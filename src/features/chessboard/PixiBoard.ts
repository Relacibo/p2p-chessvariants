import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
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
  WasmCoords,
  WasmPiece,
  WasmReserveCoords,
  WasmUiPiecePicker,
  WasmVariantConfig,
  WasmUiMap,
  WasmUiReservePile,
  isBoardCoords,
  type PendingMove,
} from "./types";
import { getPieceImageUrl } from "./pieceImages";
import { PIECE_TINT } from "./pieceImages";

// ─── Palette ─────────────────────────────────────────────────────────────────
const LIGHT = 0xf0d9b5;
const DARK = 0xb58863;
const SELECTED_COLOR = 0x1478ff;
const VALID_MOVE_COLOR = 0x00b400;
const LAST_MOVE_COLOR = 0xffd700;
const GHOST_ALPHA = 0.35;
const CANVAS_BG_DARK = 0x2d2d2d;
const CANVAS_BG_LIGHT = 0xe8e8e8;
// Gap between board slots as a fraction of stageWidth
const SLOT_GAP_RATIO = 0.08;
// Reserve panel width as a fraction of stageWidth (when reserves exist)
const RESERVE_PANEL_RATIO = 0.20;
const RESERVE_PADDING = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function coordsEq(a: WasmBoardCoords, b: WasmBoardCoords): boolean {
  return a.row === b.row && a.col === b.col && a.board_index === b.board_index;
}

function coordsEqual(a: WasmCoords, b: WasmCoords): boolean {
  if (a.type === "board" && b.type === "board") {
    return coordsEq(a, b);
  }
  if (a.type === "reserve" && b.type === "reserve") {
    // Reserve coords match by type and board_index — the engine's valid_moves
    // may use different index values, but any reserve piece can be dropped
    // on any valid reserve→board target.
    return a.board_index === b.board_index;
  }
  return false;
}

function mkBoardCoords(row: number, col: number, boardIndex: number): WasmBoardCoords {
  return { type: "board", row, col, board_index: boardIndex };
}

function mkReserveCoords(index: number, boardIndex: number): WasmReserveCoords {
  return { type: "reserve", index, board_index: boardIndex };
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
  private slotBtnsLayer = new Container();  // magnifying glass buttons in overview
  private piecePickerLayer = new Container(); // promotion / piece selection overlay

  private pieceSprites = new Map<string, Sprite>();
  private reserveSprites = new Map<string, Sprite>();
  private reserveCards = new Map<string, Graphics>();
  private piecePickerSprites = new Map<string, Container>();
  private state: SceneState | null = null;
  private slotLayouts: SlotLayout[] = [];
  private selected: WasmBoardCoords | null = null;
  private textureCache = new Map<string, Texture>();
  private initDone = false;
  private destroyed = false;
  private darkMode = true;

  // Drag state
  private dragOrigin: WasmCoords | null = null;
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
  onReturnHome: (() => void) | undefined; // fires when ⌂ is clicked in overview

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
        backgroundColor: this.darkMode ? CANVAS_BG_DARK : CANVAS_BG_LIGHT,
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

    // Log WebGL context loss / renderer errors — these would otherwise be silent.
    canvas.addEventListener("webglcontextlost", (e) => {
      console.error("[PixiBoard] WebGL context lost", e);
    });
    canvas.addEventListener("webglcontextrestored", () => {
      console.warn("[PixiBoard] WebGL context restored");
    });
    container.appendChild(canvas);

    app.stage.addChild(this.rootContainer);
    app.stage.addChild(this.uiOverlay);
    this.rootContainer.addChild(this.bgGraphics);
    this.rootContainer.addChild(this.highlightGraphics);
    this.rootContainer.addChild(this.reserveLayer);
    this.rootContainer.addChild(this.pieceLayer);
    this.rootContainer.addChild(this.dragLayer);
    this.rootContainer.addChild(this.slotBtnsLayer);
    app.stage.addChild(this.piecePickerLayer);

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

  /**
   * Load a single piece texture on demand if not already cached.
   * Returns the Texture or null when no image file exists for this piece type.
   */
  private async loadPieceTexture(color: string, pieceType: string): Promise<Texture | null> {
    const url = getPieceImageUrl(color, pieceType);
    if (!url) return null;
    if (this.textureCache.has(url)) return this.textureCache.get(url)!;
    try {
      const tex = (await Assets.load(url)) as Texture;
      this.textureCache.set(url, tex);
      return tex;
    } catch (e) {
      // File doesn't exist (404) or load error — cache the null to avoid retries
      this.textureCache.set(url, null as unknown as Texture);
      return null;
    }
  }

  /**
   * Preload textures for standard pieces so they're available on first render.
   * Other pieces load on-demand in rebuildPieces().
   */
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
    for (const s of this.piecePickerSprites.values()) s.destroy();
    this.piecePickerSprites.clear();
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
    this.rebuildPiecePicker();
    this.rebuildSlotButtons(s);
    this.rebuildUiButtons(s);
  }

  setZoomMode(mode: ZoomMode): void {
    this.currentZoomMode = mode;
    this.applyZoomMode(mode, this.focusedBoardIndex);
    if (this.state) {
      this.rebuildUiButtons(this.state);
      this.rebuildSlotButtons(this.state);
    }
    this.onZoomModeChange?.(mode);
  }

  getZoomMode(): ZoomMode {
    return this.currentZoomMode;
  }

  /** Update the canvas background color based on the current color scheme. */
  setDarkMode(dark: boolean): void {
    if (this.darkMode === dark) return;
    this.darkMode = dark;
    if (this.app) {
      this.app.renderer.background.color = dark ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
    }
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
          isBoardCoords(a.to) &&
          coordsEqual(a.from, activeSource)
        ) {
          validTargets.add(`${a.to.board_index},${a.to.row},${a.to.col}`);
        }
      }
    }
    if (selectedDropPiece) {
      for (const a of validMoves) {
        if (a.type === "move" && a.from.type === "reserve" && isBoardCoords(a.to)) {
          validTargets.add(`${a.to.board_index},${a.to.row},${a.to.col}`);
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

          if (activeSource && isBoardCoords(activeSource) && coordsEq(activeSource, coords)) {
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

  /**
   * Creates a fallback texture for piece types that have no SVG file.
   * Renders a coloured circle with the first 2 letters of the piece type.
   * The result is cached in textureCache keyed by "__fallback:{color}:{pieceType}".
   */
  private getFallbackTexture(color: string, pieceType: string): Texture {
    const cacheKey = `__fallback:${color}:${pieceType}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = 45;
    canvas.height = 45;
    const ctx = canvas.getContext("2d")!;

    // Determine if piece is "light" (white, yellow) or "dark" (black, red, blue, green)
    const isLight = color === "white" || color === "yellow";

    // Background circle
    ctx.fillStyle = isLight ? "#f0d9b5" : "#444";
    ctx.beginPath();
    ctx.arc(22, 22, 20, 0, Math.PI * 2);
    ctx.fill();

    // Border ring
    ctx.strokeStyle = isLight ? "#8b7355" : "#888";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // If a PIECE_TINT colour is available, apply a coloured dot in the center
    const tint = PIECE_TINT[color];
    if (tint != null) {
      ctx.fillStyle = `#${tint.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.arc(22, 22, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Text label — first 1-2 chars uppercase
    const label = pieceType.substring(0, 2).toUpperCase();
    ctx.fillStyle = isLight ? "#222" : "#eee";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 22, 22);

    const tex = Texture.from(canvas);
    this.textureCache.set(cacheKey, tex);
    return tex;
  }

  private rebuildPieces(): void {
    if (!this.state) return;
    const disabled = this.disabledSet();

    type DesiredEntry = { piece: WasmPiece; x: number; y: number; sl: SlotLayout };
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

    for (const [key, { piece, x, y, sl }] of desired) {
      const url = getPieceImageUrl(piece.color, piece.piece_type);
      let tex: Texture | null = null;
      if (url) {
        tex = this.textureCache.get(url) ?? null;
        if (!tex) {
          // Not yet loaded — kick off async load for future frames
          this.loadPieceTexture(piece.color, piece.piece_type);
        }
      }
      if (!tex) {
        tex = this.getFallbackTexture(piece.color, piece.piece_type);
      }

      // Parse row/col from key: "b{boardIndex}_{row},{col}"
      const m = key.match(/^b\d+_(\d+),(\d+)$/);
      if (!m) continue;
      const row = Number(m[1]);
      const col = Number(m[2]);
      const isDragOrigin =
        this.dragOrigin != null &&
        this.dragOrigin.type === "board" &&
        this.dragOrigin.board_index === sl.boardIndex &&
        this.dragOrigin.row === row &&
        this.dragOrigin.col === col;

      let sprite = this.pieceSprites.get(key);
      if (!sprite) {
        sprite = new Sprite(tex);
        if (PIECE_TINT[piece.color] != null) {
          sprite.tint = PIECE_TINT[piece.color];
        }
        this.pieceLayer.addChild(sprite);
        this.pieceSprites.set(key, sprite);
      } else if (sprite.texture !== tex) {
        sprite.texture = tex;
      }

      sprite.position.set(x, y);
      sprite.width = sl.tileSize;
      sprite.height = sl.tileSize;
      sprite.alpha = isDragOrigin ? GHOST_ALPHA : 1;
      sprite.eventMode = "static";
      sprite.cursor = "grab";

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

  private rebuildReservePiles(): void {
    if (!this.state) return;
    const { uiMap, selectedDropPiece } = this.state;

    // Clear sprites
    for (const sprite of this.reserveSprites.values()) {
      this.reserveLayer.removeChild(sprite);
      sprite.destroy();
    }
    this.reserveSprites.clear();
    // Clear card backgrounds
    for (const card of this.reserveCards.values()) {
      this.reserveLayer.removeChild(card);
      card.destroy();
    }
    this.reserveCards.clear();

    // Group reserve piles by board index
    const pilesByBoard = new Map<number, { elementId: string; pile: WasmUiReservePile }[]>();
    for (const [elementId, el] of Object.entries(uiMap)) {
      if (el.type !== "reserve_pile") continue;
      const pile = el as WasmUiReservePile;
      const boardIdx = pile.board_index ?? 0;
      if (!pilesByBoard.has(boardIdx)) pilesByBoard.set(boardIdx, []);
      pilesByBoard.get(boardIdx)!.push({ elementId, pile });
    }

    // Card style — matching piece picker panel design
    const cardColor = 0x1a1a1a;
    const cardAlpha = 0.92;
    const cardRadius = 12;

    for (const [boardIdx, piles] of pilesByBoard) {
      const sl = this.getSlotForBoard(boardIdx);
      if (!sl || sl.reserveW <= 0) continue;

      const pieceTileSize = Math.min(
        sl.tileSize * 0.85,
        sl.reserveW - RESERVE_PADDING * 2
      );

      // Count total pieces to compute card height
      let totalPieces = 0;
      for (const { pile } of piles) totalPieces += pile.pieces.length;
      if (totalPieces === 0) continue;

      const cardH = totalPieces * pieceTileSize + (totalPieces + 3) * RESERVE_PADDING;
      const cardX = sl.reserveLeft;
      const cardY = Math.max(0, sl.reserveTop - RESERVE_PADDING);

      // Draw card background — same style as piece picker
      const card = new Graphics()
        .roundRect(cardX, cardY, sl.reserveW, cardH, cardRadius)
        .fill({ color: cardColor, alpha: cardAlpha });
      card.eventMode = "none";
      this.reserveLayer.addChild(card);
      this.reserveCards.set(`card_${boardIdx}`, card);

      let yOffset = cardY + RESERVE_PADDING * 2;

      for (const { elementId, pile } of piles) {
        for (let idx = 0; idx < pile.pieces.length; idx++) {
          const piece = pile.pieces[idx];
          const url = getPieceImageUrl(piece.color, piece.piece_type);
          const tex = url ? (this.textureCache.get(url) ?? null) : null;
          if (!tex) continue;

          const key = `r_${elementId}_${idx}`;
          const sprite = new Sprite(tex);
          if (PIECE_TINT[piece.color] != null) {
            sprite.tint = PIECE_TINT[piece.color];
          }
          sprite.position.set(sl.reserveLeft + RESERVE_PADDING, yOffset);
          sprite.width = pieceTileSize;
          sprite.height = pieceTileSize;
          sprite.eventMode = "static";
          sprite.cursor = "pointer";

          if (
            selectedDropPiece &&
            selectedDropPiece.color === piece.color &&
            selectedDropPiece.piece_type === piece.piece_type
          ) {
            sprite.tint = 0x88bbff;
          }

          const capturedPiece = piece;
          const capturedElementId = elementId;
          const capturedBoardIdx = boardIdx;
          const capturedIdx = idx;
          sprite.on("pointerdown", (e: FederatedPointerEvent) => {
            e.stopPropagation();
            this.onSelectReservePiece?.(capturedPiece, capturedElementId);
            this.selected = null;
            // Start drag from reserve pile
            const origin = mkReserveCoords(capturedIdx, capturedBoardIdx);
            this.startDrag(sprite, origin, e, sl);
          });

          this.reserveLayer.addChild(sprite);
          this.reserveSprites.set(key, sprite);
          yOffset += pieceTileSize + RESERVE_PADDING;
        }
      }
    }
  }

  private rebuildPiecePicker(): void {
    if (!this.state) return;
    const { uiMap, stageWidth, stageHeight } = this.state;

    // Clear existing
    for (const c of this.piecePickerSprites.values()) {
      this.piecePickerLayer.removeChild(c);
      c.destroy();
    }
    this.piecePickerSprites.clear();
    this.piecePickerLayer.removeChildren();

    // Find piece_picker entries in uiMap
    const pickerEls: WasmUiPiecePicker[] = [];
    for (const el of Object.values(uiMap)) {
      if (el.type === "piece_picker") {
        pickerEls.push(el as WasmUiPiecePicker);
      }
    }
    if (pickerEls.length === 0) {
      this.piecePickerLayer.eventMode = "none";
      return;
    }

    // Merge pieces from all picker entries; use first non-default cancel/title
    const pieces: WasmPiece[] = [];
    let showCancel = true;
    let title = "";
    for (const el of pickerEls) {
      pieces.push(...el.pieces);
      if (el.cancelable === false) showCancel = false;
      if (el.title) title = el.title;
    }
    if (pieces.length === 0) {
      this.piecePickerLayer.eventMode = "none";
      return;
    }

    this.piecePickerLayer.eventMode = "static";

    // Layout constants
    const pieceSize = Math.min(stageWidth, stageHeight) * 0.1;
    const cardPadding = 16;
    const itemGap = 6;
    const titleHeight = title ? 28 : 0;
    const cancelHintHeight = showCancel ? 22 : 0;
    const cardW = pieces.length * pieceSize + (pieces.length - 1) * itemGap + 2 * cardPadding;
    const cardH = cardPadding + titleHeight + cancelHintHeight + pieceSize + cardPadding;
    const cardX = (stageWidth - cardW) / 2;
    const cardY = (stageHeight - cardH) / 2;

    // Semi-transparent fullscreen backdrop
    const bg = new Graphics()
      .rect(0, 0, stageWidth, stageHeight)
      .fill({ color: 0x000000, alpha: 0.4 });
    bg.eventMode = "none";
    this.piecePickerLayer.addChild(bg);

    // Cancel: click on background area sends cancel (only when cancelable).
    // Added BEFORE pieces so pieces sit on top and receive events first.
    if (showCancel) {
      const cancelBtn = new Graphics()
        .rect(0, 0, stageWidth, stageHeight)
        .fill({ color: 0x000000, alpha: 0.001 });
      cancelBtn.eventMode = "static";
      cancelBtn.cursor = "default";
      cancelBtn.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.onSubmitAction({ type: "cancel" });
      });
      this.piecePickerLayer.addChild(cancelBtn);
    }

    // Card background
    const card = new Graphics()
      .roundRect(cardX, cardY, cardW, cardH, 12)
      .fill({ color: 0x1a1a1a, alpha: 0.92 });
    card.eventMode = "none";
    this.piecePickerLayer.addChild(card);

    // Title text
    let currentY = cardY + cardPadding;
    if (title) {
      const titleText = new Text({
        text: title,
        style: { fontSize: 16, fill: 0xffffff, fontFamily: "Arial", fontWeight: "bold" },
      });
      titleText.anchor.set(0.5, 0);
      titleText.position.set(stageWidth / 2, currentY);
      currentY += titleHeight;
      this.piecePickerLayer.addChild(titleText);
    }

    // Cancel hint
    if (showCancel) {
      const cancelText = new Text({
        text: "right-click / tap away to cancel",
        style: { fontSize: 11, fill: 0x999999, fontFamily: "Arial" },
      });
      cancelText.anchor.set(0.5, 0);
      cancelText.position.set(stageWidth / 2, currentY);
      currentY += cancelHintHeight;
      this.piecePickerLayer.addChild(cancelText);
    }

    // Piece sprites
    const piecesStartX = cardX + cardPadding;
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const url = getPieceImageUrl(piece.color, piece.piece_type);
      const tex = url ? (this.textureCache.get(url) ?? null) : null;
      if (!tex) continue;

      const container = new Container();
      container.position.set(piecesStartX + i * (pieceSize + itemGap), currentY);
      container.eventMode = "static";
      container.cursor = "pointer";
      container.hitArea = new Rectangle(0, 0, pieceSize, pieceSize);

      const sprite = new Sprite(tex);
      sprite.anchor.set(0, 0);
      sprite.width = pieceSize;
      sprite.height = pieceSize;
      sprite.eventMode = "none";

      if (PIECE_TINT[piece.color] != null) {
        sprite.tint = PIECE_TINT[piece.color];
      }

      const capturedPiece = piece;
      container.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.onSubmitAction({ type: "select_piece", piece: capturedPiece });
      });

      container.addChild(sprite);
      this.piecePickerLayer.addChild(container);
      this.piecePickerSprites.set(`picker_${i}`, container);
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

    const hasMultiBoard = s.variantConfig.board.count > 1;
    const isOverview = this.currentZoomMode === "overview";
    const isOnOtherBoard = hasMultiBoard && !isOverview &&
      this.focusedBoardIndex !== (this.state?.activeBoardIndex ?? 0);
    const showZoomOut = hasMultiBoard && !isOverview;
    const showHome = hasMultiBoard && (isOverview || isOnOtherBoard);
    const showNav = hasMultiBoard && !isOverview;

    const textStyle = new TextStyle({
      fontSize: 16,
      fill: textColor,
      fontFamily: "sans-serif",
    });

    const btnX = s.stageWidth - btnW - rightMargin;
    // 5 fixed slots, ⌂ at center. Hidden buttons leave empty space.
    const centerY = Math.round(s.stageHeight / 2);
    const slotY = (slot: number) => centerY + (slot - 2) * (btnH + gap);

    const addBtn = (text: string, slot: number, onClick: () => void) => {
      const c = new Container();
      c.eventMode = "static";
      c.cursor = "pointer";
      const bg = new Graphics();
      bg.roundRect(0, 0, btnW, btnH, radius);
      bg.fill({ color: bgColor, alpha: bgAlpha });
      c.addChild(bg);
      const t = new Text({ text, style: textStyle });
      t.anchor.set(0.5);
      t.position.set(btnW / 2, btnH / 2);
      c.addChild(t);
      c.position.set(btnX, slotY(slot));
      c.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        onClick();
      });
      this.uiOverlay.addChild(c);
    };

    // Slot 0: ↻  Rotate (hidden in overview)
    if (!isOverview) {
      addBtn("↻", 0, () => this.onRotateBoard?.(this.focusedBoardIndex));
    }

    // Slot 1: ⊟  Zoom-out (single mode, multi-board)
    if (showZoomOut) {
      addBtn("⊟", 1, () => this.setZoomMode("overview"));
    }

    // Slot 2: ⌂  Home (overview or on other board)
    if (showHome) {
      addBtn("⌂", 2, () => {
        this.focusedBoardIndex = this.state?.activeBoardIndex ?? 0;
        this.setZoomMode("single");
        this.onReturnHome?.();
      });
    }

    // Slot 3: ◀  Prev board (single mode, multi-board)
    if (showNav) {
      const boardCount = s.variantConfig.board.count;
      addBtn("◀", 3, () => {
        const prev = this.focusedBoardIndex <= 0 ? boardCount - 1 : this.focusedBoardIndex - 1;
        this.focusedBoardIndex = prev;
        this.applyZoomMode("single", prev);
        this.rebuildUiButtons(this.state!);
        this.rebuildSlotButtons(this.state!);
      });
    }

    // Slot 4: ▶  Next board (single mode, multi-board)
    if (showNav) {
      const boardCount = s.variantConfig.board.count;
      addBtn("▶", 4, () => {
        const next = this.focusedBoardIndex >= boardCount - 1 ? 0 : this.focusedBoardIndex + 1;
        this.focusedBoardIndex = next;
        this.applyZoomMode("single", next);
        this.rebuildUiButtons(this.state!);
        this.rebuildSlotButtons(this.state!);
      });
    }
  }

  /** Magnifying glass buttons under each board in overview mode. */
  private rebuildSlotButtons(s: SceneState): void {
    this.slotBtnsLayer.removeChildren();
    if (this.currentZoomMode !== "overview" || s.variantConfig.board.count <= 1) return;

    const btnW = 28;
    const btnH = 28;
    const btnGapFromBoard = 16;
    const radius = 6;
    const bgColor = 0x000000;
    const bgAlpha = 0.55;
    const textColor = 0xffffff;

    const textStyle = new TextStyle({
      fontSize: 20,
      fill: textColor,
      fontFamily: "sans-serif",
    });

    for (const sl of this.slotLayouts) {
      const slotWidth = sl.slotRight - sl.slotLeft;
      const btnX = sl.slotLeft + Math.round((slotWidth - btnW) / 2);
      const btnY = sl.boardTop + sl.boardH + btnGapFromBoard;

      const c = new Container();
      c.eventMode = "static";
      c.cursor = "pointer";

      const bg = new Graphics();
      bg.roundRect(0, 0, btnW, btnH, radius);
      bg.fill({ color: bgColor, alpha: bgAlpha });
      c.addChild(bg);

      const label = new Text({ text: "＋", style: textStyle });
      label.anchor.set(0.5);
      label.position.set(btnW / 2, btnH / 2);
      c.addChild(label);

      c.position.set(btnX, btnY);
      c.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.focusedBoardIndex = sl.boardIndex;
        this.currentZoomMode = "single";
        this.applyZoomMode("single", sl.boardIndex);
        this.rebuildUiButtons(this.state!);
        this.rebuildSlotButtons(this.state!);
        this.onZoomModeChange?.("single");
      });
      this.slotBtnsLayer.addChild(c);
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

    // Overview mode: no clicks on the board itself (use 🔍 buttons below)
    if (this.currentZoomMode === "overview") return;

    if (sl.boardIndex !== this.state.activeBoardIndex) {
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
    origin: WasmCoords,
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
      // Re-apply hand cursor since PixiJS may reset it on pointermove
      if (this.app) {
        (this.app.canvas as HTMLCanvasElement).style.cursor = "grabbing";
      }
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
              isBoardCoords(a.to) &&
              coordsEqual(a.from, savedOrigin) &&
              coordsEq(a.to, target)
          );
          if (action) {
            if (isBoardCoords(savedOrigin)) {
              const piece = this.getDisplayPiece(savedOrigin.row, savedOrigin.col, savedOrigin.board_index);
              if (piece) {
                this.onPendingMove({ from: savedOrigin, piece, to: action.to as WasmBoardCoords });
              }
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
