import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Circle,
  Group,
  Layer,
  Rect,
  Stage,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  WasmAction,
  WasmBoardCoords,
  WasmBoardState,
  WasmPiece,
  WasmVariantConfig,
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

/** Standard player-index → color mapping; extend for 4-player games. */
const PLAYER_COLORS = ["white", "black", "red", "blue"];

export type ChessboardProps = {
  variantConfig: WasmVariantConfig;
  boardState: WasmBoardState;
  validActions: WasmAction[];
  playerIndex: number;
  boardIndex?: number;
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
};

function coordsEq(a: WasmBoardCoords, b: WasmBoardCoords): boolean {
  return a.row === b.row && a.col === b.col && a.boardIndex === b.boardIndex;
}

export function Chessboard({
  variantConfig,
  boardState,
  validActions,
  playerIndex,
  boardIndex = 0,
  onSubmitAction,
  lastAction,
  selectedDropPiece = null,
  onClearDropPiece,
  size = 480,
  stageWidth,
  stageHeight,
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
  // Keep a ref to validActions so onDrop always has fresh data
  const validActionsRef = useRef(validActions);
  validActionsRef.current = validActions;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageRef = useRef<any>(null);

  const setCursor = (cursor: string) => {
    stageRef.current?.container()?.style &&
      (stageRef.current.container().style.cursor = cursor);
  };

  // Player 0 (white) sees row 7 (their pieces) at the visual bottom.
  // row 0 = black backrank is at the top → default rendering is already correct for player 0.
  // Player 1 (black) wants row 0 at the bottom → needs flip.
  const flipped = playerIndex % 2 !== 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      for (const a of validActions)
        if (a.from && coordsEq(a.from, src) && a.to)
          s.add(`${a.to.row},${a.to.col}`);
    }
    if (selectedDropPiece) {
      for (const a of validActions)
        if (
          a.type === "drop" &&
          a.piece?.pieceType === selectedDropPiece.pieceType &&
          a.piece?.color === selectedDropPiece.color &&
          a.to
        )
          s.add(`${a.to.row},${a.to.col}`);
    }
    return s;
  }, [selected, dragging, selectedDropPiece, validActions]);

  const findAction = useCallback(
    (from: WasmBoardCoords, to: WasmBoardCoords) =>
      validActionsRef.current.find(
        (a) => a.from && coordsEq(a.from, from) && a.to && coordsEq(a.to, to)
      ),
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
    return { row, col, boardIndex };
  };

  const getPiece = (row: number, col: number) =>
    boardState.boards[boardIndex]?.[row * cols + col] ?? null;

  const myColor = PLAYER_COLORS[playerIndex] ?? "white";

  // ── Dragging state ───────────────────────────────────────────────────────
  const dragSurfaceRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedPieceRef = useRef<{ coords: WasmBoardCoords; origin: WasmBoardCoords } | null>(null);

  const handleDragStart = useCallback((row: number, col: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setCursor("grabbing");

    const coords: WasmBoardCoords = { row, col, boardIndex };
    dragOrigin.current = coords;
    setDragging(coords);
    setSelected(null);

    // Show ghost at origin (reduced opacity)
    const pieceEl = e.currentTarget as HTMLElement;
    pieceEl.classList.add("ghost");

    // Create drag surface (follows cursor)
    const imgUrl = getPieceImageUrl(getPiece(row, col)?.color ?? "white", getPiece(row, col)?.pieceType ?? "pawn");
    const imgEl = imgUrl ? getCachedImage(imgUrl) : undefined;

    if (dragSurfaceRef.current && imgEl) {
      dragSurfaceRef.current.innerHTML = "";
      const img = document.createElement("img");
      img.src = imgEl.src;
      img.style.width = `${tileSize}px`;
      img.style.height = `${tileSize}px`;
      dragSurfaceRef.current.appendChild(img);

      // Position under cursor
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left - tileSize / 2;
        const y = e.clientY - rect.top - tileSize / 2;
        dragSurfaceRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      dragSurfaceRef.current.classList.add("visible");
    }

    draggedPieceRef.current = { coords, origin: coords };
  }, [boardIndex, tileSize, getPiece]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragSurfaceRef.current || !draggedPieceRef.current) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left - tileSize / 2;
      const y = e.clientY - rect.top - tileSize / 2;
      dragSurfaceRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, [tileSize]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragSurfaceRef.current || !draggedPieceRef.current) return;

    e.currentTarget.releasePointerCapture(e.pointerId);

    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setDragging(null);
    setCursor("default");

    // Hide drag surface
    dragSurfaceRef.current.classList.remove("visible");
    dragSurfaceRef.current.innerHTML = "";

    // Remove ghost class from origin piece
    const pieceEl = e.currentTarget as HTMLElement;
    pieceEl.classList.remove("ghost");

    if (origin) {
      // Compute target from pointer position
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const target = fromPixel(e.clientX - rect.left, e.clientY - rect.top);
        const action = findAction(origin, target);
        if (action) {
          onSubmitAction(action);
          setSelected(null);
        }
      }
    }
  }, [boardIndex, tileSize, fromPixel, findAction, onSubmitAction]);

  // ── Tiles ────────────────────────────────────────────────────────────────
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (disabledSet.has(`${row},${col}`)) continue;

      const { x, y } = toPixel(row, col);
      const isLight = (row + col) % 2 === 0;
      const isSelected =
        selected != null && coordsEq(selected, { row, col, boardIndex });
      const isTarget = validTargets.has(`${row},${col}`);
      const isLastMove =
        lastAction &&
        ((lastAction.from && coordsEq(lastAction.from, { row, col, boardIndex })) ||
          (lastAction.to && coordsEq(lastAction.to, { row, col, boardIndex })));
      const hasPiece = getPiece(row, col) != null;

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

  const handleTileClick = (row: number, col: number) => {
    const clicked: WasmBoardCoords = { row, col, boardIndex };

    // Drop from reserve pile
    if (selectedDropPiece) {
      const action = validActions.find(
        (a) =>
          a.type === "drop" &&
          a.piece?.pieceType === selectedDropPiece.pieceType &&
          a.piece?.color === selectedDropPiece.color &&
          a.to &&
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
        onSubmitAction(action);
        setSelected(null);
        return;
      }
    }

    const piece = getPiece(row, col);
    if (piece?.color === myColor) {
      setSelected(clicked);
    } else {
      setSelected(null);
    }
  };

  // ── Pieces (DOM overlay) ─────────────────────────────────────────────────
  const pieces: ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (disabledSet.has(`${row},${col}`)) continue;
      const piece = getPiece(row, col);
      if (!piece) continue;

      const { x, y } = toPixel(row, col);
      const coords: WasmBoardCoords = { row, col, boardIndex };
      const canDrag = piece.color === myColor;
      const imgUrl = getPieceImageUrl(piece.color, piece.pieceType);
      const imgEl = imagesLoaded && imgUrl ? getCachedImage(imgUrl) : undefined;
      const isDragging = dragging != null && coordsEq(dragging, coords);

      if (imgEl) {
        pieces.push(
          <div
            key={`p-${row}-${col}`}
            className={`${styles.piece}${isDragging ? " " + styles.ghost : ""}`}
            style={{
              left: x,
              top: y,
              opacity: isDragging ? 0.35 : 1,
            }}
            onPointerDown={(e) => {
              if (canDrag) handleDragStart(row, col, e);
            }}
          >
            <img src={imgEl.src} alt="" draggable={false} />
          </div>
        );
      } else {
        // Fallback for unknown/unsupported colors: colored circle with letter
        pieces.push(
          <div
            key={`p-${row}-${col}`}
            className={styles.piece}
            style={{
              left: x,
              top: y,
              pointerEvents: "none",
            }}
            onClick={() => { if (!dragging) handleTileClick(row, col); }}
          >
            <div
              style={{
                width: tileSize,
                height: tileSize,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: tileSize * 0.76,
                  height: tileSize * 0.76,
                  borderRadius: "50%",
                  backgroundColor: piece.color,
                  border: "2px solid white",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  fontSize: tileSize * 0.35,
                  fontWeight: "bold",
                  color: "white",
                  textShadow: "0 0 2px black",
                }}
              >
                {piece.pieceType[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div ref={containerRef} className={styles.container} style={{ width: sw, height: sh }}>
      <Stage width={sw} height={sh}>
        <Layer>
          {/* Transparent background to catch clicks outside the board (deselect) */}
          <Rect
            x={0} y={0} width={sw} height={sh}
            fill="transparent"
            onClick={() => { setSelected(null); onClearDropPiece?.(); }}
          />
          {tiles}
        </Layer>
      </Stage>
      <div className={styles.overlay}>
        {pieces}
      </div>
      <div
        ref={dragSurfaceRef}
        className={styles.dragSurface}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      />
    </div>
  );
}

export default Chessboard;
