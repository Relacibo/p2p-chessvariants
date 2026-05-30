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

export interface WasmBoardCoords {
  row: number;
  col: number;
  boardIndex: number;
}

export interface WasmAction {
  type: string;
  from?: WasmBoardCoords;
  to?: WasmBoardCoords;
  piece?: WasmPiece;
  tag?: string;
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
  team: string;
}

export interface WasmReservePileState {
  reserve_piles: WasmPiece[][];
}

export interface WasmVariantConfig {
  name: string;
  version: string;
  api_version: number;
  colors: string[];
  allowed_player_count: AllowedPlayerCount;
  reserve_pile: boolean;
  check_protection: boolean;
  board: WasmBoardScriptConfig;
}

/** Player count specification from the script config. */
export type AllowedPlayerCount = number | number[] | { min: number; max: number; step?: number };
