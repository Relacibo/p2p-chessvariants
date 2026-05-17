import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk, RootState } from "../../app/store";
import * as p2p from "../../api/p2pService";
import { selectToken } from "../auth/authSlice";
import { buildInviteFragment, parseScriptUrl } from "./scriptUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LobbyPlayer = {
  peerId: string;
  /** Display name or null for anonymous guests */
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

export type LobbyState = {
  status: LobbyStatus;
  scriptUrl: string | null;
  localPeerId: string | null;
  serverLobbyId: string | null;
  players: LobbyPlayer[];
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: LobbyState = {
  status: { phase: "idle" },
  scriptUrl: null,
  localPeerId: null,
  serverLobbyId: null,
  players: [],
};

export const {
  actions: {
    _setCreating,
    _setHosting,
    _setJoining,
    _setActive,
    _setError,
    _setIdle,
    _setLocalPeerId,
    _setScriptUrl,
    _setServerLobbyId,
    _playerJoined,
    _playerLeft,
    _playerReady,
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
      state.localPeerId = null;
      state.serverLobbyId = null;
      state.players = [];
    },
    _setLocalPeerId: (state, action: PayloadAction<string>) => {
      state.localPeerId = action.payload;
    },
    _setScriptUrl: (state, action: PayloadAction<string>) => {
      state.scriptUrl = action.payload;
    },
    _setServerLobbyId: (state, action: PayloadAction<string | null>) => {
      state.serverLobbyId = action.payload;
    },
    _playerJoined: (state, action: PayloadAction<LobbyPlayer>) => {
      if (!state.players.find((p) => p.peerId === action.payload.peerId)) {
        state.players.push(action.payload);
      }
    },
    _playerLeft: (state, action: PayloadAction<string>) => {
      state.players = state.players.filter((p) => p.peerId !== action.payload);
    },
    _playerReady: (state, action: PayloadAction<string>) => {
      const player = state.players.find((p) => p.peerId === action.payload);
      if (player) player.ready = true;
    },
  },
});

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/**
 * Create a new lobby as host. Initialises P2P (guest or authenticated),
 * generates the invite link, and transitions to the "hosting" phase.
 */
export function createLobby(
  scriptUrl: string,
  useServerLobby: boolean
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const validation = parseScriptUrl(scriptUrl);
    if (!validation.ok) {
      dispatch(_setError("Invalid script URL"));
      return;
    }

    dispatch(_setCreating());
    dispatch(_setScriptUrl(scriptUrl));

    try {
      const token = selectToken(getState());
      const localPeerId =
        token && useServerLobby
          ? await p2p.initNode(token)
          : await p2p.initNodeAsGuest();

      dispatch(_setLocalPeerId(localPeerId));

      const basePath = window.location.origin + "/lobby";
      let serverLobbyId: string | null = null;
      if (token && useServerLobby) {
        try {
          serverLobbyId = await p2p.createServerLobby(scriptUrl);
        } catch {
          // Keep peer-id invites working even if server-side lobby creation fails.
          serverLobbyId = null;
        }
      }
      dispatch(_setServerLobbyId(serverLobbyId));

      const inviteUrl =
        basePath + buildInviteFragment(localPeerId, scriptUrl, serverLobbyId ?? undefined);

      dispatch(_playerJoined({ peerId: localPeerId, name: null, ready: false }));
      dispatch(_setHosting(inviteUrl));
    } catch (err) {
      dispatch(
        _setError(err instanceof Error ? err.message : "Failed to start P2P node")
      );
    }
  };
}

/**
 * Join an existing lobby by connecting to the host peer via relay.
 */
export function joinLobby(
  hostPeerId: string,
  scriptUrl: string,
  lobbyId?: string
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch(_setJoining());
    dispatch(_setScriptUrl(scriptUrl));

    try {
      const token = selectToken(getState());
      const localPeerId = token
        ? await p2p.initNode(token)
        : await p2p.initNodeAsGuest();

      dispatch(_setLocalPeerId(localPeerId));
      dispatch(_playerJoined({ peerId: localPeerId, name: null, ready: false }));

      await p2p.connectToPeerViaRelay(hostPeerId);
      if (token && lobbyId) {
        try {
          await p2p.joinServerLobby(lobbyId);
          dispatch(_setServerLobbyId(lobbyId));
        } catch {
          dispatch(_setServerLobbyId(null));
        }
      } else {
        dispatch(_setServerLobbyId(null));
      }
      dispatch(_setActive());
    } catch (err) {
      dispatch(
        _setError(err instanceof Error ? err.message : "Failed to connect to host")
      );
    }
  };
}

/** Leave the lobby and stop the P2P node. */
export function leaveLobby(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const serverLobbyId = getState().lobby.serverLobbyId;
    if (serverLobbyId) {
      try {
        await p2p.leaveServerLobby(serverLobbyId);
      } catch {
        // Always continue local cleanup.
      }
    }
    await p2p.stopNode();
    dispatch(_setIdle());
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectLobbyStatus = (state: RootState) => state.lobby.status;
export const selectLobbyScriptUrl = (state: RootState) => state.lobby.scriptUrl;
export const selectLobbyLocalPeerId = (state: RootState) => state.lobby.localPeerId;
export const selectLobbyServerLobbyId = (state: RootState) =>
  state.lobby.serverLobbyId;
export const selectLobbyPlayers = (state: RootState) => state.lobby.players;

export default reducer;
