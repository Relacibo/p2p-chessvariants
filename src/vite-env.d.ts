/// <reference types="vite/client" />

declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

// Raw WASM binding module — no WASM import, pure JS shims
declare module "/rust/pkg/chessvariant_engine_bg.js" {
  export { ChessvariantEngine, CvJsError, Piece, PieceColor, PieceType } from "chessvariant-engine";
  export function __wbg_set_wasm(wasm: WebAssembly.Exports): void;
  export function __wbindgen_init_externref_table(): void;
  export function __wbindgen_cast_0000000000000001(a: number, b: number): unknown;
}
