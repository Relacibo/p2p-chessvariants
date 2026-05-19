/**
 * P2P lobby logic: encodes/decodes Bebop P2PMsg over WebRTC DataChannels.
 * Handles host duties (send LobbyInfo, broadcast PlayerJoined/Left)
 * and client duties (send LobbyJoin, receive LobbyInfo).
 */

import {
  GameMessage,
  HostMigration,
  LobbyInfo,
  LobbyJoin,
  LobbyLeave,
  P2PMsg,
  Player,
  PlayerJoined,
  PlayerLeft,
} from "./bebop/generated";
import * as webrtcService from "./webrtcService";

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
  onHeartbeat?: (lobbyId: string) => void;
};

let myUserId: string | null = null;
let myDisplayName: string | null = null;
let isHost = false;
let serverLobbyId: string | null = null;
let scriptUrl: string | null = null;
let hostPriority: string[] = [];
let players: P2PLobbyPlayer[] = [];
let callbacks: P2PLobbyCallbacks | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function initP2PLobby(
  userId: string,
  displayName: string,
  _isHost: boolean,
  lobbyId: string | null,
  variantUrl: string | null,
  cbs: P2PLobbyCallbacks,
): void {
  myUserId = userId;
  myDisplayName = displayName;
  isHost = _isHost;
  serverLobbyId = lobbyId;
  scriptUrl = variantUrl;
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

  if (!isHost) {
    webrtcService.onPeerConnected((connectedUserId) => {
      sendLobbyJoin(connectedUserId);
    });
  }

  if (isHost && serverLobbyId) {
    startHeartbeat(serverLobbyId);
  }
}

export function resetP2PLobby(): void {
  stopHeartbeat();
  myUserId = null;
  myDisplayName = null;
  isHost = false;
  serverLobbyId = null;
  scriptUrl = null;
  callbacks = null;
  players = [];
  hostPriority = [];
}

export function sendLobbyJoin(toUserId: string): void {
  if (!myUserId) return;
  const msg = P2PMsg.encode({
    tag: 1,
    value: LobbyJoin({
      userId: myUserId,
      displayName: myDisplayName ?? myUserId,
    }),
  });
  webrtcService.sendToPeer(toUserId, msg);
}

export function sendGameMessage(
  toUserId: string,
  payload: Uint8Array<ArrayBuffer>,
): void {
  const msg = P2PMsg.encode({ tag: 7, value: GameMessage({ payload }) });
  webrtcService.sendToPeer(toUserId, msg);
}

export function broadcastGameMessage(payload: Uint8Array<ArrayBuffer>): void {
  const msg = P2PMsg.encode({ tag: 7, value: GameMessage({ payload }) });
  webrtcService.sendToAll(msg);
}

function handleMessage(
  fromUserId: string,
  msg: ReturnType<typeof P2PMsg.decode>,
): void {
  switch (msg.tag) {
    case 1:
      if (isHost) handleLobbyJoin(fromUserId, msg.value as LobbyJoin);
      break;
    case 2:
      handleLobbyInfo(msg.value as LobbyInfo);
      break;
    case 3:
      handlePlayerJoined(msg.value as PlayerJoined);
      break;
    case 4:
      handlePlayerLeft(msg.value as PlayerLeft);
      break;
    case 5:
      handleHostMigration(msg.value as HostMigration);
      break;
    case 6:
      handlePlayerLeft({ userId: fromUserId });
      break;
    case 7:
      callbacks?.onGameMessage(
        fromUserId,
        (msg.value as GameMessage).payload ?? new Uint8Array(),
      );
      break;
  }
}

function handleLobbyJoin(fromUserId: string, join: LobbyJoin): void {
  const userId = join.userId ?? fromUserId;
  const displayName = join.displayName ?? userId;

  if (!players.find((p) => p.userId === userId)) {
    players.push({ userId, displayName });
    hostPriority.push(userId);
  }

  const lobbyInfoMsg = P2PMsg.encode({
    tag: 2,
    value: LobbyInfo({
      variantUrl: scriptUrl ?? "",
      players: players.map(
        (p): Player => ({ userId: p.userId, displayName: p.displayName }),
      ),
      hostPriority,
    }),
  });
  webrtcService.sendToPeer(userId, lobbyInfoMsg);

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
  if (msg.lobbyId) {
    serverLobbyId = msg.lobbyId;
  }
  hostPriority = [
    newHostUserId,
    ...hostPriority.filter((id) => id !== newHostUserId),
  ];
  callbacks?.onHostMigration(newHostUserId, msg.lobbyId ?? undefined);

  if (newHostUserId === myUserId && serverLobbyId) {
    isHost = true;
    startHeartbeat(serverLobbyId);
  }
}

function tryBecomingHost(): void {
  if (!myUserId || hostPriority[0] !== myUserId) return;

  isHost = true;
  console.info("[p2p] I am now the host");

  if (serverLobbyId) {
    startHeartbeat(serverLobbyId);
  }

  const migrationMsg = P2PMsg.encode({
    tag: 5,
    value: HostMigration({
      newHostUserId: myUserId,
      lobbyId: serverLobbyId ?? "",
    }),
  });
  webrtcService.sendToAll(migrationMsg);
}

function startHeartbeat(lobbyId: string): void {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    callbacks?.onHeartbeat?.(lobbyId);
  }, 60_000);
}

function stopHeartbeat(): void {
  if (heartbeatInterval !== null) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function onPeerDisconnected(userId: string): void {
  handlePlayerLeft({ userId });
}

export function leaveLobby(): void {
  const msg = P2PMsg.encode({ tag: 6, value: LobbyLeave({}) });
  webrtcService.sendToAll(msg);
  resetP2PLobby();
}
