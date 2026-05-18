const API_URL = import.meta.env.VITE_API_URL as string;

export type LobbyStatus = "waiting" | "inGame" | "finished";

export type LobbyInfo = {
  id: string;
  hostUserId: string;
  scriptUrl: string;
  allowGuests: boolean;
  status: LobbyStatus;
  playerCount: number;
  minPlayers: number | null;
  maxPlayers: number | null;
  hostPeerSessionId: string | null;
};

export type LobbyPatch = {
  allowGuests?: boolean;
  status?: LobbyStatus;
  playerCount?: number;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  hostPeerSessionId?: string | null;
  scriptUrl?: string;
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

export type ListLobbiesParams = {
  page?: number;
  limit?: number;
  allowGuests?: boolean;
  status?: LobbyStatus;
  scriptUrl?: string;
};

export type ListLobbiesResponse = {
  items: LobbyInfo[];
  total: number;
  page: number;
  limit: number;
};

export async function listLobbies(params?: ListLobbiesParams): Promise<ListLobbiesResponse> {
  const url = new URL(`${API_URL}/lobby`);
  if (params?.page !== undefined) url.searchParams.set("page", String(params.page));
  if (params?.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params?.allowGuests !== undefined) url.searchParams.set("allowGuests", String(params.allowGuests));
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.scriptUrl) url.searchParams.set("scriptUrl", params.scriptUrl);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`List lobbies failed: ${res.status}`);
  return res.json();
}


export type CreateLobbyPayload = {
  scriptUrl: string;
  allowGuests: boolean;
  hostPeerSessionId: string;
  minPlayers: number;
  maxPlayers: number;
};

export async function createLobby(
  payload: CreateLobbyPayload,
  token: string
): Promise<{ lobbyId: string }> {
  const res = await authedFetch(`${API_URL}/lobby`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

export async function patchLobby(
  lobbyId: string,
  patch: LobbyPatch,
  token: string
): Promise<void> {
  const res = await authedFetch(`${API_URL}/lobby/${lobbyId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Patch lobby failed");
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

