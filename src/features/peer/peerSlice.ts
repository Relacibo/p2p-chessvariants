import { createAction, createSlice, PayloadAction } from "@reduxjs/toolkit";
import Peer, { DataConnection } from "peerjs";
import { toast } from "react-toastify";
import { AppThunk } from "../../app/store";
import { joinLobby } from "../lobby/lobbySlice";

let peer: Peer | undefined;
const connections: Map<string, DataConnection> = new Map();

export type PeerMessage = {
  type: string;
};

type PeerState = {
  peerId: string;
  connections: { peerId: string }[];
};

export const receivedMessageFromPeer = createAction<{
  from: string;
  message: PeerMessage;
}>("peer/receivedMessageFromPeer");

export const disconnectedFromPeer = createAction<{ peerId: string }>(
  "peer/disconnectedFromPeer"
);
export const createdPeer = createAction<{ peerId: string }>("peer/createdPeer");
export const connectingToPeer = createAction<{ peerId: string }>(
  "peer/connectingToPeer"
);

export const deletedPeer = createAction("peer/deletedPeer");

const slice = createSlice({
  name: "peer",
  initialState: {} as PeerState,
  reducers: {},
});

function onConnection(connection: DataConnection): AppThunk {
  return (dispatch) => {
    const { peer: peerId } = connection;
    connections.set(peerId, connection);
    dispatch(joinLobby(peerId));
    connection.on("data", (data: string) => {
      let message: PeerMessage;
      try {
        message = JSON.parse(data);
      } catch {
        console.log("Could not parse package!")
        return;
      }
      dispatch(receivedMessageFromPeer({ from: peerId, message}));
    });
    connection.on("close", () => {
      dispatch(disconnectedFromPeer({ peerId }));
    });
  };
}

export function connectPeer(wantedId?: string): AppThunk<Promise<void>> {
  return async (dispatch) => {
    try {
      await createPeer(wantedId);
    } catch (err) {
      throw err;
    }
    dispatch(createdPeer({ peerId: peer!.id }));
    peer!.on("connection", function (connection: DataConnection) {
      dispatch(onConnection(connection));
    });
  };
}

async function createPeer(wantedId?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    peer = wantedId ? new Peer(wantedId) : new Peer();
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
  return (dispatch) => {
    return new Promise(async (resolve, reject) => {
      if (!peer) {
        try {
          await createPeer();
        } catch (err) {
          toast.error("Peer server problem. Try again later!");
          reject();
          return;
        }
        dispatch(createdPeer({ peerId: peer!.id }));
      }
      if (connections.has(peerId)) {
        resolve();
        return;
      }
      const connection = peer!.connect(peerId, { reliable: true });
      dispatch(connectingToPeer({ peerId }));
      let errorHandle = (err: any) => {
        console.log("could not connect");
        switch (err.type) {
          case "peer-unavailable": {
            toast.error("Peer not available!");
            peer!.off("error", errorHandle);
            reject();
            break;
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
