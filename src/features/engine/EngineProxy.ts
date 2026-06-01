/**
 * Promise-based proxy to the WASM engine running in a Web Worker.
 * Every call is async — zero main-thread blocking.
 */

import EngineWorker from "./engineWorker.ts?worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resolve = (v: any) => void;
type Reject  = (e: Error) => void;

export class EngineProxy {
  private readonly worker: Worker;
  private pending = new Map<number, { resolve: Resolve; reject: Reject }>();
  private seq = 0;

  constructor() {
    this.worker = new EngineWorker();

    this.worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
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

  submitAction(player: string, actionJson: string) {
    return this.call<{
      ui: unknown; game_over: unknown;
      board_state: unknown; validActions: unknown;
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
