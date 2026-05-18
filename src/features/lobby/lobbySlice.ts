import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk, RootState } from "../../app/store";
import * as lobbyApi from "../../api/lobbyApi";
import * as webrtcService from "../../api/webrtcService";
import * as p2pLobbyService from "../../api/p2pLobbyService";
import { selectToken, selectUser } from "../auth/authSlice";
import { buildLobbyInviteFragment, buildPeerInviteFragment } from "./scriptUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LobbyPlayer = {
  userId: string;
  name: string | null;
  ready: boolean;
};

export type LobbyStatus =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "hosting"; inviteUrl: string }
  | { phase: "joining" }
  | { phase: "active" }
  | { phase: "error"; message: string };

export type LobbyInvite = {
  lobbyId: string;
  hostUserId: string;
  hostDisplayName: string;
};

export type LobbyState = {
  status: LobbyStatus;
  scriptUrl: string | null;
  localUserId: string | null;
  serverLobbyId: string | null;
  players: LobbyPlayer[];
  pendingInvite: LobbyInvite | null;
};

function logLobbyWarning(context: string, err: unknown): void {
  console.error(`[lobby] ${context}`, err);
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: LobbyState = {
  status: { phase: "idle" },
  scriptUrl: null,
  localUserId: null,
  serverLobbyId: null,
  players: [],
  pendingInvite: null,
};

export const {
  actions: {
    _setCreating,
    _setHosting,
    _setJoining,
    _setActive,
    _setError,
    _setIdle,
    _setLocalUserId,
    _setScriptUrl,
    _setServerLobbyId,
    _playerJoined,
    _playerLeft,
    _lobbyInviteReceived,
    _clearPendingInvite,
  },
  reducer,
} = createSlice({
  name: "lobby",
  initialState,
  reducers: {
    _setCreating: (state) => {
      state.status = { phase: "creating" };
    },
    _setHosting: (state, action: PayloadAction<string>) => {
      state.status = { phase: "hosting", inviteUrl: action.payload };
    },
    _setJoining: (state) => {
      state.status = { phase: "joining" };
    },
    _setActive: (state) => {
      state.status = { phase: "active" };
    },
    _setError: (state, action: PayloadAction<string>) => {
      state.status = { phase: "error", message: action.payload };
    },
    _setIdle: (state) => {
      state.status = { phase: "idle" };
      state.scriptUrl = null;
      state.localUserId = null;
      state.serverLobbyId = null;
      state.players = [];
    },
    _setLocalUserId: (state, action: PayloadAction<string>) => {
      state.localUserId = action.payload;
    },
    _setScriptUrl: (state, action: PayloadAction<string>) => {
      state.scriptUrl = action.payload;
    },
    _setServerLobbyId: (state, action: PayloadAction<string | null>) => {
      state.serverLobbyId = action.payload;
    },
    _playerJoined: (state, action: PayloadAction<LobbyPlayer>) => {
      if (!state.players.find((p) => p.userId === action.payload.userId)) {
        state.players.push(action.payload);
      }
    },
    _playerLeft: (state, action: PayloadAction<string>) => {
      state.players = state.players.filter((p) => p.userId !== action.payload);
    },
    _lobbyInviteReceived: (state, action: PayloadAction<LobbyInvite>) => {
      state.pendingInvite = action.payload;
    },
    _clearPendingInvite: (state) => {
      state.pendingInvite = null;
    },
  },
});

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

export function createLobby(scriptUrl: string, useServerLobby: boolean = false): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const token = selectToken(getState());
    if (!token) {
      dispatch(_setError("Login required to create a lobby"));
      return;
    }
    const user = selectUser(getState());
    if (!user) {
      dispatch(_setError("User not found"));
      return;
    }

    dispatch(_setCreating());
    dispatch(_setScriptUrl(scriptUrl));

    try {
      let lobbyId: string | null = null;
      if (useServerLobby && token) {
        const res = await lobbyApi.createLobby(scriptUrl, token);
        lobbyId = res.lobbyId;
        dispatch(_setServerLobbyId(lobbyId));
      }

      dispatch(_setLocalUserId(user.id));
      dispatch(_playerJoined({ userId: user.id, name: user.displayName ?? null, ready: false }));

      // Init P2P as host
      if (useServerLobby && token && lobbyId) {
        webrtcService.init((toUserId, signal) =>
          lobbyApi.sendSignal(lobbyId as string, toUserId, signal, token)
        );
      } else {
        webrtcService.init((toUserId, signal) =>
          lobbyApi.sendSignalDirect(toUserId, signal, token || "")
        );
      }

      p2pLobbyService.initP2PLobby(user.id, true, lobbyId, token || "", {
        onLobbyInfo: () => {},
        onPlayerJoined: (player) =>
          dispatch(_playerJoined({ userId: player.userId, name: player.displayName, ready: false })),
        onPlayerLeft: (userId) => dispatch(_playerLeft(userId)),
        onHostMigration: (_newHost) => {},
        onGameMessage: () => {},
      });

      const inviteUrl = useServerLobby && lobbyId
        ? window.location.origin + "/lobby#" + buildLobbyInviteFragment(lobbyId)
        : window.location.origin + "/lobby#" + buildPeerInviteFragment(user.id);
        
      dispatch(_setHosting(inviteUrl));
    } catch (err) {
      logLobbyWarning("create lobby failed", err);
      dispatch(_setError(err instanceof Error ? err.message : "Failed to create lobby"));
    }
  };
}

/** Join via server lobby ID (lobby invite link). */
export function joinLobbyById(lobbyId: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const token = selectToken(getState());
    if (!token) {
      dispatch(_setError("Login required to join a lobby"));
      return;
    }
    const user = selectUser(getState());
    if (!user) {
      dispatch(_setError("User not found"));
      return;
    }

    dispatch(_setJoining());

    try {
      const lobbyInfo = await lobbyApi.getLobby(lobbyId);
      dispatch(_setScriptUrl(lobbyInfo.scriptUrl));
      dispatch(_setServerLobbyId(lobbyId));
      dispatch(_setLocalUserId(user.id));

      // Signal relay via lobby context
      webrtcService.init((toUserId, signal) =>
        lobbyApi.sendSignal(lobbyId, toUserId, signal, token)
      );
      _initP2PAsJoiner(dispatch, user.id, user.displayName ?? user.id, lobbyInfo.hostUserId, null, null, token);
      await webrtcService.connectToPeers([lobbyInfo.hostUserId], user.id);
    } catch (err) {
      logLobbyWarning("join lobby failed", err);
      dispatch(_setError(err instanceof Error ? err.message : "Failed to join lobby"));
    }
  };
}

/** Join directly via host's user ID (peer invite link, no server lobby lookup). */
export function joinLobbyByPeer(hostUserId: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const token = selectToken(getState());
    if (!token) {
      dispatch(_setError("Login required to join a lobby"));
      return;
    }
    const user = selectUser(getState());
    if (!user) {
      dispatch(_setError("User not found"));
      return;
    }

    dispatch(_setJoining());
    dispatch(_setLocalUserId(user.id));

    // Signal relay direct (no lobby context)
    webrtcService.init((toUserId, signal) =>
      lobbyApi.sendSignalDirect(toUserId, signal, token)
    );
    _initP2PAsJoiner(dispatch, user.id, user.displayName ?? user.id, hostUserId, null, null, token);
    await webrtcService.connectToPeers([hostUserId], user.id);
  };
}

function _initP2PAsJoiner(
  dispatch: Parameters<AppThunk>[0],
  userId: string,
  displayName: string,
  hostUserId: string,
  lobbyId: string | null,
  _scriptUrl: string | null,
  authToken: string
) {
  p2pLobbyService.initP2PLobby(userId, false, lobbyId, authToken, {
    onLobbyInfo: (info) => {
      dispatch(_setScriptUrl(info.variantUrl));
      for (const p of info.players) {
        dispatch(_playerJoined({ userId: p.userId, name: p.displayName, ready: false }));
      }
      dispatch(_setActive());
    },
    onPlayerJoined: (player) =>
      dispatch(_playerJoined({ userId: player.userId, name: player.displayName, ready: false })),
    onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
    onHostMigration: (_newHost, newLobbyId) => {
      if (newLobbyId) dispatch(_setServerLobbyId(newLobbyId));
    },
    onGameMessage: () => {},
  });

  // Send LobbyJoin to host once connected — webrtcService will call this
  // after the DataChannel opens. We hook into the onopen event indirectly
  // by scheduling the send after connectToPeers resolves.
  setTimeout(() => {
    p2pLobbyService.sendLobbyJoin(hostUserId);
  }, 500);
}

export function leaveLobby(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { serverLobbyId } = getState().lobby;
    const token = selectToken(getState());

    p2pLobbyService.leaveLobby();
    webrtcService.reset();

    if (serverLobbyId && token) {
      try {
        await lobbyApi.deleteLobby(serverLobbyId, token);
      } catch (err) {
        logLobbyWarning("delete lobby failed during cleanup", err);
      }
    }
    dispatch(_setIdle());
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectLobbyStatus = (state: RootState) => state.lobby.status;
export const selectLobbyScriptUrl = (state: RootState) => state.lobby.scriptUrl;
export const selectLobbyLocalUserId = (state: RootState) => state.lobby.localUserId;
export const selectLobbyServerLobbyId = (state: RootState) => state.lobby.serverLobbyId;
export const selectLobbyPlayers = (state: RootState) => state.lobby.players;
export const selectPendingInvite = (state: RootState) => state.lobby.pendingInvite;

export default reducer;
