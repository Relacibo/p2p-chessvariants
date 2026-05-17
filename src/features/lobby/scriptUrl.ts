import { ChessvariantEngine } from "chessvariant-engine";

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
    // Format: https://gist.github.com/{owner}/{gistId}/{sha}
    return `${GIST_BROWSE_ORIGIN}/${this.owner}/${this.gistId}/${this.sha}`;
  }
}

export class GenericSource implements VariantSource {
  constructor(public url: string) {}
  getRawUrl() {
    return this.url;
  }
  getBrowseUrl() {
    return this.url;
  }
}

/**
 * Factory function to parse a URL into a VariantSource.
 */
export function parseVariantSource(input: string): VariantSource {
  try {
    const url = new URL(input.trim());

    // 1. GitHub Repo (Browse or Raw)
    if (url.origin === GITHUB_BROWSE_ORIGIN || url.origin === GITHUB_RAW_ORIGIN) {
      const pathname = url.pathname.replace(/^\//, "");
      const parts = pathname.split("/");

      if (url.origin === GITHUB_BROWSE_ORIGIN) {
        // {owner}/{repo}/blob/{sha}/{...path}
        if (parts.length >= 5 && parts[2] === "blob" && SHA40_RE.test(parts[3])) {
          const [owner, repo, , sha, ...pathParts] = parts;
          return new GithubRepoSource(owner, repo, sha, pathParts.join("/"));
        }
      } else {
        // {owner}/{repo}/{sha}/{...path}
        if (parts.length >= 4 && SHA40_RE.test(parts[2])) {
          const [owner, repo, sha, ...pathParts] = parts;
          return new GithubRepoSource(owner, repo, sha, pathParts.join("/"));
        }
      }
    }

    // 2. GitHub Gist (Browse or Raw)
    if (url.origin === GIST_BROWSE_ORIGIN || url.origin === GIST_RAW_ORIGIN) {
      const pathname = url.pathname.replace(/^\//, "");
      const parts = pathname.split("/");

      if (url.origin === GIST_BROWSE_ORIGIN) {
        // {owner}/{gistId}/{sha} or {gistId}/{sha}
        if (parts.length === 3 && SHA40_RE.test(parts[2])) {
          return new GithubGistSource(parts[0], parts[1], parts[2]);
        } else if (parts.length === 2 && SHA40_RE.test(parts[1])) {
          return new GithubGistSource("anonymous", parts[0], parts[1]);
        }
      } else {
        // {owner}/{gistId}/raw/{sha}/{filename}
        if (parts.length >= 5 && parts[2] === "raw" && SHA40_RE.test(parts[3])) {
          return new GithubGistSource(parts[0], parts[1], parts[3], parts.slice(4).join("/"));
        }
      }
    }
  } catch {
    // Ignore URL parse errors
  }

  return new GenericSource(input.trim());
}

// ---------------------------------------------------------------------------
// Existing logic (refactored to use VariantSource where appropriate)
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
    const engine = new ChessvariantEngine(script, 2);
    return engine.name;
  } catch (e: any) {
    throw new Error(`Engine error: ${e.message || e}`);
  }
}

/** Encode a script URL for embedding in a URL fragment. */
export function encodeScriptUrl(url: string): string {
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Decode a script URL from a URL fragment. */
export function decodeScriptUrl(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

/** Parse the invite fragment: #{peerId},{base64url(scriptUrl)} */
export type InviteFragment = {
  hostPeerId: string;
  scriptUrl: string;
  lobbyId?: string;
};

export function parseInviteFragment(fragment: string): InviteFragment | null {
  const hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const parts = hash.split(",");
  if (parts.length < 2 || parts.length > 3) return null;
  const [hostPeerId, encodedUrl, lobbyId] = parts;
  if (!hostPeerId || !encodedUrl) return null;
  try {
    const scriptUrl = decodeScriptUrl(encodedUrl);
    if (lobbyId) {
      return { hostPeerId, scriptUrl, lobbyId };
    }
    return { hostPeerId, scriptUrl };
  } catch {
    return null;
  }
}

/** Build an invite fragment for sharing. */
export function buildInviteFragment(
  hostPeerId: string,
  scriptUrl: string,
  lobbyId?: string
): string {
  const base = `#${hostPeerId},${encodeScriptUrl(scriptUrl)}`;
  return lobbyId ? `${base},${lobbyId}` : base;
}

// ---------------------------------------------------------------------------
// Deprecated / Backward Compatibility
// (To be removed after full refactoring)
// ---------------------------------------------------------------------------

export function normalizeScriptUrl(input: string): string {
  return parseVariantSource(input).getRawUrl();
}

export function getGithubBrowseUrl(urlStr: string): string {
  return parseVariantSource(urlStr).getBrowseUrl();
}

/** @deprecated use parseVariantSource */
export function parseScriptUrl(raw: string): { ok: boolean; error?: string } {
  const source = parseVariantSource(raw);
  if (source instanceof GenericSource && raw.trim().length > 0) {
    // For now, keep generic as "maybe ok" but you'd want better validation
    return { ok: true };
  }
  return { ok: true };
}

export function scriptUrlErrorMessage(error: any): string {
  return "Invalid script source";
}
