/**
 * Utilities for working with AllowedPlayerCount from variant configs.
 */
import type { AllowedPlayerCount } from "../chessboard/types";

/** Maximum number of slots (players) this config supports. */
export function getMaxSlots(apc: AllowedPlayerCount): number {
  if (typeof apc === "number") return apc;
  if (Array.isArray(apc)) return Math.max(...apc);
  return apc.max;
}

/** Minimum number of players before a game can start. */
export function getMinPlayers(apc: AllowedPlayerCount): number {
  if (typeof apc === "number") return apc;
  if (Array.isArray(apc)) return Math.min(...apc);
  return apc.min;
}

/** Check whether the given count is valid per the player count spec. */
export function isValidPlayerCount(
  apc: AllowedPlayerCount,
  n: number,
): boolean {
  if (typeof apc === "number") return n === apc;
  if (Array.isArray(apc)) return apc.includes(n);
  const step = apc.step ?? 1;
  return n >= apc.min && n <= apc.max && (n - apc.min) % step === 0;
}

/** Human-readable label for the slot range. */
export function formatSlotRange(apc: AllowedPlayerCount): string {
  if (typeof apc === "number") return `${apc}`;
  if (Array.isArray(apc)) return `[${apc.join(", ")}]`;
  return `${apc.min}–${apc.max}`;
}

/**
 * Get a display label for a slot index, derived from the variant config.
 * Uses the `colors` field (e.g. "white", "black") as the primary label,
 * falling back to "Player N".
 */
export function getSlotLabel(
  apc: AllowedPlayerCount,
  slotIndex: number,
  colors?: string[],
): string {
  if (colors && slotIndex < colors.length) {
    const color = colors[slotIndex];
    return color.charAt(0).toUpperCase() + color.slice(1);
  }
  return `Player ${slotIndex + 1}`;
}
