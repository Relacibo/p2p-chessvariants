/**
 * Promise-based proxy to the WASM engine running in a Web Worker.
 * Every call is async — zero main-thread blocking.
 *
 * submitAction uses a two-phase protocol:
 *   1. "board" — board_state + ui + game_over, returned immediately
 *   2. "validActions" — all valid actions, delivered via onValidActions callback
 */

import EngineWorker from "./engineWorker.ts?worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resolve = (v: any) => void;
type Reject  = (e: Error) => void;

interface WorkerMsg {
  id: number;
  _phase?: "board" | "validActions";
  result?: unknown;
  error?: string;
}

export class EngineProxy {
  private readonly worker: Worker;
  private pending = new Map<number, { resolve: Resolve; reject: Reject }>();
  private seq = 0;
  /** Called when validActions follow-up arrives after submitAction. */
  public onValidActions: ((allValid: unknown) => void) | null = null;

  constructor() {
    this.worker = new EngineWorker();

    this.worker.onmessage = ({ data }: MessageEvent<WorkerMsg>) => {
      const msg = data as WorkerMsg;

      // Phase 2 of submitAction — valid_actions computed, deliver to callback
      if (msg._phase === "validActions") {
        this.onValidActions?.(msg.result);
        return;
      }

      // Normal request-response (init, board phase, etc.)
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
      boardState: unknown; validActions: unknown;
      players: unknown; variantConfig: unknown;
    }>("init", { script, playerCount });
  }

  /**
   * Phase 1 resolves with board_state, ui, game_over.
   * Phase 2 (valid_actions) arrives via this.onValidActions.
   */
  submitAction(player: string, actionJson: string) {
    return this.call<{
      ui: unknown; game_over: unknown;
      board_state: unknown;
      error?: string;
    }>("submitAction", { player, actionJson });
  }

  validActionsJson()  { return this.call<unknown>("validActionsJson"); }
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
