import { useEffect, useRef, useState } from "react";
import { PixiBoard, SceneState, ZoomMode } from "./PixiBoard";
import type {
  BoardOrientation,
  PendingMove,
  WasmAction,
  WasmBoardCoords,
  WasmBoardState,
  WasmPiece,
  WasmVariantConfig,
  WasmUiMap,
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type PixiChessboardProps = {
  variantConfig: WasmVariantConfig;
  boardState: WasmBoardState;
  validMoves: WasmAction[];
  /** Primary board index of the local controlling player — determines zoom target. */
  activeBoardIndex: number;
  /** Board indices where the selected local players can interact. */
  activeBoardIndices?: number[];
  /** Per-slot orientation (index = boardIndex). Defaults to ["normal"]. */
  orientationByBoard?: BoardOrientation[];
  onRotateBoard?: (boardIndex: number) => void;
  onSubmitAction: (action: WasmAction) => void;
  lastAction?: WasmAction;
  selectedDropPiece?: WasmPiece | null;
  onClearDropPiece?: () => void;
  onSelectReservePiece?: (piece: WasmPiece, elementId: string) => void;
  uiMap?: WasmUiMap;
  stageWidth?: number;
  stageHeight?: number;
  pendingMove?: PendingMove | null;
  onPendingMove?: (move: PendingMove | null) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function PixiChessboard({
  variantConfig,
  boardState,
  validMoves,
  activeBoardIndex,
  activeBoardIndices = [activeBoardIndex],
  orientationByBoard = ["normal"],
  onRotateBoard,
  onSubmitAction,
  lastAction,
  selectedDropPiece = null,
  onClearDropPiece,
  onSelectReservePiece,
  uiMap = {},
  stageWidth = 480,
  stageHeight = 480,
  pendingMove = null,
  onPendingMove,
}: PixiChessboardProps) {
  const sw = stageWidth;
  const sh = stageHeight;

  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<PixiBoard | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("single");

  // Keep a ref to the latest state so the async init callback can use it.
  const stateRef = useRef<SceneState | null>(null);
  stateRef.current = {
    variantConfig,
    boardState,
    validMoves,
    activeBoardIndex,
    activeBoardIndices,
    orientationByBoard,
    stageWidth: sw,
    stageHeight: sh,
    pendingMove: pendingMove ?? null,
    lastAction,
    selectedDropPiece: selectedDropPiece ?? null,
    uiMap,
  };

  // Keep stable callback refs so the scene manager always dispatches to the
  // latest handler functions without needing to be re-initialised.
  const onSubmitActionRef = useRef(onSubmitAction);
  onSubmitActionRef.current = onSubmitAction;
  const onPendingMoveRef = useRef(onPendingMove);
  onPendingMoveRef.current = onPendingMove;
  const onClearDropPieceRef = useRef(onClearDropPiece);
  onClearDropPieceRef.current = onClearDropPiece;
  const onSelectReservePieceRef = useRef(onSelectReservePiece);
  onSelectReservePieceRef.current = onSelectReservePiece;

  // ── Mount / unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const board = new PixiBoard(
      (a) => onSubmitActionRef.current(a),
      (m) => onPendingMoveRef.current?.(m)
    );
    board.onClearDropPiece = () => onClearDropPieceRef.current?.();
    board.onSelectReservePiece = (piece, elementId) =>
      onSelectReservePieceRef.current?.(piece, elementId);
    board.onZoomModeChange = (mode) => setZoomMode(mode);
    boardRef.current = board;

    board
      .init(containerRef.current, sw, sh)
      .then(() => {
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
      activeBoardIndex,
      activeBoardIndices,
      orientationByBoard,
      stageWidth: sw,
      stageHeight: sh,
      pendingMove: pendingMove ?? null,
      lastAction,
      selectedDropPiece: selectedDropPiece ?? null,
      uiMap,
    });
  }, [
    variantConfig,
    boardState,
    validMoves,
    activeBoardIndex,
    activeBoardIndices,
    orientationByBoard,
    sw,
    sh,
    pendingMove,
    lastAction,
    selectedDropPiece,
    uiMap,
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
      {/* Side panel: game controls — rendered as HTML overlay right of the board */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 36,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <button
          title="Rotate board"
          onClick={() => onRotateBoard?.(activeBoardIndex)}
          style={{
            pointerEvents: "all",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            width: 28,
            height: 28,
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          ↻
        </button>
        {variantConfig.board.count > 1 && (
          <button
            onClick={toggleZoom}
            title={zoomMode === "single" ? "Zoom out (overview)" : "Zoom in (single board)"}
            style={{
              pointerEvents: "all",
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              width: 28,
              height: 28,
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {zoomMode === "single" ? "⊟" : "⊞"}
          </button>
        )}
      </div>
    </div>
  );
}

export default PixiChessboard;
