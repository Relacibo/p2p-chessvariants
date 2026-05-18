const API_URL = import.meta.env.VITE_API_URL as string;

export type LobbyMember = {
  userId: string;
  displayName: string;
};

export type LobbyInfo = {
  id: string;
  hostUserId: string;
  members: LobbyMember[];
  status: "waiting" | "in-game";
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
): Promise<{ lobbyId: string; scriptUrl: string }> {
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

export async function joinLobby(
  lobbyId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}/join`, token, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Join lobby failed: ${res.status}`);
}

export async function leaveLobby(
  lobbyId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}/leave`, token, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Leave lobby failed: ${res.status}`);
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

export async function startGame(
  lobbyId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}/start`, token, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Start game failed: ${res.status}`);
}

export async function gameEnded(
  lobbyId: string,
  token: string
): Promise<void> {
  const res = await authedFetch(
    `${API_URL}/lobby/${lobbyId}/game-ended`,
    token,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Game ended failed: ${res.status}`);
}

export async function inviteToLobby(
  lobbyId: string,
  userIds: string[],
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}/invite`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) throw new Error(`Invite failed: ${res.status}`);
}

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
