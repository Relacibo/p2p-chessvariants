import { createAction, createSlice, PayloadAction } from "@reduxjs/toolkit";
import Peer, { DataConnection } from "peerjs";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Packet, PeerMessage } from "./types";
import { v4 as uuidv4, validate as validateUUID } from "uuid";
import { handlePacket } from "./messageHandler";

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

export const receivedMessageFromPeer = createAction<Packet>(
  "peer/receivedMessageFromPeer"
);

const {
  actions: {
    initializeUUID,
    connectingPeer,
    connectedPeer,
    disconnectedPeer,
    connectingToPeer,
    peerIsConnecting,
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
    peerIsConnecting: (state, action: PayloadAction<string>) => {
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
      delete state.connections[peerId];
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
  };
}

/*function sendPacket(toUUID: string, packet: Packet): AppThunk {
  return async (dispatch, getState) => {
    const other = connections.get(toUUID);
  };
}*/

function onConnection(connection: DataConnection): AppThunk {
  return (dispatch) => {
    const { peer: peerId, metadata } = connection;
    const { uuid } = metadata;
    console.log(metadata);
    if (typeof uuid !== "string" || !validateUUID(uuid)) {
      connection.close();
      return;
    }
    connectedToPeer({ uuid, peerId });

    connection.on("data", (data: string) => {
      let message: PeerMessage;
      try {
        message = JSON.parse(data);
      } catch {
        console.log("Could not parse package!");
        return;
      }
      dispatch(handlePacket({ from: peerId, message }));
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
      const peerId = connection.peer;
      connection.on("close", () => {
        connections.delete(peerId);
        dispatch(disconnectedFromPeer(peerId));
      });
      connections.set(peerId, connection);
      dispatch(peerIsConnecting(peerId));
      dispatch(onConnection(connection));
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

export function connectToPeer(peerId: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    if (peerId === "") {
      return;
    }
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
      dispatch(onConnection(connection));
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
