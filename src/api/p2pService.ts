import { createLibp2p, type Libp2p } from "libp2p";
import { webRTC, webRTCDirect } from "@libp2p/webrtc";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { identify } from "@libp2p/identify";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { multiaddr } from "@multiformats/multiaddr";
import type { Uint8ArrayList } from "uint8arraylist";
import type { Stream } from "@libp2p/interface";
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

function logP2PWarning(context: string, err: unknown): void {
  console.error(`[p2p] ${context}`, err);
}

function startLobbyHeartbeat(lobbyId: string) {
  stopLobbyHeartbeat();
  lobbyHeartbeatTimer = setInterval(async () => {
    try {
      await sendC2S({ tag: 10, value: { lobbyId } });
    } catch (err) {
      logP2PWarning(`heartbeat failed for lobby ${lobbyId}`, err);
    }
  }, 5000);
}

/** 
 * Helper to read exactly `length` bytes from a libp2p async stream.
 * Returns null if the stream ends before the requested length is read.
 */
async function readExact(
  source: AsyncIterable<Uint8Array | Uint8ArrayList>,
  length: number
): Promise<Uint8Array | null> {
  const result = new Uint8Array(length);
  let offset = 0;

  for await (const chunk of source) {
    const arr = chunk instanceof Uint8Array ? chunk : chunk.subarray();
    const remaining = length - offset;
    const take = Math.min(arr.length, remaining);

    result.set(arr.subarray(0, take), offset);
    offset += take;

    if (offset === length) {
      return result;
    }
  }
  return null;
}

/** Read a 4-byte little-endian length prefix followed by the message payload. */
async function readLengthPrefixedMessage(stream: Stream): Promise<Uint8Array | null> {
  // 1. Read 4-byte length prefix
  const lenBytes = await readExact(stream, 4);
  if (!lenBytes) return null;
  
  const view = new DataView(lenBytes.buffer, lenBytes.byteOffset, 4);
  const length = view.getUint32(0, true); // true = Little Endian
  
  // 2. Read exactly the payload length
  return readExact(stream, length);
}

/** Prepend a 4-byte little-endian length prefix to the payload. */
function writeLengthPrefixedMessage(payload: Uint8Array): Uint8Array {
  const buf = new Uint8Array(4 + payload.length);
  const view = new DataView(buf.buffer, buf.byteOffset, 4);
  view.setUint32(0, payload.length, true); // Little Endian
  buf.set(payload, 4);
  return buf;
}

async function installS2CHandler(): Promise<void> {
  if (!node) return;
  await node.handle(S2C_PROTOCOL, async (stream) => {
    try {
      const bytes = await readLengthPrefixedMessage(stream);
      if (!bytes) return;
      const msg = S2CMsg.decode(bytes);

      if (msg.tag === 11 && gameInviteCallback) {
        gameInviteCallback(msg.value);
        try {
          await sendC2S({ tag: 11, value: {} });
        } catch (err) {
          logP2PWarning("lobby invite ack failed", err);
        }
      }
      
      // Close our side of the stream gracefully
      await stream.close();
    } catch (err) {
      logP2PWarning("Failed to process S2C message", err);
      stream.abort(err instanceof Error ? err : new Error(String(err)));
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

/** Send a C2S message to the server and return the S2C response. */
export async function sendC2S(msg: C2SMsg): Promise<S2CMsg | null> {
  if (!node || !serverMultiaddrStr) {
    throw new Error("p2p node not connected");
  }
  
  const encoded = C2SMsg.encode(msg);
  const framed = writeLengthPrefixedMessage(encoded);
  
  const ma = multiaddr(serverMultiaddrStr);
  const stream = await node.dialProtocol(ma, C2S_PROTOCOL);
  
  try {
    await stream.send(framed);
    
    const responseBytes = await readLengthPrefixedMessage(stream);
    
    // Clean close now that the transaction is complete
    await stream.close();

    if (!responseBytes) return null;
    return S2CMsg.decode(responseBytes);
  } catch (err) {
    stream.abort(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
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

/** Initialise a standalone node without fetching/dialing the relay server. */
export async function initNodeStandalone(): Promise<string> {
  if (node) {
    await stopNode();
  }

  node = await createAndStartNode();
  await installS2CHandler();
  serverMultiaddrStr = null;

  return node.peerId.toString();
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
