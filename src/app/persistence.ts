import type { Middleware } from "@reduxjs/toolkit";

const STORAGE_KEY = "app-state";

const PERSISTED_KEYS = [
  "auth",
  "lobbyVariants",
] as const;

export function loadState(): Record<string, unknown> {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return {};
    return JSON.parse(serialized);
  } catch (e) {
    console.error("[persistence] loadState failed", e);
    return {};
  }
}

export const persistenceMiddleware: Middleware =
  (store) => (next) => (action) => {
    const result = next(action);
    const state = store.getState();
    try {
      const toPersist = Object.fromEntries(
        PERSISTED_KEYS.map((key) => [key, state[key]])
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch (e) {
      console.error("[persistence] localStorage write failed", e);
    }
    return result;
  };
