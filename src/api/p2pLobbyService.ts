/**
 * P2P lobby logic: encodes/decodes Bebop P2PMsg over WebRTC DataChannels.
 * Handles host duties (send LobbyInfo, broadcast PlayerJoined/Left)
 * and client duties (send LobbyJoin, receive LobbyInfo).
 */

import {
  P2PMsg,
  LobbyJoin,
  LobbyInfo,
  PlayerJoined,
  PlayerLeft,
  HostMigration,
  LobbyLeave,
  GameMessage,
  Player,
} from "./bebop/generated";
import * as webrtcService from "./webrtcService";
import * as lobbyApi from "./lobbyApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type P2PLobbyPlayer = {
  userId: string;
  displayName: string;
};

export type P2PLobbyCallbacks = {
  onLobbyInfo: (info: {
    variantUrl: string;
    players: P2PLobbyPlayer[];
    hostPriority: string[];
  }) => void;
  onPlayerJoined: (player: P2PLobbyPlayer) => void;
  onPlayerLeft: (userId: string) => void;
  onHostMigration: (newHostUserId: string, lobbyId?: string) => void;
  onGameMessage: (fromUserId: string, payload: Uint8Array) => void;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let myUserId: string | null = null;
let isHost = false;
let serverLobbyId: string | null = null;
let hostPriority: string[] = [];
let players: P2PLobbyPlayer[] = [];
let callbacks: P2PLobbyCallbacks | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let token: string | null = null;

// ---------------------------------------------------------------------------
// Init / Reset
// ---------------------------------------------------------------------------

export function initP2PLobby(
  userId: string,
  _isHost: boolean,
  lobbyId: string | null,
  _token: string | null,
  cbs: P2PLobbyCallbacks
): void {
  myUserId = userId;
  isHost = _isHost;
  serverLobbyId = lobbyId;
  token = _token;
  callbacks = cbs;
  players = [];
  hostPriority = [userId];

  webrtcService.setMessageCallback((fromUserId, data) => {
    try {
      const msg = P2PMsg.decode(data);
      handleMessage(fromUserId, msg);
    } catch (e) {
      console.error("[p2p] failed to decode message", e);
    }
  });

  if (isHost && serverLobbyId && token) {
    startHeartbeat(serverLobbyId, token);
  }
}

export function resetP2PLobby(): void {
  stopHeartbeat();
  myUserId = null;
  isHost = false;
  serverLobbyId = null;
  token = null;
  callbacks = null;
  players = [];
  hostPriority = [];
}

// ---------------------------------------------------------------------------
// Outgoing messages
// ---------------------------------------------------------------------------

/** Joiner calls this after WebRTC connect to announce themselves to the host. */
export function sendLobbyJoin(toUserId: string): void {
  if (!myUserId) return;
  const msg = P2PMsg.encode({
    tag: 1,
    value: LobbyJoin({ userId: myUserId, displayName: "" }),
  });
  webrtcService.sendToPeer(toUserId, msg);
}

export function sendGameMessage(toUserId: string, payload: Uint8Array<ArrayBuffer>): void {
  const msg = P2PMsg.encode({ tag: 7, value: GameMessage({ payload }) });
  webrtcService.sendToPeer(toUserId, msg);
}

export function broadcastGameMessage(payload: Uint8Array<ArrayBuffer>): void {
  const msg = P2PMsg.encode({ tag: 7, value: GameMessage({ payload }) });
  webrtcService.sendToAll(msg);
}

// ---------------------------------------------------------------------------
// Incoming message handler
// ---------------------------------------------------------------------------

function handleMessage(fromUserId: string, msg: ReturnType<typeof P2PMsg.decode>): void {
  switch (msg.tag) {
    case 1: // LobbyJoin — only host handles this
      if (isHost) handleLobbyJoin(fromUserId, msg.value as LobbyJoin);
      break;
    case 2: // LobbyInfo — only joiners receive this
      handleLobbyInfo(msg.value as LobbyInfo);
      break;
    case 3: // PlayerJoined
      handlePlayerJoined(msg.value as PlayerJoined);
      break;
    case 4: // PlayerLeft
      handlePlayerLeft(msg.value as PlayerLeft);
      break;
    case 5: // HostMigration
      handleHostMigration(msg.value as HostMigration);
      break;
    case 6: // LobbyLeave
      handlePlayerLeft({ userId: fromUserId });
      break;
    case 7: // GameMessage
      callbacks?.onGameMessage(fromUserId, (msg.value as GameMessage).payload ?? new Uint8Array());
      break;
  }
}

// ---------------------------------------------------------------------------
// Host logic
// ---------------------------------------------------------------------------

function handleLobbyJoin(fromUserId: string, join: LobbyJoin): void {
  const userId = join.userId ?? fromUserId;
  const displayName = join.displayName ?? userId;

  // Add to list if not already present
  if (!players.find((p) => p.userId === userId)) {
    players.push({ userId, displayName });
    hostPriority.push(userId);
  }

  // Send full lobby state back to the joiner
  const lobbyInfoMsg = P2PMsg.encode({
    tag: 2,
    value: LobbyInfo({
      variantUrl: serverLobbyId ? undefined : undefined, // host has the URL from state
      players: players.map((p): Player => ({ userId: p.userId, displayName: p.displayName })),
      hostPriority: hostPriority,
    }),
  });
  webrtcService.sendToPeer(userId, lobbyInfoMsg);

  // Broadcast PlayerJoined to all other peers
  const joinedMsg = P2PMsg.encode({
    tag: 3,
    value: PlayerJoined({
      player: { userId, displayName } as Player,
    }),
  });
  for (const p of players) {
    if (p.userId !== userId && p.userId !== myUserId) {
      webrtcService.sendToPeer(p.userId, joinedMsg);
    }
  }
}

// ---------------------------------------------------------------------------
// Client/shared logic
// ---------------------------------------------------------------------------

function handleLobbyInfo(info: LobbyInfo): void {
  players = (info.players ?? []).map((p: Player) => ({
    userId: p.userId ?? "",
    displayName: p.displayName ?? "",
  }));
  hostPriority = info.hostPriority ?? [];
  callbacks?.onLobbyInfo({
    variantUrl: info.variantUrl ?? "",
    players,
    hostPriority,
  });
}

function handlePlayerJoined(msg: PlayerJoined): void {
  const userId = msg.player?.userId ?? "";
  const displayName = msg.player?.displayName ?? userId;
  if (!players.find((p) => p.userId === userId)) {
    players.push({ userId, displayName });
    if (!hostPriority.includes(userId)) hostPriority.push(userId);
  }
  callbacks?.onPlayerJoined({ userId, displayName });
}

function handlePlayerLeft(msg: { userId?: string }): void {
  const userId = msg.userId ?? "";
  players = players.filter((p) => p.userId !== userId);

  const wasHost = hostPriority[0] === userId;
  hostPriority = hostPriority.filter((id) => id !== userId);

  callbacks?.onPlayerLeft(userId);

  if (wasHost) {
    tryBecomingHost();
  }
}

function handleHostMigration(msg: HostMigration): void {
  const newHostUserId = msg.newHostUserId ?? "";
  hostPriority = [newHostUserId, ...hostPriority.filter((id) => id !== newHostUserId)];
  callbacks?.onHostMigration(newHostUserId, msg.lobbyId ?? undefined);

  if (newHostUserId === myUserId) {
    isHost = true;
    if (serverLobbyId && token) startHeartbeat(serverLobbyId, token);
  }
}

// ---------------------------------------------------------------------------
// Host migration
// ---------------------------------------------------------------------------

function tryBecomingHost(): void {
  if (!myUserId || hostPriority[0] !== myUserId) return;

  isHost = true;
  console.info("[p2p] I am now the host");

  // Re-register with server if we have a lobby
  if (serverLobbyId && token) {
    startHeartbeat(serverLobbyId, token);
  }

  // Announce to all peers
  const migrationMsg = P2PMsg.encode({
    tag: 5,
    value: HostMigration({
      newHostUserId: myUserId,
      lobbyId: serverLobbyId ?? "",
    }),
  });
  webrtcService.sendToAll(migrationMsg);
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

function startHeartbeat(lobbyId: string, authToken: string): void {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    lobbyApi
      .heartbeat(lobbyId, authToken)
      .catch((e) => console.error("[p2p] heartbeat failed", e));
  }, 60_000);
}

function stopHeartbeat(): void {
  if (heartbeatInterval !== null) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/** Call when a peer disconnects (from webrtcService connectionState callback). */
export function onPeerDisconnected(userId: string): void {
  handlePlayerLeft({ userId });
}

/** Send LobbyLeave to all peers and clean up. */
export function leaveLobby(): void {
  const msg = P2PMsg.encode({ tag: 6, value: LobbyLeave({}) });
  webrtcService.sendToAll(msg);
  resetP2PLobby();
}
