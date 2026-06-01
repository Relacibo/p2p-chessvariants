/**
 * Promise-based proxy to the WASM engine running in a Web Worker.
 * Every call is async — zero main-thread blocking.
 *
 * Progressive Phase 2 after submitAction:
 *   1. "validMoves" — local player's moves, delivered ASAP via onValidMoves
 *   2. "gameOver"  — full validMoves + game_over, delivered via onGameOver
 */

import EngineWorker from "./engineWorker.ts?worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resolve = (v: any) => void;
type Reject  = (e: Error) => void;

interface WorkerMsg {
  id: number;
  _phase?: "validMoves" | "gameOver";
  result?: unknown;
  error?: string;
}

export interface ValidMovesPayload {
  validMoves: {
    player: { board: number; color: string; team: number };
    moves: unknown[];
  };
}

export interface GameOverPayload {
  validMoves: unknown[];
  gameOver: unknown;
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
      if (msg._phase === "validMoves") {
        this.onValidMoves?.(msg.result as ValidMovesPayload);
        return;
      }

      // Phase 2b+c — game over result with full validMoves
      if (msg._phase === "gameOver") {
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

  init(script: string, playerCount: number) {
    return this.call<{
      boardState: unknown;
      validMoves: unknown[];
      gameOver: unknown;
      players: unknown[];
      variantConfig: unknown;
    }>("init", { script, playerCount });
  }

  /**
   * Phase 1 resolves with board_state, ui, game_over, stateJson, players.
   * Phase 2a → this.onValidMoves  (local player's moves)
   * Phase 2c → this.onGameOver    (all moves + game_over result)
   */
  submitAction(player: string, actionJson: string, localPlayer: string) {
    return this.call<{
      ui: unknown; game_over: unknown;
      board_state: unknown; stateJson: unknown;
      players: unknown[];
      error?: string;
    }>("submitAction", { player, actionJson, localPlayer });
  }

  validMovesJson()  { return this.call<unknown>("validMovesJson"); }
  getUiJson(p: string){ return this.call<{ ui: unknown }>("getUiJson", { player: p }); }
  boardStateJson()    { return this.call<unknown>("boardStateJson"); }
  playersJson()       { return this.call<unknown[]>("playersJson"); }
  variantConfigJson() { return this.call<unknown>("variantConfigJson"); }
  stateJson()         { return this.call<unknown>("stateJson"); }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
