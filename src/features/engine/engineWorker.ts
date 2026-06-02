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
    | "init" | "submitAction" | "validMovesJson" | "getUiJson"
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
        const p = payload as { script: string; playerCount: number };
        const ChessvariantEngine = await getEngineClass();
        engine = new ChessvariantEngine(p.script, p.playerCount);
        const va = JSON.parse(engine.validMovesAllJson());
        ok(id, {
          boardState:    JSON.parse(engine.boardStateJson()),
          validMoves:    va.validMoves,
          gameOver:      va.gameOver,
          players:       JSON.parse(engine.playersJson()),
          variantConfig: JSON.parse(engine.variantConfigJson()),
        });
        break;
      }
      case "submitAction": {
        const p = payload as { player: string; actionJson: string; localPlayer: string };
        // Phase 1: board, ui, game_over — send IMMEDIATELY
        const result = JSON.parse(need().submitAction(p.player, p.actionJson));
        ok(id, {
          ...result,
          stateJson: JSON.parse(need().stateJson()),
          players:   JSON.parse(need().playersJson()),
        });

        // Phase 2a: valid_moves for local player FIRST
        const localMoves = JSON.parse(need().validMovesForPlayerJson(p.localPlayer));
        postMessage({
          id,
          _phase: "validMoves",
          result: { validMoves: localMoves },
        });

        // Yield to let Phase 2a message reach the main thread before blocking
        // on the more expensive Phase 2b computation.
        await new Promise<void>(r => setTimeout(r, 0));

        // Phase 2b + 2c: remaining players + game_over check
        const all = JSON.parse(need().validMovesAllJson());
        postMessage({
          id,
          _phase: "gameOver",
          result: { gameOver: all.gameOver, validMoves: all.validMoves },
        });
        break;
      }
      case "validMovesJson":
        ok(id, JSON.parse(need().validMovesAllJson()).validMoves);
        break;
      case "getUiJson":
        ok(id, JSON.parse(need().getUiJson((payload as { player: string }).player)));
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
    err(id, e instanceof Error ? e.message : String(e));
  }
};
