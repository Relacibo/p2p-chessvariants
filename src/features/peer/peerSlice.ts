import {
  Action,
  createAction,
  createSlice,
  PayloadAction,
} from "@reduxjs/toolkit";
import Peer, { DataConnection } from "peerjs";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Packet, PeerMessage } from "./types";
import { v4 as uuidv4, validate as validateUUID } from "uuid";
import { handlePacket } from "./messageHandler";

let peer: Peer | undefined;
const connections: Map<string, DataConnection> = new Map();
const outgoingMessageQueue: Map<string, PeerMessage[]> = new Map();

type ConnectionState = {
  state: "disconnected" | "connecting" | "connected";
  peerId?: string;
};

type PeerState = {
  myUUID: string;
  connectionState: ConnectionState;
  connections: { [key: string]: ConnectionState };
};

export const receivedMessageFromPeer = createAction<Packet>(
  "peer/receivedMessageFromPeer"
);

export const disconnectedFromPeer = createAction<string>(
  "peer/disconnectedFromPeer"
);
export const connectingToPeer = createAction<{ uuid?: string; peerId: string }>(
  "peer/connectingToPeer"
);

export const deletedPeer = createAction("peer/deletedPeer");

const {
  actions: {
    initializeUUID,
    createdPeer,
    peerConnected,
    resetConnectionStates,
  },
  reducer,
} = createSlice({
  name: "peer",
  initialState: {
    connectionState: {
      state: "disconnected",
    },
    connections: {},
  } as PeerState,
  reducers: {
    initializeUUID: (state, action: PayloadAction<string>) => {
      state.myUUID = action.payload;
    },
    createdPeer: (state, action: PayloadAction<string>) => {
      const peerId = action.payload;
      state.connectionState = {
        state: "connected",
        peerId,
      };
    },
    peerConnected: (
      state,
      action: PayloadAction<{ uuid: string; peerId: string }>
    ) => {
      const { uuid, peerId } = action.payload;
      state.connections[uuid] = {
        state: "connected",
        peerId,
      };
    },
    resetConnectionStates: (state) => {
      state.connectionState = {
        ...state.connectionState,
        state: "disconnected",
      };
      for (const key in state.connections) {
        const value = state.connections[key];
        state.connections[key] = { ...value, state: "disconnected" };
      }
    },
  },
});

export function initializePeer(): AppThunk {
  return async (dispatch, getState) => {
    if (typeof selectPeerUUID(getState()) === "undefined") {
      dispatch(initializeUUID(uuidv4()));
    }
    dispatch(resetConnectionStates());
    await dispatch(connectPeer());
  };
}

function sendPacket(toUUID: string, packet: Packet): AppThunk {
  return async (dispatch, getState) => {
    const other = connections.get(toUUID);
  };
}

function onConnection(connection: DataConnection): AppThunk {
  return (dispatch) => {
    const { peer: peerId, metadata } = connection;
    const { uuid } = metadata;
    if (typeof uuid !== "string" || !validateUUID(uuid)) {
      connection.close();
      return;
    }
    connections.set(uuid, connection);

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
    connection.on("close", () => {
      dispatch(disconnectedFromPeer(peerId));
    });
  };
}

export function connectPeer(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const oldPeerId = selectPeerId(getState());
    try {
      await createPeer(oldPeerId);
    } catch (err) {
      throw err;
    }
    dispatch(createdPeer(peer!.id));

    peer!.on("connection", function (connection: DataConnection) {
      dispatch(onConnection(connection));
    });
  };
}

function createPeer(wanted?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    peer = new Peer(wanted);
    let errorHandle = (err: any) => {
      if (peer) {
        peer.destroy();
      }
      reject(err);
      return;
    };
    peer.on("error", errorHandle);
    peer.on("open", () => {
      peer?.off("error", errorHandle);
      resolve(peer!);
    });
  });
}

export function connectToPeer(peerId: string): AppThunk<Promise<void>> {
  return (dispatch, getState) => {
    return new Promise(async (resolve, reject) => {
      if (!peer) {
        try {
          await createPeer();
        } catch (err) {
          toast.error("Peer server problem. Try again later!");
          reject();
          return;
        }
        dispatch(createdPeer(peer!.id));
      }
      const { myUUID: uuid } = selectPeerState(getState());
      const connection = peer!.connect(peerId, {
        reliable: true,
        metadata: { uuid },
      });
      dispatch(connectingToPeer({ peerId }));
      let errorHandle = (err: any) => {
        console.log("could not connect");
        switch (err.type) {
          case "peer-unavailable": {
            toast.error("Peer not available!");
            peer!.off("error", errorHandle);
            reject();
            return;
          }
        }
      };
      connection.on("open", () => {
        peer!.off("error", errorHandle);
        dispatch(onConnection(connection));
        resolve();
      });
      peer!.on("error", errorHandle);
    });
  };
}

export function disconnectPeer(): AppThunk {
  return (dispatch) => {
    peer?.destroy();
    connections.clear();
    dispatch(deletedPeer());
    peer = undefined;
  };
}

export const selectPeerState = (state: RootState) => state.peer;

export const selectPeerUUID = (state: RootState) => state.peer.myUUID;
export const selectPeerId = (state: RootState) =>
  state.peer.connectionState.peerId;
export const selectPeerConnectionState = (state: RootState) =>
  state.peer.connectionState.state;

export default reducer;
