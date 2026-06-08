import {
  Box,
  Button,
  Loader,
  Tooltip,
} from "@mantine/core";
import {
  IconCode,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PixiChessboard as Chessboard } from "../chessboard/PixiChessboard";
import useConfigureLayout from "../layout/hooks";
import {
  listLocalScripts,
  loadLocalScript,
} from "../variant-editor/localScripts";
import { useChessGame } from "../chessboard/useChessGame";
import style from "./DevBoardView.module.css";
import {
  BoardOrientation,
  PendingMove,
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmPlayerConfig,
  WasmPlayerMoves,
  WasmUiMap,
  WasmVariantConfig,
  getPlayerOrientation,
} from "../chessboard/types";
import { useSelector } from "../../app/hooks";
import {
  selectAllVariants,
  VariantEntry,
  OFFICIAL_VARIANTS,
} from "../lobby/variantsSlice";

// ─── Log entry ───────────────────────────────────────────────────────────────

type LogAction =
  | { kind: "move"; action: WasmAction & { type: "move" } }
  | { kind: "ui"; elementId: string; piece?: WasmPiece };

interface LogEntry {
  id: number;
  timestamp: string;
  player: number;
  action: LogAction;
}

let logSeq = 0;

/** Determine which selected player should act. Returns first selected player. */
function getActingPlayer(
  action: WasmAction,
  validMovesAll: WasmPlayerMoves[],
): string | null {
  const actionJson = JSON.stringify(action);
  for (const pm of validMovesAll) {
    if (pm.moves.some((m) => JSON.stringify(m) === actionJson)) {
      return String(pm.player);
    }
  }
  if (action.type === "select_piece" || action.type === "cancel") {
    const active = validMovesAll.find((pm) => pm.moves.length > 0);
    if (active) return String(active.player);
  }
  return null;
}

// ─── URL State (single JSON query param) ─────────────────────────────────────
interface UrlState {
  /** Script identifier */
  script?: string;
  n?: number;       // player count
  sel?: string[];   // selected player IDs
}

function readUrlState(sp: URLSearchParams): UrlState {
  const raw = sp.get("dev");
  if (!raw) return {};
  try { return JSON.parse(raw) as UrlState; }
  catch (e) { console.error("[DevBoardView] readUrlState parse failed", e); return {}; }
}

function encodeUrlState(s: UrlState): string {
  return JSON.stringify(s);
}

/**
 * Resolve a script identifier to either a fetchable URL or localStorage content.
 */
function resolveScript(
  scriptId: string,
  bundledVariants: VariantEntry[],
): { url: string } | { content: string } | null {
  if (!scriptId) return null;

  // localStorage
  if (scriptId.startsWith("local:")) {
    const name = scriptId.slice("local:".length);
    const content = loadLocalScript(name);
    return content ? { content } : null;
  }

  // Bundled name (case-insensitive)
  const lower = scriptId.toLowerCase();
  for (const v of OFFICIAL_VARIANTS) {
    if (v.name.toLowerCase() === lower || v.url === scriptId) return { url: v.url };
  }
  for (const v of bundledVariants) {
    if (v.name.toLowerCase() === lower || v.url === scriptId) return { url: v.url };
  }

  // Direct URL/path
  if (scriptId.startsWith("/") || scriptId.startsWith("http")) {
    return { url: scriptId };
  }

  return null;
}

function useCompositeVariants(): VariantEntry[] {
  const bundled = useSelector(selectAllVariants);
  return useMemo(() => {
    const seen = new Set(bundled.map((v) => v.url));
    const local = listLocalScripts().map((s) => ({
      name: `📝 ${s.name}`,
      url: `local:${s.name}`,
    }));
    const extras = local.filter((l) => !seen.has(l.url));
    return [...bundled, ...extras];
  }, [bundled]);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DevBoardView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const [searchParams, setSearchParams] = useSearchParams();
  const variants = useCompositeVariants();

  const initUrl = useMemo(() => readUrlState(searchParams), []);

  const [selectedVariant, setSelectedVariant] = useState<VariantEntry | null>(null);
  const [playerCount, setPlayerCount] = useState<number | string>(
    () => initUrl.n ?? 2,
  );
  const [controllingPlayer, setControllingPlayer] = useState<string>(
    () => initUrl.sel?.[0] ?? "",
  );

  // ── Engine state ──
  const {
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
    loadScript: loadScriptRaw,
    loadScriptContent: loadScriptContentRaw,
    handleSubmitAction: handleSubmitActionRaw,
  } = useChessGame();

  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(
    () => initUrl.sel ?? [],
  );
  const [localOrientationOverride, setLocalOrientationOverride] = useState<
    Partial<Record<number, BoardOrientation>>
  >({});

  const lastLoadedScriptId = useRef<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const editorPopupRef = useRef<Window | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Derive board index from the controlling player's moves
  const playerRef = useMemo((): number | null => {
    if (!controllingPlayer) return null;
    const pid = parseInt(controllingPlayer, 10);
    return isNaN(pid) ? null : pid;
  }, [controllingPlayer]);
  const currentBoardIndex = useMemo(() => {
    if (playerRef == null) return 0;
    const pm = validMovesAll.find((pm2) => pm2.player === playerRef);
    if (pm && pm.moves.length > 0) {
      const firstM = pm.moves[0] as unknown as { from: { type: string; board_index: number } };
      return firstM.from.board_index;
    }
    return 0;
  }, [playerRef, validMovesAll]);

  const activeBoardIndices = useMemo((): number[] => {
    if (selectedPlayers.length === 0) return [currentBoardIndex];
    const boards = new Set<number>();
    const selIds = new Set(selectedPlayers.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n)));
    for (const pm of validMovesAll) {
      if (selIds.has(pm.player) && pm.moves.length > 0) {
        for (const m of pm.moves) {
          const mv = m as unknown as { from: { type: string; board_index: number }; to: unknown };
          if (mv.from.type === "board") boards.add(mv.from.board_index);
          if (mv.to && (mv.to as { type: string }).type === "board") boards.add((mv.to as { board_index: number }).board_index);
        }
      }
    }
    return boards.size > 0 ? [...boards] : [currentBoardIndex];
  }, [selectedPlayers, currentBoardIndex, validMovesAll]);

  const orientationByBoard = useMemo((): BoardOrientation[] => {
    const count = variantConfig?.board.count ?? 1;
    const arr = new Array<BoardOrientation>(count).fill("normal");
    const covered = new Set<number>();
    let controllingTeam = 0;
    const firstSel = selectedPlayers[0];
    if (firstSel) {
      const pid = parseInt(firstSel, 10);
      if (!isNaN(pid)) {
        const cfg = allPlayers.find((p) => p.id === pid);
        if (cfg) controllingTeam = cfg.team;
      }
    }
    for (const p of allPlayers) {
      const b = p.home_board ?? 0;
      if (covered.has(b)) continue;
      if (p.team === controllingTeam) { covered.add(b); arr[b] = getPlayerOrientation(p, b); }
    }
    for (const p of allPlayers) {
      const b = p.home_board ?? 0;
      if (covered.has(b)) continue;
      covered.add(b); arr[b] = getPlayerOrientation(p, b);
    }
    for (const [board, override] of Object.entries(localOrientationOverride)) {
      if (override) arr[Number(board)] = override;
    }
    return arr;
  }, [allPlayers, selectedPlayers, variantConfig?.board.count, localOrientationOverride]);

  const usedOrientations = useMemo((): BoardOrientation[] => {
    const clockwiseOrder: BoardOrientation[] = ["normal", "clockwise", "flipped", "counterclockwise"];
    const unique = new Set<BoardOrientation>();
    for (const p of allPlayers) unique.add(getPlayerOrientation(p, p.home_board ?? 0));
    for (const o of Object.values(localOrientationOverride)) { if (o) unique.add(o); }
    const sorted = clockwiseOrder.filter((o) => unique.has(o));
    return sorted.length > 0 ? sorted : ["normal"];
  }, [allPlayers, localOrientationOverride]);

  const handleRotateBoard = useCallback(
    (boardIndex: number) => {
      setLocalOrientationOverride((prev) => {
        const current = prev[boardIndex] ?? allPlayers.find((p) => p.home_board === boardIndex)?.orientations.find((o) => o.board === boardIndex)?.orientation ?? "normal";
        const currentIdx = usedOrientations.indexOf(current);
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % usedOrientations.length : 0;
        return { ...prev, [boardIndex]: usedOrientations[nextIdx] };
      });
    },
    [allPlayers, usedOrientations],
  );

  const displayValidMoves = useMemo((): WasmAction[] => {
    if (selectedPlayers.length <= 1) return validMoves;
    const selectedSet = new Set(selectedPlayers.map(Number));
    const actions: WasmAction[] = [];
    for (const pm of validMovesAll) {
      if (selectedSet.has(pm.player)) actions.push(...pm.moves);
    }
    return actions;
  }, [validMovesAll, selectedPlayers, validMoves]);

  // ── Container resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Sync state to URL ──
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const urlState: UrlState = {};
    if (playerCount) urlState.n = typeof playerCount === "number" ? playerCount : parseInt(String(playerCount), 10) || 2;
    if (selectedVariant?.url) urlState.script = selectedVariant.url;
    if (selectedPlayers.length > 0) urlState.sel = selectedPlayers;

    next.set("dev", encodeUrlState(urlState));
    next.delete("state"); next.delete("script"); next.delete("players");
    next.delete("player"); next.delete("panel");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCount, selectedPlayers, selectedVariant?.url]);

  // ── Bidirectional sync: selectedPlayers[0] ↔ controllingPlayer ──
  useEffect(() => {
    const primary = selectedPlayers[0] || "";
    if (primary && primary !== controllingPlayer) setControllingPlayer(primary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayers]);

  useEffect(() => {
    if (controllingPlayer && !selectedPlayers.includes(controllingPlayer)) {
      setSelectedPlayers((prev) => [...prev, controllingPlayer]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllingPlayer]);

  // ── Logging ──
  const addLogEntry = useCallback(
    (playerId: number, action: LogAction) => {
      const id = ++logSeq;
      setLog((prev) => [...prev, { id, timestamp: new Date().toLocaleTimeString(), player: playerId, action }]);
    },
    [],
  );

  // ── loadScript ──
  const loadScriptById = useCallback(
    async (scriptId: string, numPlayers: number) => {
      setLog([]);
      setLocalOrientationOverride({});
      const urlPreselection = readUrlState(searchParams).sel;
      const resolved = resolveScript(scriptId, variants);

      if (!resolved) {
        console.error("[DevBoardView] cannot resolve script:", scriptId);
        return;
      }

      if ("content" in resolved) {
        await loadScriptContentRaw(resolved.content, numPlayers);
      } else {
        await loadScriptRaw(resolved.url, numPlayers);
      }
      await restorePlayersAfterLoad(urlPreselection);
    },
    [loadScriptRaw, loadScriptContentRaw, proxyRef, searchParams, variants],
  );

  const restorePlayersAfterLoad = useCallback(
    async (urlPreselection?: string[]) => {
      const proxy = proxyRef.current;
      if (!proxy) return;
      const [allValid, allP] = await Promise.all([
        proxy.validMovesJson() as Promise<WasmPlayerMoves[]>,
        proxy.playersJson() as Promise<WasmPlayerConfig[]>,
      ]);
      const active = allValid.filter((pa) => pa.moves.length > 0).map((pa) => pa.player);
      if (active.length > 0) setControllingPlayer(String(active[0]));
      if (urlPreselection && urlPreselection.length > 0) {
        const idSet = new Set(urlPreselection.map(Number));
        const restored = allP.filter((p) => idSet.has(p.id)).map((p) => String(p.id));
        setSelectedPlayers(restored.length > 0 ? restored : urlPreselection);
      } else {
        setSelectedPlayers(allP.map((p) => String(p.id)));
      }
    },
    [proxyRef],
  );

  // ── Test handler — from editor popup (postMessage) ──
  const handleEditorTest = useCallback(
    (script: string) => {
      const n = typeof playerCount === "number" ? playerCount : (Number(playerCount) || 2);
      setLog([]);
      setLocalOrientationOverride({});
      loadScriptContentRaw(script, n).then(() => restorePlayersAfterLoad());
    },
    [loadScriptContentRaw, playerCount, proxyRef, restorePlayersAfterLoad],
  );

  // ── Listen for postMessage from editor popup ──
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      // Test script from editor
      if (event.data?.type === "test-script" && typeof event.data?.script === "string") {
        handleEditorTest(event.data.script);
        return;
      }

      // Load variant + player count (from editor Test button or pop-up)
      if (event.data?.type === "load-variant" && typeof event.data?.url === "string") {
        const n = typeof event.data?.players === "number" ? event.data.players : 2;
        if (event.data.script) {
          // Content-based (editor Test with saved script)
          setSelectedVariant({ name: "Editor Test", url: event.data.url });
          setLog([]);
          setLocalOrientationOverride({});
          loadScriptContentRaw(event.data.script, n).then(() => restorePlayersAfterLoad());
        } else {
          const v = variants.find((v2) => v2.url === event.data.url);
          if (v) setSelectedVariant(v);
          else setSelectedVariant({ name: event.data.url, url: event.data.url });
          loadScriptById(event.data.url, n);
        }
        return;
      }

      // Set controlling players
      if (event.data?.type === "set-controlling-players" && Array.isArray(event.data?.players)) {
        setSelectedPlayers(event.data.players);
        return;
      }

      // Editor script identity changed — sync URL without reloading
      if (event.data?.type === "editor-script-change") {
        const tmpl = event.data?.template as string | null;
        const name = String(event.data?.name ?? "");
        if (tmpl && tmpl !== "__empty__") {
          const v = variants.find((v2) => v2.url === tmpl);
          if (v) setSelectedVariant(v);
          else if (tmpl.startsWith("local:")) setSelectedVariant({ name: tmpl, url: tmpl });
        } else if (name) {
          setSelectedVariant({ name, url: `local:${name}` });
        } else {
          setSelectedVariant(null);
        }
        return;
      }

      // Request game state
      if (event.data?.type === "request-state" && editorPopupRef.current) {
        void proxyRef.current?.stateJson().then((v) => {
          editorPopupRef.current?.postMessage(
            { type: "debug-data", data: { gameState: v } },
            window.location.origin,
          );
        }).catch((e) => console.error("[dev] stateJson failed", e));
        return;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [handleEditorTest, proxyRef, loadScriptById, loadScriptContentRaw, restorePlayersAfterLoad, variants]);

  // ── Send debug data to editor popup on every state change ──
  useEffect(() => {
    const popup = editorPopupRef.current;
    if (!popup || popup.closed) {
      editorPopupRef.current = null;
      return;
    }
    const logStr = JSON.stringify(
      [...log].reverse().map((entry) => ({ id: entry.id, timestamp: entry.timestamp, player: entry.player, action: entry.action })),
      null, 2,
    );
    const data: Record<string, unknown> = { actionLog: logStr };
    if (variantConfig) data.variantConfig = variantConfig;
    data.validMoves = validMovesAll.map((pm) => ({ player: pm.player, moves: pm.moves }));
    popup.postMessage({ type: "debug-data", data }, window.location.origin);
  }, [log, variantConfig, validMovesAll]);

  // ── Notify editor popup when engine state is ready ──
  useEffect(() => {
    const popup = editorPopupRef.current;
    if (!popup || popup.closed) { editorPopupRef.current = null; return; }
    if (!variantConfig || allPlayers.length === 0) return;
    popup.postMessage({
      type: "engine-loaded",
      variantName: selectedVariant?.name ?? "",
      variantUrl: selectedVariant?.url ?? "",
      playerCount: typeof playerCount === "number" ? playerCount : Number(playerCount) || 2,
      players: allPlayers.map((p) => ({ id: String(p.id), name: p.name ?? String(p.id) })),
      selectedPlayers,
    }, window.location.origin);
  }, [variantConfig, allPlayers, selectedVariant, playerCount, selectedPlayers]);

  // ── Sync when controlling player changes ──
  useEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy || !controllingPlayer) return;
    syncState(proxy, controllingPlayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllingPlayer]);

  // ── Mount: load from URL query param, or default to first variant ──
  useEffect(() => {
    const urlState = readUrlState(searchParams);
    const scriptId = urlState.script;
    if (scriptId) {
      const resolved = resolveScript(scriptId, variants);
      if (resolved && lastLoadedScriptId.current !== scriptId) {
        lastLoadedScriptId.current = scriptId;
        if ("url" in resolved) {
          const v = variants.find((v2) => v2.url === resolved.url);
          if (v) setSelectedVariant(v);
        } else {
          setSelectedVariant({ name: scriptId, url: scriptId });
        }
        loadScriptById(scriptId, urlState.n ?? 2);
      }
      return;
    }
    const first = variants[0];
    if (first && lastLoadedScriptId.current !== first.url) {
      lastLoadedScriptId.current = first.url;
      setSelectedVariant(first);
      loadScriptById(first.url, urlState.n ?? 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("dev")]);

  // ── Open editor in popup window ──
  const handleOpenEditor = () => {
    const popup = window.open("/dev/editor", "cv-editor-popout", "width=1300,height=900");
    if (popup) editorPopupRef.current = popup;
  };

  // ── Submit an action ──
  const handleSubmitAction = useCallback(
    async (action: WasmAction) => {
      const proxy = proxyRef.current;
      if (!proxy || selectedPlayers.length === 0) return;
      const actor = validMovesAll.length > 0 ? getActingPlayer(action, validMovesAll) : null;
      const actingPlayer = actor ?? controllingPlayer ?? selectedPlayers[0];
      if (!actingPlayer) return;
      const actingPlayerId = parseInt(actingPlayer, 10) || -1;
      if (action.type === "move") {
        addLogEntry(actingPlayerId, { kind: "move", action });
      } else if (action.type === "interact") {
        addLogEntry(actingPlayerId, { kind: "ui", elementId: action.element_id });
      } else if (action.type === "select_piece") {
        addLogEntry(actingPlayerId, { kind: "ui", elementId: "select_piece", piece: action.piece });
      } else if (action.type === "cancel") {
        addLogEntry(actingPlayerId, { kind: "ui", elementId: "cancel" });
      }
      await handleSubmitActionRaw(actingPlayer, action);
    },
    [proxyRef, selectedPlayers, allPlayers, controllingPlayer, validMovesAll, addLogEntry, handleSubmitActionRaw],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box ref={containerRef} className={style.container}>

      {/* ── Board area (fills entire space) ── */}
      <Box style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loading && (
          <Box style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Loader />
          </Box>
        )}
        {!loading && boardState && variantConfig && containerSize.w > 0 && containerSize.h > 0 && (
          <Chessboard
            variantConfig={variantConfig}
            boardState={boardState}
            validMoves={displayValidMoves}
            activeBoardIndex={currentBoardIndex}
            activeBoardIndices={activeBoardIndices}
            orientationByBoard={orientationByBoard}
            onRotateBoard={handleRotateBoard}
            onReturnHome={() => setLocalOrientationOverride({})}
            onSubmitAction={handleSubmitAction}
            lastAction={lastAction}
            selectedDropPiece={selectedDropPiece}
            onClearDropPiece={() => setSelectedDropPiece(null)}
            onSelectReservePiece={(piece) => setSelectedDropPiece(piece)}
            uiMap={uiElements ?? {}}
            stageWidth={containerSize.w}
            stageHeight={containerSize.h}
            pendingMove={pendingMove}
            onPendingMove={setPendingMove}
          />
        )}
      </Box>

      {/* ── Floating editor button ── */}
      <Tooltip label="Open editor & controls" position="left" withArrow>
        <Button
          variant="filled" color="dark" size="sm"
          style={{
            position: "absolute", bottom: 12, right: 12, zIndex: 200,
            borderRadius: 20, padding: "4px 12px",
          }}
          leftSection={<IconCode size="0.9rem" />}
          onClick={handleOpenEditor}
        >
          Editor
        </Button>
      </Tooltip>

    </Box>
  );
}

export default DevBoardView;
