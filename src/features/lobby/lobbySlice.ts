import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { notifications } from "@mantine/notifications";
import { api, getTurnCredentials, sendSignal, sendSignalDirect, heartbeat } from "../../api/api";
import {
  buildPeerHandle,
  getOrCreatePeerId,
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
  connectionStatus: "self" | "connecting" | "connected" | "failed";
};

export type LobbyStatus =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "joining" }
  | { phase: "active" }
  | { phase: "closed" }
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
  isHost: boolean;
  isPrimaryTab: boolean;
  myPeerId: string | null;
  hostUserId: string | null;
  hostPeerSessionId: string | null;
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
  isHost: false,
  isPrimaryTab: true,
  myPeerId: null,
  hostUserId: null,
  hostPeerSessionId: null,
  allowGuests: true,
  players: [],
  pendingInvite: null,
};

export const {
  actions: {
    _setCreating,
    _setIsHost,
    _setIsPrimaryTab,
    _setMyPeerId,
    _setHostUserId,
    _setHostPeerSessionId,
    _setJoining,
    _setActive,
    _setError,
    _setLobbyClosed,
    _setIdle,
    _setLocalUserId,
    _setScriptUrl,
    _setServerLobbyId,
    _setAllowGuests,
    _playerJoined,
    _playerLeft,
    _playerConnectionChanged,
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
    _setIsHost: (state, action: PayloadAction<boolean>) => {
      state.isHost = action.payload;
    },
    _setIsPrimaryTab: (state, action: PayloadAction<boolean>) => {
      state.isPrimaryTab = action.payload;
    },
    _setMyPeerId: (state, action: PayloadAction<string | null>) => {
      state.myPeerId = action.payload;
    },
    _setHostUserId: (state, action: PayloadAction<string | null>) => {
      state.hostUserId = action.payload;
    },
    _setHostPeerSessionId: (state, action: PayloadAction<string | null>) => {
      state.hostPeerSessionId = action.payload;
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
    _setLobbyClosed: (state) => {
      state.status = { phase: "closed" };
    },
    _setIdle: (state) => {
      state.status = { phase: "idle" };
      state.scriptUrl = null;
      state.localUserId = null;
      state.serverLobbyId = null;
      state.isHost = false;
      state.isPrimaryTab = true;
      state.myPeerId = null;
      state.hostUserId = null;
      state.hostPeerSessionId = null;
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
    _playerConnectionChanged: (
      state,
      action: PayloadAction<{
        userId: string;
        status: "connecting" | "connected" | "failed";
      }>,
    ) => {
      const player = state.players.find((p) => p.userId === action.payload.userId);
      if (player) {
        player.connectionStatus = action.payload.status;
      }
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

function getInitialConnectionStatus(
  localUserId: string,
  playerUserId: string,
): LobbyPlayer["connectionStatus"] {
  if (playerUserId === localUserId) {
    return "self";
  }
  return webrtcService.hasPeer(playerUserId) ? "connected" : "connecting";
}

function mapConnectionStateToStatus(
  state: RTCPeerConnectionState,
): "connecting" | "connected" | "failed" {
  if (state === "connected") {
    return "connected";
  }
  if (state === "failed" || state === "closed") {
    return "failed";
  }
  // "disconnected" is transient — show as connecting (yellow) while ICE tries to recover
  return "connecting";
}

function handleRemoteLobbyClosed(dispatch: LobbyDispatch): void {
  p2pLobbyService.resetP2PLobby();
  webrtcService.reset();
  dispatch(_setLobbyClosed());
  notifications.show({
    title: "Lobby closed",
    message: "The host closed the lobby.",
    color: "gray",
  });
}

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
            hostPeerSessionId: getOrCreatePeerId(user.id),
            minPlayers: scriptConfig.minPlayers,
            maxPlayers: scriptConfig.maxPlayers,
          }),
        ).unwrap();
        lobbyId = res.lobbyId;
        dispatch(_setServerLobbyId(lobbyId));
      }

      dispatch(_setLocalUserId(user.id));
      dispatch(_setHostUserId(user.id));
      dispatch(
        _playerJoined({
          userId: user.id,
          name: user.displayName ?? null,
          ready: false,
          connectionStatus: "self",
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
                connectionStatus: getInitialConnectionStatus(
                  user.id,
                  player.userId,
                ),
              }),
            ),
          onPlayerLeft: (userId) => dispatch(_playerLeft(userId)),
          onGameMessage: () => {},
          onConnectionStateChanged: (peerUserId, state) => {
            dispatch(
              _playerConnectionChanged({
                userId: peerUserId,
                status: mapConnectionStateToStatus(state),
              }),
            );
          },
          onLobbyClosed: () => {},
          onHeartbeat: (heartbeatLobbyId) => {
            const currentToken = selectToken(getState());
            heartbeat(currentToken ?? "", heartbeatLobbyId).catch((err: any) => {
              console.error("[p2p] heartbeat failed", err);
              if (err?.status === 404 || err?.status === 403) {
                handleRemoteLobbyClosed(dispatch);
              }
            });
          },
        },
      );

      dispatch(_setIsHost(true));
      dispatch(_setMyPeerId(getOrCreatePeerId(user.id)));
      dispatch(_setHostPeerSessionId(getOrCreatePeerId(user.id)));
      dispatch(_setActive());
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

    p2pLobbyService.resetP2PLobby();
    webrtcService.reset();
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
      dispatch(_setHostUserId(lobbyInfo.hostUserId));

      if (lobbyInfo.hostUserId === user.id) {
        const myPeerId = getOrCreatePeerId(user.id);
        const isActiveHostTab =
          !lobbyInfo.hostPeerSessionId ||
          lobbyInfo.hostPeerSessionId === myPeerId;
        dispatch(
          _playerJoined({
            userId: user.id,
            name: user.displayName ?? null,
            ready: false,
            connectionStatus: "self",
          }),
        );
        dispatch(_setIsHost(true));
        dispatch(_setMyPeerId(myPeerId));
        dispatch(_setHostPeerSessionId(lobbyInfo.hostPeerSessionId ?? null));
        dispatch(_setAllowGuests(lobbyInfo.allowGuests));
        dispatch(_setActive());
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
                    connectionStatus: getInitialConnectionStatus(
                      user.id,
                      player.userId,
                    ),
                  }),
                ),
              onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
              onGameMessage: () => {},
              onConnectionStateChanged: (peerUserId, state) => {
                dispatch(
                  _playerConnectionChanged({
                    userId: peerUserId,
                    status: mapConnectionStateToStatus(state),
                  }),
                );
              },
              onLobbyClosed: () => {},
              onHeartbeat: (heartbeatLobbyId) => {
                const currentToken = selectToken(getState());
                heartbeat(currentToken ?? "", heartbeatLobbyId).catch((err: any) => {
                  console.error("[p2p] heartbeat failed", err);
                  if (err?.status === 404 || err?.status === 403) {
                    handleRemoteLobbyClosed(dispatch);
                  }
                });
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

    p2pLobbyService.resetP2PLobby();
    webrtcService.reset();
    dispatch(_setJoining());
    dispatch(_setLocalUserId(user.id));
    dispatch(_setHostUserId(hostUserId));

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
        if (info.hostUserId) dispatch(_setHostUserId(info.hostUserId));
        for (const p of info.players) {
          dispatch(
            _playerJoined({
              userId: p.userId,
              name: p.displayName,
              ready: false,
              connectionStatus: getInitialConnectionStatus(userId, p.userId),
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
            connectionStatus: getInitialConnectionStatus(userId, player.userId),
          }),
        ),
      onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
      onGameMessage: () => {},
      onConnectionStateChanged: (peerUserId, state) => {
        dispatch(
          _playerConnectionChanged({
            userId: peerUserId,
            status: mapConnectionStateToStatus(state),
          }),
        );
      },
      onLobbyClosed: () => {
        handleRemoteLobbyClosed(dispatch);
      },
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
    const token = selectToken(state);
    const user = selectUser(state);
    if (!token || !user || !serverLobbyId || !state.lobby.isHost)
      return;

    try {
      const myPeerId = getOrCreatePeerId(user.id);
      await dispatch(
        api.endpoints.patchLobby.initiate({
          id: serverLobbyId,
          patch: { hostPeerSessionId: myPeerId },
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
                connectionStatus: getInitialConnectionStatus(
                  user.id,
                  player.userId,
                ),
              }),
            ),
          onPlayerLeft: (uid) => dispatch(_playerLeft(uid)),
          onGameMessage: () => {},
          onConnectionStateChanged: (peerUserId, state) => {
            dispatch(
              _playerConnectionChanged({
                userId: peerUserId,
                status: mapConnectionStateToStatus(state),
              }),
            );
          },
          onLobbyClosed: () => {},
          onHeartbeat: (heartbeatLobbyId) => {
            const currentToken = selectToken(getState());
            heartbeat(currentToken ?? "", heartbeatLobbyId).catch((err: any) => {
              console.error("[p2p] heartbeat failed", err);
              if (err?.status === 404 || err?.status === 403) {
                handleRemoteLobbyClosed(dispatch);
              }
            });
          },
        },
      );
      dispatch(_setMyPeerId(myPeerId));
      dispatch(_setHostPeerSessionId(myPeerId));
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
export const selectScriptUrl = selectLobbyScriptUrl;
export const selectLobbyLocalUserId = (state: RootState) =>
  state.lobby.localUserId;
export const selectLobbyServerLobbyId = (state: RootState) =>
  state.lobby.serverLobbyId;
export const selectServerLobbyId = selectLobbyServerLobbyId;
export const selectIsHost = (state: RootState) => state.lobby.isHost;
export const selectIsPrimaryTab = (state: RootState) => state.lobby.isPrimaryTab;
export const selectHostUserId = (state: RootState) => state.lobby.hostUserId;
export const selectHostPeerSessionId = (state: RootState) =>
  state.lobby.hostPeerSessionId;
export const selectLobbyAllowGuests = (state: RootState) => state.lobby.allowGuests;
export const selectLobbyPlayers = (state: RootState) => state.lobby.players;
export const selectPendingInvite = (state: RootState) =>
  state.lobby.pendingInvite;

export const selectInviteUrl = (state: RootState): string => {
  const { isHost, serverLobbyId, localUserId } = state.lobby;
  if (serverLobbyId)
    return window.location.origin + "/lobby/" + serverLobbyId;
  if (isHost && localUserId)
    return (
      window.location.origin +
      "/lobby/by-peer-id/" +
      buildPeerHandle(localUserId)
    );
  return "";
};

export const selectIsPassiveHostTab = (state: RootState): boolean => {
  const { isHost, hostPeerSessionId, myPeerId } = state.lobby;
  return (
    isHost && !!hostPeerSessionId && !!myPeerId && hostPeerSessionId !== myPeerId
  );
};

export default reducer;
