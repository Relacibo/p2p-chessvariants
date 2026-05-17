import { ChessvariantEngine } from "chessvariant-engine";

const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com";
const GITHUB_BROWSE_ORIGIN = "https://github.com";
const SHA40_RE = /^[0-9a-f]{40}$/i;

export type ParsedScriptUrl = {
  owner: string;
  repo: string;
  sha: string;
  path: string;
};

export type ScriptUrlError =
  | "not-github"
  | "missing-path-segments"
  | "not-a-commit-sha";

export type ScriptUrlResult =
  | { ok: true; parsed: ParsedScriptUrl }
  | { ok: false; error: ScriptUrlError };

/**
 * Converts a GitHub browse URL to a raw URL.
 * Input: https://github.com/{owner}/{repo}/blob/{sha}/{path}
 * Output: https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}
 */
function convertBrowseUrlToRaw(url: URL): string | null {
  if (url.origin !== GITHUB_BROWSE_ORIGIN) {
    return null;
  }

  const parts = url.pathname.replace(/^\//, "").split("/");
  // Expected: {owner}/{repo}/blob/{sha}/{...path}
  if (parts.length < 5 || parts[2] !== "blob") {
    return null;
  }

  const [owner, repo, , sha, ...pathParts] = parts;
  return `${GITHUB_RAW_ORIGIN}/${owner}/${repo}/${sha}/${pathParts.join("/")}`;
}

/**
 * Converts a GitHub raw URL to a browse URL.
 * Input: https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}
 * Output: https://github.com/{owner}/{repo}/blob/{sha}/{path}
 */
export function getGithubBrowseUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (url.origin === GITHUB_RAW_ORIGIN) {
      const parts = url.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 4) {
        const [owner, repo, sha, ...pathParts] = parts;
        return `${GITHUB_BROWSE_ORIGIN}/${owner}/${repo}/blob/${sha}/${pathParts.join("/")}`;
      }
    }
  } catch {
    // Fall through to return original string
  }
  return urlStr;
}

/**
 * Validates that a URL is a GitHub Raw URL (or GitHub browse URL that can be converted)
 * locked to a specific commit SHA.
 * 
 * Accepts:
 * - https://raw.githubusercontent.com/{owner}/{repo}/{sha40}/{path}
 * - https://github.com/{owner}/{repo}/blob/{sha40}/{path}
 * 
 * Rejects branch names like "main", "master" etc.
 */
export function parseScriptUrl(raw: string): ScriptUrlResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "not-github" };
  }

  // Try to convert browse URL to raw URL
  let pathname = url.pathname;
  if (url.origin === GITHUB_BROWSE_ORIGIN) {
    const converted = convertBrowseUrlToRaw(url);
    if (!converted) {
      return { ok: false, error: "not-github" };
    }
    // Re-parse as raw URL
    try {
      const rawUrl = new URL(converted);
      pathname = rawUrl.pathname;
    } catch {
      return { ok: false, error: "not-github" };
    }
  } else if (url.origin !== GITHUB_RAW_ORIGIN) {
    return { ok: false, error: "not-github" };
  }

  // pathname: /{owner}/{repo}/{sha}/{...path}
  const parts = pathname.replace(/^\//, "").split("/");
  if (parts.length < 4) {
    return { ok: false, error: "missing-path-segments" };
  }

  const [owner, repo, sha, ...pathParts] = parts;
  if (!SHA40_RE.test(sha)) {
    return { ok: false, error: "not-a-commit-sha" };
  }

  return {
    ok: true,
    parsed: {
      owner,
      repo,
      sha,
      path: pathParts.join("/"),
    },
  };
}

export function scriptUrlErrorMessage(error: ScriptUrlError): string {
  switch (error) {
    case "not-github":
      return "URL must be a GitHub link (raw.githubusercontent.com or github.com)";
    case "missing-path-segments":
      return "URL must include owner, repo, commit SHA and file path";
    case "not-a-commit-sha":
      return "URL must reference a full 40-character commit SHA, not a branch name";
  }
}

/** Convert user input (browse or raw GitHub URL) to a raw GitHub URL. */
export function normalizeScriptUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    
    // If it's already a raw URL, return as-is
    if (url.origin === GITHUB_RAW_ORIGIN) {
      return url.toString();
    }
    
    // If it's a browse URL, convert to raw
    if (url.origin === GITHUB_BROWSE_ORIGIN) {
      const converted = convertBrowseUrlToRaw(url);
      if (converted) {
        return converted;
      }
    }
  } catch {
    // Fall through to return original input
  }
  
  return input;
}
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
