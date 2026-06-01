/**
 * Promise-based proxy to the WASM engine running in a Web Worker.
 * Every method is async — no main-thread blocking.
 */

// Matches the union in engineWorker.ts
type WorkerMessageType =
  | "init"
  | "submitAction"
  | "validActionsJson"
  | "getUiJson"
  | "boardStateJson"
  | "playersJson"
  | "variantConfigJson"
  | "stateJson";

interface PendingCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (value: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: (error: any) => void;
}

export class EngineProxy {
  private worker: Worker;
  private pending = new Map<number, PendingCall>();
  private nextId = 0;

  constructor() {
    this.worker = new Worker(
      new URL("./engineWorker.ts", import.meta.url),
      { type: "module" }
    );
    this.worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.error) {
        p.reject(new Error(data.error));
      } else {
        p.resolve(data.result);
      }
    };
    this.worker.onerror = (ev: ErrorEvent) => {
      // Worker-level errors — reject all pending calls
      const err = new Error(ev.message || "Engine worker error");
      for (const [, p] of this.pending) {
        p.reject(err);
      }
      this.pending.clear();
    };
  }

  private call<T = unknown>(
    type: WorkerMessageType,
    payload?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  /** Create a new engine instance in the Worker. */
  async init(script: string, playerCount: number) {
    return this.call<{
      boardState: unknown;
      validActions: unknown;
      players: unknown;
      variantConfig: unknown;
    }>("init", { script, playerCount });
  }

  /** Submit an action. Returns ui, game_over, valid_actions, and board_state. */
  async submitAction(
    player: string,
    actionJson: string
  ) {
    return this.call<{
      ui: unknown;
      game_over: unknown;
      validActions: unknown;
      boardState: unknown;
    }>("submitAction", { player, actionJson });
  }

  /** Fetch valid actions for all players. */
  async validActionsJson() {
    return this.call<unknown>("validActionsJson");
  }

  /** Fetch UI for a specific player. */
  async getUiJson(player: string) {
    return this.call<{ ui: unknown }>("getUiJson", { player });
  }

  /** Fetch current board state. */
  async boardStateJson() {
    return this.call<unknown>("boardStateJson");
  }

  /** Fetch players list. */
  async playersJson() {
    return this.call<unknown[]>("playersJson");
  }

  /** Fetch variant config. */
  async variantConfigJson() {
    return this.call<unknown>("variantConfigJson");
  }

  /** Fetch full game state as JSON. */
  async stateJson() {
    return this.call<unknown>("stateJson");
  }

  /** Terminate the worker (cleanup). */
  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
