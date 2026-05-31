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

/** An action produced by `validActionsJson()` or an event sent to `handleEventJson()`.
 *  For `move` events: `from` and `to` are set.
 *  For UI events like `promote`: only `type` and `value` are set. */
export interface WasmAction {
  type: string;
  from?: WasmCoords;
  to?: WasmCoords;
  piece?: WasmPiece;
  /** For UI events (promotion choice, button press, etc.) */
  value?: string;
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
  name: string;
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
export type AllowedPlayerCount = number | number[] | { min: number; max: number; step?: number };

// ─── UI Element types (from handleEventJson result) ─────────────────────────

/** A player visibility filter: string = player name, object = team. */
export type WasmUiPlayerFilter = string | { team: number };

/** A multiple-choice modal (promotion, gating…).
 *  Fires an event `{ type: action, value: selectedOption }`. */
export interface WasmUiChoice {
  type: "choice";
  /** The event type fired when the user selects an option. */
  action: string;
  title: string;
  options: string[];
  players?: WasmUiPlayerFilter[];
}

/** A non-interactive info/warning banner. */
export interface WasmUiBanner {
  type: "banner";
  id: string;
  text: string;
  style: "info" | "warning" | "error";
  players?: WasmUiPlayerFilter[];
}

/** A clickable button. Fires `{ type: action }`. */
export interface WasmUiButton {
  type: "button";
  /** The event type fired on click. */
  action: string;
  label: string;
  players?: WasmUiPlayerFilter[];
}

export type WasmUiElement = WasmUiChoice | WasmUiBanner | WasmUiButton;

/** Result of `handleEventJson()`. */
export interface WasmHandleEventResult {
  ui: WasmUiElement[];
}

/** A player reference: `{ board, color }`. */
export interface PlayerRef {
  board: number;
  color: string;
}
