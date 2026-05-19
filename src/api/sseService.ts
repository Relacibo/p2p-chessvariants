import { fetchEventSource } from "@microsoft/fetch-event-source";

const API_URL = import.meta.env.VITE_API_URL as string;

export type SseEvent =
  | {
      type: "lobby_invite";
      lobbyId: string;
      hostUserId: string;
      hostDisplayName: string;
    }
  | {
      type: "signal";
      lobbyId: string | null;
      fromUserId: string;
      signal: unknown;
    };

type SseCallback = (event: SseEvent) => void;

let controller: AbortController | null = null;
const callbacks = new Set<SseCallback>();
let onUnauthorized: (() => void) | null = null;

export function onSseEvent(callback: SseCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

function emit(event: SseEvent) {
  for (const cb of callbacks) {
    cb(event);
  }
}

export function connectSse(token: string, onAuthError?: () => void): void {
  if (controller) {
    controller.abort();
  }
  controller = new AbortController();
  onUnauthorized = onAuthError ?? null;

  fetchEventSource(`${API_URL}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
    openWhenHidden: true,
    async onopen(response) {
      if (response.status === 401) {
        console.warn("[sse] 401 Unauthorized — stopping retries, logging out");
        onUnauthorized?.();
        throw new Error("sse_unauthorized");
      }
      if (!response.ok) {
        throw new Error(`sse_http_${response.status}`);
      }
    },
    onmessage(ev) {
      if (!ev.event) return;
      try {
        const data = JSON.parse(ev.data);
        emit({ type: ev.event as SseEvent["type"], ...data });
      } catch (e) {
        console.error("[sse] failed to parse event", ev, e);
      }
    },
    onerror(err) {
      if (controller?.signal.aborted) throw err; // intentional disconnect
      const msg = err instanceof Error ? err.message : "";
      if (msg === "sse_unauthorized") throw err; // stop retrying on 401
      console.error("[sse] connection error", err);
      // returning normally retries on transient errors
    },
  });
}

export function disconnectSse(): void {
  controller?.abort();
  controller = null;
}

export function isSseConnected(): boolean {
  return controller !== null;
}
