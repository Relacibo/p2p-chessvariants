/**
 * Utilities for working with AllowedPlayerCount from variant configs.
 * The data arrives as a serde-tagged enum from the Rust engine:
 *   { exact: N }  |  { discrete: [...] }  |  { range: { min, max, step? } }
 */
import type { AllowedPlayerCount } from "../chessboard/types";

/** Maximum number of slots (players) this config supports. */
export function getMaxSlots(apc: AllowedPlayerCount): number {
  if ("exact" in apc) return apc.exact;
  if ("discrete" in apc) return Math.max(...apc.discrete);
  return apc.range.max;
}

/** Minimum number of players before a game can start. */
export function getMinPlayers(apc: AllowedPlayerCount): number {
  if ("exact" in apc) return apc.exact;
  if ("discrete" in apc) return Math.min(...apc.discrete);
  return apc.range.min;
}

/** Check whether the given count is valid per the player count spec. */
export function isValidPlayerCount(
  apc: AllowedPlayerCount,
  n: number,
): boolean {
  if ("exact" in apc) return n === apc.exact;
  if ("discrete" in apc) return apc.discrete.includes(n);
  const step = apc.range.step ?? 1;
  return n >= apc.range.min && n <= apc.range.max && (n - apc.range.min) % step === 0;
}

/** Human-readable label for the slot range. */
export function formatSlotRange(apc: AllowedPlayerCount): string {
  if ("exact" in apc) return `${apc.exact}`;
  if ("discrete" in apc) return `[${apc.discrete.join(", ")}]`;
  return `${apc.range.min}–${apc.range.max}`;
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
