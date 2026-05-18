const API_URL = import.meta.env.VITE_API_URL as string;

export type TurnCredentials = {
  urls: string[];
  username: string;
  credential: string;
};

let cached: { credentials: TurnCredentials; expiresAt: number } | null = null;

export async function getTurnCredentials(token: string): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return buildIceServers(cached.credentials);
  }

  const res = await fetch(`${API_URL}/turn-credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.warn("[turn] Failed to fetch TURN credentials, falling back to STUN only");
    return [];
  }

  const creds: TurnCredentials = await res.json();
  // Coturn HMAC usernames are "{expiry}:{userid}" — parse expiry from username
  const expiry = parseInt(creds.username.split(":")[0], 10);
  cached = { credentials: creds, expiresAt: isNaN(expiry) ? now + 3600_000 : expiry * 1000 };
  return buildIceServers(creds);
}

function buildIceServers(creds: TurnCredentials): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  for (const url of creds.urls) {
    // Add UDP variant as-is
    servers.push({ urls: url, username: creds.username, credential: creds.credential });
    // Add TCP transport fallback for networks that block UDP
    if (url.startsWith("turn:") && !url.includes("?transport=")) {
      servers.push({
        urls: url + "?transport=tcp",
        username: creds.username,
        credential: creds.credential,
      });
    }
  }
  return servers;
}
