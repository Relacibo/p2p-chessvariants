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

/** Variant config as returned by `variantConfigJson()`. */
export interface WasmVariantConfig {
  name: string;
  version: string;
  api_version: number;
  min_players: number;
  max_players: number;
  reserve_pile: boolean;
  check_protection: boolean;
  board: WasmBoardScriptConfig;
}
