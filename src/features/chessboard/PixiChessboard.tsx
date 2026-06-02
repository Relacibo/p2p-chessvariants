import { useEffect, useRef, useState } from "react";
import { PixiBoard, SceneState, ZoomMode } from "./PixiBoard";
import type {
  WasmAction,
  WasmBoardCoords,
  WasmBoardState,
  WasmPiece,
  WasmVariantConfig,
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type PendingMove = {
  from: WasmBoardCoords;
  piece: WasmPiece;
  to: WasmBoardCoords;
};

export type PixiChessboardProps = {
  variantConfig: WasmVariantConfig;
  boardState: WasmBoardState;
  validMoves: WasmAction[];
  boardIndex: number;
  flipped: boolean;
  onSubmitAction: (action: WasmAction) => void;
  lastAction?: WasmAction;
  selectedDropPiece?: WasmPiece | null;
  onClearDropPiece?: () => void;
  /** Logical board pixel size. Defaults to 480. */
  size?: number;
  /** Total canvas width. Defaults to board width. */
  stageWidth?: number;
  /** Total canvas height. Defaults to board height. */
  stageHeight?: number;
  pendingMove?: PendingMove | null;
  onPendingMove?: (move: PendingMove | null) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function PixiChessboard({
  variantConfig,
  boardState,
  validMoves,
  boardIndex,
  flipped,
  onSubmitAction,
  lastAction,
  selectedDropPiece = null,
  onClearDropPiece,
  size = 480,
  stageWidth,
  stageHeight,
  pendingMove = null,
  onPendingMove,
}: PixiChessboardProps) {
  const { rows, cols } = boardState;
  const tileSize = size / Math.max(rows, cols);
  const sw = stageWidth ?? Math.round(tileSize * cols);
  const sh = stageHeight ?? Math.round(tileSize * rows);

  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<PixiBoard | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("single");

  // Keep a ref to the latest state so the async init callback can use it.
  const stateRef = useRef<SceneState | null>(null);
  stateRef.current = {
    variantConfig,
    boardState,
    validMoves,
    boardIndex,
    flipped,
    tileSize,
    stageWidth: sw,
    stageHeight: sh,
    pendingMove: pendingMove ?? null,
    lastAction,
    selectedDropPiece: selectedDropPiece ?? null,
  };

  // Keep stable callback refs so the scene manager always dispatches to the
  // latest handler functions without needing to be re-initialised.
  const onSubmitActionRef = useRef(onSubmitAction);
  onSubmitActionRef.current = onSubmitAction;
  const onPendingMoveRef = useRef(onPendingMove);
  onPendingMoveRef.current = onPendingMove;
  const onClearDropPieceRef = useRef(onClearDropPiece);
  onClearDropPieceRef.current = onClearDropPiece;

  // ── Mount / unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const board = new PixiBoard(
      (a) => onSubmitActionRef.current(a),
      (m) => onPendingMoveRef.current?.(m)
    );
    board.onClearDropPiece = () => onClearDropPieceRef.current?.();
    boardRef.current = board;

    board
      .init(containerRef.current, sw, sh)
      .then(() => {
        // Use the latest state (not the stale closure values from mount time)
        if (stateRef.current) board.update(stateRef.current);
      })
      .catch((e: unknown) => {
        console.error("[PixiChessboard] init failed", e);
      });

    return () => {
      board.destroy();
      boardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reactive state sync ──────────────────────────────────────────────────
  useEffect(() => {
    boardRef.current?.update({
      variantConfig,
      boardState,
      validMoves,
      boardIndex,
      flipped,
      tileSize,
      stageWidth: sw,
      stageHeight: sh,
      pendingMove: pendingMove ?? null,
      lastAction,
      selectedDropPiece: selectedDropPiece ?? null,
    });
  }, [
    variantConfig,
    boardState,
    validMoves,
    boardIndex,
    flipped,
    tileSize,
    sw,
    sh,
    pendingMove,
    lastAction,
    selectedDropPiece,
  ]);

  // ── Zoom toggle ──────────────────────────────────────────────────────────
  const toggleZoom = () => {
    const next: ZoomMode = zoomMode === "single" ? "overview" : "single";
    setZoomMode(next);
    boardRef.current?.setZoomMode(next);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: sw, height: sh }}
    >
      {/* PixiJS appends its canvas here after init() */}
      <button
        onClick={toggleZoom}
        title={zoomMode === "single" ? "Zoom out (overview)" : "Zoom in (single board)"}
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          zIndex: 10,
          padding: "4px 8px",
          fontSize: 18,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        {zoomMode === "single" ? "⊟" : "⊞"}
      </button>
    </div>
  );
}

export default PixiChessboard;
