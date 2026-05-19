export type LobbyStatus = "waiting" | "in-game" | "finished";

export type LobbyInfo = {
  id: string;
  hostUserId: string;
  scriptUrl: string;
  allowGuests: boolean;
  status: LobbyStatus;
  playerCount: number;
  minPlayers?: number;
  maxPlayers?: number;
  hostPeerSessionId?: string;
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

export type CreateLobbyPayload = {
  scriptUrl: string;
  allowGuests: boolean;
  hostPeerSessionId: string;
  minPlayers: number;
  maxPlayers: number;
};

export type TurnCredentials = {
  urls: string[];
  username: string;
  credential: string;
};
