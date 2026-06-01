/**
 * Web Worker that owns the WASM ChessvariantEngine instance.
 * All WASM calls run off the main thread — no UI freeze.
 */

import { ChessvariantEngine } from "chessvariant-engine";

// ── Message protocol ──────────────────────────────────────────────────────────

interface WorkerRequest {
  id: number;
  type:
    | "init"
    | "submitAction"
    | "validActionsJson"
    | "getUiJson"
    | "boardStateJson"
    | "playersJson"
    | "variantConfigJson"
    | "stateJson";
  payload?: unknown;
}

// ── State ─────────────────────────────────────────────────────────────────────

let engine: ChessvariantEngine | null = null;

function respond(id: number, result: unknown) {
  postMessage({ id, result });
}

function respondError(id: number, error: string) {
  postMessage({ id, error });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleInit(payload: { script: string; playerCount: number }): unknown {
  engine = new ChessvariantEngine(payload.script, payload.playerCount);
  return {
    boardState: JSON.parse(engine.boardStateJson()),
    validActions: JSON.parse(engine.validActionsJson()),
    players: JSON.parse(engine.playersJson()),
    variantConfig: JSON.parse(engine.variantConfigJson()),
  };
}

function handleSubmitAction(payload: {
  player: string;
  actionJson: string;
}): unknown {
  if (!engine) throw new Error("Engine not initialized");

  // 1. Submit the action — runs handle_action, returns { ui, game_over }
  const resultJson = engine.submitAction(payload.player, payload.actionJson);
  const result = JSON.parse(resultJson);

  // 2. Fetch updated valid actions for all players
  //    (cache was invalidated by submitAction, so this recomputes)
  const validActions = JSON.parse(engine.validActionsJson());

  // 3. Fetch updated board state
  const boardState = JSON.parse(engine.boardStateJson());

  return {
    ...result,
    validActions,
    boardState,
  };
}

function handleValidActionsJson(): unknown {
  if (!engine) throw new Error("Engine not initialized");
  return JSON.parse(engine.validActionsJson());
}

function handleGetUiJson(payload: { player: string }): unknown {
  if (!engine) throw new Error("Engine not initialized");
  const result = JSON.parse(engine.getUiJson(payload.player));
  return result;
}

function handleBoardStateJson(): unknown {
  if (!engine) throw new Error("Engine not initialized");
  return JSON.parse(engine.boardStateJson());
}

function handlePlayersJson(): unknown {
  if (!engine) throw new Error("Engine not initialized");
  return JSON.parse(engine.playersJson());
}

function handleVariantConfigJson(): unknown {
  if (!engine) throw new Error("Engine not initialized");
  return JSON.parse(engine.variantConfigJson());
}

function handleStateJson(): unknown {
  if (!engine) throw new Error("Engine not initialized");
  return JSON.parse(engine.stateJson());
}

// ── Message loop ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-restricted-globals
onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = e.data;
  try {
    switch (type) {
      case "init":
        respond(id, handleInit(payload as { script: string; playerCount: number }));
        break;
      case "submitAction":
        respond(
          id,
          handleSubmitAction(
            payload as { player: string; actionJson: string }
          )
        );
        break;
      case "validActionsJson":
        respond(id, handleValidActionsJson());
        break;
      case "getUiJson":
        respond(id, handleGetUiJson(payload as { player: string }));
        break;
      case "boardStateJson":
        respond(id, handleBoardStateJson());
        break;
      case "playersJson":
        respond(id, handlePlayersJson());
        break;
      case "variantConfigJson":
        respond(id, handleVariantConfigJson());
        break;
      case "stateJson":
        respond(id, handleStateJson());
        break;
      default:
        respondError(id, `Unknown message type: ${type}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    respondError(id, message);
  }
};
