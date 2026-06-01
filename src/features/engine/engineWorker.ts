/**
 * Web Worker — owns the WASM ChessvariantEngine.
 *
 * All heavy WASM/Rhai computation runs here.
 * Messages are accepted immediately (before WASM is ready) and queued.
 *
 * Progressive Phase 2 after submitAction:
 *   2a. valid_moves for local player → postMessage immediately
 *   2b. valid_moves for remaining players (background, no message)
 *   2c. is_game_over + game_over → postMessage when ready
 */

import type { ChessvariantEngine as EngineType } from "chessvariant-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BgModule {
  __wbg_set_wasm(exports: WebAssembly.Exports): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface WorkerRequest {
  id: number;
  type:
    | "init" | "submitAction" | "validMovesJson" | "getUiJson"
    | "boardStateJson" | "playersJson" | "variantConfigJson" | "stateJson";
  payload?: unknown;
}

// ── WASM init promise ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let EngineClass!: new (script: string, n: number) => EngineType;
let engine: EngineType | null = null;
const ready: { current: Promise<void> | null } = { current: null };

ready.current = (async () => {
  const bg: BgModule = await (
    Function("u", "return import(u)")("/rust/pkg/chessvariant_engine_bg.js") as Promise<BgModule>
  );
  const wasmUrl = new URL("/rust/pkg/chessvariant_engine_bg.wasm", self.location.href);
  const resp = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiateStreaming(
    resp,
    { "./chessvariant_engine_bg.js": bg } as WebAssembly.Imports,
  );
  bg.__wbg_set_wasm(instance.exports);
  const start = (instance.exports as Record<string, unknown>).__wbindgen_start;
  if (typeof start === "function") (start as () => void)();
  EngineClass = bg.ChessvariantEngine;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(id: number, result: unknown) { postMessage({ id, result }); }
function err(id: number, message: string) { postMessage({ id, error: message }); }

function need(): EngineType {
  if (!engine) throw new Error("Engine not initialised");
  return engine;
}

async function whenReady<T>(fn: () => T): Promise<T> {
  if (ready.current) await ready.current;
  return fn();
}

// ── Message loop (registered IMMEDIATELY, before WASM is ready) ───────────────

onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = e.data;
  try {
    switch (type) {
      case "init": {
        await whenReady(() => {
          const p = payload as { script: string; playerCount: number };
          engine = new EngineClass(p.script, p.playerCount);
          // Use validMovesAllJson for initial state (includes game_over check)
          const va = JSON.parse(engine.validMovesAllJson());
          return {
            boardState:    JSON.parse(engine.boardStateJson()),
            validMoves:    va.validMoves,
            gameOver:      va.gameOver,
            players:       JSON.parse(engine.playersJson()),
            variantConfig: JSON.parse(engine.variantConfigJson()),
          };
        }).then(r => ok(id, r));
        break;
      }
      case "submitAction": {
        const p = payload as { player: string; actionJson: string; localPlayer: string };
        // Phase 1: board, ui, game_over — send IMMEDIATELY
        const result = await whenReady(() => {
          const r = JSON.parse(need().submitAction(p.player, p.actionJson));
          return {
            ...r,
            stateJson: JSON.parse(need().stateJson()),
            players:   JSON.parse(need().playersJson()),
          };
        });
        ok(id, result);

        // Phase 2a: valid_moves for local player FIRST
        const localMoves = await whenReady(() =>
          JSON.parse(need().validMovesForPlayerJson(p.localPlayer))
        );
        postMessage({
          id,
          _phase: "validMoves",
          result: { validMoves: localMoves },
        });

        // Phase 2b + 2c: remaining players + game_over check
        const all = await whenReady(() =>
          JSON.parse(need().validMovesAllJson())
        );
        postMessage({
          id,
          _phase: "gameOver",
          result: { gameOver: all.gameOver, validMoves: all.validMoves },
        });
        break;
      }
      case "validMovesJson":
        ok(id, await whenReady(() => {
          const r = JSON.parse(need().validMovesAllJson());
          return r.validMoves; // just the moves array, not the full {validMoves, gameOver} object
        })); break;
      case "getUiJson":
        ok(id, await whenReady(() => JSON.parse(need().getUiJson((payload as { player: string }).player)))); break;
      case "boardStateJson":
        ok(id, await whenReady(() => JSON.parse(need().boardStateJson()))); break;
      case "playersJson":
        ok(id, await whenReady(() => JSON.parse(need().playersJson()))); break;
      case "variantConfigJson":
        ok(id, await whenReady(() => JSON.parse(need().variantConfigJson()))); break;
      case "stateJson":
        ok(id, await whenReady(() => JSON.parse(need().stateJson()))); break;
      default:
        err(id, `Unknown message type: ${type}`);
    }
  } catch (e: unknown) {
    err(id, e instanceof Error ? e.message : String(e));
  }
};
