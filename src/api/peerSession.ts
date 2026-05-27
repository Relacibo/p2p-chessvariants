/**
 * Each user gets a stable peer UUID stored in localStorage (per userId).
 * This ensures a consistent peer identity across tabs and page refreshes
 * for the same user on the same browser.
 *
 * The peer handle encodes both the peer UUID and the user's ID:
 *   `<peerUUID>~<userId>`
 *
 * The user ID is embedded so that the WebRTC signaling layer can still
 * route messages to the correct user via the server's SSE stream.
 *
 * Note: Only one primary tab per user participates in the WebRTC mesh,
 * so having a shared UUID across tabs causes no collision.
 */

const PEER_ID_PREFIX = "p2pcv-peer-id-";

/** Returns (or creates) the stable peer UUID for the given user. */
export function getOrCreatePeerId(userId: string): string {
  const key = `${PEER_ID_PREFIX}${userId}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/** Returns a stable peer handle: `<peerUUID>~<userId>` */
export function buildPeerHandle(userId: string): string {
  return `${getOrCreatePeerId(userId)}~${userId}`;
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
