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

/** Pending move from drag-start — the client predicts the move locally. */
export type PendingMove = {
  from: WasmBoardCoords;
  piece: WasmPiece;
  to: WasmBoardCoords;
};

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

/** Action types. `select_piece` and `cancel` come only from PiecePicker UI elements. */
export type WasmAction =
  | { type: "move"; from: WasmCoords; to: WasmCoords }
  | { type: "select_piece"; piece: WasmPiece }
  | { type: "interact"; elementId: string }
  | { type: "cancel" };

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

export type BoardOrientation = "normal" | "flipped" | "clockwise" | "counterclockwise";

export interface WasmPlayerConfig {
  color: string;
  board: number;
  team: number;
  orientation?: BoardOrientation;
}

export interface WasmVariantConfig {
  name: string;
  version: string;
  api_version: number;
  colors: string[];
  allowed_player_count: AllowedPlayerCount;
  board: WasmBoardScriptConfig;
}

/** Player count specification from the script config. */
export type AllowedPlayerCount =
  | number
  | number[]
  | { min: number; max: number; step?: number };

// ─── v2 UI Element types (from getUiJson / submitAction result) ──

/** A clickable button. */
export interface WasmUiButton {
  type: "button";
  label: string;
}

/** A non-interactive info/warning/error banner. */
export interface WasmUiBanner {
  type: "banner";
  text: string;
  style: "info" | "warning" | "error";
}

/** A reserve pile display. */
export interface WasmUiReservePile {
  type: "reserve_pile";
  pieces: WasmPiece[];
  /** Which board slot this reserve pile belongs to (default 0). Set by the Rhai script. */
  board_index: number;
}

/** A piece picker modal (promotion, gating, etc.). */
export interface WasmUiPiecePicker {
  type: "piece_picker";
  pieces: WasmPiece[];
}

export type WasmUiElementNode =
  | WasmUiButton
  | WasmUiBanner
  | WasmUiReservePile
  | WasmUiPiecePicker;

/** UI map returned by engine: { [elementId: string]: WasmUiElementNode }. */
export type WasmUiMap = Record<string, WasmUiElementNode>;

/** A player's valid moves entry from `validMovesJson()`. */
export interface WasmPlayerMoves {
  player: { board: number; color: string; team: number };
  moves: WasmAction[];
}

/** Result of `submitAction()`. */
export interface WasmSubmitActionResult {
  ui: WasmUiMap;
  game_over: {
    type: "winner" | "winners" | "draw";
    player?: number;
    players?: number[];
  } | null;
  board_state: WasmBoardState;
}

/** A player reference: `{ board, color }`. */
export interface PlayerRef {
  board: number;
  color: string;
  orientation?: BoardOrientation;
}

/** Helper: extract a valid default player count from the variant config. */
export function getDefaultPlayerCount(
  allowed: AllowedPlayerCount
): number {
  if (typeof allowed === "number") return allowed;
  if (Array.isArray(allowed)) return allowed[0] ?? 2;
  return allowed.min ?? 2;
}
