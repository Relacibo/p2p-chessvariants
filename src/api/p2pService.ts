import { createLibp2p, type Libp2p } from "libp2p";
import { webRTC, webRTCDirect } from "@libp2p/webrtc";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { identify } from "@libp2p/identify";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { multiaddr } from "@multiformats/multiaddr";
import type { Uint8ArrayList } from "uint8arraylist";
import { type NewGameEvent, C2SMsg, S2CMsg } from "./bebop/generated";

const C2S_PROTOCOL = "/c2s/v1";
const S2C_PROTOCOL = "/s2c/v1";

let node: Libp2p | null = null;
let serverMultiaddrStr: string | null = null;

export type GameInviteCallback = (
  event: NewGameEvent,
  resolve: (accepted: boolean) => void
) => void;

let gameInviteCallback: GameInviteCallback | null = null;

export function setGameInviteCallback(cb: GameInviteCallback) {
  gameInviteCallback = cb;
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
  stream.send(encoded);
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

  await node.handle(S2C_PROTOCOL, async (stream) => {
    const bytes = await readStream(stream);
    const msg = S2CMsg.decode(bytes);

    if (msg.tag === 4) {
      const event = msg.value;
      if (gameInviteCallback) {
        let answered = false;
        await new Promise<void>((outerResolve) => {
          gameInviteCallback!(event, async (accepted: boolean) => {
            if (answered) return;
            answered = true;
            const answer = C2SMsg.encode({ tag: 4, value: { accepted } });
            stream.send(answer);
            await stream.close();
            outerResolve();
          });
        });
      }
    }
  });

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
  await node.dial(multiaddr(serverMultiaddrStr));

  return node.peerId.toString();
}

export async function stopNode(): Promise<void> {
  if (node) {
    await node.stop();
    node = null;
    serverMultiaddrStr = null;
  }
}

export function getLocalPeerId(): string | null {
  return node?.peerId.toString() ?? null;
}

