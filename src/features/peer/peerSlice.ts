import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import Peer, { DataConnection } from "peerjs";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Packet } from "./types";
import { v4 as uuidv4, validate as validateUUID } from "uuid";
import { addMessageHandler, handlePacket } from "./messageHandler";
import { reverseLookup } from "../../util/util";

let peer: Peer | undefined;
const connections: Map<string, DataConnection> = new Map();
//const outgoingMessageQueue: Map<string, PeerMessage[]> = new Map();

type ConnectionState = {
  state: "disconnected" | "connecting" | "connected";
  peerId?: string;
};

type PeerState = {
  myUUID?: string;
  connectionState: ConnectionState;
  connections: { [uuid: string]: string };
  connecting: string[];
};

const {
  actions: {
    initializeUUID,
    connectingPeer,
    connectedPeer,
    disconnectedPeer,
    connectingToPeer,
    resetConnectionStates,
    disconnectedFromPeer,
    connectedToPeer,
  },
  reducer,
} = createSlice({
  name: "peer",
  initialState: {
    connectionState: {
      state: "disconnected",
    },
    connections: {},
    connecting: [] as string[],
  } as PeerState,
  reducers: {
    initializeUUID: (state, action: PayloadAction<string>) => {
      state.myUUID = action.payload;
    },
    connectingPeer: (state) => {
      state.connectionState = {
        ...state.connectionState,
        state: "connecting",
      };
    },
    connectedPeer: (state, action: PayloadAction<string>) => {
      const peerId = action.payload;
      state.connectionState = {
        state: "connected",
        peerId,
      };
    },
    disconnectedPeer: (state) => {
      state.connectionState = {
        ...state.connectionState,
        state: "disconnected",
      };
    },
    connectedToPeer: (
      state,
      action: PayloadAction<{ uuid: string; peerId: string }>
    ) => {
      const { uuid, peerId } = action.payload;
      state.connecting = state.connecting.filter((id) => peerId !== id);
      state.connections[uuid] = peerId;
    },
    connectingToPeer: (state, action: PayloadAction<string>) => {
      if (!state.connecting.includes(action.payload)) {
        state.connecting.push(action.payload);
      }
    },
    resetConnectionStates: (state) => {
      state.connectionState = {
        state: "disconnected",
      };
      state.connections = {};
      state.connecting = [];
    },
    disconnectedFromPeer: (state, action: PayloadAction<string>) => {
      const peerId = action.payload;
      state.connecting = state.connecting.filter((id) => peerId !== id);
      const uuid = reverseLookup(state.connections, peerId);
      if (typeof uuid !== "undefined") {
        delete state.connections[uuid];
      }
    },
  },
});

export function initializePeer(): AppThunk {
  return async (dispatch, getState) => {
    if (typeof selectPeerUUID(getState()) === "undefined") {
      dispatch(initializeUUID(uuidv4()));
    }
    const oldConnections = selectPeerConnections(getState());
    let oldPeerIds = selectPeerConnecting(getState()).concat(
      Object.values(oldConnections)
    );
    dispatch(resetConnectionStates());
    await dispatch(connectPeer());
    dispatch(errorHandler());
    oldPeerIds.forEach((peerId) => {
      dispatch(connectToPeer(peerId));
    });
    addMessageHandler("peer", peerMessageHandler);
  };
}

function sendPacket(uuid: string, packet: Packet): AppThunk {
  return async (_dispatch, getState) => {
    const peerIds = selectPeerConnections(getState());
    const conn = connections.get(peerIds[uuid]);
    if (typeof conn === "undefined") {
      return;
    }
    conn.send(packet);
  };
}

function peerMessageHandler(packet: Packet): AppThunk {
  return (dispatch, getState) => {
    const { uuid, peerId } = packet;
    const cs = selectPeerConnections(getState());
    const cg = selectPeerConnecting(getState());
    if (typeof cs[uuid] !== "undefined" || !cg.includes(peerId)) {
      return;
    }
    const connection = connections.get(peerId)!;
    if (!validateUUID(uuid)) {
      connection.close();
      return;
    }
    dispatch(connectedToPeer({ uuid, peerId }));
  };
}

export function connectToPeer(peerId: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { myUUID: uuid } = selectPeerState(getState());
    const connection = peer!.connect(peerId, {
      reliable: true,
      metadata: { uuid },
    });
    connections.set(peerId, connection);
    dispatch(connectingToPeer(peerId));
    connection.on("close", () => {
      connections.delete(peerId);
      dispatch(disconnectedFromPeer(peerId));
    });
    connection.on("open", () => {
      connection.on("data", (data: Packet) => {
        dispatch(handlePacket({ ...data, peerId }));
      });
    });
  };
}

export function connectPeer(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch(connectingPeer());
    const oldPeerId = selectPeerId(getState());
    try {
      peer = await createPeer(oldPeerId);
    } catch (err) {
      throw err;
    }
    dispatch(connectedPeer(peer!.id));
    peer!.on("disconnected", () => {
      dispatch(disconnectedPeer());
    });

    peer!.on("connection", function (connection: DataConnection) {
      const { peer: peerId, metadata } = connection;
      connection.on("close", () => {
        connections.delete(peerId);
        dispatch(disconnectedFromPeer(peerId));
      });
      connections.set(peerId, connection);
      const { uuid } = metadata;
      if (!validateUUID(uuid)) {
        connection.close();
        return;
      }
      connection.on("open", () => {
        dispatch(connectedToPeer({ uuid, peerId }));
        connection.on("data", (data: Packet) => {
          dispatch(handlePacket({ ...data, peerId }));
        });
        const myUUID = selectPeerUUID(getState());
        connection.send({ type: "peer", uuid: myUUID });
      })
    });
  };
}

function createPeer(wanted?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const p = new Peer(wanted);
    let errorHandle = (err: any) => {
      if (p) {
        p.destroy();
      }
      if (err.type === "unavailable-id") {
        createPeer()
          .then((p) => resolve(p))
          .catch((err) => reject(err));
        return;
      }
      reject(err);
      return;
    };
    p.on("error", errorHandle);
    p.on("open", () => {
      p?.off("error", errorHandle);
      resolve(p!);
    });
  });
}

function errorHandler(): AppThunk {
  return (dispatch) => {
    peer!.on("error", (err) => {
      switch (err.type) {
        case "peer-unavailable":
          toast.error(err);
          console.error(err);
          const peerId = (err.message as String).substring(26);
          dispatch(disconnectedFromPeer(peerId));
          break;
      }
    });
  };
}

export function disconnectFromPeer(peerId: string): AppThunk<Promise<void>> {
  return async () => {
    connections.get(peerId)?.close();
  };
}

export const selectPeerState = (state: RootState) => state.peer;

export const selectPeerUUID = (state: RootState) => state.peer.myUUID;
export const selectPeerId = (state: RootState) =>
  state.peer.connectionState.peerId;
export const selectPeerConnectionState = (state: RootState) =>
  state.peer.connectionState.state;
export const selectPeerConnections = (state: RootState) =>
  state.peer.connections;
export const selectPeerConnecting = (state: RootState) => state.peer.connecting;

export default reducer;
