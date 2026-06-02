import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  WasmAction,
  WasmBoardCoords,
  WasmBoardState,
  WasmCoords,
  WasmPiece,
  WasmVariantConfig,
  isBoardCoords,
} from "./types";
import { getCachedImage, getPieceImageUrl, preloadAllPieceImages } from "./pieceImages";
import styles from "./Chessboard.module.css";

// Lichess board palette
const LIGHT = "#F0D9B5";
const DARK = "#B58863";
const SELECTED_FILL = "rgba(20, 120, 255, 0.45)";
const VALID_MOVE_DOT = "rgba(0, 180, 0, 0.7)";
const VALID_CAPTURE_FILL = "rgba(0, 180, 0, 0.35)";
const LAST_MOVE_FILL = "rgba(255, 215, 0, 0.35)";

export type PendingMove = {
  from: WasmBoardCoords;
  piece: WasmPiece;
  to: WasmBoardCoords;
};

export type ChessboardProps = {
  variantConfig: WasmVariantConfig;
  boardState: WasmBoardState;
  validMoves: WasmAction[];
  /** Which board to render (from the controlling player's board index). */
  boardIndex: number;
  /** Whether the board is flipped for this player's perspective. */
  flipped: boolean;
  onSubmitAction: (action: WasmAction) => void;
  lastAction?: WasmAction;
  /** When set, highlights valid drop squares for this piece (from reserve pile). */
  selectedDropPiece?: WasmPiece | null;
  onClearDropPiece?: () => void;
  /** Pixel width/height of the board square. Defaults to 480. */
  size?: number;
  /**
   * Total width/height of the Konva Stage. When provided the Stage fills this
   * area and the board is centered inside it. Defaults to the board size.
   */
  stageWidth?: number;
  stageHeight?: number;
  /**
   * Optimistic prediction: piece appears at destination immediately on drop,
   * before the worker confirms. Managed by the parent so it can be cleared in
   * the same state batch as the real boardState update (avoids an extra render).
   */
  pendingMove?: PendingMove | null;
  onPendingMove?: (move: PendingMove | null) => void;
};

function coordsEq(a: WasmCoords, b: WasmCoords): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "reserve" && b.type === "reserve") return a.index === b.index;
  if (a.type === "board" && b.type === "board")
    return a.row === b.row && a.col === b.col && a.boardIndex === b.boardIndex;
  return false;
}

function mkBoardCoords(row: number, col: number, boardIndex: number): WasmBoardCoords {
  return { type: "board", row, col, boardIndex };
}

export function Chessboard({
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
}: ChessboardProps) {
  const { rows, cols } = boardState;
  const tileSize = size / Math.max(rows, cols);
  const boardW = tileSize * cols;
  const boardH = tileSize * rows;

  const sw = stageWidth ?? boardW;
  const sh = stageHeight ?? boardH;
  const offsetX = Math.floor((sw - boardW) / 2);
  const offsetY = Math.floor((sh - boardH) / 2);

  // Trigger re-render once piece images are loaded
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [selected, setSelected] = useState<WasmBoardCoords | null>(null);
  const [dragging, setDragging] = useState<WasmBoardCoords | null>(null);
  const dragOrigin = useRef<WasmBoardCoords | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageRef = useRef<any>(null);
  const dragSurfaceRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep a ref to validMoves so onDrop always has fresh data
  const validMovesRef = useRef(validMoves);
  validMovesRef.current = validMoves;
  // Keep a stable ref to the pointer-move handler so add/remove always match
  const handleWindowPointerMoveRef = useRef<((e: PointerEvent) => void) | null>(null);

  const setCursor = (cursor: string) => {
    stageRef.current?.container()?.style &&
      (stageRef.current.container().style.cursor = cursor);
  };

  // Derive pickable squares from validMoves — which pieces can be selected/dragged.
  // A square is pickable if there is at least one Move action from it.
  const pickableSquares = useMemo(() => {
    const s = new Set<string>();
    for (const a of validMoves) {
      if (a.type === "move" && isBoardCoords(a.from))
        s.add(`${a.from.row},${a.from.col}`);
    }
    return s;
  }, [validMoves]);

  useEffect(() => {
    preloadAllPieceImages().then(() => setImagesLoaded(true));
  }, []);

  const disabledSet = useMemo(() => {
    const s = new Set<string>();
    for (const { r1, c1, r2: h, c2: w } of variantConfig.board.disabled_rects) {
      for (let r = r1; r < r1 + h; r++)
        for (let c = c1; c < c1 + w; c++) s.add(`${r},${c}`);
    }
    return s;
  }, [variantConfig]);

  const validTargets = useMemo(() => {
    const s = new Set<string>();
    // Show targets for whichever source is active (click-select or drag)
    const src = selected ?? dragging;
    if (src) {
      for (const a of validMoves) {
        if (a.type === "move" && coordsEq(a.from, src) && isBoardCoords(a.to))
          s.add(`${a.to.row},${a.to.col}`);
      }
    }
    if (selectedDropPiece) {
      // Drops: from is a ReserveCoords. Show all valid destinations.
      for (const a of validMoves) {
        if (
          a.type === "move" &&
          a.from.type === "reserve" &&
          isBoardCoords(a.to)
        )
          s.add(`${a.to.row},${a.to.col}`);
      }
    }
    return s;
  }, [selected, dragging, selectedDropPiece, validMoves]);

  const findAction = useCallback(
    (from: WasmBoardCoords, to: WasmBoardCoords) =>
      validMovesRef.current.find(
        (a) =>
          a.type === "move" && coordsEq(a.from, from) && coordsEq(a.to, to)
      ) as Extract<WasmAction, { type: "move" }> | undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Convert logical (row, col) → pixel top-left in the Stage. */
  const toPixel = (row: number, col: number) => ({
    x: offsetX + col * tileSize,
    y: offsetY + (flipped ? rows - 1 - row : row) * tileSize,
  });

  /** Convert a Stage pixel position → logical BoardCoords. */
  const fromPixel = (x: number, y: number): WasmBoardCoords => {
    const rawRow = Math.floor((y - offsetY) / tileSize);
    const col = Math.max(0, Math.min(cols - 1, Math.floor((x - offsetX) / tileSize)));
    const row = Math.max(
      0,
      Math.min(rows - 1, flipped ? rows - 1 - rawRow : rawRow)
    );
    return mkBoardCoords(row, col, boardIndex);
  };

  const getPiece = (row: number, col: number) =>
    boardState.boards[boardIndex]?.[row * cols + col] ?? null;

  /** getPiece with optimistic prediction applied. */
  const getDisplayPiece = (row: number, col: number): WasmPiece | null => {
    const piece = getPiece(row, col);
    if (!pendingMove) return piece;
    const coords = mkBoardCoords(row, col, boardIndex);
    if (coordsEq(coords, pendingMove.from)) return null;
    if (coordsEq(coords, pendingMove.to)) return pendingMove.piece;
    return piece;
  };

  const handleTileClick = (row: number, col: number) => {
    const clicked = mkBoardCoords(row, col, boardIndex);

    // Drop from reserve pile: find the matching Move action with ReserveCoords from
    if (selectedDropPiece) {
      const action = validMoves.find(
        (a): a is Extract<WasmAction, { type: "move" }> =>
          a.type === "move" &&
          a.from.type === "reserve" &&
          coordsEq(a.to, clicked)
      );
      if (action) {
        onSubmitAction(action);
        onClearDropPiece?.();
      } else {
        onClearDropPiece?.();
      }
      setSelected(null);
      return;
    }

    if (selected) {
      const action = findAction(selected, clicked);
      if (action) {
        const piece = getPiece(selected.row, selected.col);
        if (piece && isBoardCoords(action.to)) {
          onPendingMove?.({ from: selected, piece, to: action.to });
        }
        onSubmitAction(action);
        setSelected(null);
        return;
      }
    }

    const piece = getPiece(row, col);
    if (piece && pickableSquares.has(`${row},${col}`)) {
      setSelected(clicked);
    } else {
      setSelected(null);
    }
  };

  // ── Tiles ────────────────────────────────────────────────────────────────
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (disabledSet.has(`${row},${col}`)) continue;

      const { x, y } = toPixel(row, col);
      const isLight = (row + col) % 2 === 0;
      const tileCoords = mkBoardCoords(row, col, boardIndex);
      const isSelected = selected != null && coordsEq(selected, tileCoords);
      const isTarget = validTargets.has(`${row},${col}`);
      const isLastMove =
        lastAction &&
        lastAction.type === "move" &&
        (coordsEq(lastAction.from, tileCoords) ||
          coordsEq(lastAction.to, tileCoords));
      const hasPiece = getDisplayPiece(row, col) != null;

      tiles.push(
        <Group key={`t-${row}-${col}`} onClick={() => handleTileClick(row, col)}>
          <Rect x={x} y={y} width={tileSize} height={tileSize} fill={isLight ? LIGHT : DARK} />
          {isLastMove && (
            <Rect x={x} y={y} width={tileSize} height={tileSize} fill={LAST_MOVE_FILL} listening={false} />
          )}
          {isSelected && (
            <Rect x={x} y={y} width={tileSize} height={tileSize} fill={SELECTED_FILL} listening={false} />
          )}
          {isTarget && !hasPiece && (
            <Circle
              x={x + tileSize / 2}
              y={y + tileSize / 2}
              radius={tileSize * 0.16}
              fill={VALID_MOVE_DOT}
              listening={false}
            />
          )}
          {isTarget && hasPiece && (
            <Rect x={x} y={y} width={tileSize} height={tileSize} fill={VALID_CAPTURE_FILL} listening={false} />
          )}
        </Group>
      );
    }
  }

  // ── Pieces ───────────────────────────────────────────────────────────────
  // All pieces stay in a fixed-order array — never reordered during drag.
  // Z-ordering for the dragged piece is handled by DOM drag surface.
  const pieces: ReactNode[] = [];
  let ghostEl: ReactNode = null;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (disabledSet.has(`${row},${col}`)) continue;
      const piece = getDisplayPiece(row, col);
      if (!piece) continue;

      const { x, y } = toPixel(row, col);
      const coords = mkBoardCoords(row, col, boardIndex);
      const canDrag = pickableSquares.has(`${row},${col}`);
      const imgUrl = getPieceImageUrl(piece.color, piece.pieceType);
      const imgEl = imagesLoaded && imgUrl ? getCachedImage(imgUrl) : undefined;
      const isDragging = dragging != null && coordsEq(dragging, coords);

      if (imgEl) {
        // Ghost: semi-transparent copy stays on origin square while dragging
        if (isDragging) {
          ghostEl = (
            <KonvaImage
              key={`ghost-${row}-${col}`}
              image={imgEl}
              x={x} y={y}
              width={tileSize} height={tileSize}
              opacity={0.35}
              listening={false}
            />
          );
        }

        // Piece node stays in the same array position throughout drag
        pieces.push(
          <KonvaImage
            key={`p-${row}-${col}`}
            id={`piece-${row}-${col}`}
            image={imgEl}
            x={x} y={y}
            width={tileSize} height={tileSize}
            draggable={canDrag}
            onMouseEnter={() => { if (canDrag) setCursor("grab"); }}
            onMouseLeave={() => { if (!isDragging) setCursor("default"); }}
            onClick={() => { if (!dragging) handleTileClick(row, col); }}
            onDragStart={(e: KonvaEventObject<DragEvent>) => {
              dragOrigin.current = coords;
              setSelected(null);
              setDragging(coords);
              setCursor("grabbing");
              // Hide Konva piece — DOM drag surface shows the visual copy
              e.target.opacity(0);
              // Disable canvas pointer-events during drag so Konva's
              // _pointermove handler never fires — this prevents the
              // getIntersection → getImageData GPU readback (888ms+ per move).
              const container = stageRef.current?.container();
              if (container) container.style.pointerEvents = "none";
              // Spawn DOM drag surface (follows cursor with GPU compositing)
              const piece = getPiece(row, col);
              const pieceImgUrl = getPieceImageUrl(piece?.color ?? "white", piece?.pieceType ?? "pawn");
              const cachedImg = pieceImgUrl ? getCachedImage(pieceImgUrl) : undefined;
              if (dragSurfaceRef.current && cachedImg) {
                dragSurfaceRef.current.innerHTML = "";
                const img = document.createElement("img");
                img.src = cachedImg.src;
                img.style.width = `${tileSize}px`;
                img.style.height = `${tileSize}px`;
                dragSurfaceRef.current.appendChild(img);
                // Position centered under cursor (viewport coordinates)
                const clientX = (e.evt as unknown as PointerEvent).clientX;
                const clientY = (e.evt as unknown as PointerEvent).clientY;
                dragSurfaceRef.current.style.transform =
                  `translate(${clientX - tileSize / 2}px, ${clientY - tileSize / 2}px)`;
                dragSurfaceRef.current.style.display = "block";
              }
              window.addEventListener("pointermove", handleWindowPointerMove);
            }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              // Restore canvas pointer-events immediately
              const container = stageRef.current?.container();
              if (container) container.style.pointerEvents = "";
              const handler = handleWindowPointerMoveRef.current;
              if (handler) window.removeEventListener("pointermove", handler);
              // Hide DOM drag surface
              if (dragSurfaceRef.current) {
                dragSurfaceRef.current.style.display = "none";
                dragSurfaceRef.current.innerHTML = "";
              }
              const origin = dragOrigin.current;
              dragOrigin.current = null;
              setDragging(null);
              setCursor("default");
              let pendingSet = false;
              if (origin) {
                // Use the pointerup event's coordinates (stage.getPointerPosition()
                // is stale because the canvas had pointer-events:none during drag)
                const stageBox = stageRef.current?.container()?.getBoundingClientRect();
                const clientX = (e.evt as unknown as PointerEvent).clientX;
                const clientY = (e.evt as unknown as PointerEvent).clientY;
                const pointer = stageBox
                  ? { x: clientX - stageBox.left, y: clientY - stageBox.top }
                  : null;
                if (pointer) {
                  const target = fromPixel(pointer.x, pointer.y);
                  const action = findAction(origin, target);
                  if (action) {
                    const piece = getPiece(origin.row, origin.col);
                    if (piece && isBoardCoords(action.to)) {
                      onPendingMove?.({ from: origin, piece, to: action.to });
                      pendingSet = true;
                    }
                    onSubmitAction(action);
                    setSelected(null);
                  }
                }
              }
              if (!pendingSet) {
                // No valid move: snap piece back to its grid position
                e.target.opacity(1);
                e.target.position({ x, y });
              }
              // If pendingSet: keep piece invisible — React unmounts it via pendingMove
            }}
          />
        );
      } else {
        // Fallback for unknown/unsupported colors: colored circle with letter
        pieces.push(
          <Group key={`p-${row}-${col}`} id={`piece-${row}-${col}`} onClick={() => { if (!dragging) handleTileClick(row, col); }}>
            <Circle
              x={x + tileSize / 2}
              y={y + tileSize / 2}
              radius={tileSize * 0.38}
              fill={piece.color}
              stroke="white"
              strokeWidth={1}
            />
            <Text
              x={x}
              y={y + tileSize / 2 - tileSize * 0.2}
              width={tileSize}
              align="center"
              text={piece.pieceType[0]?.toUpperCase() ?? "?"}
              fontSize={tileSize * 0.35}
              fill="white"
              listening={false}
            />
          </Group>
        );
      }
    }
  }

  // ── Window pointer move handler for drag surface ──────────────────────────
  // Keep a stable ref so add/remove always refer to the same function object,
  // even if tileSize changes mid-drag.
  const tileSizeRef = useRef(tileSize);
  tileSizeRef.current = tileSize;
  const handleWindowPointerMove = useCallback((e: PointerEvent) => {
    if (!dragSurfaceRef.current) return;
    dragSurfaceRef.current.style.transform =
      `translate(${e.clientX - tileSizeRef.current / 2}px, ${e.clientY - tileSizeRef.current / 2}px)`;
  }, []); // stable — reads tileSize via ref
  handleWindowPointerMoveRef.current = handleWindowPointerMove;

  return (
    <>
      <div ref={containerRef} className={styles.container} style={{ width: sw, height: sh }}>
        <Stage ref={stageRef} width={sw} height={sh}>
          <Layer>
            {/* Transparent background to catch clicks outside the board (deselect) */}
            <Rect
              x={0} y={0} width={sw} height={sh}
              fill="transparent"
              onClick={() => { setSelected(null); onClearDropPiece?.(); }}
            />
            {tiles}
            {ghostEl}
            {pieces}
          </Layer>
        </Stage>
      </div>
      <div ref={dragSurfaceRef} className={styles.dragSurface} />
    </>
  );
}

export default Chessboard;
