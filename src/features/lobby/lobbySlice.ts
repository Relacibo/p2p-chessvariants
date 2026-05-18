import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk, RootState } from "../../app/store";
import * as lobbyApi from "../../api/lobbyApi";
import { selectToken, selectUser } from "../auth/authSlice";
import { buildInviteFragment, parseScriptUrl } from "./scriptUrl";

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
  scriptUrl: string;
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
    _playerReady,
    _lobbyDeleted,
    _gameStarted,
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
      state.players = state.players.filter(
        (p) => p.userId !== action.payload
      );
    },
    _playerReady: (state, action: PayloadAction<string>) => {
      const player = state.players.find((p) => p.userId === action.payload);
      if (player) player.ready = true;
    },
    _lobbyDeleted: (
      state,
      action: PayloadAction<{ lobbyId: string }>
    ) => {
      if (state.serverLobbyId === action.payload.lobbyId) {
        state.status = { phase: "idle" };
        state.scriptUrl = null;
        state.localUserId = null;
        state.serverLobbyId = null;
        state.players = [];
      }
    },
    _gameStarted: (
      state,
      _action: PayloadAction<{
        lobbyId: string;
        members: Array<{ userId: string; displayName: string }>;
      }>
    ) => {
      state.status = { phase: "active" };
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
// SSE event handler (called from SseManager)
// ---------------------------------------------------------------------------

export function handleSseMemberJoined(
  lobbyId: string,
  member: { userId: string; displayName: string }
): AppThunk {
  return (dispatch, getState) => {
    const { serverLobbyId } = getState().lobby;
    if (serverLobbyId !== lobbyId) return;
    dispatch(
      _playerJoined({ userId: member.userId, name: member.displayName, ready: false })
    );
  };
}

export function handleSseMemberLeft(
  lobbyId: string,
  userId: string
): AppThunk {
  return (dispatch, getState) => {
    const { serverLobbyId } = getState().lobby;
    if (serverLobbyId !== lobbyId) return;
    dispatch(_playerLeft(userId));
  };
}

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

export function createLobby(scriptUrl: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const validation = parseScriptUrl(scriptUrl);
    if (!validation.ok) {
      dispatch(_setError("Invalid script URL"));
      return;
    }

    const token = selectToken(getState());
    if (!token) {
      dispatch(_setError("Login required to create a lobby"));
      return;
    }

    const user = selectUser(getState());
    dispatch(_setCreating());
    dispatch(_setScriptUrl(scriptUrl));

    try {
      const { lobbyId } = await lobbyApi.createLobby(scriptUrl, token);
      dispatch(_setLocalUserId(user?.id ?? ""));
      dispatch(_setServerLobbyId(lobbyId));
      dispatch(
        _playerJoined({
          userId: user?.id ?? "",
          name: user?.displayName ?? null,
          ready: false,
        })
      );

      const inviteUrl =
        window.location.origin +
        "/lobby#" +
        buildInviteFragment(lobbyId, scriptUrl);
      dispatch(_setHosting(inviteUrl));
    } catch (err) {
      logLobbyWarning("create lobby failed", err);
      dispatch(
        _setError(
          err instanceof Error ? err.message : "Failed to create lobby"
        )
      );
    }
  };
}

export function joinLobby(
  lobbyId: string,
  scriptUrl: string
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const token = selectToken(getState());
    if (!token) {
      dispatch(_setError("Login required to join a lobby"));
      return;
    }

    dispatch(_setJoining());
    dispatch(_setScriptUrl(scriptUrl));

    try {
      await lobbyApi.joinLobby(lobbyId, token);
      const lobbyInfo = await lobbyApi.getLobby(lobbyId);

      dispatch(_setServerLobbyId(lobbyId));
      const user = selectUser(getState());
      dispatch(_setLocalUserId(user?.id ?? ""));

      for (const member of lobbyInfo.members) {
        dispatch(
          _playerJoined({
            userId: member.userId,
            name: member.displayName,
            ready: false,
          })
        );
      }
      dispatch(_setActive());
    } catch (err) {
      logLobbyWarning("join lobby failed", err);
      dispatch(
        _setError(err instanceof Error ? err.message : "Failed to join lobby")
      );
    }
  };
}

export function leaveLobby(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { serverLobbyId, localUserId } = getState().lobby;
    const token = selectToken(getState());

    if (serverLobbyId && token) {
      try {
        await lobbyApi.leaveLobby(serverLobbyId, token);
      } catch (err) {
        logLobbyWarning("server lobby leave failed during cleanup", err);
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
export const selectLobbyLocalUserId = (state: RootState) =>
  state.lobby.localUserId;
export const selectLobbyServerLobbyId = (state: RootState) =>
  state.lobby.serverLobbyId;
export const selectLobbyPlayers = (state: RootState) => state.lobby.players;
export const selectPendingInvite = (state: RootState) =>
  state.lobby.pendingInvite;

export default reducer;
