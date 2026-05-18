/** WebRTC peer connections for client-to-client game data channels.
 *  Signaling is routed through the server via POST /lobby/{id}/signal → SSE "signal" event.
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let iceServers: RTCIceServer[] = STUN_SERVERS;

export type SignalSender = (
  toUserId: string,
  signal: object
) => Promise<void>;

export type DataChannelMessageCallback = (
  fromUserId: string,
  data: Uint8Array
) => void;

type PeerState = {
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescSet: boolean;
};

let signalSender: SignalSender | null = null;
let messageCallback: DataChannelMessageCallback | null = null;
let peerConnectedCallback: ((userId: string) => void) | null = null;
const peers = new Map<string, PeerState>();

export function setMessageCallback(cb: DataChannelMessageCallback) {
  messageCallback = cb;
}

export function onPeerConnected(cb: (userId: string) => void) {
  peerConnectedCallback = cb;
}

export function init(sendSignal: SignalSender) {
  signalSender = sendSignal;
}

export function setIceServers(servers: RTCIceServer[]) {
  iceServers = servers;
}

export function reset() {
  for (const [, { pc }] of peers) {
    pc.close();
  }
  peers.clear();
  signalSender = null;
  peerConnectedCallback = null;
  iceServers = STUN_SERVERS;
}

function createPeer(remoteUserId: string, isInitiator: boolean): PeerState {
  const pc = new RTCPeerConnection({ iceServers });
  const state: PeerState = { pc, dataChannel: null, pendingCandidates: [], remoteDescSet: false };
  peers.set(remoteUserId, state);

  pc.onicecandidate = async (ev) => {
    if (ev.candidate && signalSender) {
      await signalSender(remoteUserId, {
        type: "ice-candidate",
        candidate: ev.candidate.toJSON(),
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "disconnected" ||
      pc.connectionState === "failed"
    ) {
      peers.delete(remoteUserId);
    }
  };

  if (isInitiator) {
    const dc = pc.createDataChannel("game");
    state.dataChannel = dc;
    setupDataChannel(dc, remoteUserId);
  } else {
    pc.ondatachannel = (ev) => {
      state.dataChannel = ev.channel;
      setupDataChannel(ev.channel, remoteUserId);
    };
  }

  return state;
}

function setupDataChannel(dc: RTCDataChannel, remoteUserId: string) {
  dc.binaryType = "arraybuffer";
  dc.onopen = () => {
    peerConnectedCallback?.(remoteUserId);
  };
  dc.onmessage = (ev) => {
    if (messageCallback) {
      messageCallback(remoteUserId, new Uint8Array(ev.data));
    }
  };
}

/** Called when a game starts: initiates WebRTC connections to all peers. */
export async function connectToPeers(
  allMemberIds: string[],
  myUserId: string,
  alwaysInitiate = false
): Promise<void> {
  for (const remoteId of allMemberIds) {
    if (remoteId === myUserId) continue;
    // When alwaysInitiate is true (joiner role), always send the offer.
    // Otherwise use lexicographic order to avoid duplicate offers in full-mesh setups.
    const isInitiator = alwaysInitiate || myUserId < remoteId;
    const state = createPeer(remoteId, isInitiator);
    if (isInitiator) {
      const offer = await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      await signalSender!(remoteId, { type: "offer", sdp: offer });
    }
  }
}

export async function handleSignal(
  fromUserId: string,
  signal: {
    type: "offer" | "answer" | "ice-candidate";
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }
): Promise<void> {
  let state = peers.get(fromUserId);

  if (signal.type === "offer") {
    if (!state) {
      state = createPeer(fromUserId, false);
    }
    await state.pc.setRemoteDescription(signal.sdp!);
    state.remoteDescSet = true;
    for (const c of state.pendingCandidates) {
      await state.pc.addIceCandidate(new RTCIceCandidate(c));
    }
    state.pendingCandidates = [];
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    await signalSender!(fromUserId, { type: "answer", sdp: answer });
  } else if (signal.type === "answer") {
    if (state) {
      await state.pc.setRemoteDescription(signal.sdp!);
      state.remoteDescSet = true;
      for (const c of state.pendingCandidates) {
        await state.pc.addIceCandidate(new RTCIceCandidate(c));
      }
      state.pendingCandidates = [];
    }
  } else if (signal.type === "ice-candidate") {
    if (state && signal.candidate) {
      if (state.remoteDescSet) {
        await state.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        state.pendingCandidates.push(signal.candidate);
      }
    }
  }
}

export function sendToAll(data: Uint8Array): void {
  for (const [, { dataChannel }] of peers) {
    if (dataChannel?.readyState === "open") {
      dataChannel.send(data as Uint8Array<ArrayBuffer>);
    }
  }
}

export function sendToPeer(toUserId: string, data: Uint8Array): boolean {
  const state = peers.get(toUserId);
  if (state?.dataChannel?.readyState === "open") {
    state.dataChannel.send(data as Uint8Array<ArrayBuffer>);
    return true;
  }
  return false;
}
