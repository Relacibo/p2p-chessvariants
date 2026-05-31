export interface WasmPiece {
  pieceType: string;
  color: string;
}

/** Flat board state as returned by `boardStateJson()`. */
export interface WasmBoardState {
  rows: number;
  cols: number;
  numberOfBoards: number;
  /** One flat array per board: index = row * cols + col */
  boards: (WasmPiece | null)[][];
}

/** A board square coordinate. */
export interface WasmBoardCoords {
  type: "board";
  row: number;
  col: number;
  boardIndex: number;
}

/** A reserve slot coordinate — used when a piece is dragged from the reserve pile. */
export interface WasmReserveCoords {
  type: "reserve";
  index: number;
}

/** Union coordinate type: board square OR reserve slot. */
export type WasmCoords = WasmBoardCoords | WasmReserveCoords;

/** Helper to check if coords point to a board square. */
export function isBoardCoords(c: WasmCoords): c is WasmBoardCoords {
  return c.type === "board";
}

/** A move action produced by `validActionsJson()`.
 *  `piece` is set for reserve drops; for board moves the engine reads it from the board. */
export interface WasmAction {
  type: "move";
  from: WasmCoords;
  to: WasmCoords;
  piece?: WasmPiece;
}

export interface WasmDisabledRect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** Board config as returned by `variantConfigJson()`. */
export interface WasmBoardScriptConfig {
  type: string;
  rows: number;
  cols: number;
  count: number;
  disabled_rects: WasmDisabledRect[];
}

export interface WasmPlayerConfig {
  color: string;
  board: number;
  team: number;
}

export interface WasmReservePileState {
  reserve_piles: WasmPiece[][];
}

export interface WasmVariantConfig {
  name: string;
  version: string;
  api_version: number;
  colors: string[];
  players: WasmPlayerConfig[];
  allowed_player_count: AllowedPlayerCount;
  reserve_pile: boolean;
  check_protection: boolean;
  promotion_pieces: string[];
  board: WasmBoardScriptConfig;
}

/** Player count specification from the script config. */
export type AllowedPlayerCount =
  | number
  | number[]
  | { min: number; max: number; step?: number };

// ─── v2 UI Element types (from getUiJson / handleMove / uiInteraction result) ──

/** A clickable button. Handler closure stripped by engine. */
export interface WasmUiButton {
  type: "button";
  label: string;
}

/** A piece selection dialog (promotion, gating…). Handler closure stripped by engine. */
export interface WasmUiPieceSelection {
  type: "piece_selection";
  title: string;
  pieces: WasmPiece[];
}

/** A non-interactive info/warning/error banner. */
export interface WasmUiBanner {
  type: "banner";
  text: string;
  style: "info" | "warning" | "error";
}

export type WasmUiElementNode = WasmUiButton | WasmUiPieceSelection | WasmUiBanner;

/** UI map returned by engine: { [elementId: string]: WasmUiElementNode }.
 *  Element IDs are stable, unique strings (e.g. "promo_pick", "draw_btn"). */
export type WasmUiMap = Record<string, WasmUiElementNode>;

/** Result of `handleMove()` or `uiInteraction()`. */
export interface WasmMoveResult {
  ui: WasmUiMap;
  game_over: {
    type: "winner" | "winners" | "draw";
    player?: number;
    players?: number[];
  } | null;
}

/** A player reference: `{ board, color }`. */
export interface PlayerRef {
  board: number;
  color: string;
}

/** Helper: extract a valid default player count from the variant config. */
export function getDefaultPlayerCount(
  allowed: AllowedPlayerCount
): number {
  if (typeof allowed === "number") return allowed;
  if (Array.isArray(allowed)) return allowed[0] ?? 2;
  return allowed.min ?? 2;
}
