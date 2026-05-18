const API_URL = import.meta.env.VITE_API_URL as string;

export type LobbyInfo = {
  id: string;
  hostUserId: string;
  scriptUrl: string;
};

async function authedFetch(
  url: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  return res;
}

export async function createLobby(
  scriptUrl: string,
  token: string
): Promise<{ lobbyId: string }> {
  const res = await authedFetch(`${API_URL}/lobby`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scriptUrl }),
  });
  if (!res.ok) throw new Error(`Create lobby failed: ${res.status}`);
  return res.json();
}

export async function getLobby(lobbyId: string): Promise<LobbyInfo> {
  const res = await fetch(`${API_URL}/lobby/${lobbyId}`);
  if (!res.ok) throw new Error(`Get lobby failed: ${res.status}`);
  return res.json();
}

export async function deleteLobby(
  lobbyId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}`, token, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete lobby failed: ${res.status}`);
}

export async function heartbeat(
  lobbyId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/lobby/${lobbyId}/heartbeat`,
    token,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Heartbeat failed: ${res.status}`);
}

export async function updateHost(
  lobbyId: string,
  newHostUserId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}/host`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newHostUserId }),
  });
  if (!res.ok) throw new Error(`Update host failed: ${res.status}`);
}

/** Relay a WebRTC signal via a lobby context. */
export async function sendSignal(
  lobbyId: string,
  toUserId: string,
  signal: object,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}/signal`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toUserId, signal }),
  });
  if (!res.ok) throw new Error(`Signal relay failed: ${res.status}`);
}

/** Relay a WebRTC signal directly to a user (no lobby context). */
export async function sendSignalDirect(
  toUserId: string,
  signal: object,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/signal/${toUserId}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal }),
  });
  if (!res.ok) throw new Error(`Direct signal relay failed: ${res.status}`);
}

