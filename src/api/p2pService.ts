import { createLibp2p, type Libp2p } from "libp2p";
import { webRTC, webRTCDirect } from "@libp2p/webrtc";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { identify } from "@libp2p/identify";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { multiaddr } from "@multiformats/multiaddr";
import type { Uint8ArrayList } from "uint8arraylist";
import { type LobbyInvite, C2SMsg, S2CMsg } from "./bebop/generated";

const C2S_PROTOCOL = "/c2s/v1";
const S2C_PROTOCOL = "/s2c/v1";

let node: Libp2p | null = null;
let serverMultiaddrStr: string | null = null;
let lobbyHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

const NIL_GUID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_VARIANT_VERSION = "rhai-v1";

export type GameInviteCallback = (event: LobbyInvite) => void;
let gameInviteCallback: GameInviteCallback | null = null;

export function setGameInviteCallback(cb: GameInviteCallback) {
  gameInviteCallback = cb;
}

function stopLobbyHeartbeat() {
  if (lobbyHeartbeatTimer !== null) {
    clearInterval(lobbyHeartbeatTimer);
    lobbyHeartbeatTimer = null;
  }
}

function startLobbyHeartbeat(lobbyId: string) {
  stopLobbyHeartbeat();
  lobbyHeartbeatTimer = setInterval(async () => {
    try {
      await sendC2S({ tag: 10, value: { lobbyId } });
    } catch {
      // Heartbeats are best-effort and should not crash the app.
    }
  }, 5000);
}

async function installS2CHandler(): Promise<void> {
  if (!node) return;
  await node.handle(S2C_PROTOCOL, async (stream) => {
    const bytes = await readStream(stream);
    if (bytes.length === 0) return;
    const msg = S2CMsg.decode(bytes);

    if (msg.tag === 11 && gameInviteCallback) {
      gameInviteCallback(msg.value);
      try {
        await sendC2S({ tag: 11, value: {} });
      } catch {
        // Ack is best-effort.
      }
    }
  });
}

async function fetchServerInfo(): Promise<{
  peer_id: string;
  multiaddr: string;
}> {
  const apiUrl = import.meta.env.VITE_API_URL;
  const res = await fetch(`${apiUrl}/p2p/info`);
  if (!res.ok) throw new Error(`Failed to fetch p2p info: ${res.status}`);
  return res.json();
}

function toUint8Array(chunk: Uint8Array | Uint8ArrayList): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  return chunk.subarray();
}

async function readStream(
  source: AsyncIterable<Uint8Array | Uint8ArrayList>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    chunks.push(toUint8Array(chunk));
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Send a C2S message to the server and return the S2C response. */
export async function sendC2S(msg: C2SMsg): Promise<S2CMsg | null> {
  if (!node || !serverMultiaddrStr) {
    throw new Error("p2p node not connected");
  }
  const encoded = C2SMsg.encode(msg);
  const ma = multiaddr(serverMultiaddrStr);
  const stream = await node.dialProtocol(ma, C2S_PROTOCOL);
  await stream.send(encoded);
  await stream.close();
  const responseBytes = await readStream(stream);
  if (responseBytes.length === 0) return null;
  return S2CMsg.decode(responseBytes);
}

/** Connect to a peer by their libp2p peer ID via the server circuit relay. */
export async function connectToPeerViaRelay(
  targetPeerId: string
): Promise<void> {
  if (!node || !serverMultiaddrStr) {
    throw new Error("p2p node not connected");
  }
  const relayedAddr = multiaddr(
    `${serverMultiaddrStr}/p2p-circuit/p2p/${targetPeerId}`
  );
  await node.dial(relayedAddr);
}

/** Create a server-tracked lobby for authenticated users. */
export async function createServerLobby(scriptUrl: string): Promise<string> {
  const response = await sendC2S({
    tag: 3,
    value: {
      variantId: NIL_GUID,
      variantVersion: DEFAULT_VARIANT_VERSION,
      scriptUrl,
    },
  });
  if (
    !response ||
    response.tag !== 3 ||
    response.value.success !== true ||
    !response.value.lobbyId
  ) {
    throw new Error("Server lobby creation failed");
  }
  startLobbyHeartbeat(response.value.lobbyId);
  return response.value.lobbyId;
}

/** Join a server-tracked lobby for authenticated users. */
export async function joinServerLobby(lobbyId: string): Promise<void> {
  const response = await sendC2S({
    tag: 5,
    value: { lobbyId },
  });
  if (!response || response.tag !== 4 || response.value.success !== true) {
    throw new Error("Server lobby join failed");
  }
  startLobbyHeartbeat(lobbyId);
}

/** Leave a server-tracked lobby. */
export async function leaveServerLobby(lobbyId: string): Promise<void> {
  stopLobbyHeartbeat();
  await sendC2S({
    tag: 6,
    value: { lobbyId },
  });
}

async function createAndStartNode(): Promise<Libp2p> {
  const newNode = await createLibp2p({
    transports: [webRTCDirect(), webRTC(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
    },
  });
  await newNode.start();
  return newNode;
}

/** Initialise the libp2p node, connect to the server, and register with the given JWT. */
export async function initNode(jwt: string): Promise<string> {
  if (node) {
    await stopNode();
  }

  const serverInfo = await fetchServerInfo();
  serverMultiaddrStr = serverInfo.multiaddr;

  node = await createAndStartNode();
  await installS2CHandler();

  await node.dial(multiaddr(serverMultiaddrStr));

  const response = await sendC2S({ tag: 1, value: { authToken: jwt } });
  if (!response || response.tag !== 1 || !response.value.success) {
    throw new Error("Server rejected peer registration");
  }

  return node.peerId.toString();
}

/**
 * Initialise a guest libp2p node and connect to the relay server without
 * authenticating. The relay is used at the transport level so peers can
 * still reach each other via circuit relay, but the node is not registered
 * with the server's application-level user directory.
 */
export async function initNodeAsGuest(): Promise<string> {
  if (node) {
    await stopNode();
  }

  const serverInfo = await fetchServerInfo();
  serverMultiaddrStr = serverInfo.multiaddr;

  node = await createAndStartNode();
  await installS2CHandler();
  await node.dial(multiaddr(serverMultiaddrStr));

  return node.peerId.toString();
}

export async function stopNode(): Promise<void> {
  stopLobbyHeartbeat();
  if (node) {
    await node.stop();
    node = null;
    serverMultiaddrStr = null;
  }
}

export function getLocalPeerId(): string | null {
  return node?.peerId.toString() ?? null;
}
