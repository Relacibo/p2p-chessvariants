/**
 * Zod validation schemas for all WASM engine payloads.
 *
 * These schemas validate JSON crossing the Rust→JS boundary.
 * A schema mismatch produces a ZodError with an exact path to the failing field,
 * making casing bugs and type errors immediately debuggable.
 *
 * Usage (in useChessGame.ts or EngineProxy):
 *   import { BoardStateSchema } from "../engine/schemas";
 *   const valid = BoardStateSchema.parse(rawJson);
 */

import { z } from "zod";

/**
 * Parse and validate raw JSON at the engine boundary.
 * Returns the validated value or throws a ZodError with path context.
 *
 * Usage:
 *   const board = validateEngineJson(BoardStateSchema, engine.boardStateJson());
 */
export function validateEngineJson<T>(schema: z.ZodType<T>, raw: string): T {
  const parsed: unknown = JSON.parse(raw);
  return schema.parse(parsed);
}

/**
 * Like `validateEngineJson` but returns `{ success, data, error }` instead of throwing.
 * Use when validation failure should not abort the whole flow.
 */
export function safeValidateEngineJson<T>(
  schema: z.ZodType<T>,
  raw: string,
): { success: true; data: T } | { success: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      success: false,
      error: `[engine] JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const result = schema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: `[engine] Schema mismatch:\n${result.error.message}` };
}

// ── Primitive / leaf types ────────────────────────────────────────────────────

/** A chess piece: `{ piece_type: "king", color: "white" }`. */
export const PieceSchema = z.object({
  piece_type: z.string(),
  color: z.string(),
});

/** Board square coordinate: `{ type: "board", row: 1, col: 2, board_index: 0 }`. */
export const BoardCoordsSchema = z.object({
  type: z.literal("board"),
  row: z.number(),
  col: z.number(),
  board_index: z.number(),
});

/** Reserve slot coordinate: `{ type: "reserve", index: 0, board_index: 0 }`. */
export const ReserveCoordsSchema = z.object({
  type: z.literal("reserve"),
  index: z.number(),
  board_index: z.number(),
});

/** Tagged union of board and reserve coordinates. */
export const CoordsSchema = z.discriminatedUnion("type", [
  BoardCoordsSchema,
  ReserveCoordsSchema,
]);

/** A game action: move, select_piece, interact, or cancel. */
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), from: CoordsSchema, to: CoordsSchema }),
  z.object({ type: z.literal("select_piece"), piece: PieceSchema }),
  z.object({ type: z.literal("interact"), element_id: z.string() }),
  z.object({ type: z.literal("cancel") }),
]);

// ── Board state ────────────────────────────────────────────────────────────────

export const BoardStateSchema = z.object({
  rows: z.number(),
  cols: z.number(),
  number_of_boards: z.number(),
  boards: z.array(z.array(PieceSchema.nullable())),
});

// ── Player ────────────────────────────────────────────────────────────────────

export const PlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  home_board: z.number(),
  team: z.number(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const PlayerMovesSchema = z.object({
  player: z.number(),
  moves: z.array(ActionSchema),
});

// ── Game progress ─────────────────────────────────────────────────────────────

export const GameProgressSchema = z.discriminatedUnion("progress", [
  z.object({ progress: z.literal("in_progress") }),
  z.object({ progress: z.literal("draw") }),
  z.object({ progress: z.literal("decisive"), winning_team: z.number() }),
]);

// ── Valid moves wrapper ───────────────────────────────────────────────────────

/** Payload of `validMovesAllJson()`: `{ valid_moves: [...], game_over: ... }`. */
export const ValidMovesAllSchema = z.object({
  valid_moves: z.array(PlayerMovesSchema),
  game_over: GameProgressSchema.nullable(),
});

// ── Submit action result ──────────────────────────────────────────────────────

/** Payload of `submitAction()`: `{ ui, game_over, board_state }`. */
export const SubmitActionResultSchema = z.object({
  ui: z.record(z.string(), z.unknown()),
  game_over: GameProgressSchema.nullable(),
  board_state: BoardStateSchema,
});

// ── Variant config ────────────────────────────────────────────────────────────

export const DisabledRectSchema = z.object({
  r1: z.number(),
  c1: z.number(),
  r2: z.number(),
  c2: z.number(),
});

export const BoardScriptConfigSchema = z.object({
  type: z.string(),
  rows: z.number(),
  cols: z.number(),
  count: z.number(),
  disabled_rects: z.array(DisabledRectSchema),
});

/** Loose validation of the player count field — handles `number | number[] | { min, max, step? }`. */
export const AllowedPlayerCountSchema = z.union([
  z.number(),
  z.array(z.number()),
  z.object({ min: z.number(), max: z.number(), step: z.number().optional() }),
]);

export const VariantConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  api_version: z.number(),
  colors: z.array(z.string()),
  allowed_player_count: AllowedPlayerCountSchema,
  board: BoardScriptConfigSchema,
});

// ── Player config (from playersJson) ──────────────────────────────────────────

export const PlayerConfigSchema = z.object({
  id: z.number(),
  name: z.string(),
  home_board: z.number().optional(),
  team: z.number(),
  orientation: z
    .union([
      z.literal("normal"),
      z.literal("flipped"),
      z.literal("clockwise"),
      z.literal("counterclockwise"),
    ])
    .optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
