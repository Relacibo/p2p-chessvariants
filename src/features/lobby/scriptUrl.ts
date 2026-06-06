import { ChessvariantEngine } from "chessvariant-engine";
import { WasmVariantConfig } from "../chessboard/types";

const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com";
const GITHUB_BROWSE_ORIGIN = "https://github.com";
const GIST_BROWSE_ORIGIN = "https://gist.github.com";
const GIST_RAW_ORIGIN = "https://gist.githubusercontent.com";
const SHA40_RE = /^[0-9a-f]{40}$/i;

// ---------------------------------------------------------------------------
// VariantSource Abstraction
// ---------------------------------------------------------------------------

export interface VariantSource {
  getRawUrl(): string;
  getBrowseUrl(): string;
}

export class GithubRepoSource implements VariantSource {
  constructor(
    public owner: string,
    public repo: string,
    public sha: string,
    public path: string
  ) {}

  getRawUrl() {
    return `${GITHUB_RAW_ORIGIN}/${this.owner}/${this.repo}/${this.sha}/${this.path}`;
  }

  getBrowseUrl() {
    return `${GITHUB_BROWSE_ORIGIN}/${this.owner}/${this.repo}/blob/${this.sha}/${this.path}`;
  }
}

export class GithubGistSource implements VariantSource {
  constructor(
    public owner: string,
    public gistId: string,
    public sha: string,
    public filename: string = ""
  ) {}

  getRawUrl() {
    // Format: https://gist.githubusercontent.com/{owner}/{gistId}/raw/{sha}/{filename}
    return `${GIST_RAW_ORIGIN}/${this.owner}/${this.gistId}/raw/${this.sha}/${this.filename}`;
  }

  getBrowseUrl() {
    // Format: https://gist.github.com/${this.owner}/${this.gistId}/${this.sha}
    return `${GIST_BROWSE_ORIGIN}/${this.owner}/${this.gistId}/${this.sha}`;
  }
}

/**
 * Factory function to parse a URL into a VariantSource.
 * Returns null if the URL is recognizably GitHub/Gist but invalid (e.g. missing SHA),
 * or if it is an unsupported generic URL.
 */
export function parseVariantSource(input: string): VariantSource | null {
  // Local/relative URLs are not GitHub/Gist — return null immediately
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("../")) {
    return null;
  }
  try {
    const url = new URL(input.trim());

    // 1. GitHub Repo (Browse or Raw)
    if (
      url.origin === GITHUB_BROWSE_ORIGIN ||
      url.origin === GITHUB_RAW_ORIGIN
    ) {
      const pathname = url.pathname.replace(/^\//, "");
      const parts = pathname.split("/");

      if (url.origin === GITHUB_BROWSE_ORIGIN) {
        // {owner}/{repo}/blob/{sha}/{...path}
        if (parts.length >= 5 && parts[2] === "blob") {
          if (!SHA40_RE.test(parts[3])) return null; // Not a commit SHA
          const [owner, repo, , sha, ...pathParts] = parts;
          return new GithubRepoSource(owner, repo, sha, pathParts.join("/"));
        }
      } else {
        // {owner}/{repo}/{sha}/{...path}
        if (parts.length >= 4) {
          if (!SHA40_RE.test(parts[2])) return null; // Not a commit SHA
          const [owner, repo, sha, ...pathParts] = parts;
          return new GithubRepoSource(owner, repo, sha, pathParts.join("/"));
        }
      }
      return null; // Recognized as GitHub but invalid format
    }

    // 2. GitHub Gist (Browse or Raw)
    if (url.origin === GIST_BROWSE_ORIGIN || url.origin === GIST_RAW_ORIGIN) {
      const pathname = url.pathname.replace(/^\//, "");
      const parts = pathname.split("/");

      if (url.origin === GIST_BROWSE_ORIGIN) {
        // {owner}/{gistId}/{sha} or {gistId}/{sha}
        if (parts.length === 3) {
          if (!SHA40_RE.test(parts[2])) return null;
          return new GithubGistSource(parts[0], parts[1], parts[2]);
        } else if (parts.length === 2) {
          if (!SHA40_RE.test(parts[1])) return null;
          return new GithubGistSource("anonymous", parts[0], parts[1]);
        }
      } else {
        // {owner}/{gistId}/raw/{sha}/{filename}
        if (parts.length >= 5 && parts[2] === "raw") {
          if (!SHA40_RE.test(parts[3])) return null;
          return new GithubGistSource(
            parts[0],
            parts[1],
            parts[3],
            parts.slice(4).join("/")
          );
        }
      }
      return null; // Recognized as Gist but invalid format
    }
  } catch (e) {
    // Not an absolute URL — return null (caller handles fallback)
    console.debug("[scriptUrl] not an absolute URL:", input);
  }

  // Generic fallback removed to strictly enforce immutability
  return null;
}


// ---------------------------------------------------------------------------
// Existing logic
// ---------------------------------------------------------------------------

export async function fetchScriptText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch script: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export async function validateAndGetName(url: string): Promise<string> {
  const script = await fetchScriptText(url);
  try {
    const json = await ChessvariantEngine.parseConfig(script);
    const config = JSON.parse(json) as WasmVariantConfig;
    return config.name;
  } catch (e: any) {
    throw new Error(`Engine error: ${e.message || e}`);
  }
}

export type ScriptConfig = {
  name: string;
  minPlayers: number;
  maxPlayers: number;
};

/**
 * Extract min/max players from the allowed_player_count field.
 */
export function getPlayersRange(apc: WasmVariantConfig["allowed_player_count"]): { min: number; max: number } {
  if ("exact" in apc) {
    return { min: apc.exact, max: apc.exact };
  }
  if ("discrete" in apc) {
    return { min: Math.min(...apc.discrete), max: Math.max(...apc.discrete) };
  }
  return { min: apc.range.min, max: apc.range.max };
}

export async function parseScriptConfig(url: string): Promise<ScriptConfig> {
  const config = await fetchAndParseFullConfig(url);
  const range = getPlayersRange(config.allowed_player_count);
  return {
    name: config.name,
    minPlayers: range.min,
    maxPlayers: range.max,
  };
}

/** Fetch + parse the full variant config from a script URL. */
export async function fetchAndParseFullConfig(url: string): Promise<WasmVariantConfig> {
  const script = await fetchScriptText(url);
  try {
    const json = await ChessvariantEngine.parseConfig(script);
    return JSON.parse(json) as WasmVariantConfig;
  } catch (e: any) {
    throw new Error(`Engine error: ${e.message || e}`);
  }
}

/** Encode a script URL for embedding in a URL query parameter. */
export function encodeScriptUrl(url: string): string {
  return encodeURIComponent(url);
}

/** Decode a script URL from a URL query parameter. */
export function decodeScriptUrl(encoded: string): string {
  return decodeURIComponent(encoded);
}

/**
 * Invite fragment formats (URL hash):
 *   #lobby:{lobbyId}   — join via server lobby discovery
 *   #peer:{hostUserId} — connect directly to a peer (no server lobby)
 */
export type InviteFragment =
  | { type: "lobby"; lobbyId: string }
  | { type: "peer"; hostUserId: string };

export function parseInviteFragment(fragment: string): InviteFragment | null {
  const hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (hash.startsWith("lobby:")) {
    const lobbyId = hash.slice("lobby:".length);
    return lobbyId ? { type: "lobby", lobbyId } : null;
  }
  if (hash.startsWith("peer:")) {
    const hostUserId = hash.slice("peer:".length);
    return hostUserId ? { type: "peer", hostUserId } : null;
  }
  return null;
}

export function buildLobbyInviteFragment(lobbyId: string): string {
  return `lobby:${lobbyId}`;
}

export function buildPeerInviteFragment(hostUserId: string): string {
  return `peer:${hostUserId}`;
}

// ---------------------------------------------------------------------------
// Deprecated / Backward Compatibility
// (To be removed after full refactoring)
// ---------------------------------------------------------------------------

export function normalizeScriptUrl(input: string): string {
  return parseVariantSource(input)?.getRawUrl() ?? input;
}

export function getGithubBrowseUrl(urlStr: string): string {
  return parseVariantSource(urlStr)?.getBrowseUrl() ?? urlStr;
}

/** @deprecated use parseVariantSource */
export function parseScriptUrl(raw: string): { ok: boolean; error?: string } {
  // Local/relative URLs are valid (served from frontend host)
  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return { ok: true };
  }
  const source = parseVariantSource(raw);
  if (!source) {
    return {
      ok: false,
      error:
        "Invalid or non-immutable URL. GitHub links must reference a 40-character commit SHA (Permalink).",
    };
  }
  return { ok: true };
}

export function scriptUrlErrorMessage(error: string | undefined): string {
  return error || "Invalid script source";
}
