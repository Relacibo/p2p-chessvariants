import { fetchEventSource } from "@microsoft/fetch-event-source";

const API_URL = import.meta.env.VITE_API_URL as string;

export type SseEvent =
  | {
      type: "lobby_member_joined";
      lobbyId: string;
      member: { userId: string; displayName: string };
    }
  | { type: "lobby_member_left"; lobbyId: string; userId: string }
  | { type: "lobby_deleted"; lobbyId: string }
  | {
      type: "lobby_game_started";
      lobbyId: string;
      members: Array<{ userId: string; displayName: string }>;
    }
  | { type: "lobby_game_ended"; lobbyId: string }
  | {
      type: "lobby_invite";
      lobbyId: string;
      hostUserId: string;
      hostDisplayName: string;
      scriptUrl: string;
    }
  | {
      type: "signal";
      lobbyId: string;
      fromUserId: string;
      signal: unknown;
    };

type SseCallback = (event: SseEvent) => void;

let controller: AbortController | null = null;
const callbacks = new Set<SseCallback>();

export function onSseEvent(callback: SseCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

function emit(event: SseEvent) {
  for (const cb of callbacks) {
    cb(event);
  }
}

export function connectSse(token: string): void {
  if (controller) {
    controller.abort();
  }
  controller = new AbortController();

  fetchEventSource(`${API_URL}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
    openWhenHidden: true,
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
      console.error("[sse] connection error", err);
      // fetchEventSource retries automatically on network errors
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
