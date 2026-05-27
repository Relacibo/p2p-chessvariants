/**
 * P2P lobby logic: encodes/decodes Bebop P2PMsg over WebRTC DataChannels.
 * Handles host duties (send LobbyInfo, broadcast PlayerJoined/Left)
 * and client duties (send LobbyJoin, receive LobbyInfo).
 */

import {
  GameMessage,
  LobbyInfo,
  LobbyJoin,
  LobbyKick,
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
    hostUserId: string | null;
  }) => void;
  onPlayerJoined: (player: P2PLobbyPlayer) => void;
  onPlayerLeft: (userId: string) => void;
  onGameMessage: (fromUserId: string, payload: Uint8Array) => void;
  onConnectionStateChanged: (
    userId: string,
    state: RTCPeerConnectionState,
  ) => void;
  onLobbyClosed: () => void;
  onKicked: () => void;
  onHeartbeat?: (lobbyId: string) => void;
};

let myUserId: string | null = null;
let myDisplayName: string | null = null;
let isHost = false;
let serverLobbyId: string | null = null;
let scriptUrl: string | null = null;
let currentHostId: string | null = null;
let players: P2PLobbyPlayer[] = [];
let callbacks: P2PLobbyCallbacks | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Best known state timestamp from incoming LobbyJoin messages (used on host reconnect)
let bestStateTimestamp = 0n;

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 3000;

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
  players = [{ userId, displayName }];
  currentHostId = isHost ? userId : null;

  webrtcService.setMessageCallback((fromUserId, data) => {
    try {
      const msg = P2PMsg.decode(data);
      handleMessage(fromUserId, msg);
    } catch (e) {
      console.error("[p2p] failed to decode message", e);
    }
  });

  webrtcService.onPeerDisconnected((disconnectedUserId) => {
    handlePeerDisconnected(disconnectedUserId);
  });
  webrtcService.onConnectionStateChanged((userId, state) => {
    callbacks?.onConnectionStateChanged(userId, state);
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
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  bestStateTimestamp = 0n;
  myUserId = null;
  myDisplayName = null;
  isHost = false;
  serverLobbyId = null;
  scriptUrl = null;
  callbacks = null;
  players = [];
  currentHostId = null;
}

export function sendLobbyJoin(toUserId: string): void {
  if (!myUserId) return;
  console.log(`[p2p] sendLobbyJoin → ${toUserId.slice(0, 8)} (me: ${myUserId.slice(0, 8)})`);
  const msg = P2PMsg.encode({
    tag: 1,
    value: LobbyJoin({
      userId: myUserId,
      displayName: myDisplayName ?? myUserId,
      knownPlayers: players.map((p): Player => ({ userId: p.userId, displayName: p.displayName })),
      stateTimestamp: BigInt(Date.now()),
    }),
  });
  const sent = webrtcService.sendToPeer(toUserId, msg);
  console.log(`[p2p] sendLobbyJoin result: ${sent ? "sent" : "FAILED - channel not ready"}`);
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
  const tagNames: Record<number, string> = {1:"LobbyJoin",2:"LobbyInfo",3:"PlayerJoined",4:"PlayerLeft",6:"LobbyLeave",7:"GameMessage",8:"LobbyKick"};
  console.log(`[p2p] received ${tagNames[msg.tag] ?? `tag=${msg.tag}`} from ${fromUserId.slice(0, 8)} (isHost=${isHost})`);
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
    case 6:
      if (currentHostId === fromUserId && !isHost) {
        callbacks?.onLobbyClosed();
        currentHostId = null;
      } else {
        handlePlayerLeft({ userId: fromUserId });
      }
      break;
    case 7:
      callbacks?.onGameMessage(
        fromUserId,
        (msg.value as GameMessage).payload ?? new Uint8Array(),
      );
      break;
    case 8:
      if (currentHostId === fromUserId) {
        handleLobbyKick(msg.value as LobbyKick);
      }
      break;
  }
}

function handleLobbyJoin(fromUserId: string, join: LobbyJoin): void {
  const userId = join.userId ?? fromUserId;
  const displayName = join.displayName ?? userId;
  const ts = join.stateTimestamp ?? 0n;
  console.log(`[p2p] handleLobbyJoin from ${userId.slice(0, 8)}, ts=${ts}, bestTs=${bestStateTimestamp}, current players: [${players.map(p=>p.userId.slice(0,8)).join(", ")}]`);

  // If this guest has a newer snapshot than what we know, merge their player list.
  // This helps rebuild state after a host refresh.
  if (ts > bestStateTimestamp && join.knownPlayers && join.knownPlayers.length > 0) {
    bestStateTimestamp = ts;
    for (const kp of join.knownPlayers) {
      if (!kp.userId || kp.userId === myUserId) continue;
      if (!players.find((p) => p.userId === kp.userId)) {
        const p = { userId: kp.userId, displayName: kp.displayName ?? kp.userId };
        players.push(p);
        // Notify Redux — connection status will be "connecting" until they reconnect
        callbacks?.onPlayerJoined({ userId: p.userId, displayName: p.displayName });
        console.log(`[p2p] merged known player ${p.userId.slice(0, 8)} from snapshot`);
      }
    }
  }

  if (!players.find((p) => p.userId === userId)) {
    players.push({ userId, displayName });
    callbacks?.onPlayerJoined({ userId, displayName });
  }

  console.log(`[p2p] sending LobbyInfo to ${userId.slice(0, 8)}, players: [${players.map(p=>p.userId.slice(0,8)).join(", ")}]`);
  const lobbyInfoMsg = P2PMsg.encode({
    tag: 2,
    value: LobbyInfo({
      variantUrl: scriptUrl ?? "",
      players: players.map(
        (p): Player => ({ userId: p.userId, displayName: p.displayName }),
      ),
      hostPriority: [myUserId!],
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
  reconnectAttempts = 0;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  players = (info.players ?? []).map((p: Player) => ({
    userId: p.userId ?? "",
    displayName: p.displayName ?? "",
  }));
  currentHostId = info.hostPriority?.[0] ?? null;
  console.log(`[p2p] handleLobbyInfo: players=[${players.map(p=>p.userId.slice(0,8)).join(", ")}], host=${currentHostId?.slice(0,8)}`);
  callbacks?.onLobbyInfo({
    variantUrl: info.variantUrl ?? "",
    players,
    hostUserId: currentHostId,
  });

  const hostId = currentHostId ?? "";
  for (const p of players) {
    if (p.userId !== myUserId && p.userId !== hostId && !webrtcService.hasPeer(p.userId)) {
      void webrtcService.connectToPeers([p.userId], myUserId!, false);
    }
  }
}

function handlePlayerJoined(msg: PlayerJoined): void {
  const userId = msg.player?.userId ?? "";
  const displayName = msg.player?.displayName ?? userId;
  if (!players.find((p) => p.userId === userId)) {
    players.push({ userId, displayName });
  }
  callbacks?.onPlayerJoined({ userId, displayName });

  if (userId !== myUserId && !webrtcService.hasPeer(userId)) {
    void webrtcService.connectToPeers([userId], myUserId!, false);
  }
}

function handlePlayerLeft(msg: { userId?: string }): void {
  const userId = msg.userId ?? "";
  if (!userId || !players.some((p) => p.userId === userId)) return;

  players = players.filter((p) => p.userId !== userId);
  callbacks?.onPlayerLeft(userId);

  if (isHost) {
    const leftMsg = P2PMsg.encode({ tag: 4, value: PlayerLeft({ userId }) });
    webrtcService.sendToAll(leftMsg);
  }
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

function handlePeerDisconnected(userId: string): void {
  console.log(`[p2p] peer disconnected: ${userId.slice(0, 8)}, isHost=${isHost}`);
  const wasHost = userId === currentHostId && !isHost;
  // Mark as failed/disconnected — don't remove from the player list.
  // A deliberate leave (LobbyLeave message) will call handlePlayerLeft instead.
  callbacks?.onConnectionStateChanged(userId, "failed");
  if (wasHost) {
    scheduleHostReconnect(userId);
  }
}

function scheduleHostReconnect(hostUserId: string): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log("[p2p] host reconnect: max attempts reached, giving up");
    return;
  }
  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * reconnectAttempts;
  console.log(`[p2p] host reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!myUserId || !callbacks) return;
    void webrtcService.connectToPeers([hostUserId], myUserId, true);
  }, delay);
}

export function kickPlayer(userId: string): void {
  if (!isHost || !myUserId) return;
  console.log(`[p2p] kicking ${userId.slice(0, 8)}`);
  const msg = P2PMsg.encode({ tag: 8, value: LobbyKick({ userId }) });
  webrtcService.sendToAll(msg);
  // Host removes them locally too
  handlePlayerLeft({ userId });
}

function handleLobbyKick(kick: LobbyKick): void {
  const userId = kick.userId ?? "";
  if (userId === myUserId) {
    // We were kicked
    console.log("[p2p] we were kicked from the lobby");
    callbacks?.onKicked();
    resetP2PLobby();
  } else {
    // Someone else was kicked
    handlePlayerLeft({ userId });
  }
}

export function leaveLobby(): void {
  const msg = P2PMsg.encode({ tag: 6, value: LobbyLeave({}) });
  webrtcService.sendToAll(msg);
  resetP2PLobby();
}
