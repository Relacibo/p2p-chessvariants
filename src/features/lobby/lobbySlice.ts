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
import { selectToken, selectUser, login } from "../auth/authSlice";
import { fetchAndParseFullConfig, parseScriptConfig } from "./scriptUrl";
import type { WasmVariantConfig } from "../chessboard/types";
import { getMaxSlots, isValidPlayerCount } from "./playerCountUtils";

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
  | { phase: "kicked" }
  | { phase: "game_started"; playerCount: number; setupJson?: string }
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
  /** Maps userId → WasmPlayerConfig.id (0-indexed slot). -1 means unassigned. */
  playerAssignments: Record<string, number>;
  /** Full variant configuration parsed from the script URL. */
  variantConfig: WasmVariantConfig | null;
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
  playerAssignments: {},
  variantConfig: null,
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
    _setKicked,
    _setLocalUserId,
    _setScriptUrl,
    _setServerLobbyId,
    _setAllowGuests,
    _playerJoined,
    _playerLeft,
    _playerConnectionChanged,
    _lobbyInviteReceived,
    _clearPendingInvite,
    _slotAssigned,
    _gameStarted,
    _setVariantConfig,
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
      state.playerAssignments = {};
      state.variantConfig = null;
    },
    _setKicked: (state) => {
      state.status = { phase: "kicked" };
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
      state.playerAssignments = {};
      state.variantConfig = null;
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
      const userId = action.payload;
      state.players = state.players.filter((p) => p.userId !== userId);
      delete state.playerAssignments[userId];
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
    _slotAssigned: (
      state,
      action: PayloadAction<{ userId: string; slotIndex: number }>,
    ) => {
      const { userId, slotIndex } = action.payload;
      if (slotIndex === -1) {
        delete state.playerAssignments[userId];
      } else {
        // Evict any prior holder of this slot.
        for (const uid of Object.keys(state.playerAssignments)) {
          if (state.playerAssignments[uid] === slotIndex) {
            delete state.playerAssignments[uid];
          }
        }
        state.playerAssignments[userId] = slotIndex;
      }
    },
    _gameStarted: (
      state,
      action: PayloadAction<{
        assignments: Array<{ userId: string; playerConfigId: number }>;
        playerCount: number;
        setupJson?: string;
      }>,
    ) => {
      const { assignments, playerCount, setupJson } = action.payload;
      state.playerAssignments = {};
      for (const { userId, playerConfigId } of assignments) {
        state.playerAssignments[userId] = playerConfigId;
      }
      state.status = { phase: "game_started", playerCount, setupJson };
    },
    _setVariantConfig: (state, action: PayloadAction<WasmVariantConfig>) => {
      state.variantConfig = action.payload;
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

/** Host-only callbacks wired to Redux state for slot assignment, join validation, and game start. */
function _makeHostGameCallbacks(
  dispatch: LobbyDispatch,
  getState: () => RootState,
): Pick<
  import("../../api/p2pLobbyService").P2PLobbyCallbacks,
  "onGameStart" | "onSlotRequest" | "onSlotAssigned" | "onValidateJoin" | "onJoinRejected"
> {
  return {
    onValidateJoin: (_userId, _displayName) => {
      const state = getState().lobby;
      const apc = state.variantConfig?.allowed_player_count;
      if (!apc) return true; // unknown config — allow
      const max = getMaxSlots(apc);
      // Count connected players (not just assigned). The player hasn't been added yet
      // but will be if we return true.
      const connectedCount = state.players.length;
      if (connectedCount >= max) {
        console.log(`[lobby] rejecting join: lobby full (${connectedCount}/${max})`);
        return false;
      }
      return true;
    },
    onJoinRejected: (reason) => {
      dispatch(_setError(reason));
      notifications.show({
        title: "Join rejected",
        message: reason,
        color: "red",
      });
    },
    onSlotRequest: (fromUserId, slotIndex) => {
      const state = getState().lobby;
      const assignments = state.playerAssignments;
      // Validate slotIndex against maxSlots from config
      if (slotIndex >= 0) {
        const apc = state.variantConfig?.allowed_player_count;
        if (apc) {
          const max = getMaxSlots(apc);
          if (slotIndex >= max) {
            console.log(`[lobby] rejecting slot ${slotIndex}: exceeds max ${max}`);
            return false;
          }
        }
        // Reject if another user already holds this slot.
        const holder = Object.entries(assignments).find(
          ([, s]) => s === slotIndex,
        )?.[0];
        if (holder && holder !== fromUserId) return false;
      }
      dispatch(_slotAssigned({ userId: fromUserId, slotIndex }));
      return true;
    },
    onSlotAssigned: (slotUserId, slotIndex) => {
      dispatch(_slotAssigned({ userId: slotUserId, slotIndex }));
    },
    onGameStart: ({ assignments, playerCount, setupJson }) => {
      dispatch(_gameStarted({ assignments, playerCount, setupJson }));
    },
  };
}

export function createLobby(
  scriptUrl: string,
  useServerLobby: boolean = false,
  allowGuests: boolean = true,
  guestDisplayName?: string,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const token = selectToken(getState());
    const authUser = selectUser(getState());

    // Server lobbies require authentication
    if (useServerLobby && (!token || !authUser)) {
      dispatch(_setError("Login required to create a server lobby"));
      return;
    }

    // For P2P lobbies, allow guest creation without token
    const effectiveUserId: string = authUser?.id ?? crypto.randomUUID();
    const effectiveDisplayName: string =
      authUser?.displayName ?? guestDisplayName ?? "Guest";

    dispatch(_setCreating());
    dispatch(_setScriptUrl(scriptUrl));

    try {
      // Parse the full variant config (needed for slot count and validation in all lobby types).
      let variantConfig: WasmVariantConfig | null = null;
      try {
        variantConfig = await fetchAndParseFullConfig(scriptUrl);
        dispatch(_setVariantConfig(variantConfig));
      } catch (e) {
        console.warn("[lobby] could not parse variant config for lobby creation", e);
      }

      let lobbyId: string | null = null;
      if (useServerLobby) {
        const scriptConfig = variantConfig
          ? {
              name: variantConfig.name,
              minPlayers:
                typeof variantConfig.allowed_player_count === "number"
                  ? variantConfig.allowed_player_count
                  : Array.isArray(variantConfig.allowed_player_count)
                    ? Math.min(...variantConfig.allowed_player_count)
                    : variantConfig.allowed_player_count.min,
              maxPlayers:
                typeof variantConfig.allowed_player_count === "number"
                  ? variantConfig.allowed_player_count
                  : Array.isArray(variantConfig.allowed_player_count)
                    ? Math.max(...variantConfig.allowed_player_count)
                    : variantConfig.allowed_player_count.max,
            }
          : await parseScriptConfig(scriptUrl);
        const res = await dispatch(
          api.endpoints.createLobby.initiate({
            scriptUrl,
            allowGuests,
            hostPeerSessionId: getOrCreatePeerId(authUser!.id),
            minPlayers: scriptConfig.minPlayers,
            maxPlayers: scriptConfig.maxPlayers,
          }),
        ).unwrap();
        lobbyId = res.lobbyId;
        dispatch(_setServerLobbyId(lobbyId));
      }

      dispatch(_setLocalUserId(effectiveUserId));
      dispatch(_setHostUserId(effectiveUserId));
      dispatch(
        _playerJoined({
          userId: effectiveUserId,
          name: effectiveDisplayName,
          ready: false,
          connectionStatus: "self",
        }),
      );

      if (token) {
        await _applyTurnCredentials(token);
      }

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
        effectiveUserId,
        effectiveDisplayName,
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
                  effectiveUserId,
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
          onKicked: () => {},
          onHeartbeat: (heartbeatLobbyId) => {
            const currentToken = selectToken(getState());
            heartbeat(currentToken ?? "", heartbeatLobbyId).catch((err: any) => {
              console.error("[p2p] heartbeat failed", err);
              if (err?.status === 404 || err?.status === 403) {
                handleRemoteLobbyClosed(dispatch);
              }
            });
          },
          ..._makeHostGameCallbacks(dispatch, getState),
        },
      );

      dispatch(_setIsHost(true));
      dispatch(_setMyPeerId(getOrCreatePeerId(effectiveUserId)));
      dispatch(_setHostPeerSessionId(getOrCreatePeerId(effectiveUserId)));
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
      // Parse variant config for slot count and validation
      fetchAndParseFullConfig(lobbyInfo.scriptUrl)
        .then(cfg => dispatch(_setVariantConfig(cfg)))
        .catch(e => console.warn("[lobby] could not parse variant config from lobby info", e));
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
          // Confirm to the API that we're the active host. This handles the case
          // where the peer ID changed (e.g. localStorage cleared) and ensures any
          // fresh guests joining after a refresh see the correct hostPeerSessionId.
          await Promise.all([
            dispatch(
              api.endpoints.patchLobby.initiate({
                id: lobbyId,
                patch: { hostPeerSessionId: myPeerId },
              }),
            )
              .unwrap()
              .catch((err) =>
                console.warn("[lobby] host peer session patch failed:", err),
              ),
            _applyTurnCredentials(token),
          ]);
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
              onKicked: () => {},
              onHeartbeat: (heartbeatLobbyId) => {
                const currentToken = selectToken(getState());
                heartbeat(currentToken ?? "", heartbeatLobbyId).catch((err: any) => {
                  console.error("[p2p] heartbeat failed", err);
                  if (err?.status === 404 || err?.status === 403) {
                    handleRemoteLobbyClosed(dispatch);
                  }
                });
              },
              ..._makeHostGameCallbacks(dispatch, getState),
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
        getState,
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
      getState,
      user.id,
      user.displayName ?? user.id,
      null,
      null,
    );
    await webrtcService.connectToPeers([hostUserId], user.id, true);
  };
}

/**
 * P2P-only guest join. No server lobby — the guest only needs a display name.
 * Obtains a lightweight guest token from the server (for WebRTC signaling),
 * then initiates the P2P join with the host.
 */
export function joinLobbyByPeerAsGuest(
  peerHandle: string,
  displayName: string,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    p2pLobbyService.resetP2PLobby();
    webrtcService.reset();
    dispatch(_setJoining());

    try {
      // Obtain a guest token for signaling (transparent to the user)
      const guestResult = await dispatch(
        api.endpoints.guestLogin.initiate({ displayName }),
      ).unwrap();
      dispatch(login({ token: guestResult.token, user: guestResult.user }));

      const hostUserId = userIdFromPeerHandle(peerHandle);
      const userId = guestResult.user.id;

      dispatch(_setLocalUserId(userId));
      dispatch(_setHostUserId(hostUserId));

      await _applyTurnCredentials(guestResult.token);

      webrtcService.init((toUserId, signal) => {
        const currentToken = selectToken(getState());
        return sendSignalDirect(currentToken ?? "", toUserId, signal);
      });
      _initP2PAsJoiner(dispatch, getState, userId, displayName, null, null);
      await webrtcService.connectToPeers([hostUserId], userId, true);
    } catch (err) {
      logLobbyWarning("P2P guest join failed", err);
      dispatch(
        _setError(err instanceof Error ? err.message : "Failed to join lobby"),
      );
    }
  };
}

function _initP2PAsJoiner(
  dispatch: LobbyDispatch,
  getState: () => RootState,
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
        // Parse variant config for slot count and validation
        fetchAndParseFullConfig(info.variantUrl)
          .then(cfg => dispatch(_setVariantConfig(cfg)))
          .catch(e => console.warn("[lobby] could not parse variant config from lobby info", e));
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
      onKicked: () => {
        dispatch(_setKicked());
        notifications.show({
          title: "Kicked",
          message: "You were kicked from the lobby.",
          color: "red",
        });
      },
      onGameStart: ({ assignments, playerCount, setupJson }) => {
        dispatch(_gameStarted({ assignments, playerCount, setupJson }));
      },
      onSlotAssigned: (slotUserId, slotIndex) => {
        dispatch(_slotAssigned({ userId: slotUserId, slotIndex }));
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

export function kickPlayer(userId: string): AppThunk {
  return (_dispatch, getState) => {
    const state = getState();
    if (!state.lobby.isHost) return;
    p2pLobbyService.kickPlayer(userId);
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
          onKicked: () => {},
          onHeartbeat: (heartbeatLobbyId) => {
            const currentToken = selectToken(getState());
            heartbeat(currentToken ?? "", heartbeatLobbyId).catch((err: any) => {
              console.error("[p2p] heartbeat failed", err);
              if (err?.status === 404 || err?.status === 403) {
                handleRemoteLobbyClosed(dispatch);
              }
            });
          },
          ..._makeHostGameCallbacks(dispatch, getState),
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
export const selectVariantConfig = (state: RootState) =>
  state.lobby.variantConfig;

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

export const selectPlayerAssignments = (state: RootState) =>
  state.lobby.playerAssignments;

/**
 * Request a slot (playerConfigId) in the upcoming game.
 * Host validates and broadcasts the assignment; non-host sends a request to the host.
 * slotIndex -1 to unclaim.
 */
export function requestSlot(slotIndex: number): AppThunk {
  return (_dispatch, getState) => {
    const state = getState().lobby;
    const { localUserId, hostUserId, isHost, variantConfig } = state;
    if (!localUserId) return;

    // Validate slotIndex against maxSlots from config
    if (variantConfig?.allowed_player_count && slotIndex >= 0) {
      const max = getMaxSlots(variantConfig.allowed_player_count);
      if (slotIndex >= max) {
        console.log(`[lobby] requestSlot: slot ${slotIndex} exceeds max ${max}`);
        return;
      }
    }

    if (isHost) {
      // Host assigns itself directly without a request round-trip.
      const assignments = state.playerAssignments;
      if (slotIndex !== -1) {
        const holder = Object.entries(assignments).find(
          ([, s]) => s === slotIndex,
        )?.[0];
        if (holder && holder !== localUserId) return; // slot taken
      }
      _dispatch(_slotAssigned({ userId: localUserId, slotIndex }));
      p2pLobbyService.broadcastSlotAssigned(localUserId, slotIndex);
    } else {
      if (!hostUserId) return;
      p2pLobbyService.sendSlotRequest(hostUserId, slotIndex);
    }
  };
}

/**
 * Host-only: start the game. Broadcasts GameStart to all peers and transitions
 * local state to game_started.
 */
export function startGame(): AppThunk {
  return (_dispatch, getState) => {
    const state = getState().lobby;
    if (!state.isHost) return;
    const { playerAssignments, variantConfig } = state;
    const assignedCount = Object.keys(playerAssignments).length;

    // Validate player count against allowed_player_count
    if (variantConfig?.allowed_player_count) {
      if (!isValidPlayerCount(variantConfig.allowed_player_count, assignedCount)) {
        console.log(`[lobby] startGame: player count ${assignedCount} is invalid for variant`);
        return;
      }
    }

    const assignments = Object.entries(playerAssignments).map(
      ([userId, playerConfigId]) => ({ userId, playerConfigId }),
    );
    // setupJson is generated by the engine during init. For now, pass an empty
    // default — peers will run setup_players internally when setupJson is absent.
    const setupJson = "{}";
    p2pLobbyService.broadcastGameStart(assignments, assignedCount, setupJson);
    _dispatch(_gameStarted({ assignments, playerCount: assignedCount, setupJson }));
  };
}

export default reducer;
