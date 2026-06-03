import {
  ActionIcon,
  Box,
  Button,
  Combobox,
  Group,
  InputBase,
  Loader,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useCombobox } from "@mantine/core";
import {
  IconBrandGithub,
  IconPlayerSkipBack,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EngineProxy } from "../engine/EngineProxy";
import { PixiChessboard as Chessboard } from "../chessboard/PixiChessboard";
import useConfigureLayout from "../layout/hooks";
import style from "./DevBoardView.module.css";
import {
  BoardOrientation,
  PendingMove,
  PlayerRef,
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmPlayerConfig,
  WasmPlayerMoves,
  WasmUiMap,
  WasmVariantConfig,
} from "../chessboard/types";
import { useSelector } from "../../app/hooks";
import { selectAllVariants, VariantEntry } from "../lobby/variantsSlice";
import {
  fetchScriptText,
  getGithubBrowseUrl,
} from "../lobby/scriptUrl";

// ─── Log entry ───────────────────────────────────────────────────────────────

type LogAction =
  | { kind: "move"; action: WasmAction & { type: "move" } }
  | { kind: "ui"; elementId: string; piece?: WasmPiece };

interface LogEntry {
  id: number;
  timestamp: string;
  player: string;
  action: LogAction;
}

let logSeq = 0;

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    // Try meaningful toString (not the default [object Object])
    if (typeof obj.toString === "function" &&
        obj.toString !== Object.prototype.toString) {
      return obj.toString();
    }
  }
  try { return JSON.stringify(e, null, 2); } catch { return String(e); }
}

/** Determine which selected player should act based on the piece being moved. */
function getActingPlayer(
  action: WasmAction,
  boardState: WasmBoardState,
  selectedPlayers: string[],
): string | null {
  if (action.type === "move" && action.from.type === "board") {
    const { row, col, boardIndex } = action.from;
    const board = boardState.boards[boardIndex];
    if (board) {
      const idx = row * boardState.cols + col;
      const piece = board[idx];
      if (piece) {
        const found = selectedPlayers.find((p) => {
          try {
            const ref = JSON.parse(p) as PlayerRef;
            return (
              ref.board === boardIndex &&
              ref.color === piece.color
            );
          } catch {
            return false;
          }
        });
        if (found) return found;
      }
    }
  }
  return selectedPlayers[0] ?? null;
}

// ─── URL State (single JSON query param) ─────────────────────────────────────
interface UrlState {
  script?: string;
  n?: number;
  sel?: string[];
  panel?: number;
}

function readUrlState(sp: URLSearchParams): UrlState {
  const raw = sp.get("dev");
  if (!raw) return {};
  try { return JSON.parse(raw) as UrlState; } catch { return {}; }
}

function encodeUrlState(s: UrlState): string {
  return JSON.stringify(s);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DevBoardView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const [searchParams, setSearchParams] = useSearchParams();
  const variants = useSelector(selectAllVariants);
  const combobox = useCombobox();

  const initUrl = useMemo(() => readUrlState(searchParams), []);

  const [search, setSearch] = useState("");

  const [drawerOpen, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(initUrl.panel === 1);

  const [selectedVariant, setSelectedVariant] = useState<VariantEntry | null>(
    null
  );
  const [playerCount, setPlayerCount] = useState<number | string>(
    () => initUrl.n ?? 2
  );
  // controllingPlayer is the primary player for submit/sync (first of selectedPlayers).
  const [controllingPlayer, setControllingPlayer] = useState<string>(
    () => initUrl.sel?.[0] ?? ""
  );
  const [activePlayers, setActivePlayers] = useState<PlayerRef[]>([]);
  const [allPlayers, setAllPlayers] = useState<WasmPlayerConfig[]>([]);
  // selectedPlayers persisted in URL state
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(
    () => initUrl.sel ?? []
  );
  const [localOrientationOverride, setLocalOrientationOverride] = useState<
    Partial<Record<number, BoardOrientation>>
  >({});

  const proxyRef = useRef<EngineProxy | null>(null);
  const lastLoadedUrl = useRef<string | null>(null);
  const [variantConfig, setVariantConfig] = useState<WasmVariantConfig | null>(
    null
  );
  const [boardState, setBoardState] = useState<WasmBoardState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [validMoves, setValidMoves] = useState<WasmAction[]>([]);

  const [validMovesAll, setValidMovesAll] = useState<WasmPlayerMoves[]>([]);

  const [uiElements, setUiElements] = useState<WasmUiMap | null>(null);
  const [lastAction, setLastAction] = useState<WasmAction | undefined>();
  const [selectedDropPiece, setSelectedDropPiece] = useState<WasmPiece | null>(
    null
  );
  const [log, setLog] = useState<LogEntry[]>([]);
  const [gameStateJson, setGameStateJson] = useState<object | null>(null);
  const [showGameState, setShowGameState] = useState(false);
  const [showActionLog, setShowActionLog] = useState(false);
  const [validMovesJsonStr, setValidMovesJsonStr] = useState<string | null>(null);
  const [showValidMoves, setShowValidMoves] = useState(false);
  const [gameOver, setGameOver] = useState<{
    type: "winner" | "winners" | "draw";
    player?: number;
    players?: number[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Derive board index and orientation from the controlling player's full identity.
  const playerRef = useMemo((): PlayerRef | null => {
    if (!controllingPlayer) return null;
    try { return JSON.parse(controllingPlayer) as PlayerRef; }
    catch { return null; }
  }, [controllingPlayer]);
  const currentBoardIndex = playerRef?.board ?? 0;

  // Derive board indices for all selected controlling players (drag permissions).
  const activeBoardIndices = useMemo((): number[] => {
    if (selectedPlayers.length === 0) return [currentBoardIndex];
    const boards = new Set<number>();
    for (const p of selectedPlayers) {
      try {
        const ref = JSON.parse(p) as PlayerRef;
        if (ref.board != null) boards.add(ref.board);
      } catch {
        /* malformed JSON — skip */
      }
    }
    return boards.size > 0 ? [...boards] : [currentBoardIndex];
  }, [selectedPlayers, currentBoardIndex]);

  // Derive per-slot orientation: selected player's team perspective.
  const orientationByBoard = useMemo((): BoardOrientation[] => {
    const count = variantConfig?.board.count ?? 1;
    const arr = new Array<BoardOrientation>(count).fill("normal");
    const covered = new Set<number>();

    // Determine controlling team from first selected player
    let controllingTeam = 0;
    const firstSel = selectedPlayers[0];
    if (firstSel) {
      try {
        const ref = JSON.parse(firstSel) as PlayerRef;
        const cfg = allPlayers.find(p => p.board === (ref.board ?? 0) && p.color === (ref.color ?? ''));
        if (cfg) controllingTeam = cfg.team;
      } catch { /* skip */ }
    }

    // 1) For each board, find player with same team as controlling player
    for (const p of allPlayers) {
      if (covered.has(p.board)) continue;
      if (p.team === controllingTeam) {
        covered.add(p.board);
        arr[p.board] = p.orientation ?? "normal";
      }
    }

    // 2) Remaining boards: first player per board
    for (const p of allPlayers) {
      if (covered.has(p.board)) continue;
      covered.add(p.board);
      arr[p.board] = p.orientation ?? "normal";
    }

    // 3) Local overrides (rotate button) always win
    for (const [board, override] of Object.entries(localOrientationOverride)) {
      if (override) arr[Number(board)] = override;
    }

    return arr;
  }, [allPlayers, selectedPlayers, variantConfig?.board.count, localOrientationOverride]);

  // Collect unique orientations from all players + local overrides, sorted clockwise.
  const usedOrientations = useMemo((): BoardOrientation[] => {
    const clockwiseOrder: BoardOrientation[] = [
      "normal",
      "clockwise",
      "flipped",
      "counterclockwise",
    ];
    const unique = new Set<BoardOrientation>();
    for (const p of allPlayers) {
      unique.add(p.orientation ?? "normal");
    }
    for (const o of Object.values(localOrientationOverride)) {
      if (o) unique.add(o);
    }
    const sorted = clockwiseOrder.filter((o) => unique.has(o));
    return sorted.length > 0 ? sorted : ["normal"];
  }, [allPlayers, localOrientationOverride]);

  const handleRotateBoard = useCallback(
    (boardIndex: number) => {
      setLocalOrientationOverride((prev) => {
        const current =
          prev[boardIndex] ??
          allPlayers.find((p) => p.board === boardIndex)?.orientation ??
          "normal";
        const currentIdx = usedOrientations.indexOf(current);
        const nextIdx =
          currentIdx >= 0
            ? (currentIdx + 1) % usedOrientations.length
            : 0;
        return { ...prev, [boardIndex]: usedOrientations[nextIdx] };
      });
    },
    [allPlayers, usedOrientations],
  );

  // Union valid moves from all selected players for display.
  const displayValidMoves = useMemo((): WasmAction[] => {
    if (selectedPlayers.length <= 1) return validMoves;
    const selectedSet = new Set(selectedPlayers);
    const actions: WasmAction[] = [];
    for (const pm of validMovesAll) {
      const ref = JSON.stringify({
        board: pm.player.board,
        color: pm.player.color,
      });
      if (selectedSet.has(ref)) {
        actions.push(...pm.moves);
      }
    }
    return actions;
  }, [validMovesAll, selectedPlayers, validMoves]);

  // ── Container resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Sync state to URL as single JSON query param ──
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const urlState: UrlState = {};
    if (playerCount) urlState.n = typeof playerCount === "number" ? playerCount : parseInt(String(playerCount), 10) || 2;
    if (selectedVariant?.url) urlState.script = selectedVariant.url;
    if (selectedPlayers.length > 0) urlState.sel = selectedPlayers;
    urlState.panel = drawerOpen ? 1 : 0;

    next.set("dev", encodeUrlState(urlState));
    // Clean up old individual params
    next.delete("state");
    next.delete("script");
    next.delete("players");
    next.delete("player");
    next.delete("panel");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCount, selectedPlayers, drawerOpen, selectedVariant?.url]);

  // ── Bidirectional sync: selectedPlayers[0] ↔ controllingPlayer ──
  useEffect(() => {
    const primary = selectedPlayers[0] || "";
    if (primary && primary !== controllingPlayer) {
      setControllingPlayer(primary);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayers]);

  useEffect(() => {
    if (controllingPlayer && !selectedPlayers.includes(controllingPlayer)) {
      setSelectedPlayers((prev) => [...prev, controllingPlayer]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllingPlayer]);

  // Derive active players from valid_actions all (entries with non-empty actions)
  const deriveActivePlayers = useCallback(
    (allActions: WasmPlayerMoves[]): PlayerRef[] => {
      return allActions
        .filter((pa) => pa.moves.length > 0)
        .map((pa) => ({
          board: pa.player.board,
          color: pa.player.color,
          orientation: allPlayers.find(
            (ap) => ap.board === pa.player.board && ap.color === pa.player.color
          )?.orientation,
        }));
    },
    [allPlayers],
  );

  const syncState = useCallback(
    async (proxy: EngineProxy, player?: string) => {
      const p = player ?? controllingPlayer;
      const [boardState, allValid, allP] = await Promise.all([
        proxy.boardStateJson() as Promise<WasmBoardState>,
        proxy.validMovesJson() as Promise<WasmPlayerMoves[]>,
        proxy.playersJson() as Promise<WasmPlayerConfig[]>,
      ]);
      setBoardState(boardState);
      setValidMovesAll(allValid);
      setActivePlayers(deriveActivePlayers(allValid));
      setAllPlayers(allP);
      if (p) {
        const ref: PlayerRef = JSON.parse(p);
        const entry = allValid.find(pa =>
          pa.player.board === ref.board && pa.player.color === ref.color
        );
        setValidMoves(entry?.moves ?? []);
        const uiResult = await proxy.getUiJson(p) as { ui: WasmUiMap };
        const ui = (uiResult.ui ?? null) as WasmUiMap | null;
        setUiElements(ui);
      } else {
        setValidMoves([]);
        setUiElements(null);
      }
    },
    [controllingPlayer, deriveActivePlayers],
  );

  const addLogEntry = useCallback(
    (player: string, action: LogAction) => {
      const id = ++logSeq;
      setLog((prev) => [
        ...prev,
        {
          id,
          timestamp: new Date().toLocaleTimeString(),
          player,
          action,
        },
      ]);
    },
    []
  );

  const loadScript = useCallback(
    async (url: string, numPlayers: number) => {
      proxyRef.current?.terminate();
      proxyRef.current = null;
      notifications.clean();
      setLoading(true);
      setLog([]);
      setLastAction(undefined);
      setSelectedDropPiece(null);
      setVariantConfig(null);
      setBoardState(null);
      setValidMoves([]);
      setValidMovesAll([]);
      setUiElements(null);
      // Capture URL selection before clearing (it gets synced away)
      const urlPreselection = readUrlState(searchParams).sel;
      setSelectedPlayers([]);
      setLocalOrientationOverride({});
      try {
        const script = await fetchScriptText(url);
        const proxy = new EngineProxy();
        const init = await proxy.init(script, numPlayers);
        proxyRef.current = proxy;
        setVariantConfig(init.variantConfig as WasmVariantConfig);
        setBoardState(init.boardState as WasmBoardState);
        const initialValid = init.validMoves as WasmPlayerMoves[];
        setValidMovesAll(initialValid);
        const initPlayers = deriveActivePlayers(initialValid);
        const firstPlayer = initPlayers[0] ? JSON.stringify(initPlayers[0]) : "";
        setControllingPlayer(firstPlayer);
        setActivePlayers(initPlayers);
        await syncState(proxy, firstPlayer);
        // Restore selected players: URL preselection wins over default "all"
        if (urlPreselection && urlPreselection.length > 0) {
          setSelectedPlayers(urlPreselection);
        } else {
          // No URL selection — default to all players
          try {
            const allP = (await proxy.playersJson()) as WasmPlayerConfig[];
            setSelectedPlayers(
              allP.map((p) =>
                JSON.stringify({ board: p.board, color: p.color })
              )
            );
          } catch {
            setSelectedPlayers(firstPlayer ? [firstPlayer] : []);
          }
        }
      } catch (e: unknown) {
        notifications.show({
          title: "Load failed",
          message: extractErrorMessage(e),
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
    const scriptUrl = urlState.script;
    if (scriptUrl) {
      const variant = variants.find((v) => v.url === scriptUrl);
      if (variant) {
        setSelectedVariant(variant);
        if (lastLoadedUrl.current !== scriptUrl) {
          lastLoadedUrl.current = scriptUrl;
          loadScript(scriptUrl, urlState.n ?? 2);
        }
        return;
      }
    }
    // Fallback: first variant or first official
    const first = variants[0];
    if (first && lastLoadedUrl.current !== first.url) {
      lastLoadedUrl.current = first.url;
      setSelectedVariant(first);
      loadScript(first.url, urlState.n ?? 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("dev")]);

  const handleVariantSelect = (url: string) => {
    const variant = variants.find((v) => v.url === url);
    if (variant) {
      setSelectedVariant(variant);
      combobox.closeDropdown();
    }
  };

  const handleLoad = () => {
    const url = selectedVariant?.url;
    if (!url) return;
    const n =
      typeof playerCount === "number"
        ? playerCount
        : parseInt(String(playerCount), 10) || 2;
    loadScript(url, n);
    closeDrawer();
  };

  // ── Register progressive Phase 2 callbacks on the current proxy ──
  useEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy) return;
    // Phase 2a: local player's valid_moves (fast, updates highlights)
    proxy.onValidMoves = (payload) => {
      const lm = payload.validMoves;
      setValidMoves((lm.moves ?? []) as WasmAction[]);
    };
    // Phase 2c: all validMoves for all players + game_over result
    proxy.onGameOver = (payload) => {
      const va = payload.validMoves as WasmPlayerMoves[];
      setValidMovesAll(va);
      setActivePlayers(deriveActivePlayers(va));
      if (payload.gameOver) {
        setGameOver(payload.gameOver as typeof gameOver);
      }
    };
    return () => {
      proxy.onValidMoves = null;
      proxy.onGameOver = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyRef.current, controllingPlayer]);

  // ── Submit an action via submitAction ──
  const handleSubmitAction = useCallback(
    async (action: WasmAction) => {
      const proxy = proxyRef.current;
      if (!proxy || selectedPlayers.length === 0) return;

      // Determine which player to act as (based on the piece being moved)
      const actor =
        boardState && selectedPlayers.length > 0
          ? getActingPlayer(action, boardState, selectedPlayers)
          : null;
      const actingPlayer = actor ?? controllingPlayer ?? selectedPlayers[0];
      if (!actingPlayer) return;

      try {
        // Phase 1: board state + ui + game_over — arrives immediately
        const result = await proxy.submitAction(
          actingPlayer,
          JSON.stringify(action),
          actingPlayer,
        );
        if (result.error) {
          notifications.show({
            title: "Action failed",
            message: extractErrorMessage(result.error),
            color: "red",
            withBorder: true,
            autoClose: false,
          });
          // Force a boardState identity change to clear optimistic prediction
          setBoardState(prev => prev ? { ...prev } : null);
          setPendingMove(null);
          return;
        }
        // ── Render board immediately ──
        setUiElements(result.ui as WasmUiMap);
        setLastAction(action);
        setSelectedDropPiece(null);
        // Clear optimistic prediction in the same batch as the real board state
        // so React renders them together (one Konva repaint instead of two).
        setPendingMove(null);
        if (result.board_state) setBoardState(result.board_state as WasmBoardState);
        const extra = result as unknown as Record<string, unknown>;
        if (extra.stateJson) setGameStateJson(extra.stateJson as object);
        if (extra.players) setAllPlayers(extra.players as WasmPlayerConfig[]);
        if (action.type === "move") {
          addLogEntry(actingPlayer, { kind: "move", action });
        } else if (action.type === "interact") {
          addLogEntry(actingPlayer, { kind: "ui", elementId: action.elementId });
        } else if (action.type === "select_piece") {
          addLogEntry(actingPlayer, { kind: "ui", elementId: "select_piece", piece: action.piece });
        } else if (action.type === "cancel") {
          addLogEntry(actingPlayer, { kind: "ui", elementId: "cancel" });
        }
        // Phase 2: valid_actions arrive asynchronously via proxy.onValidMoves
      } catch (e: unknown) {
        notifications.show({
          title: "Action failed",
          message: extractErrorMessage(e),
          color: "red",
          withBorder: true,
          autoClose: false,
        });
      }
    },
    [controllingPlayer, selectedPlayers, boardState, addLogEntry, deriveActivePlayers],
  );

  const filteredVariants = variants.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box ref={containerRef} className={style.container}>
      {/* ── Fullscreen Stage — board is centered inside it ── */}
      {loading && (
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
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

      {/* ── Piece selection is rendered inside the PixiJS board via get_ui ── */}

      {/* ── Dev gear button — only shown when drawer is closed (drawer has its own close X) ── */}
      {!drawerOpen && (
        <Tooltip label="Dev controls" position="left" withArrow>
          <ActionIcon
            variant="filled"
            color="dark"
            size="lg"
            radius="xl"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 200,
            }}
            onClick={openDrawer}
          >
            <IconSettings size="1.1rem" />
          </ActionIcon>
        </Tooltip>
      )}

      {/* ── Dev sidebar panel ── */}
      <Box
        style={{
          position: "absolute",
          top: 0,
          right: drawerOpen ? 0 : -350,
          width: 330,
          height: "100%",
          zIndex: 150,
          transition: "right 0.25s ease",
        }}
      >
        <Paper
          shadow="lg"
          withBorder
          style={{ height: "100%", borderRadius: 0, overflow: "hidden" }}
        >
          <ScrollArea h="100%" type="auto" offsetScrollbars>
            <Stack gap="md" p="md">
              <Group justify="space-between" align="center">
                <Text fw={600}>Dev controls</Text>
                <ActionIcon variant="subtle" size="sm" onClick={closeDrawer}>
                  <IconX size="0.9rem" />
                </ActionIcon>
              </Group>
              {/* Variant combobox — like the lobby */}
          <Combobox
            store={combobox}
            withinPortal={false}
            onOptionSubmit={handleVariantSelect}
          >
            <Combobox.Target>
              <InputBase
                component="button"
                type="button"
                pointer
                rightSection={<Text size="xs" c="dimmed">▼</Text>}
                onClick={() => combobox.toggleDropdown()}
                rightSectionPointerEvents="none"
                label="Variant"
                style={{ flex: 1 }}
              >
                {selectedVariant ? (
                  <Group justify="space-between" style={{ width: "100%" }}>
                    <Text size="sm">{selectedVariant.name}</Text>
                    <Tooltip label="View Source">
                      <ActionIcon
                        variant="transparent"
                        color="gray"
                        component="a"
                        href={getGithubBrowseUrl(selectedVariant.url)}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <IconBrandGithub size="1.2rem" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed">
                    Select a variant…
                  </Text>
                )}
              </InputBase>
            </Combobox.Target>

            <Combobox.Dropdown>
              <Combobox.Search
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search variants…"
              />
              <Combobox.Options>
                {filteredVariants.length === 0 ? (
                  <Combobox.Empty>No variants found</Combobox.Empty>
                ) : (
                  filteredVariants.map((item) => (
                    <Combobox.Option value={item.url} key={item.url}>
                      <Text size="sm">{item.name}</Text>
                    </Combobox.Option>
                  ))
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>

          <NumberInput
            label="Players"
            min={2}
            max={8}
            value={playerCount}
            onChange={setPlayerCount}
          />
          <Button
            leftSection={<IconPlayerSkipBack size="0.85rem" />}
            onClick={handleLoad}
            loading={loading}
            fullWidth
          >
            Load / Restart
          </Button>

          <MultiSelect
            label="Controlling players (local)"
            data={allPlayers.map((p) => ({
              value: JSON.stringify({ board: p.board, color: p.color }),
              label: `${p.color} ${p.board > 0 ? `(board ${p.board})` : ""}`,
            }))}
            value={selectedPlayers}
            onChange={(values) => setSelectedPlayers(values)}
            clearable
          />

          {/* ── Action Log (collapsible JSON) ── */}
          <Box>
            <Group
              justify="space-between"
              align="center"
              style={{ cursor: "pointer" }}
              onClick={() => setShowActionLog((s) => !s)}
            >
              <Group gap="xs">
                <Text size="sm" fw={600}>
                  Action Log
                </Text>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLog([]);
                  }}
                  title="Clear"
                >
                  <IconTrash size="0.85rem" />
                </ActionIcon>
              </Group>
              <Text size="xs" c="dimmed">
                {showActionLog ? "▼" : "▶"}
              </Text>
            </Group>
            {showActionLog && (
              <Box
                mt={4}
                style={{
                  minHeight: 60,
                  maxHeight: 300,
                  overflow: "auto",
                  resize: "vertical",
                  background: "#1a1b1e",
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                {log.length === 0 ? (
                  <Text size="xs" c="dimmed" fs="italic">
                    No actions yet.
                  </Text>
                ) : (
                  <Text
                    size="xs"
                    component="pre"
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      fontFamily: "monospace",
                      color: "#c9d1d9",
                    }}
                  >
                    {JSON.stringify(
                      [...log].reverse().map((entry) => ({
                        id: entry.id,
                        timestamp: entry.timestamp,
                        player: JSON.parse(entry.player),
                        action: entry.action,
                      })),
                      null,
                      2
                    )}
                  </Text>
                )}
              </Box>
            )}
          </Box>

          {/* ── Game State JSON (collapsible) ── */}
          <Box>
            <Group
              justify="space-between"
              align="center"
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (!showGameState && !gameStateJson) {
                  // Fetch on first expand
                  void proxyRef.current?.stateJson().then(v => {
                    setGameStateJson(v as object);
                  }).catch((e) => console.error("[dev] stateJson failed", e));
                }
                setShowGameState((s) => !s);
              }}
            >
              <Text size="sm" fw={600}>
                Game State
              </Text>
              <Text size="xs" c="dimmed">
                {showGameState ? "▼" : "▶"}
              </Text>
            </Group>
            {showGameState && gameStateJson && (
              <Box
                mt={4}
                style={{
                  minHeight: 80,
                  maxHeight: 400,
                  overflow: "auto",
                  resize: "vertical",
                  background: "#1a1b1e",
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Text
                  size="xs"
                  component="pre"
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    color: "#c9d1d9",
                  }}
                >
                  {JSON.stringify(gameStateJson, null, 2)}
                </Text>
              </Box>
            )}
          </Box>

          {/* ── Valid Actions JSON (collapsible) ── */}
          <Box mt="xs">
            <Group
              justify="space-between"
              align="center"
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (!showValidMoves && !validMovesJsonStr) {
                  // Fetch on first expand
                  void proxyRef.current?.validMovesJson().then(v => {
                    setValidMovesJsonStr(JSON.stringify(v, null, 2));
                  }).catch((e) => console.error("[dev] validMovesJson failed", e));
                }
                setShowValidMoves((s) => !s);
              }}
            >
              <Text size="sm" fw={600}>
                Valid Moves
              </Text>
              <Text size="xs" c="dimmed">
                {showValidMoves ? "▼" : "▶"}
              </Text>
            </Group>
            {showValidMoves && validMovesJsonStr && (
              <Box
                mt={4}
                style={{
                  minHeight: 80,
                  maxHeight: 400,
                  overflow: "auto",
                  resize: "vertical",
                  background: "#1a1b1e",
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Text
                  size="xs"
                  component="pre"
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    color: "#c9d1d9",
                  }}
                >
                  {(() => {
                    try {
                      return JSON.stringify(
                        JSON.parse(validMovesJsonStr),
                        null,
                        2
                      );
                    } catch {
                      return validMovesJsonStr;
                    }
                  })()}
                </Text>
              </Box>
            )}
          </Box>
            </Stack>
          </ScrollArea>
        </Paper>
      </Box>
    </Box>
  );
}

export default DevBoardView;
