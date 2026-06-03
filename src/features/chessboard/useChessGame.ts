import { useCallback, useEffect, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { EngineProxy } from "../engine/EngineProxy";
import {
  PendingMove,
  PlayerRef,
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmPlayerConfig,
  WasmPlayerMoves,
  WasmUiMap,
  WasmVariantConfig,
} from "./types";
import { fetchScriptText } from "../lobby/scriptUrl";

export type GameOverResult = {
  type: "winner" | "winners" | "draw";
  player?: number;
  players?: number[];
};

export interface UseChessGameOptions {
  /** JSON-encoded PlayerRef for the local player whose valid moves / UI to show. */
  controllingPlayerRef?: string | null;
  /** Called after a local action is successfully submitted. Use to broadcast to peers. */
  onActionSubmitted?: (actorPlayerRef: string, action: WasmAction) => void;
}

export interface UseChessGameResult {
  proxyRef: React.MutableRefObject<EngineProxy | null>;
  boardState: WasmBoardState | null;
  validMoves: WasmAction[];
  validMovesAll: WasmPlayerMoves[];
  uiElements: WasmUiMap | null;
  allPlayers: WasmPlayerConfig[];
  activePlayers: PlayerRef[];
  gameOver: GameOverResult | null;
  pendingMove: PendingMove | null;
  selectedDropPiece: WasmPiece | null;
  lastAction: WasmAction | undefined;
  variantConfig: WasmVariantConfig | null;
  loading: boolean;
  setPendingMove: React.Dispatch<React.SetStateAction<PendingMove | null>>;
  setSelectedDropPiece: React.Dispatch<React.SetStateAction<WasmPiece | null>>;
  syncState: (proxy: EngineProxy, playerRefOverride?: string) => Promise<void>;
  loadScript: (url: string, numPlayers: number) => Promise<void>;
  /**
   * Submit a local action. `actorPlayerRef` is the JSON PlayerRef of the acting
   * player. After a successful submit the `onActionSubmitted` callback fires.
   */
  handleSubmitAction: (actorPlayerRef: string, action: WasmAction) => Promise<void>;
  /**
   * Apply an action submitted by a remote peer. Runs the engine step and syncs
   * local state, but does NOT call `onActionSubmitted`.
   */
  applyRemoteAction: (actorPlayerRef: string, action: WasmAction) => Promise<void>;
}

export function useChessGame(options: UseChessGameOptions = {}): UseChessGameResult {
  const { onActionSubmitted } = options;

  // Keep a ref so syncState / handleSubmitAction closures always see the latest value
  // without needing to be recreated.
  const controllingPlayerRefRef = useRef<string | null | undefined>(
    options.controllingPlayerRef,
  );
  useEffect(() => {
    controllingPlayerRefRef.current = options.controllingPlayerRef;
  }, [options.controllingPlayerRef]);

  const proxyRef = useRef<EngineProxy | null>(null);
  const [variantConfig, setVariantConfig] = useState<WasmVariantConfig | null>(null);
  const [boardState, setBoardState] = useState<WasmBoardState | null>(null);
  const [validMoves, setValidMoves] = useState<WasmAction[]>([]);
  const [validMovesAll, setValidMovesAll] = useState<WasmPlayerMoves[]>([]);
  const [uiElements, setUiElements] = useState<WasmUiMap | null>(null);
  const [allPlayers, setAllPlayers] = useState<WasmPlayerConfig[]>([]);
  const [activePlayers, setActivePlayers] = useState<PlayerRef[]>([]);
  const [gameOver, setGameOver] = useState<GameOverResult | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [selectedDropPiece, setSelectedDropPiece] = useState<WasmPiece | null>(null);
  const [lastAction, setLastAction] = useState<WasmAction | undefined>();
  const [loading, setLoading] = useState(false);

  // Keep allPlayers in a ref so deriveActivePlayers doesn't create stale closures.
  const allPlayersRef = useRef<WasmPlayerConfig[]>([]);
  useEffect(() => {
    allPlayersRef.current = allPlayers;
  }, [allPlayers]);

  const deriveActivePlayers = useCallback((allActions: WasmPlayerMoves[]): PlayerRef[] => {
    return allActions
      .filter((pa) => pa.moves.length > 0)
      .map((pa) => ({
        id: pa.player.id,
        orientation: allPlayersRef.current.find(
          (ap) => ap.id === pa.player.id,
        )?.orientation,
      }));
  }, []);

  const syncState = useCallback(
    async (proxy: EngineProxy, playerRefOverride?: string): Promise<void> => {
      const player = playerRefOverride ?? controllingPlayerRefRef.current ?? undefined;
      const [bs, allValid, allP] = await Promise.all([
        proxy.boardStateJson() as Promise<WasmBoardState>,
        proxy.validMovesJson() as Promise<WasmPlayerMoves[]>,
        proxy.playersJson() as Promise<WasmPlayerConfig[]>,
      ]);
      setBoardState(bs);
      setValidMovesAll(allValid);
      setActivePlayers(deriveActivePlayers(allValid));
      setAllPlayers(allP);
      if (player) {
        const pid: number = JSON.parse(player);
        const entry = allValid.find((pa) => pa.player.id === pid);
        setValidMoves(entry?.moves ?? []);
        const uiResult = (await proxy.deriveUiJson(player)) as { ui: WasmUiMap };
        setUiElements((uiResult.ui ?? null) as WasmUiMap | null);
      } else {
        setValidMoves([]);
        setUiElements(null);
      }
    },
    [deriveActivePlayers],
  );

  const loadScript = useCallback(
    async (url: string, numPlayers: number): Promise<void> => {
      proxyRef.current?.terminate();
      proxyRef.current = null;
      notifications.clean();
      setLoading(true);
      setLastAction(undefined);
      setSelectedDropPiece(null);
      setVariantConfig(null);
      setBoardState(null);
      setValidMoves([]);
      setValidMovesAll([]);
      setUiElements(null);
      setGameOver(null);
      setAllPlayers([]);
      setActivePlayers([]);
      try {
        const script = await fetchScriptText(url);
        const proxy = new EngineProxy();
        const init = await proxy.init(script, numPlayers);
        proxyRef.current = proxy;
        setVariantConfig(init.variantConfig as WasmVariantConfig);
        setBoardState(init.boardState as WasmBoardState);
        const initialValid = init.validMoves as WasmPlayerMoves[];
        setValidMovesAll(initialValid);
        setActivePlayers(deriveActivePlayers(initialValid));
        const firstPlayer = controllingPlayerRefRef.current
          ?? (deriveActivePlayers(initialValid)[0]
              ? JSON.stringify(deriveActivePlayers(initialValid)[0])
              : "");
        await syncState(proxy, firstPlayer || undefined);
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : JSON.stringify(e);
        notifications.show({
          title: "Load failed",
          message: msg,
          color: "red",
          withBorder: true,
          autoClose: false,
        });
      } finally {
        setLoading(false);
      }
    },
    [syncState, deriveActivePlayers],
  );

  // Register progressive Phase 2 callbacks whenever proxy changes.
  useEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy) return;
    proxy.onValidMoves = (payload) => {
      setValidMoves((payload.validMoves.moves ?? []) as WasmAction[]);
    };
    proxy.onGameOver = (payload) => {
      const va = payload.validMoves as WasmPlayerMoves[];
      setValidMovesAll(va);
      setActivePlayers(deriveActivePlayers(va));
      if (payload.gameOver) {
        setGameOver(payload.gameOver as GameOverResult);
      }
    };
    return () => {
      proxy.onValidMoves = null;
      proxy.onGameOver = null;
    };
  // Re-run when proxy is swapped (loadScript sets proxyRef.current synchronously).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyRef.current, deriveActivePlayers]);

  const handleSubmitAction = useCallback(
    async (actorPlayerRef: string, action: WasmAction): Promise<void> => {
      const proxy = proxyRef.current;
      if (!proxy) return;
      try {
        const result = await proxy.submitAction(
          actorPlayerRef,
          JSON.stringify(action),
          actorPlayerRef,
        );
        if (result.error) {
          const msg = String(result.error);
          notifications.show({
            title: "Action failed",
            message: msg,
            color: "red",
            withBorder: true,
            autoClose: false,
          });
          setBoardState((prev) => (prev ? { ...prev } : null));
          setPendingMove(null);
          return;
        }
        setUiElements(result.ui as WasmUiMap);
        setLastAction(action);
        setSelectedDropPiece(null);
        setPendingMove(null);
        if (result.board_state) setBoardState(result.board_state as WasmBoardState);
        const extra = result as unknown as Record<string, unknown>;
        if (extra.players) setAllPlayers(extra.players as WasmPlayerConfig[]);
        onActionSubmitted?.(actorPlayerRef, action);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        notifications.show({
          title: "Action failed",
          message: msg,
          color: "red",
          withBorder: true,
          autoClose: false,
        });
      }
    },
    [onActionSubmitted],
  );

  const applyRemoteAction = useCallback(
    async (actorPlayerRef: string, action: WasmAction): Promise<void> => {
      const proxy = proxyRef.current;
      if (!proxy) return;
      try {
        const localRef = controllingPlayerRefRef.current ?? actorPlayerRef;
        const result = await proxy.submitAction(
          actorPlayerRef,
          JSON.stringify(action),
          localRef,
        );
        if (result.error) {
          console.error("[useChessGame] remote action error", result.error);
          return;
        }
        if (result.board_state) setBoardState(result.board_state as WasmBoardState);
        setUiElements(result.ui as WasmUiMap);
        setLastAction(action);
        const extra = result as unknown as Record<string, unknown>;
        if (extra.players) setAllPlayers(extra.players as WasmPlayerConfig[]);
        // Sync valid moves for local player after remote move.
        await syncState(proxy);
      } catch (e: unknown) {
        console.error("[useChessGame] applyRemoteAction failed", e);
      }
    },
    [syncState],
  );

  return {
    proxyRef,
    boardState,
    validMoves,
    validMovesAll,
    uiElements,
    allPlayers,
    activePlayers,
    gameOver,
    pendingMove,
    selectedDropPiece,
    lastAction,
    variantConfig,
    loading,
    setPendingMove,
    setSelectedDropPiece,
    syncState,
    loadScript,
    handleSubmitAction,
    applyRemoteAction,
  };
}
