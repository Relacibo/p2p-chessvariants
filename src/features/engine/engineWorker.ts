/**
 * Web Worker — owns the WASM ChessvariantEngine.
 *
 * All heavy WASM/Rhai computation runs here.
 * WASM is loaded via a dynamic import on first use to avoid blocking the
 * module body (the static import's top-level await can deadlock in some
 * Chromium versions when the WASM module graph has async initialisation).
 *
 * Progressive Phase 2 after submitAction:
 *   2a. valid_moves for local player → postMessage immediately
 *   2b. valid_moves for remaining players (background, no message)
 *   2c. is_game_over + game_over → postMessage when ready
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerRequest {
  id: number;
  type:
    | "init" | "submitAction" | "validMovesJson" | "deriveUiJson"
    | "boardStateJson" | "playersJson" | "variantConfigJson" | "stateJson";
  payload?: unknown;
}

// ── Lazy WASM import ──────────────────────────────────────────────────────────
// Use dynamic import so the worker module body (and `onmessage`) can execute
// synchronously without waiting for the WASM's top-level async initialisation.
// The static import caused a module-init hang in module workers under Chromium.

type EngineInstance = import("chessvariant-engine").ChessvariantEngine;

let _engineModule: typeof import("chessvariant-engine") | null = null;

async function getEngineClass() {
  if (!_engineModule) {
    _engineModule = await import("chessvariant-engine");
  }
  return _engineModule.ChessvariantEngine;
}

// ── Engine state ──────────────────────────────────────────────────────────────

let engine: EngineInstance | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(id: number, result: unknown) { postMessage({ id, result }); }
function err(id: number, message: string) { postMessage({ id, error: message }); }

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    try { return JSON.stringify(e, null, 2); } catch (e2) { console.error("[engineWorker] formatError JSON.stringify failed", e2); }
  }
  return String(e);
}

function need(): EngineInstance {
  if (!engine) throw new Error("Engine not initialised");
  return engine;
}

// ── Message loop ──────────────────────────────────────────────────────────────

onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = e.data;
  try {
    switch (type) {
      case "init": {
        const p = payload as { script: string; playerCount?: number; setupJson?: string };
        const ChessvariantEngine = await getEngineClass();
        if (p.setupJson && p.setupJson !== "{}") {
          // Use pre-built setup from host (P2P peer path)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          engine = (ChessvariantEngine as any).new_with_setup(p.script, p.setupJson) as EngineInstance;
        } else {
          const pc = p.playerCount ?? 2;
          engine = new ChessvariantEngine(p.script, pc);
        }
        const va = JSON.parse(engine.validMovesAllJson());
        ok(id, {
          board_state:   JSON.parse(engine.boardStateJson()),
          valid_moves:   va.valid_moves,
          game_over:     va.game_over,
          players:       JSON.parse(engine.playersJson()),
          variant_config: JSON.parse(engine.variantConfigJson()),
        });
        break;
      }
      case "submitAction": {
        const p = payload as { player: string; actionJson: string; localPlayer: string };
        // Phase 1: board, ui, game_over — send IMMEDIATELY
        const result = JSON.parse(need().submitAction(p.player, p.actionJson));
        ok(id, {
          ...result,
          state_json: JSON.parse(need().stateJson()),
          players:   JSON.parse(need().playersJson()),
        });

        // Phase 2a: valid_moves for local player FIRST
        const localMoves = JSON.parse(need().validMovesForPlayerJson(p.localPlayer));
        postMessage({
          id,
          _phase: "valid_moves",
          result: { valid_moves: localMoves },
        });

        // Yield to let Phase 2a message reach the main thread before blocking
        // on the more expensive Phase 2b computation.
        await new Promise<void>(r => setTimeout(r, 0));

        // Phase 2b + 2c: remaining players + game_over check
        const all = JSON.parse(need().validMovesAllJson());
        postMessage({
          id,
          _phase: "game_over",
          result: { game_over: all.game_over, valid_moves: all.valid_moves },
        });
        break;
      }
      case "validMovesJson":
        ok(id, JSON.parse(need().validMovesAllJson()).valid_moves);
        break;
      case "deriveUiJson":
        ok(id, JSON.parse(need().deriveUiJson((payload as { player: string }).player)));
        break;
      case "boardStateJson":
        ok(id, JSON.parse(need().boardStateJson()));
        break;
      case "playersJson":
        ok(id, JSON.parse(need().playersJson()));
        break;
      case "variantConfigJson":
        ok(id, JSON.parse(need().variantConfigJson()));
        break;
      case "stateJson":
        ok(id, JSON.parse(need().stateJson()));
        break;
      default:
        err(id, `Unknown message type: ${type}`);
    }
  } catch (e: unknown) {
    err(id, formatError(e));
  }
};
