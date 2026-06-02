import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Texture,
  Assets,
} from "pixi.js";
import {
  WasmAction,
  WasmBoardCoords,
  WasmBoardState,
  WasmPiece,
  WasmVariantConfig,
  isBoardCoords,
} from "./types";
import type { PendingMove } from "./PixiChessboard";
import { getPieceImageUrl } from "./pieceImages";

// ─── Palette ─────────────────────────────────────────────────────────────────
const LIGHT = 0xf0d9b5;
const DARK = 0xb58863;
const SELECTED_COLOR = 0x1478ff;
const VALID_MOVE_COLOR = 0x00b400;
const LAST_MOVE_COLOR = 0xffd700;
const GHOST_ALPHA = 0.35;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function coordsEq(a: WasmBoardCoords, b: WasmBoardCoords): boolean {
  return a.row === b.row && a.col === b.col && a.boardIndex === b.boardIndex;
}

function mkBoardCoords(
  row: number,
  col: number,
  boardIndex: number
): WasmBoardCoords {
  return { type: "board", row, col, boardIndex };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type ZoomMode = "single" | "overview";

export interface SceneState {
  variantConfig: WasmVariantConfig;
  boardState: WasmBoardState;
  validMoves: WasmAction[];
  boardIndex: number;
  flipped: boolean;
  tileSize: number;
  stageWidth: number;
  stageHeight: number;
  pendingMove: PendingMove | null;
  lastAction: WasmAction | undefined;
  selectedDropPiece: WasmPiece | null | undefined;
}

interface Layout {
  tileSize: number;
  rows: number;
  cols: number;
  boardW: number;
  boardH: number;
  offsetX: number;
  offsetY: number;
  boardIndex: number;
  flipped: boolean;
}

// ─── Scene manager ────────────────────────────────────────────────────────────
export class PixiBoard {
  private app: Application | null = null;

  // rootContainer carries all board content and is scaled for zoom.
  private rootContainer = new Container();
  private bgGraphics = new Graphics();
  private highlightGraphics = new Graphics();
  private pieceLayer = new Container();
  // Drag copies live above pieces, inside rootContainer (scales with zoom).
  private dragLayer = new Container();

  private pieceSprites = new Map<string, Sprite>(); // key = `${row},${col}`
  private state: SceneState | null = null;
  private selected: WasmBoardCoords | null = null;
  private textureCache = new Map<string, Texture>();
  private initDone = false;
  private destroyed = false;

  // Drag state
  private dragOrigin: WasmBoardCoords | null = null;
  private dragCopy: Sprite | null = null;
  private dragPointerMove: ((e: PointerEvent) => void) | null = null;
  private dragPointerUp: ((e: PointerEvent) => void) | null = null;

  // Mutable callbacks — updated without re-initialising the board
  onSubmitAction: (action: WasmAction) => void;
  onPendingMove: (move: PendingMove | null) => void;
  onClearDropPiece: (() => void) | undefined;

  constructor(
    onSubmitAction: (action: WasmAction) => void,
    onPendingMove: (move: PendingMove | null) => void
  ) {
    this.onSubmitAction = onSubmitAction;
    this.onPendingMove = onPendingMove;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  // Takes a container div — PixiJS creates its own <canvas> so that two
  // concurrent async inits (React StrictMode double-mount) never share a canvas
  // element and cannot corrupt each other's WebGL context.
  async init(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;

    const app = new Application();
    this.app = app;

    try {
      await app.init({
        width,
        height,
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

    // Component may have been unmounted while init was awaiting.
    // Use the local `app` ref — this.app may have been nulled by destroy().
    if (this.destroyed) {
      app.destroy(true, { children: true });
      this.app = null;
      return;
    }

    // Only append to DOM after init completes — ensures no two canvases share
    // a WebGL context during the StrictMode double-mount window.
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    container.appendChild(canvas);

    app.stage.addChild(this.rootContainer);
    this.rootContainer.addChild(this.bgGraphics);
    this.rootContainer.addChild(this.highlightGraphics);
    this.rootContainer.addChild(this.pieceLayer);
    this.rootContainer.addChild(this.dragLayer);

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
    if (this.dragPointerMove)
      window.removeEventListener("pointermove", this.dragPointerMove);
    if (this.dragPointerUp)
      window.removeEventListener("pointerup", this.dragPointerUp);
    for (const s of this.pieceSprites.values()) s.destroy();
    this.pieceSprites.clear();
    if (this.initDone && this.app) {
      // Remove canvas from DOM before destroying so React's container div is clean.
      const canvas = this.app.canvas as HTMLCanvasElement;
      canvas.parentNode?.removeChild(canvas);
      this.app.destroy(false, { children: true });
    }
    // If init is still in-flight, it will detect this.destroyed and call
    // app.destroy(true, ...) which removes the canvas itself.
    this.app = null;
    this.initDone = false;
  }

  // ─── Public update API ─────────────────────────────────────────────────────

  update(s: SceneState): void {
    if (!this.initDone) return;
    const prev = this.state;
    this.state = s;

    const layoutChanged =
      !prev ||
      prev.tileSize !== s.tileSize ||
      prev.stageWidth !== s.stageWidth ||
      prev.stageHeight !== s.stageHeight ||
      prev.boardState.rows !== s.boardState.rows ||
      prev.boardState.cols !== s.boardState.cols ||
      prev.flipped !== s.flipped;

    const piecesChanged =
      layoutChanged ||
      prev?.boardState !== s.boardState ||
      prev?.pendingMove !== s.pendingMove ||
      prev?.validMoves !== s.validMoves;

    const highlightsChanged =
      piecesChanged ||
      prev?.lastAction !== s.lastAction ||
      prev?.selectedDropPiece !== s.selectedDropPiece;

    if (layoutChanged) {
      this.app?.renderer.resize(s.stageWidth, s.stageHeight);
      this.rebuildBackground();
      this.rebuildHitArea();
    }
    if (piecesChanged) this.rebuildPieces();
    if (highlightsChanged) this.rebuildHighlights();
  }

  setZoomMode(mode: ZoomMode): void {
    if (!this.state) return;
    const { tileSize, stageWidth, stageHeight } = this.state;
    const { rows, cols } = this.state.boardState;
    const boardW = tileSize * cols;
    const boardH = tileSize * rows;

    if (mode === "single") {
      this.rootContainer.scale.set(1);
      this.rootContainer.position.set(0, 0);
    } else {
      // Overview: scale so that the board fits ~1/3 of the viewport
      // (leaving room to conceptually show 6 boards around it).
      const n = Math.ceil(Math.sqrt(6));
      const scale = Math.min(
        (stageWidth / boardW) / n,
        (stageHeight / boardH) / n
      );
      this.rootContainer.scale.set(scale);
      this.rootContainer.position.set(
        (stageWidth - boardW * scale) / 2,
        (stageHeight - boardH * scale) / 2
      );
    }
  }

  // ─── Coordinate helpers ────────────────────────────────────────────────────

  private getLayout(): Layout | null {
    if (!this.state) return null;
    const { tileSize, stageWidth, stageHeight, boardIndex, flipped } =
      this.state;
    const { rows, cols } = this.state.boardState;
    const boardW = tileSize * cols;
    const boardH = tileSize * rows;
    const offsetX = Math.floor((stageWidth - boardW) / 2);
    const offsetY = Math.floor((stageHeight - boardH) / 2);
    return { tileSize, rows, cols, boardW, boardH, offsetX, offsetY, boardIndex, flipped };
  }

  /** Logical (row, col) → rootContainer-local pixel top-left. */
  private toLocal(row: number, col: number, l: Layout) {
    return {
      x: l.offsetX + col * l.tileSize,
      y: l.offsetY + (l.flipped ? l.rows - 1 - row : row) * l.tileSize,
    };
  }

  /** rootContainer-local pixel → board coords (null if outside board). */
  private fromLocal(lx: number, ly: number, l: Layout): WasmBoardCoords | null {
    const rawCol = Math.floor((lx - l.offsetX) / l.tileSize);
    const rawRow = Math.floor((ly - l.offsetY) / l.tileSize);
    if (rawCol < 0 || rawCol >= l.cols || rawRow < 0 || rawRow >= l.rows)
      return null;
    const row = l.flipped ? l.rows - 1 - rawRow : rawRow;
    return mkBoardCoords(row, rawCol, l.boardIndex);
  }

  /** Client (viewport) pixel → rootContainer-local pixel. */
  private clientToLocal(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.app) return null;
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const stageX = clientX - rect.left;
    const stageY = clientY - rect.top;
    const sx = this.rootContainer.scale.x || 1;
    const sy = this.rootContainer.scale.y || 1;
    return {
      x: (stageX - this.rootContainer.x) / sx,
      y: (stageY - this.rootContainer.y) / sy,
    };
  }

  // ─── Disabled squares ──────────────────────────────────────────────────────

  private disabledSet(): Set<string> {
    const s = new Set<string>();
    for (const { r1, c1, r2: h, c2: w } of (this.state?.variantConfig.board
      .disabled_rects ?? [])) {
      for (let r = r1; r < r1 + h; r++)
        for (let c = c1; c < c1 + w; c++) s.add(`${r},${c}`);
    }
    return s;
  }

  // ─── Scene rebuild ─────────────────────────────────────────────────────────

  private rebuildBackground(): void {
    this.bgGraphics.clear();
    const l = this.getLayout();
    if (!l) return;
    const disabled = this.disabledSet();
    for (let row = 0; row < l.rows; row++) {
      for (let col = 0; col < l.cols; col++) {
        if (disabled.has(`${row},${col}`)) continue;
        const { x, y } = this.toLocal(row, col, l);
        this.bgGraphics
          .rect(x, y, l.tileSize, l.tileSize)
          .fill((row + col) % 2 === 0 ? LIGHT : DARK);
      }
    }

    // The background graphics object also handles click events for the board.
    this.bgGraphics.eventMode = "static";
    this.bgGraphics.removeAllListeners();
    this.bgGraphics.on("pointerdown", (e: FederatedPointerEvent) => {
      if (this.dragOrigin) return;
      const local = e.getLocalPosition(this.rootContainer);
      const l2 = this.getLayout();
      if (!l2) return;
      const coords = this.fromLocal(local.x, local.y, l2);
      if (coords) {
        this.handleTileClick(coords.row, coords.col);
      } else {
        this.selected = null;
        this.onClearDropPiece?.();
        this.rebuildHighlights();
      }
    });
  }

  /** Re-attaches the hit-area listener; called when layout changes. */
  private rebuildHitArea(): void {
    // Hit-area is already on bgGraphics — rebuildBackground sets it up.
    // Nothing extra needed here; keeping the method for clarity.
  }

  private rebuildHighlights(): void {
    this.highlightGraphics.clear();
    const l = this.getLayout();
    if (!this.state || !l) return;
    const { validMoves, lastAction, selectedDropPiece, boardIndex } = this.state;
    const disabled = this.disabledSet();

    // Compute valid target squares for the current selection / drag / reserve piece.
    // During drag, dragOrigin acts as the selection source.
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
          validTargets.add(`${a.to.row},${a.to.col}`);
        }
      }
    }
    if (selectedDropPiece) {
      for (const a of validMoves) {
        if (
          a.type === "move" &&
          a.from.type === "reserve" &&
          isBoardCoords(a.to)
        ) {
          validTargets.add(`${a.to.row},${a.to.col}`);
        }
      }
    }

    for (let row = 0; row < l.rows; row++) {
      for (let col = 0; col < l.cols; col++) {
        if (disabled.has(`${row},${col}`)) continue;
        const { x, y } = this.toLocal(row, col, l);
        const coords = mkBoardCoords(row, col, boardIndex);

        // Last-move highlight
        if (lastAction?.type === "move") {
          const fromMatch =
            isBoardCoords(lastAction.from) && coordsEq(lastAction.from, coords);
          const toMatch =
            isBoardCoords(lastAction.to) && coordsEq(lastAction.to, coords);
          if (fromMatch || toMatch) {
            this.highlightGraphics
              .rect(x, y, l.tileSize, l.tileSize)
              .fill({ color: LAST_MOVE_COLOR, alpha: 0.35 });
          }
        }

        // Selected-square highlight (also shown during drag)
        if (activeSource && coordsEq(activeSource, coords)) {
          this.highlightGraphics
            .rect(x, y, l.tileSize, l.tileSize)
            .fill({ color: SELECTED_COLOR, alpha: 0.45 });
        }

        // Valid-target highlight: dot for empty square, ring overlay for captures
        if (validTargets.has(`${row},${col}`)) {
          const hasPiece = this.getDisplayPiece(row, col) != null;
          if (hasPiece) {
            this.highlightGraphics
              .rect(x, y, l.tileSize, l.tileSize)
              .fill({ color: VALID_MOVE_COLOR, alpha: 0.35 });
          } else {
            this.highlightGraphics
              .circle(
                x + l.tileSize / 2,
                y + l.tileSize / 2,
                l.tileSize * 0.16
              )
              .fill({ color: VALID_MOVE_COLOR, alpha: 0.7 });
          }
        }
      }
    }
  }

  private getDisplayPiece(row: number, col: number): WasmPiece | null {
    if (!this.state) return null;
    const { boardState, boardIndex, pendingMove } = this.state;
    const piece =
      boardState.boards[boardIndex]?.[row * boardState.cols + col] ?? null;
    if (!pendingMove) return piece;
    const coords = mkBoardCoords(row, col, boardIndex);
    if (coordsEq(pendingMove.from, coords)) return null;
    if (coordsEq(pendingMove.to, coords)) return pendingMove.piece;
    return piece;
  }

  private rebuildPieces(): void {
    const l = this.getLayout();
    if (!this.state || !l) return;
    const { validMoves, boardIndex } = this.state;
    const disabled = this.disabledSet();

    const pickable = new Set<string>();
    for (const a of validMoves) {
      if (a.type === "move" && isBoardCoords(a.from))
        pickable.add(`${a.from.row},${a.from.col}`);
    }

    // Build desired state
    const desired = new Map<
      string,
      { piece: WasmPiece; x: number; y: number; canDrag: boolean }
    >();
    for (let row = 0; row < l.rows; row++) {
      for (let col = 0; col < l.cols; col++) {
        if (disabled.has(`${row},${col}`)) continue;
        const piece = this.getDisplayPiece(row, col);
        if (!piece) continue;
        const pos = this.toLocal(row, col, l);
        desired.set(`${row},${col}`, {
          piece,
          x: pos.x,
          y: pos.y,
          canDrag: pickable.has(`${row},${col}`),
        });
      }
    }

    // Remove sprites no longer needed
    for (const [key, sprite] of this.pieceSprites) {
      if (!desired.has(key)) {
        this.pieceLayer.removeChild(sprite);
        sprite.destroy();
        this.pieceSprites.delete(key);
      }
    }

    // Add or update sprites
    for (const [key, { piece, x, y, canDrag }] of desired) {
      const url = getPieceImageUrl(piece.color, piece.pieceType);
      const tex = url ? (this.textureCache.get(url) ?? null) : null;
      if (!tex) continue;

      const [rowStr, colStr] = key.split(",");
      const row = Number(rowStr);
      const col = Number(colStr);
      const isDragOrigin =
        this.dragOrigin != null &&
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
      sprite.width = l.tileSize;
      sprite.height = l.tileSize;
      // Show ghost at drag origin; dragged piece appears via dragCopy
      sprite.alpha = isDragOrigin ? GHOST_ALPHA : 1;
      sprite.eventMode = canDrag ? "static" : "none";
      sprite.cursor = canDrag ? "grab" : "default";

      if (canDrag) {
        sprite.removeAllListeners();
        const r = row;
        const c = col;
        sprite.on("pointerdown", (e: FederatedPointerEvent) => {
          e.stopPropagation();
          // Select this piece immediately so valid-move dots appear during drag.
          // startDrag will set dragOrigin and null selected; rebuildHighlights
          // uses dragOrigin as the active source when set.
          this.selected = mkBoardCoords(r, c, boardIndex);
          this.startDrag(sprite!, mkBoardCoords(r, c, boardIndex), e);
        });
      }
    }
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  private handleTileClick(row: number, col: number): void {
    if (!this.state) return;
    const { validMoves, boardIndex, selectedDropPiece } = this.state;
    const clicked = mkBoardCoords(row, col, boardIndex);

    // Reserve-pile drop
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
        const piece = this.getDisplayPiece(this.selected.row, this.selected.col);
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
    const piece = this.getDisplayPiece(row, col);
    const canPick = validMoves.some(
      (a) =>
        a.type === "move" && isBoardCoords(a.from) && coordsEq(a.from, clicked)
    );
    this.selected = piece && canPick ? clicked : null;
    this.rebuildHighlights();
  }

  private startDrag(
    originSprite: Sprite,
    origin: WasmBoardCoords,
    e: FederatedPointerEvent
  ): void {
    if (!this.app || !this.state) return;
    const l = this.getLayout();
    if (!l) return;

    this.dragOrigin = origin;
    this.selected = null; // dragOrigin takes over as active source in rebuildHighlights
    originSprite.alpha = GHOST_ALPHA;

    // Create a drag copy that follows the cursor inside rootContainer
    const dragCopy = new Sprite(originSprite.texture);
    dragCopy.width = l.tileSize;
    dragCopy.height = l.tileSize;
    const initLocal = e.getLocalPosition(this.rootContainer);
    dragCopy.position.set(
      initLocal.x - l.tileSize / 2,
      initLocal.y - l.tileSize / 2
    );
    this.dragLayer.addChild(dragCopy);
    this.dragCopy = dragCopy;

    const moveHandler = (ev: PointerEvent) => {
      const local = this.clientToLocal(ev.clientX, ev.clientY);
      if (local) {
        dragCopy.position.set(
          local.x - l.tileSize / 2,
          local.y - l.tileSize / 2
        );
      }
    };

    const upHandler = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      this.dragPointerMove = null;
      this.dragPointerUp = null;

      this.dragLayer.removeChild(dragCopy);
      dragCopy.destroy();
      this.dragCopy = null;

      const savedOrigin = this.dragOrigin;
      this.dragOrigin = null;

      if (savedOrigin && this.state) {
        const local = this.clientToLocal(ev.clientX, ev.clientY);
        const target = local ? this.fromLocal(local.x, local.y, this.getLayout()!) : null;

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
            const piece = this.getDisplayPiece(savedOrigin.row, savedOrigin.col);
            if (piece && isBoardCoords(action.to)) {
              this.onPendingMove({ from: savedOrigin, piece, to: action.to });
            }
            this.onSubmitAction(action);
            // Keep ghost invisible — React will re-render via pendingMove
            originSprite.alpha = 0;
          } else {
            originSprite.alpha = 1; // invalid drop: snap back
          }
        } else {
          originSprite.alpha = 1; // dropped outside board
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
}
