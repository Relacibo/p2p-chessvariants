import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  Assets,
} from "pixi.js";
import {
  BoardOrientation,
  WasmAction,
  WasmBoardCoords,
  WasmBoardState,
  WasmPiece,
  WasmVariantConfig,
  WasmUiMap,
  WasmUiReservePile,
  isBoardCoords,
  type PendingMove,
} from "./types";
import { getPieceImageUrl } from "./pieceImages";

// ─── Palette ─────────────────────────────────────────────────────────────────
const LIGHT = 0xf0d9b5;
const DARK = 0xb58863;
const SELECTED_COLOR = 0x1478ff;
const VALID_MOVE_COLOR = 0x00b400;
const LAST_MOVE_COLOR = 0xffd700;
const GHOST_ALPHA = 0.35;
// Gap between board slots as a fraction of stageWidth
const SLOT_GAP_RATIO = 0.08;
// Reserve panel width as a fraction of stageWidth (when reserves exist)
const RESERVE_PANEL_RATIO = 0.20;
const RESERVE_PADDING = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function coordsEq(a: WasmBoardCoords, b: WasmBoardCoords): boolean {
  return a.row === b.row && a.col === b.col && a.boardIndex === b.boardIndex;
}

function mkBoardCoords(row: number, col: number, boardIndex: number): WasmBoardCoords {
  return { type: "board", row, col, boardIndex };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type ZoomMode = "single" | "overview";

export interface SceneState {
  variantConfig: WasmVariantConfig;
  boardState: WasmBoardState;
  /** Valid moves for the selected controlling players. */
  validMoves: WasmAction[];
  /** Primary board index of the local controlling players — determines zoom target. */
  activeBoardIndex: number;
  /** Board indices where the selected local players can interact. */
  activeBoardIndices: number[];
  /** Per-slot orientation (index = boardIndex). */
  orientationByBoard: BoardOrientation[];
  stageWidth: number;
  stageHeight: number;
  pendingMove: PendingMove | null;
  lastAction: WasmAction | undefined;
  selectedDropPiece: WasmPiece | null | undefined;
  uiMap: WasmUiMap;
}

/** Per-slot layout in world (rootContainer-local) coordinates. */
interface SlotLayout {
  boardIndex: number;
  tileSize: number;
  rows: number;
  cols: number;
  boardW: number;
  boardH: number;
  // Board tile origin (world coords)
  boardLeft: number;
  boardTop: number;
  orientation: BoardOrientation;
  // Reserve column (world coords)
  reserveLeft: number;
  reserveTop: number;
  reserveW: number;
  // Slot bounds (world coords) for hit-testing
  slotLeft: number;
  slotRight: number;
}

// ─── Scene manager ────────────────────────────────────────────────────────────
export class PixiBoard {
  private app: Application | null = null;

  // Flat shared layers — all slots draw into the same layers at their world positions.
  private rootContainer = new Container();
  private bgGraphics = new Graphics();
  private highlightGraphics = new Graphics();
  private reserveLayer = new Container();
  private pieceLayer = new Container();
  private dragLayer = new Container();
  private uiOverlay = new Container();

  private pieceSprites = new Map<string, Sprite>();
  private reserveSprites = new Map<string, Sprite>();
  private state: SceneState | null = null;
  private slotLayouts: SlotLayout[] = [];
  private selected: WasmBoardCoords | null = null;
  private textureCache = new Map<string, Texture>();
  private initDone = false;
  private destroyed = false;

  // Drag state
  private dragOrigin: WasmBoardCoords | null = null;
  private dragCopy: Sprite | null = null;
  private dragPointerMove: ((e: PointerEvent) => void) | null = null;
  private dragPointerUp: ((e: PointerEvent) => void) | null = null;

  // Zoom animation
  private zoomCurrent = { x: 0, y: 0, scale: 1 };
  private zoomTarget = { x: 0, y: 0, scale: 1 };
  private zoomAnimating = false;
  private currentZoomMode: ZoomMode = "single";
  private focusedBoardIndex = 0;

  // Mutable callbacks — updated without re-initialising
  onSubmitAction: (action: WasmAction) => void;
  onPendingMove: (move: PendingMove | null) => void;
  onClearDropPiece: (() => void) | undefined;
  onSelectReservePiece: ((piece: WasmPiece, elementId: string) => void) | undefined;
  onZoomModeChange: ((mode: ZoomMode) => void) | undefined;
  onRotateBoard: ((boardIndex: number) => void) | undefined;

  constructor(
    onSubmitAction: (action: WasmAction) => void,
    onPendingMove: (move: PendingMove | null) => void
  ) {
    this.onSubmitAction = onSubmitAction;
    this.onPendingMove = onPendingMove;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  // Takes a container div — PixiJS creates its own <canvas> so two concurrent
  // async inits (React StrictMode double-mount) never share a WebGL context.
  async init(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;

    const app = new Application();
    this.app = app;

    try {
      await app.init({
        width: Math.max(width, 1),
        height: Math.max(height, 1),
        backgroundColor: 0x2d2d2d,
        antialias: true,
        resolution: window.devicePixelRatio ?? 1,
        autoDensity: true,
      });
    } catch (e) {
      console.error("[PixiBoard] app.init failed", e);
      this.app = null;
      return;
    }

    if (this.destroyed) {
      app.destroy(true, { children: true });
      this.app = null;
      return;
    }

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    container.appendChild(canvas);

    app.stage.addChild(this.rootContainer);
    app.stage.addChild(this.uiOverlay);
    this.rootContainer.addChild(this.bgGraphics);
    this.rootContainer.addChild(this.highlightGraphics);
    this.rootContainer.addChild(this.reserveLayer);
    this.rootContainer.addChild(this.pieceLayer);
    this.rootContainer.addChild(this.dragLayer);

    app.ticker.add(() => {
      if (this.zoomAnimating) this.stepZoomAnimation();
    });

    await this.loadTextures();

    if (this.destroyed) {
      app.destroy(true, { children: true });
      this.app = null;
      return;
    }

    this.initDone = true;
  }

  private async loadTextures(): Promise<void> {
    const colors = ["white", "black"];
    const pieceTypes = ["king", "queen", "rook", "bishop", "knight", "pawn"];
    await Promise.all(
      colors.flatMap((color) =>
        pieceTypes.map(async (pieceType) => {
          const url = getPieceImageUrl(color, pieceType);
          if (!url || this.textureCache.has(url)) return;
          try {
            const tex = (await Assets.load(url)) as Texture;
            this.textureCache.set(url, tex);
          } catch (e) {
            console.error(`[PixiBoard] Failed to load texture ${url}`, e);
          }
        })
      )
    );
  }

  destroy(): void {
    this.destroyed = true;
    if (this.dragPointerMove) window.removeEventListener("pointermove", this.dragPointerMove);
    if (this.dragPointerUp) window.removeEventListener("pointerup", this.dragPointerUp);
    for (const s of this.pieceSprites.values()) s.destroy();
    this.pieceSprites.clear();
    for (const s of this.reserveSprites.values()) s.destroy();
    this.reserveSprites.clear();
    if (this.initDone && this.app) {
      const canvas = this.app.canvas as HTMLCanvasElement;
      canvas.parentNode?.removeChild(canvas);
      this.app.destroy(false, { children: true });
    }
    this.app = null;
    this.initDone = false;
  }

  // ─── Public update API ─────────────────────────────────────────────────────

  update(s: SceneState): void {
    if (!this.initDone) return;
    const prev = this.state;

    if (!prev) {
      // First update: initialize zoom position to active board slot (instant, no animation).
      this.focusedBoardIndex = s.activeBoardIndex;
      const targetX = this.slotX(s.activeBoardIndex, s.stageWidth);
      this.zoomCurrent = { x: targetX, y: 0, scale: 1 };
      this.zoomTarget = { x: targetX, y: 0, scale: 1 };
      this.rootContainer.position.set(targetX, 0);
      this.rootContainer.scale.set(1);
    }

    this.state = s;

    const layoutChanged =
      !prev ||
      prev.stageWidth !== s.stageWidth ||
      prev.stageHeight !== s.stageHeight ||
      prev.boardState.rows !== s.boardState.rows ||
      prev.boardState.cols !== s.boardState.cols ||
      prev.orientationByBoard !== s.orientationByBoard ||
      prev.variantConfig.board.count !== s.variantConfig.board.count ||
      prev.uiMap !== s.uiMap;

    const piecesChanged =
      layoutChanged ||
      prev?.boardState !== s.boardState ||
      prev?.pendingMove !== s.pendingMove ||
      prev?.validMoves !== s.validMoves ||
      prev?.activeBoardIndex !== s.activeBoardIndex ||
      prev?.activeBoardIndices !== s.activeBoardIndices;

    const highlightsChanged =
      piecesChanged ||
      prev?.lastAction !== s.lastAction ||
      prev?.selectedDropPiece !== s.selectedDropPiece;

    const reserveChanged =
      layoutChanged ||
      prev?.uiMap !== s.uiMap ||
      prev?.selectedDropPiece !== s.selectedDropPiece;

    if (layoutChanged) {
      this.app?.renderer.resize(s.stageWidth, s.stageHeight);
      const canvas = this.app?.canvas as HTMLCanvasElement | undefined;
      if (canvas) {
        canvas.style.width = `${s.stageWidth}px`;
        canvas.style.height = `${s.stageHeight}px`;
      }
      this.slotLayouts = this.computeSlotLayouts(s);
      this.rebuildBackground();
    }
    if (piecesChanged) this.rebuildPieces();
    if (highlightsChanged) this.rebuildHighlights();
    if (reserveChanged) this.rebuildReservePiles();
    this.rebuildUiButtons(s);
  }

  setZoomMode(mode: ZoomMode): void {
    this.currentZoomMode = mode;
    this.applyZoomMode(mode, this.focusedBoardIndex);
    this.onZoomModeChange?.(mode);
  }

  getZoomMode(): ZoomMode {
    return this.currentZoomMode;
  }

  // ─── Slot layout ───────────────────────────────────────────────────────────

  /** World X offset of slot i. */
  private slotX(boardIndex: number, stageWidth: number): number {
    const gap = Math.round(stageWidth * SLOT_GAP_RATIO);
    return -(boardIndex * (stageWidth + gap));
  }

  private computeSlotLayouts(s: SceneState): SlotLayout[] {
    const {
      stageWidth: W,
      stageHeight: H,
      variantConfig,
      boardState,
      orientationByBoard,
      uiMap,
    } = s;
    const boardCount = variantConfig.board.count;
    const { rows, cols } = boardState;
    const gap = Math.round(W * SLOT_GAP_RATIO);
    const slotStride = W + gap;

    const reserveForBoard = new Set<number>();
    for (const el of Object.values(uiMap)) {
      if (el.type === "reserve_pile") {
        reserveForBoard.add((el as WasmUiReservePile).board_index ?? 0);
      }
    }

    const layouts: SlotLayout[] = [];
    for (let i = 0; i < boardCount; i++) {
      const orientation = orientationByBoard[i] ?? "normal";
      const rotated = orientation === "clockwise" || orientation === "counterclockwise";
      const hasReserve = reserveForBoard.has(i);
      const reserveW = hasReserve ? Math.max(60, Math.round(W * RESERVE_PANEL_RATIO)) : 0;
      const boardAreaW = W - reserveW - (hasReserve ? 12 : 0);
      const tileSize = Math.max(
        16,
        Math.min(
          Math.floor(boardAreaW / (rotated ? rows : cols)),
          Math.floor((H - 16) / (rotated ? cols : rows))
        )
      );
      const boardW = tileSize * (rotated ? rows : cols);
      const boardH = tileSize * (rotated ? cols : rows);
      const slotOriginX = i * slotStride;
      const boardLeft = slotOriginX + Math.floor((boardAreaW - boardW) / 2);
      const boardTop = Math.floor((H - boardH) / 2);

      layouts.push({
        boardIndex: i,
        tileSize,
        rows,
        cols,
        boardW,
        boardH,
        boardLeft,
        boardTop,
        orientation,
        reserveLeft: slotOriginX + boardAreaW + 12,
        reserveTop: Math.round(H * 0.1),
        reserveW,
        slotLeft: slotOriginX,
        slotRight: slotOriginX + W,
      });
    }
    return layouts;
  }

  private getSlotForBoard(boardIndex: number): SlotLayout | null {
    return this.slotLayouts.find((sl) => sl.boardIndex === boardIndex) ?? null;
  }

  // ─── Coordinate helpers ────────────────────────────────────────────────────

  /** Logical (row, col) → world-space pixel top-left for a given slot. */
  private toWorld(row: number, col: number, sl: SlotLayout): { x: number; y: number } {
    const { boardLeft, boardTop, tileSize, rows, cols, orientation } = sl;
    switch (orientation) {
      case "flipped":
        return {
          x: boardLeft + (cols - 1 - col) * tileSize,
          y: boardTop + (rows - 1 - row) * tileSize,
        };
      case "clockwise":
        return {
          x: boardLeft + (rows - 1 - row) * tileSize,
          y: boardTop + col * tileSize,
        };
      case "counterclockwise":
        return {
          x: boardLeft + row * tileSize,
          y: boardTop + (cols - 1 - col) * tileSize,
        };
      default:
        return {
          x: boardLeft + col * tileSize,
          y: boardTop + row * tileSize,
        };
    }
  }

  /** World-space pixel → board coords (null if outside all boards). */
  private fromWorld(wx: number, wy: number): { coords: WasmBoardCoords; sl: SlotLayout } | null {
    for (const sl of this.slotLayouts) {
      const relX = wx - sl.boardLeft;
      const relY = wy - sl.boardTop;
      if (relX < 0 || relX >= sl.boardW || relY < 0 || relY >= sl.boardH) continue;
      const px = Math.floor(relX / sl.tileSize);
      const py = Math.floor(relY / sl.tileSize);
      let row: number;
      let col: number;
      switch (sl.orientation) {
        case "flipped":
          col = sl.cols - 1 - px;
          row = sl.rows - 1 - py;
          break;
        case "clockwise":
          row = sl.rows - 1 - px;
          col = py;
          break;
        case "counterclockwise":
          row = px;
          col = sl.cols - 1 - py;
          break;
        default:
          col = px;
          row = py;
          break;
      }
      return { coords: mkBoardCoords(row, col, sl.boardIndex), sl };
    }
    return null;
  }

  /** Which slot does a world X coordinate belong to? */
  private slotAtWorldX(wx: number): SlotLayout | null {
    return this.slotLayouts.find((sl) => wx >= sl.slotLeft && wx < sl.slotRight) ?? null;
  }

  /** Client (viewport) pixel → world (rootContainer-local) pixel. */
  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.app) return null;
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const sx = this.rootContainer.scale.x || 1;
    const sy = this.rootContainer.scale.y || 1;
    return {
      x: (clientX - rect.left - this.rootContainer.x) / sx,
      y: (clientY - rect.top - this.rootContainer.y) / sy,
    };
  }

  // ─── Disabled squares ──────────────────────────────────────────────────────

  private disabledSet(): Set<string> {
    const s = new Set<string>();
    for (const { r1, c1, r2: h, c2: w } of (this.state?.variantConfig.board.disabled_rects ?? [])) {
      for (let r = r1; r < r1 + h; r++)
        for (let c = c1; c < c1 + w; c++) s.add(`${r},${c}`);
    }
    return s;
  }

  // ─── Scene rebuild ─────────────────────────────────────────────────────────

  private rebuildBackground(): void {
    this.bgGraphics.clear();
    if (!this.state) return;
    const disabled = this.disabledSet();
    for (const sl of this.slotLayouts) {
      for (let row = 0; row < sl.rows; row++) {
        for (let col = 0; col < sl.cols; col++) {
          if (disabled.has(`${row},${col}`)) continue;
          const { x, y } = this.toWorld(row, col, sl);
          this.bgGraphics
            .rect(x, y, sl.tileSize, sl.tileSize)
            .fill((row + col) % 2 === 0 ? LIGHT : DARK);
        }
      }
    }

    this.bgGraphics.eventMode = "static";
    this.bgGraphics.removeAllListeners();
    this.bgGraphics.on("pointerdown", (e: FederatedPointerEvent) => {
      if (this.dragOrigin) return;
      const world = e.getLocalPosition(this.rootContainer);
      this.handleBoardPointerDown(world.x, world.y);
    });
  }

  private rebuildHighlights(): void {
    this.highlightGraphics.clear();
    if (!this.state) return;
    const { validMoves, lastAction, selectedDropPiece } = this.state;
    const disabled = this.disabledSet();

    const activeSource = this.dragOrigin ?? this.selected;
    const validTargets = new Set<string>();

    if (activeSource) {
      for (const a of validMoves) {
        if (
          a.type === "move" &&
          isBoardCoords(a.from) &&
          coordsEq(a.from, activeSource) &&
          isBoardCoords(a.to)
        ) {
          validTargets.add(`${a.to.boardIndex},${a.to.row},${a.to.col}`);
        }
      }
    }
    if (selectedDropPiece) {
      for (const a of validMoves) {
        if (a.type === "move" && a.from.type === "reserve" && isBoardCoords(a.to)) {
          validTargets.add(`${a.to.boardIndex},${a.to.row},${a.to.col}`);
        }
      }
    }

    for (const sl of this.slotLayouts) {
      for (let row = 0; row < sl.rows; row++) {
        for (let col = 0; col < sl.cols; col++) {
          if (disabled.has(`${row},${col}`)) continue;
          const { x, y } = this.toWorld(row, col, sl);
          const coords = mkBoardCoords(row, col, sl.boardIndex);

          if (lastAction?.type === "move") {
            const fromMatch = isBoardCoords(lastAction.from) && coordsEq(lastAction.from, coords);
            const toMatch = isBoardCoords(lastAction.to) && coordsEq(lastAction.to, coords);
            if (fromMatch || toMatch) {
              this.highlightGraphics
                .rect(x, y, sl.tileSize, sl.tileSize)
                .fill({ color: LAST_MOVE_COLOR, alpha: 0.35 });
            }
          }

          if (activeSource && coordsEq(activeSource, coords)) {
            this.highlightGraphics
              .rect(x, y, sl.tileSize, sl.tileSize)
              .fill({ color: SELECTED_COLOR, alpha: 0.45 });
          }

          if (validTargets.has(`${sl.boardIndex},${row},${col}`)) {
            const hasPiece = this.getDisplayPiece(row, col, sl.boardIndex) != null;
            if (hasPiece) {
              this.highlightGraphics
                .rect(x, y, sl.tileSize, sl.tileSize)
                .fill({ color: VALID_MOVE_COLOR, alpha: 0.35 });
            } else {
              this.highlightGraphics
                .circle(x + sl.tileSize / 2, y + sl.tileSize / 2, sl.tileSize * 0.16)
                .fill({ color: VALID_MOVE_COLOR, alpha: 0.7 });
            }
          }
        }
      }
    }
  }

  private getDisplayPiece(row: number, col: number, boardIndex: number): WasmPiece | null {
    if (!this.state) return null;
    const { boardState, pendingMove } = this.state;
    const piece = boardState.boards[boardIndex]?.[row * boardState.cols + col] ?? null;
    if (!pendingMove) return piece;
    const coords = mkBoardCoords(row, col, boardIndex);
    if (coordsEq(pendingMove.from, coords)) return null;
    if (coordsEq(pendingMove.to, coords)) return pendingMove.piece;
    return piece;
  }

  private rebuildPieces(): void {
    if (!this.state) return;
    const { validMoves, activeBoardIndices } = this.state;
    const disabled = this.disabledSet();

    const pickable = new Set<string>();
    for (const a of validMoves) {
      if (a.type === "move" && isBoardCoords(a.from))
        pickable.add(`${a.from.boardIndex},${a.from.row},${a.from.col}`);
    }

    type DesiredEntry = { piece: WasmPiece; x: number; y: number; canDrag: boolean; sl: SlotLayout };
    const desired = new Map<string, DesiredEntry>();
    for (const sl of this.slotLayouts) {
      for (let row = 0; row < sl.rows; row++) {
        for (let col = 0; col < sl.cols; col++) {
          if (disabled.has(`${row},${col}`)) continue;
          const piece = this.getDisplayPiece(row, col, sl.boardIndex);
          if (!piece) continue;
          const { x, y } = this.toWorld(row, col, sl);
          desired.set(`b${sl.boardIndex}_${row},${col}`, {
            piece,
            x,
            y,
            canDrag: activeBoardIndices.includes(sl.boardIndex) &&
              pickable.has(`${sl.boardIndex},${row},${col}`),
            sl,
          });
        }
      }
    }

    for (const [key, sprite] of this.pieceSprites) {
      if (!desired.has(key)) {
        this.pieceLayer.removeChild(sprite);
        sprite.destroy();
        this.pieceSprites.delete(key);
      }
    }

    for (const [key, { piece, x, y, canDrag, sl }] of desired) {
      const url = getPieceImageUrl(piece.color, piece.pieceType);
      const tex = url ? (this.textureCache.get(url) ?? null) : null;
      if (!tex) continue;

      // Parse row/col from key: "b{boardIndex}_{row},{col}"
      const m = key.match(/^b\d+_(\d+),(\d+)$/);
      if (!m) continue;
      const row = Number(m[1]);
      const col = Number(m[2]);
      const isDragOrigin =
        this.dragOrigin != null &&
        this.dragOrigin.boardIndex === sl.boardIndex &&
        this.dragOrigin.row === row &&
        this.dragOrigin.col === col;

      let sprite = this.pieceSprites.get(key);
      if (!sprite) {
        sprite = new Sprite(tex);
        this.pieceLayer.addChild(sprite);
        this.pieceSprites.set(key, sprite);
      } else if (sprite.texture !== tex) {
        sprite.texture = tex;
      }

      sprite.position.set(x, y);
      sprite.width = sl.tileSize;
      sprite.height = sl.tileSize;
      sprite.alpha = isDragOrigin ? GHOST_ALPHA : 1;
      sprite.eventMode = canDrag ? "static" : "none";
      sprite.cursor = canDrag ? "grab" : "default";

      if (canDrag) {
        sprite.removeAllListeners();
        const r = row;
        const c = col;
        const boardIdx = sl.boardIndex;
        sprite.on("pointerdown", (e: FederatedPointerEvent) => {
          e.stopPropagation();
          this.selected = mkBoardCoords(r, c, boardIdx);
          this.startDrag(sprite!, mkBoardCoords(r, c, boardIdx), e, sl);
        });
      }
    }
  }

  private rebuildReservePiles(): void {
    if (!this.state) return;
    const { uiMap, selectedDropPiece } = this.state;

    for (const sprite of this.reserveSprites.values()) {
      this.reserveLayer.removeChild(sprite);
      sprite.destroy();
    }
    this.reserveSprites.clear();

    // Group reserve piles by board index
    const pilesByBoard = new Map<number, { elementId: string; pile: WasmUiReservePile }[]>();
    for (const [elementId, el] of Object.entries(uiMap)) {
      if (el.type !== "reserve_pile") continue;
      const pile = el as WasmUiReservePile;
      const boardIdx = pile.board_index ?? 0;
      if (!pilesByBoard.has(boardIdx)) pilesByBoard.set(boardIdx, []);
      pilesByBoard.get(boardIdx)!.push({ elementId, pile });
    }

    for (const [boardIdx, piles] of pilesByBoard) {
      const sl = this.getSlotForBoard(boardIdx);
      if (!sl || sl.reserveW <= 0) continue;

      const pieceTileSize = Math.min(
        sl.tileSize * 0.85,
        sl.reserveW - RESERVE_PADDING * 2
      );
      let yOffset = sl.reserveTop;

      for (const { elementId, pile } of piles) {
        for (let idx = 0; idx < pile.pieces.length; idx++) {
          const piece = pile.pieces[idx];
          const url = getPieceImageUrl(piece.color, piece.pieceType);
          const tex = url ? (this.textureCache.get(url) ?? null) : null;
          if (!tex) continue;

          const key = `r_${elementId}_${idx}`;
          const sprite = new Sprite(tex);
          sprite.position.set(sl.reserveLeft + RESERVE_PADDING, yOffset);
          sprite.width = pieceTileSize;
          sprite.height = pieceTileSize;
          sprite.eventMode = "static";
          sprite.cursor = "pointer";

          if (
            selectedDropPiece &&
            selectedDropPiece.color === piece.color &&
            selectedDropPiece.pieceType === piece.pieceType
          ) {
            sprite.tint = 0x88bbff;
          }

          const capturedPiece = piece;
          const capturedElementId = elementId;
          sprite.on("pointerdown", (e: FederatedPointerEvent) => {
            e.stopPropagation();
            this.onSelectReservePiece?.(capturedPiece, capturedElementId);
            this.selected = null;
            this.rebuildHighlights();
          });

          this.reserveLayer.addChild(sprite);
          this.reserveSprites.set(key, sprite);
          yOffset += pieceTileSize + RESERVE_PADDING;
        }
      }
    }
  }

  private rebuildUiButtons(s: SceneState): void {
    this.uiOverlay.removeChildren();

    const btnW = 28;
    const btnH = 28;
    const gap = 8;
    const rightMargin = 4;
    const bgColor = 0x000000;
    const bgAlpha = 0.55;
    const textColor = 0xffffff;
    const radius = 6;

    const totalH = btnH * 2 + gap;
    const startY = Math.round((s.stageHeight - totalH) / 2);
    const btnX = s.stageWidth - btnW - rightMargin;

    const textStyle = new TextStyle({
      fontSize: 16,
      fill: textColor,
      fontFamily: "sans-serif",
    });

    // ── Rotate button ──
    {
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "pointer";

      const bg = new Graphics();
      bg.roundRect(0, 0, btnW, btnH, radius);
      bg.fill({ color: bgColor, alpha: bgAlpha });
      container.addChild(bg);

      const label = new Text({ text: "↻", style: textStyle });
      label.anchor.set(0.5);
      label.position.set(btnW / 2, btnH / 2);
      container.addChild(label);

      container.position.set(btnX, startY);
      container.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.onRotateBoard?.(this.focusedBoardIndex);
      });
      this.uiOverlay.addChild(container);
    }

    // ── Zoom button ──
    {
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "pointer";

      const bg = new Graphics();
      bg.roundRect(0, 0, btnW, btnH, radius);
      bg.fill({ color: bgColor, alpha: bgAlpha });
      container.addChild(bg);

      const zoomLabel = this.currentZoomMode === "single" ? "⊟" : "⊞";
      const label = new Text({ text: zoomLabel, style: textStyle });
      label.anchor.set(0.5);
      label.position.set(btnW / 2, btnH / 2);
      container.addChild(label);

      container.position.set(btnX, startY + btnH + gap);
      container.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        const next: ZoomMode = this.currentZoomMode === "single" ? "overview" : "single";
        this.setZoomMode(next);
      });
      this.uiOverlay.addChild(container);
    }
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  private handleBoardPointerDown(wx: number, wy: number): void {
    if (!this.state) return;
    const hit = this.fromWorld(wx, wy);

    if (!hit) {
      // Clicked outside all boards — deselect
      this.selected = null;
      this.onClearDropPiece?.();
      this.rebuildHighlights();
      return;
    }

    const { coords, sl } = hit;

    // Clicking a passive board in overview mode → zoom to it
    if (sl.boardIndex !== this.state.activeBoardIndex) {
      if (this.currentZoomMode === "overview") {
        this.focusedBoardIndex = sl.boardIndex;
        this.currentZoomMode = "single";
        this.applyZoomMode("single", sl.boardIndex);
        this.onZoomModeChange?.("single");
      }
      return;
    }

    this.handleTileClick(coords.row, coords.col, sl.boardIndex);
  }

  private handleTileClick(row: number, col: number, boardIndex: number): void {
    if (!this.state) return;
    const { validMoves, selectedDropPiece } = this.state;
    const clicked = mkBoardCoords(row, col, boardIndex);

    // Drop a reserve piece
    if (selectedDropPiece) {
      const action = validMoves.find(
        (a): a is Extract<WasmAction, { type: "move" }> =>
          a.type === "move" &&
          a.from.type === "reserve" &&
          isBoardCoords(a.to) &&
          coordsEq(a.to, clicked)
      );
      if (action) this.onSubmitAction(action);
      this.onClearDropPiece?.();
      this.selected = null;
      this.rebuildHighlights();
      return;
    }

    // Move selected piece
    if (this.selected) {
      const action = validMoves.find(
        (a): a is Extract<WasmAction, { type: "move" }> =>
          a.type === "move" &&
          isBoardCoords(a.from) &&
          coordsEq(a.from, this.selected!) &&
          isBoardCoords(a.to) &&
          coordsEq(a.to, clicked)
      );
      if (action) {
        const piece = this.getDisplayPiece(this.selected.row, this.selected.col, boardIndex);
        if (piece && isBoardCoords(action.to)) {
          this.onPendingMove({ from: this.selected, piece, to: action.to });
        }
        this.onSubmitAction(action);
        this.selected = null;
        this.rebuildHighlights();
        return;
      }
    }

    // Select / deselect piece
    const piece = this.getDisplayPiece(row, col, boardIndex);
    const canPick = validMoves.some(
      (a) => a.type === "move" && isBoardCoords(a.from) && coordsEq(a.from, clicked)
    );
    this.selected = piece && canPick ? clicked : null;
    this.rebuildHighlights();
  }

  private startDrag(
    originSprite: Sprite,
    origin: WasmBoardCoords,
    e: FederatedPointerEvent,
    sl: SlotLayout
  ): void {
    if (!this.app || !this.state) return;

    this.dragOrigin = origin;
    this.selected = null;
    originSprite.alpha = GHOST_ALPHA;

    // Set hand cursor during drag
    if (this.app) {
      (this.app.canvas as HTMLCanvasElement).style.cursor = "grabbing";
    }

    const dragCopy = new Sprite(originSprite.texture);
    dragCopy.width = sl.tileSize;
    dragCopy.height = sl.tileSize;
    const initWorld = e.getLocalPosition(this.rootContainer);
    dragCopy.position.set(initWorld.x - sl.tileSize / 2, initWorld.y - sl.tileSize / 2);
    this.dragLayer.addChild(dragCopy);
    this.dragCopy = dragCopy;

    const moveHandler = (ev: PointerEvent) => {
      const world = this.clientToWorld(ev.clientX, ev.clientY);
      if (world) dragCopy.position.set(world.x - sl.tileSize / 2, world.y - sl.tileSize / 2);
    };

    const upHandler = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      this.dragPointerMove = null;
      this.dragPointerUp = null;

      // Restore default cursor
      if (this.app) {
        (this.app.canvas as HTMLCanvasElement).style.cursor = "";
      }

      this.dragLayer.removeChild(dragCopy);
      dragCopy.destroy();
      this.dragCopy = null;

      const savedOrigin = this.dragOrigin;
      this.dragOrigin = null;

      if (savedOrigin && this.state) {
        const world = this.clientToWorld(ev.clientX, ev.clientY);
        const hit = world ? this.fromWorld(world.x, world.y) : null;
        const target = hit?.coords ?? null;

        if (target) {
          const action = this.state.validMoves.find(
            (a): a is Extract<WasmAction, { type: "move" }> =>
              a.type === "move" &&
              isBoardCoords(a.from) &&
              coordsEq(a.from, savedOrigin) &&
              isBoardCoords(a.to) &&
              coordsEq(a.to, target)
          );
          if (action) {
            const piece = this.getDisplayPiece(savedOrigin.row, savedOrigin.col, savedOrigin.boardIndex);
            if (piece && isBoardCoords(action.to)) {
              this.onPendingMove({ from: savedOrigin, piece, to: action.to });
            }
            this.onSubmitAction(action);
            originSprite.alpha = 0;
          } else {
            originSprite.alpha = 1;
          }
        } else {
          originSprite.alpha = 1;
        }
      } else {
        originSprite.alpha = 1;
      }

      this.rebuildHighlights();
    };

    this.dragPointerMove = moveHandler;
    this.dragPointerUp = upHandler;
    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
    this.rebuildHighlights();
  }

  // ─── Zoom animation ────────────────────────────────────────────────────────

  private applyZoomMode(mode: ZoomMode, boardIndex: number): void {
    if (!this.state) return;
    const { stageWidth: W, stageHeight: H, variantConfig } = this.state;
    const boardCount = variantConfig.board.count;
    const gap = Math.round(W * SLOT_GAP_RATIO);
    const slotStride = W + gap;

    if (mode === "single") {
      this.zoomTarget = { x: -(boardIndex * slotStride), y: 0, scale: 1 };
    } else {
      if (boardCount <= 1) {
        this.zoomTarget = { x: 0, y: 0, scale: 1 };
      } else {
        const totalW = boardCount * slotStride - gap;
        const scale = Math.min(W / totalW, 1);
        const scaledW = totalW * scale;
        const scaledH = H * scale;
        this.zoomTarget = {
          x: (W - scaledW) / 2,
          y: (H - scaledH) / 2,
          scale,
        };
      }
    }
    this.zoomAnimating = true;
  }

  private stepZoomAnimation(): void {
    const SPEED = 0.14;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    this.zoomCurrent.x = lerp(this.zoomCurrent.x, this.zoomTarget.x, SPEED);
    this.zoomCurrent.y = lerp(this.zoomCurrent.y, this.zoomTarget.y, SPEED);
    this.zoomCurrent.scale = lerp(this.zoomCurrent.scale, this.zoomTarget.scale, SPEED);
    this.rootContainer.position.set(this.zoomCurrent.x, this.zoomCurrent.y);
    this.rootContainer.scale.set(this.zoomCurrent.scale);

    const done =
      Math.abs(this.zoomCurrent.x - this.zoomTarget.x) < 0.5 &&
      Math.abs(this.zoomCurrent.y - this.zoomTarget.y) < 0.5 &&
      Math.abs(this.zoomCurrent.scale - this.zoomTarget.scale) < 0.001;

    if (done) {
      this.rootContainer.position.set(this.zoomTarget.x, this.zoomTarget.y);
      this.rootContainer.scale.set(this.zoomTarget.scale);
      this.zoomCurrent = { ...this.zoomTarget };
      this.zoomAnimating = false;
    }
  }
}
