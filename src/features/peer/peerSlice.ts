import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AppDispatch, AppThunk, RootState } from "../../app/store";
import { selectSession } from "../auth/authSlice";
import type { LobbyInvite } from "../../api/bebop/generated";
import * as p2p from "../../api/p2pService";

export type GameInvite = {
  id: string;
  senderUserId: string;
  senderUserName: string;
  variantId: string;
  variantVersion: string;
  timeoutSecs: number;
  senderPeerId: string;
};

type PeerState = {
  connectionState: "disconnected" | "connecting" | "connected" | "error";
  localPeerId?: string;
  pendingInvites: GameInvite[];
};

const {
  actions: { connecting, connected, disconnected, inviteReceived, inviteRemoved },
  reducer,
} = createSlice({
  name: "peer",
  initialState: {
    connectionState: "disconnected",
    pendingInvites: [],
  } as PeerState,
  reducers: {
    connecting: (state) => {
      state.connectionState = "connecting";
    },
    connected: (state, action: PayloadAction<string>) => {
      state.connectionState = "connected";
      state.localPeerId = action.payload;
    },
    disconnected: (state) => {
      state.connectionState = "disconnected";
      state.localPeerId = undefined;
    },
    inviteReceived: (state, action: PayloadAction<GameInvite>) => {
      state.pendingInvites.push(action.payload);
    },
    inviteRemoved: (state, action: PayloadAction<string>) => {
      state.pendingInvites = state.pendingInvites.filter(
        (inv) => inv.id !== action.payload
      );
    },
  },
});

function makeInviteHandler(dispatch: (action: unknown) => unknown) {
  return (event: LobbyInvite) => {
    const id = crypto.randomUUID();
    const invite: GameInvite = {
      id,
      senderUserId: event.hostUserId ?? "",
      senderUserName: event.hostName ?? "",
      variantId: event.variantId ?? "",
      variantVersion: event.variantVersion ?? "",
      timeoutSecs: 60,
      senderPeerId: "",
    };
    dispatch(inviteReceived(invite));
  };
}

export function initializePeer(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const session = selectSession(getState());
    if (session.state !== "logged-in") return;

    dispatch(connecting());
    p2p.setGameInviteCallback(makeInviteHandler(dispatch));

    try {
      const localPeerId = await p2p.initNode(session.token);
      dispatch(connected(localPeerId));
    } catch (err) {
      dispatch(disconnected());
      throw err;
    }
  };
}

export function respondToInvite(
  inviteId: string,
  _accepted: boolean
): AppThunk {
  return (dispatch) => {
    dispatch(inviteRemoved(inviteId));
  };
}

export function connectToPeer(targetPeerId: string): AppThunk<Promise<void>> {
  return async () => {
    await p2p.connectToPeerViaRelay(targetPeerId);
  };
}

export function disconnectFromPeer(_peerId: string): AppThunk<Promise<void>> {
  return async () => {
    // TODO: close individual peer connection when game sessions are tracked
  };
}

export function disconnectPeer(): AppThunk<Promise<void>> {
  return async (dispatch) => {
    await p2p.stopNode();
    dispatch(disconnected());
  };
}

export const selectPeerConnectionState = (state: RootState) =>
  state.peer.connectionState;

export const selectLocalPeerId = (state: RootState) => state.peer.localPeerId;
export const selectPeerId = selectLocalPeerId;

export const selectPendingInvites = (state: RootState) =>
  state.peer.pendingInvites;

/** @deprecated No direct peer-to-peer connections tracked yet; returns empty map. */
export const selectPeerConnections = (_: RootState): Record<string, string> =>
  ({});

/** @deprecated No pending connection tracking yet; returns empty array. */
export const selectPeerConnecting = (_: RootState): string[] => [];

export default reducer;
