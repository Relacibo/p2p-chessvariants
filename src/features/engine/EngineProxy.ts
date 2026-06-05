/**
 * Promise-based proxy to the WASM engine running in a Web Worker.
 * Every call is async — zero main-thread blocking.
 *
 * Progressive Phase 2 after submitAction:
 *   1. "valid_moves" — local player's moves, delivered ASAP via onValidMoves
 *   2. "game_over"  — full validMoves + game_over, delivered via onGameOver
 */

import EngineWorker from "./engineWorker.ts?worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resolve = (v: any) => void;
type Reject  = (e: Error) => void;

interface WorkerMsg {
  id: number;
  _phase?: "valid_moves" | "game_over";
  result?: unknown;
  error?: string;
}

export interface ValidMovesPayload {
  valid_moves: {
    player: number;
    moves: unknown[];
  };
}

export interface GameOverPayload {
  valid_moves: unknown[];
  game_over: unknown;
}

export class EngineProxy {
  private readonly worker: Worker;
  private pending = new Map<number, { resolve: Resolve; reject: Reject }>();
  private seq = 0;
  /** Called when local player's validMoves are ready (Phase 2a). */
  public onValidMoves: ((payload: ValidMovesPayload) => void) | null = null;
  /** Called after all validMoves + is_game_over computed (Phase 2b+c). */
  public onGameOver: ((payload: GameOverPayload) => void) | null = null;

  constructor() {
    this.worker = new EngineWorker();

    this.worker.onmessage = ({ data }: MessageEvent<WorkerMsg>) => {
      const msg = data as WorkerMsg;

      // Phase 2a — local player's valid_moves, fast path
      if (msg._phase === "valid_moves") {
        this.onValidMoves?.(msg.result as ValidMovesPayload);
        return;
      }

      // Phase 2b+c — game over result with full validMoves
      if (msg._phase === "game_over") {
        this.onGameOver?.(msg.result as GameOverPayload);
        return;
      }

      // Normal request-response
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);

      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    };

    this.worker.onerror = (ev: ErrorEvent) => {
      const e = new Error(ev.message || "Engine worker error");
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    };
  }

  private call<T>(type: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.seq++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  init(script: string, playerCount: number, setupJson?: string) {
    return this.call<{
      board_state: unknown;
      valid_moves: unknown[];
      game_over: unknown;
      players: unknown[];
      variant_config: unknown;
    }>("init", { script, playerCount, setupJson });
  }

  /**
   * Phase 1 resolves with board_state, ui, game_over, state_json, players.
   * Phase 2a → this.onValidMoves  (local player's moves)
   * Phase 2c → this.onGameOver    (all moves + game_over result)
   */
  submitAction(player: string, actionJson: string, localPlayer: string) {
    return this.call<{
      ui: unknown; game_over: unknown;
      board_state: unknown; state_json: unknown;
      players: unknown[];
      error?: string;
    }>("submitAction", { player, actionJson, localPlayer });
  }

  validMovesJson()  { return this.call<unknown>("validMovesJson"); }
  deriveUiJson(p: string){ return this.call<{ ui: unknown }>("deriveUiJson", { player: p }); }
  boardStateJson()    { return this.call<unknown>("boardStateJson"); }
  playersJson()       { return this.call<unknown[]>("playersJson"); }
  variantConfigJson() { return this.call<unknown>("variantConfigJson"); }
  stateJson()         { return this.call<unknown>("stateJson"); }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
