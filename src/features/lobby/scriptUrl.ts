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
  } catch {
    // Ignore URL parse errors
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

export type InviteFragment = {
  lobbyId: string;
  scriptUrl: string;
};

export function parseInviteFragment(fragment: string): InviteFragment | null {
  const hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const parts = hash.split(",");
  if (parts.length < 2) return null;
  const [lobbyId, encodedUrl] = parts;
  if (!lobbyId || !encodedUrl) return null;
  try {
    const scriptUrl = decodeScriptUrl(encodedUrl);
    return { lobbyId, scriptUrl };
  } catch {
    return null;
  }
}

/** Build an invite fragment: #{lobbyId},{base64url(scriptUrl)} */
export function buildInviteFragment(lobbyId: string, scriptUrl: string): string {
  return `${lobbyId},${encodeScriptUrl(scriptUrl)}`;
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
