/**
 * Cross-tab coordination via BroadcastChannel.
 * Allows detecting secondary tabs and coordinating primary/secondary role.
 */

const CHANNEL_NAME = "p2pcv-lobby";
const PING_TIMEOUT_MS = 200;

type TabMessage =
  | { type: "ping"; lobbyId: string; userId: string }
  | { type: "pong"; lobbyId: string; userId: string }
  | { type: "state-update"; lobbyId: string; state: SecondaryTabState }
  | { type: "takeover-request"; lobbyId: string; userId: string }
  | { type: "takeover-yield"; lobbyId: string };

export type SecondaryTabState = {
  players: Array<{
    userId: string;
    name: string | null;
    connectionStatus: string;
    role?: string;
  }>;
  isHost: boolean;
  hostUserId: string | null;
  scriptUrl: string | null;
};

let channel: BroadcastChannel | null = null;
const handlers = new Set<(msg: TabMessage) => void>();

function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (ev) => {
      for (const handler of handlers) {
        handler(ev.data as TabMessage);
      }
    };
  }
  return channel;
}

function onMessage(handler: (msg: TabMessage) => void): () => void {
  handlers.add(handler);
  getChannel();
  return () => handlers.delete(handler);
}

function send(msg: TabMessage): void {
  getChannel().postMessage(msg);
}

/** Returns true if this tab should be the primary (no other primary responded). */
export async function checkIsPrimary(
  lobbyId: string,
  userId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let gotPong = false;
    const cleanup = onMessage((msg) => {
      if (msg.type === "pong" && msg.lobbyId === lobbyId && msg.userId === userId) {
        gotPong = true;
        cleanup();
        resolve(false);
      }
    });

    send({ type: "ping", lobbyId, userId });

    setTimeout(() => {
      cleanup();
      if (!gotPong) {
        resolve(true);
      }
    }, PING_TIMEOUT_MS);
  });
}

/** Primary tab calls this to respond to pings. Returns cleanup function. */
export function registerAsPrimary(lobbyId: string, userId: string): () => void {
  return onMessage((msg) => {
    if (msg.type === "ping" && msg.lobbyId === lobbyId && msg.userId === userId) {
      send({ type: "pong", lobbyId, userId });
    }
  });
}

/** Primary broadcasts lobby state to secondary tabs. */
export function broadcastLobbyState(
  lobbyId: string,
  state: SecondaryTabState,
): void {
  send({ type: "state-update", lobbyId, state });
}

/** Secondary tab listens for state updates. Returns cleanup. */
export function onLobbyStateUpdate(
  lobbyId: string,
  callback: (state: SecondaryTabState) => void,
): () => void {
  return onMessage((msg) => {
    if (msg.type === "state-update" && msg.lobbyId === lobbyId) {
      callback(msg.state);
    }
  });
}

/** Secondary requests takeover. Resolves when primary yields or times out. */
export async function requestTakeover(
  lobbyId: string,
  userId: string,
): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = onMessage((msg) => {
      if (msg.type === "takeover-yield" && msg.lobbyId === lobbyId) {
        cleanup();
        resolve();
      }
    });

    send({ type: "takeover-request", lobbyId, userId });

    setTimeout(() => {
      cleanup();
      resolve();
    }, 3000);
  });
}

/** Primary registers a takeover handler. Returns cleanup. */
export function onTakeoverRequest(
  lobbyId: string,
  userId: string,
  handler: () => void,
): () => void {
  return onMessage((msg) => {
    if (
      msg.type === "takeover-request" &&
      msg.lobbyId === lobbyId &&
      msg.userId === userId
    ) {
      handler();
    }
  });
}

/** Primary signals that it has yielded to a takeover. */
export function yieldPrimary(lobbyId: string): void {
  send({ type: "takeover-yield", lobbyId });
}
