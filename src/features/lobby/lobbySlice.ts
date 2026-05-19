import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { notifications } from "@mantine/notifications";
import { api, getTurnCredentials, sendSignal, sendSignalDirect, heartbeat } from "../../api/api";
import {
  buildPeerHandle,
  getSessionId,
  userIdFromPeerHandle,
} from "../../api/peerSession";
import * as p2pLobbyService from "../../api/p2pLobbyService";
import * as webrtcService from "../../api/webrtcService";
import type { AppThunk, RootState } from "../../app/store";
import { selectToken, selectUser } from "../auth/authSlice";
import { parseScriptConfig } from "./scriptUrl";

export type LobbyPlayer = {
  userId: string;
  name: string | null;
  ready: boolean;
};

export type LobbyStatus =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "hosting"; inviteUrl: string; isPassiveHostTab: boolean }
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
  allowGuests: boolean;
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

const initialState: LobbyState = {
  status: { phase: "idle" },
  scriptUrl: null,
  localUserId: null,
  serverLobbyId: null,
  allowGuests: true,
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
    _setAllowGuests,
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
    _setHosting: (
      state,
      action: PayloadAction<{
        inviteUrl: string;
        allowGuests: boolean;
        isPassiveHostTab: boolean;
      }>,
    ) => {
      state.status = {
        phase: "hosting",
        inviteUrl: action.payload.inviteUrl,
        isPassiveHostTab: action.payload.isPassiveHostTab,
      };
      state.allowGuests = action.payload.allowGuests;
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
      state.allowGuests = true;
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
    _setAllowGuests: (state, action: PayloadAction<boolean>) => {
      state.allowGuests = action.payload;
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

type LobbyDispatch = Parameters<AppThunk<Promise<void>>>[0];

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

export function createLobby(
  scriptUrl: string,
  useServerLobby: boolean = false,
  allowGuests: boolean = true,
): AppThunk<Promise<void>> {
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
      if (useServerLobby) {
        const scriptConfig = await parseScriptConfig(scriptUrl);
        const res = await dispatch(
          api.endpoints.createLobby.initiate({
            scriptUrl,
            allowGuests,
            hostPeerSessionId: getSessionId(),
            minPlayers: scriptConfig.minPlayers,
            maxPlayers: scriptConfig.maxPlayers,
          }),
        ).unwrap();
        lobbyId = res.lobbyId;
        dispatch(_setServerLobbyId(lobbyId));
      }

      dispatch(_setLocalUserId(user.id));
      dispatch(
        _playerJoined({
          userId: user.id,
          name: user.displayName ?? null,
          ready: false,
        }),
      );

      await _applyTurnCredentials(token);

      if (useServerLobby && lobbyId) {
        const capturedLobbyId = lobbyId;
        webrtcService.init((toUserId, signal) => {
          const currentToken = selectToken(getState());
          return sendSignal(currentToken ?? "", capturedLobbyId, toUserId, signal);
        });
      } else {
        webrtcService.init((toUserId, signal) => {
          const currentToken = selectToken(getState());
          return sendSignalDirect(currentToken ?? "", toUserId, signal);
        });
      }

      p2pLobbyService.initP2PLobby(
        user.id,
        user.displayName ?? user.id,
        true,
        lobbyId,
        scriptUrl,
        {
          onLobbyInfo: () => {},
          onPlayerJoined: (player) =>
            dispatch(
              _playerJoined({
                userId: player.userId,
                name: player.displayName,
                ready: false,
              }),
            ),
          onPlayerLeft: (userId) => dispatch(_playerLeft(userId)),
          onHostMigration: (_newHost) => {},
          onGameMessage: () => {},
          onHeartbeat: (heartbeatLobbyId) => {
            const currentToken = selectToken(getState());
            heartbeat(currentToken ?? "", heartbeatLobbyId).catch((e) =>
              console.error("[p2p] heartbeat failed", e),
            );
          },
        },
      );

      const inviteUrl =
        useServerLobby && lobbyId
          ? window.location.origin + "/lobby/" + lobbyId
          : window.location.origin +
            "/lobby/by-peer-id/" +
            buildPeerHandle(user.id);

      dispatch(
        _setHosting({ inviteUrl, allowGuests, isPassiveHostTab: false }),
      );
      notifications.show({
        title: "Lobby created!",
        message: "Share the invite link with players.",
        color: "green",
      });
    } catch (err) {
      logLobbyWarning("create lobby failed", err);
      dispatch(
        _setError(
          err instanceof Error ? err.message : "Failed to create lobby",
        ),
      );
    }
  };
}

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
      const request = dispatch(api.endpoints.getLobby.initiate(lobbyId));
      let lobbyInfo;
      try {
        lobbyInfo = await request.unwrap();
      } finally {
        request.unsubscribe();
      }

      dispatch(_setScriptUrl(lobbyInfo.scriptUrl));
      dispatch(_setServerLobbyId(lobbyId));
      dispatch(_setLocalUserId(user.id));

      if (lobbyInfo.hostUserId === user.id) {
        const isActiveHostTab =
          !lobbyInfo.hostPeerSessionId ||
          lobbyInfo.hostPeerSessionId === getSessionId();
        dispatch(
          _playerJoined({
            userId: user.id,
            name: user.displayName ?? null,
            ready: false,
          }),
        );
        const inviteUrl = window.location.origin + "/lobby/" + lobbyId;
        dispatch(
          _setHosting({
            inviteUrl,
            allowGuests: lobbyInfo.allowGuests,
            isPassiveHostTab: !isActiveHostTab,
          }),
        );
        if (isActiveHostTab) {
          await _applyTurnCredentials(token);
          webrtcService.init((toUserId, signal) => {
            const currentToken = selectToken(getState());
            return sendSignal(currentToken ?? "", lobbyId, toUserId, signal);
          });
          p2pLobbyService.initP2PLobby(
            user.id,
            user.displayName ?? user.id,
            true,
            lobbyId,
            lobbyInfo.scriptUrl,
            {
              onLobbyInfo: () => {},
              onPlayerJoined: (player) =>
                dispatch(
                  _playerJoined({
                    userId: player.userId,
                    name: player.displayName,
                    ready: false,
                  }),
                ),
              onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
              onHostMigration: (_newHost, newLobbyId) => {
                if (newLobbyId) dispatch(_setServerLobbyId(newLobbyId));
              },
              onGameMessage: () => {},
              onHeartbeat: (heartbeatLobbyId) => {
                const currentToken = selectToken(getState());
                heartbeat(currentToken ?? "", heartbeatLobbyId).catch((e) =>
                  console.error("[p2p] heartbeat failed", e),
                );
              },
            },
          );
        }
        return;
      }

      await _applyTurnCredentials(token);
      webrtcService.init((toUserId, signal) => {
        const currentToken = selectToken(getState());
        return sendSignal(currentToken ?? "", lobbyId, toUserId, signal);
      });
      _initP2PAsJoiner(
        dispatch,
        user.id,
        user.displayName ?? user.id,
        lobbyId,
        lobbyInfo.scriptUrl,
      );
      await webrtcService.connectToPeers([lobbyInfo.hostUserId], user.id, true);
    } catch (err) {
      logLobbyWarning("join lobby failed", err);
      dispatch(
        _setError(err instanceof Error ? err.message : "Failed to join lobby"),
      );
    }
  };
}

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

    const hostUserId = userIdFromPeerHandle(peerHandle);

    dispatch(_setJoining());
    dispatch(_setLocalUserId(user.id));

    await _applyTurnCredentials(token);

    webrtcService.init((toUserId, signal) => {
      const currentToken = selectToken(getState());
      return sendSignalDirect(currentToken ?? "", toUserId, signal);
    });
    _initP2PAsJoiner(
      dispatch,
      user.id,
      user.displayName ?? user.id,
      null,
      null,
    );
    await webrtcService.connectToPeers([hostUserId], user.id, true);
  };
}

function _initP2PAsJoiner(
  dispatch: LobbyDispatch,
  userId: string,
  displayName: string,
  lobbyId: string | null,
  variantUrl: string | null,
): void {
  p2pLobbyService.initP2PLobby(
    userId,
    displayName,
    false,
    lobbyId,
    variantUrl,
    {
      onLobbyInfo: (info) => {
        dispatch(_setScriptUrl(info.variantUrl));
        for (const p of info.players) {
          dispatch(
            _playerJoined({
              userId: p.userId,
              name: p.displayName,
              ready: false,
            }),
          );
        }
        dispatch(_setActive());
      },
      onPlayerJoined: (player) =>
        dispatch(
          _playerJoined({
            userId: player.userId,
            name: player.displayName,
            ready: false,
          }),
        ),
      onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
      onHostMigration: (_newHost, newLobbyId) => {
        if (newLobbyId) dispatch(_setServerLobbyId(newLobbyId));
      },
      onGameMessage: () => {},
    },
  );
}

export function leaveLobby(): AppThunk<Promise<void>> {
  return async (dispatch) => {
    p2pLobbyService.leaveLobby();
    webrtcService.reset();
    dispatch(_setIdle());
  };
}

export function closeLobby(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { serverLobbyId } = getState().lobby;

    p2pLobbyService.leaveLobby();
    webrtcService.reset();

    if (serverLobbyId) {
      try {
        await dispatch(
          api.endpoints.deleteLobby.initiate(serverLobbyId),
        ).unwrap();
      } catch (err) {
        logLobbyWarning("delete lobby failed during cleanup", err);
      }
    }
    dispatch(_setIdle());
  };
}

export function becomeActiveHost(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const state = getState();
    const { serverLobbyId } = state.lobby;
    const lobbyStatus = selectLobbyStatus(state);
    const token = selectToken(state);
    const user = selectUser(state);
    if (!token || !user || !serverLobbyId || lobbyStatus.phase !== "hosting")
      return;

    try {
      await dispatch(
        api.endpoints.patchLobby.initiate({
          id: serverLobbyId,
          patch: { hostPeerSessionId: getSessionId() },
        }),
      ).unwrap();
      await _applyTurnCredentials(token);
      webrtcService.init((toUserId, signal) => {
        const currentToken = selectToken(getState());
        return sendSignal(currentToken ?? "", serverLobbyId, toUserId, signal);
      });
      const currentScriptUrl = getState().lobby.scriptUrl;
      p2pLobbyService.initP2PLobby(
        user.id,
        user.displayName ?? user.id,
        true,
        serverLobbyId,
        currentScriptUrl,
        {
          onLobbyInfo: () => {},
          onPlayerJoined: (player) =>
            dispatch(
              _playerJoined({
                userId: player.userId,
                name: player.displayName,
                ready: false,
              }),
            ),
          onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
          onHostMigration: (_newHost, newLobbyId) => {
            if (newLobbyId) dispatch(_setServerLobbyId(newLobbyId));
          },
          onGameMessage: () => {},
          onHeartbeat: (heartbeatLobbyId) => {
            const currentToken = selectToken(getState());
            heartbeat(currentToken ?? "", heartbeatLobbyId).catch((e) =>
              console.error("[p2p] heartbeat failed", e),
            );
          },
        },
      );
      dispatch(_setHosting({ inviteUrl: lobbyStatus.inviteUrl, allowGuests: getState().lobby.allowGuests, isPassiveHostTab: false }));
      notifications.show({
        title: "Active host",
        message: "This tab is now the active host.",
        color: "green",
      });
    } catch (err) {
      logLobbyWarning("become active host failed", err);
    }
  };
}

export function setLobbyAllowGuests(val: boolean): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { serverLobbyId } = getState().lobby;
    dispatch(_setAllowGuests(val));
    if (serverLobbyId) {
      try {
        await dispatch(
          api.endpoints.patchLobby.initiate({ id: serverLobbyId, patch: { allowGuests: val } }),
        ).unwrap();
      } catch (err) {
        dispatch(_setAllowGuests(!val)); // revert
        logLobbyWarning("update allow guests failed", err);
      }
    }
  };
}

export const selectLobbyStatus = (state: RootState) => state.lobby.status;
export const selectLobbyScriptUrl = (state: RootState) => state.lobby.scriptUrl;
export const selectLobbyLocalUserId = (state: RootState) =>
  state.lobby.localUserId;
export const selectLobbyServerLobbyId = (state: RootState) =>
  state.lobby.serverLobbyId;
export const selectLobbyAllowGuests = (state: RootState) => state.lobby.allowGuests;
export const selectLobbyPlayers = (state: RootState) => state.lobby.players;
export const selectPendingInvite = (state: RootState) =>
  state.lobby.pendingInvite;

export default reducer;
