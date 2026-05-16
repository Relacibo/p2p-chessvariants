const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com";
const SHA40_RE = /^[0-9a-f]{40}$/i;

export type ParsedScriptUrl = {
  owner: string;
  repo: string;
  sha: string;
  path: string;
};

export type ScriptUrlError =
  | "not-github-raw"
  | "missing-path-segments"
  | "not-a-commit-sha";

export type ScriptUrlResult =
  | { ok: true; parsed: ParsedScriptUrl }
  | { ok: false; error: ScriptUrlError };

/**
 * Validates that a URL is a GitHub Raw URL locked to a specific commit SHA.
 * Accepts: https://raw.githubusercontent.com/{owner}/{repo}/{sha40}/{path}
 * Rejects branch names like "main", "master" etc.
 */
export function parseScriptUrl(raw: string): ScriptUrlResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "not-github-raw" };
  }

  if (url.origin !== GITHUB_RAW_ORIGIN) {
    return { ok: false, error: "not-github-raw" };
  }

  // pathname: /{owner}/{repo}/{sha}/{...path}
  const parts = url.pathname.replace(/^\//, "").split("/");
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
    case "not-github-raw":
      return "URL must start with https://raw.githubusercontent.com/";
    case "missing-path-segments":
      return "URL must include owner, repo, commit SHA and file path";
    case "not-a-commit-sha":
      return "URL must reference a full 40-character commit SHA, not a branch name";
  }
}

/** Fetch the raw script text from a validated GitHub Raw URL. */
export async function fetchScriptText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch script: ${res.status} ${res.statusText}`);
  }
  return res.text();
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
};

export function parseInviteFragment(fragment: string): InviteFragment | null {
  const hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const commaIdx = hash.indexOf(",");
  if (commaIdx === -1) return null;
  const hostPeerId = hash.slice(0, commaIdx);
  const encodedUrl = hash.slice(commaIdx + 1);
  if (!hostPeerId || !encodedUrl) return null;
  try {
    const scriptUrl = decodeScriptUrl(encodedUrl);
    return { hostPeerId, scriptUrl };
  } catch {
    return null;
  }
}

/** Build an invite fragment for sharing. */
export function buildInviteFragment(
  hostPeerId: string,
  scriptUrl: string
): string {
  return `#${hostPeerId},${encodeScriptUrl(scriptUrl)}`;
}
