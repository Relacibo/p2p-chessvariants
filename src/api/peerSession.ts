/**
 * Each browser tab gets a unique session UUID stored in sessionStorage.
 * This makes non-server lobby invite URLs unique per tab, so the same
 * user can host multiple lobbies in different tabs simultaneously.
 *
 * The peer handle encodes both the session UUID and the user's ID:
 *   `<sessionUUID>~<userId>`
 *
 * The user ID is embedded so that the WebRTC signaling layer can still
 * route messages to the correct user via the server's SSE stream.
 */

const SESSION_KEY = "p2p_peer_session_id";

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Returns a stable, tab-unique peer handle: `<sessionUUID>~<userId>` */
export function buildPeerHandle(userId: string): string {
  return `${getOrCreateSessionId()}~${userId}`;
}

/**
 * Extracts the user ID from a peer handle.
 * Accepts both the new `<sessionUUID>~<userId>` format and the legacy
 * plain `<userId>` format for backwards compatibility.
 */
export function userIdFromPeerHandle(handle: string): string {
  const sep = handle.indexOf("~");
  return sep !== -1 ? handle.slice(sep + 1) : handle;
}
