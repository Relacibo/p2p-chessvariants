import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk, RootState } from "../../app/store";
import * as lobbyApi from "../../api/lobbyApi";
import * as webrtcService from "../../api/webrtcService";
import * as p2pLobbyService from "../../api/p2pLobbyService";
import { getTurnCredentials } from "../../api/turnApi";
import { buildPeerHandle, getSessionId, userIdFromPeerHandle } from "../../api/peerSession";
import { selectToken, selectUser } from "../auth/authSlice";
import { notifications } from "@mantine/notifications";
import { parseScriptConfig } from "./scriptUrl";

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
  | { phase: "hosting"; inviteUrl: string; allowGuests: boolean; isPassiveHostTab: boolean }
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
  const message = err instanceof Error ? err.message : String(err);
  notifications.show({
    title: "Lobby error",
    message: `${context}: ${message}`,
    color: "red",
  });
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
    _setHosting: (state, action: PayloadAction<{ inviteUrl: string; allowGuests: boolean; isPassiveHostTab: boolean }>) => {
      state.status = { phase: "hosting", inviteUrl: action.payload.inviteUrl, allowGuests: action.payload.allowGuests, isPassiveHostTab: action.payload.isPassiveHostTab };
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

/** Fetches TURN credentials and updates the webrtcService ICE servers. Falls back silently. */
async function _applyTurnCredentials(token: string): Promise<void> {
  try {
    const turnServers = await getTurnCredentials(token);
    if (turnServers.length > 0) {
      webrtcService.setIceServers([
        { urls: "stun:stun.l.google.com:19302" },
        ...turnServers,
      ]);
    }
  } catch (err) {
    console.warn("[turn] Could not apply TURN credentials:", err);
  }
}

export function createLobby(scriptUrl: string, useServerLobby: boolean = false, allowGuests: boolean = true): AppThunk<Promise<void>> {
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
        const scriptConfig = await parseScriptConfig(scriptUrl);
        const res = await lobbyApi.createLobby({
          scriptUrl,
          allowGuests,
          hostPeerSessionId: getSessionId(),
          minPlayers: scriptConfig.minPlayers,
          maxPlayers: scriptConfig.maxPlayers,
        }, token);
        lobbyId = res.lobbyId;
        dispatch(_setServerLobbyId(lobbyId));
      }

      dispatch(_setLocalUserId(user.id));
      dispatch(_playerJoined({ userId: user.id, name: user.displayName ?? null, ready: false }));

      await _applyTurnCredentials(token);

      // Init P2P as host — always read current token so refreshes are picked up
      if (useServerLobby && token && lobbyId) {
        const capturedLobbyId = lobbyId;
        webrtcService.init((toUserId, signal) => {
          const currentToken = selectToken(getState());
          return lobbyApi.sendSignal(capturedLobbyId, toUserId, signal, currentToken ?? "");
        });
      } else {
        webrtcService.init((toUserId, signal) => {
          const currentToken = selectToken(getState());
          return lobbyApi.sendSignalDirect(toUserId, signal, currentToken ?? "");
        });
      }

      p2pLobbyService.initP2PLobby(user.id, user.displayName ?? user.id, true, lobbyId, scriptUrl, token || "", {
        onLobbyInfo: () => {},
        onPlayerJoined: (player) =>
          dispatch(_playerJoined({ userId: player.userId, name: player.displayName, ready: false })),
        onPlayerLeft: (userId) => dispatch(_playerLeft(userId)),
        onHostMigration: (_newHost) => {},
        onGameMessage: () => {},
      });

      const inviteUrl = useServerLobby && lobbyId
        ? window.location.origin + "/lobby/" + lobbyId
        : window.location.origin + "/lobby/by-peer-id/" + buildPeerHandle(user.id);
        
      dispatch(_setHosting({ inviteUrl, allowGuests, isPassiveHostTab: false }));
      notifications.show({ title: "Lobby created!", message: "Share the invite link with players.", color: "green" });
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

      // If the current user is the host (e.g. after a page reload), re-init as host
      if (lobbyInfo.hostUserId === user.id) {
        const isActiveHostTab = !lobbyInfo.hostPeerSessionId || lobbyInfo.hostPeerSessionId === getSessionId();
        dispatch(_playerJoined({ userId: user.id, name: user.displayName ?? null, ready: false }));
        const inviteUrl = window.location.origin + "/lobby/" + lobbyId;
        dispatch(_setHosting({ inviteUrl, allowGuests: lobbyInfo.allowGuests, isPassiveHostTab: !isActiveHostTab }));
        if (isActiveHostTab) {
          await _applyTurnCredentials(token);
          webrtcService.init((toUserId, signal) => {
            const currentToken = selectToken(getState());
            return lobbyApi.sendSignal(lobbyId, toUserId, signal, currentToken ?? "");
          });
          p2pLobbyService.initP2PLobby(user.id, user.displayName ?? user.id, true, lobbyId, lobbyInfo.scriptUrl, token, {
            onLobbyInfo: () => {},
            onPlayerJoined: (player) =>
              dispatch(_playerJoined({ userId: player.userId, name: player.displayName, ready: false })),
            onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
            onHostMigration: (_newHost, newLobbyId) => {
              if (newLobbyId) dispatch(_setServerLobbyId(newLobbyId));
            },
            onGameMessage: () => {},
          });
        }
        return;
      }

      // Signal relay via lobby context — always read current token from state
      await _applyTurnCredentials(token);
      webrtcService.init((toUserId, signal) => {
        const currentToken = selectToken(getState());
        return lobbyApi.sendSignal(lobbyId, toUserId, signal, currentToken ?? "");
      });
      _initP2PAsJoiner(dispatch, user.id, user.displayName ?? user.id, lobbyInfo.hostUserId, lobbyId, lobbyInfo.scriptUrl, token);
      // Joiner always initiates the WebRTC connection so the host (which never calls connectToPeers) can answer
      await webrtcService.connectToPeers([lobbyInfo.hostUserId], user.id, true);
    } catch (err) {
      logLobbyWarning("join lobby failed", err);
      dispatch(_setError(err instanceof Error ? err.message : "Failed to join lobby"));
    }
  };
}

/** Join directly via host's user ID (peer invite link, no server lobby lookup). */
export function joinLobbyByPeer(peerHandle: string): AppThunk<Promise<void>> {
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

    // Extract the real user ID from the handle (supports legacy plain userId too)
    const hostUserId = userIdFromPeerHandle(peerHandle);

    dispatch(_setJoining());
    dispatch(_setLocalUserId(user.id));

    await _applyTurnCredentials(token);

    // Signal relay direct (no lobby context) — always read current token from state
    webrtcService.init((toUserId, signal) => {
      const currentToken = selectToken(getState());
      return lobbyApi.sendSignalDirect(toUserId, signal, currentToken ?? "");
    });
    _initP2PAsJoiner(dispatch, user.id, user.displayName ?? user.id, hostUserId, null, null, token);
    // Joiner always initiates the WebRTC connection
    await webrtcService.connectToPeers([hostUserId], user.id, true);
  };
}

function _initP2PAsJoiner(
  dispatch: Parameters<AppThunk>[0],
  userId: string,
  displayName: string,
  hostUserId: string,
  lobbyId: string | null,
  variantUrl: string | null,
  authToken: string
) {
  p2pLobbyService.initP2PLobby(userId, displayName, false, lobbyId, variantUrl, authToken, {
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
  // LobbyJoin is now sent automatically via webrtcService.onPeerConnected when DataChannel opens
}

/** Leave a lobby as a non-host participant (disconnects P2P, does NOT delete the lobby). */
export function leaveLobby(): AppThunk<Promise<void>> {
  return async (dispatch) => {
    p2pLobbyService.leaveLobby();
    webrtcService.reset();
    dispatch(_setIdle());
  };
}

/** Close the lobby as host (deletes it on the server and disconnects). */
export function closeLobby(): AppThunk<Promise<void>> {
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

/** Claim host role for this tab: PATCHes hostPeerSessionId on the server and starts P2P/heartbeat. */
export function becomeActiveHost(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const state = getState();
    const { serverLobbyId } = state.lobby;
    const lobbyStatus = selectLobbyStatus(state);
    const token = selectToken(state);
    const user = selectUser(state);
    if (!token || !user || !serverLobbyId || lobbyStatus.phase !== "hosting") return;

    try {
      await lobbyApi.patchLobby(serverLobbyId, { hostPeerSessionId: getSessionId() }, token);
      await _applyTurnCredentials(token);
      webrtcService.init((toUserId, signal) => {
        const currentToken = selectToken(getState());
        return lobbyApi.sendSignal(serverLobbyId, toUserId, signal, currentToken ?? "");
      });
      const currentScriptUrl = getState().lobby.scriptUrl;
      p2pLobbyService.initP2PLobby(user.id, user.displayName ?? user.id, true, serverLobbyId, currentScriptUrl, token, {
        onLobbyInfo: () => {},
        onPlayerJoined: (player) =>
          dispatch(_playerJoined({ userId: player.userId, name: player.displayName, ready: false })),
        onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
        onHostMigration: (_newHost, newLobbyId) => {
          if (newLobbyId) dispatch(_setServerLobbyId(newLobbyId));
        },
        onGameMessage: () => {},
      });
      dispatch(_setHosting({ ...lobbyStatus, isPassiveHostTab: false }));
      notifications.show({ title: "Active host", message: "This tab is now the active host.", color: "green" });
    } catch (err) {
      logLobbyWarning("become active host failed", err);
    }
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
