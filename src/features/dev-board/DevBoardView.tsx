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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PixiChessboard as Chessboard } from "../chessboard/PixiChessboard";
import useConfigureLayout from "../layout/hooks";
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
} from "../chessboard/types";
import { useSelector } from "../../app/hooks";
import { selectAllVariants, VariantEntry } from "../lobby/variantsSlice";
import { getGithubBrowseUrl } from "../lobby/scriptUrl";

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
  _action: WasmAction,
  _boardState: WasmBoardState,
  selectedPlayers: string[],
): string | null {
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
  try { return JSON.parse(raw) as UrlState; } catch (e) { console.error("[DevBoardView] readUrlState parse failed", e); return {}; }
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
  // ── Engine state managed by useChessGame hook ──
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
    handleSubmitAction: handleSubmitActionRaw,
  } = useChessGame();

  // selectedPlayers persisted in URL state
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(
    () => initUrl.sel ?? []
  );
  const [localOrientationOverride, setLocalOrientationOverride] = useState<
    Partial<Record<number, BoardOrientation>>
  >({});

  const lastLoadedUrl = useRef<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [gameStateJson, setGameStateJson] = useState<object | null>(null);
  const [showGameState, setShowGameState] = useState(false);
  const [showActionLog, setShowActionLog] = useState(false);
  const [validMovesJsonStr, setValidMovesJsonStr] = useState<string | null>(null);
  const [showValidMoves, setShowValidMoves] = useState(false);
  const [showVariantConfig, setShowVariantConfig] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Derive board index from the controlling player's moves in validMovesAll.
  const playerRef = useMemo((): number | null => {
    if (!controllingPlayer) return null;
    const pid = parseInt(controllingPlayer, 10);
    return isNaN(pid) ? null : pid;
  }, [controllingPlayer]);
  const currentBoardIndex = useMemo(() => {
    if (playerRef == null) return 0;
    const pm = validMovesAll.find(pm2 => pm2.player.id === playerRef);
    if (pm && pm.moves.length > 0) {
      const firstM = pm.moves[0] as unknown as { from: { type: string; boardIndex: number } };
      return firstM.from.boardIndex;
    }
    return 0;
  }, [playerRef, validMovesAll]);

  // Derive board indices for all selected controlling players (drag permissions).
  const activeBoardIndices = useMemo((): number[] => {
    if (selectedPlayers.length === 0) return [currentBoardIndex];
    const boards = new Set<number>();
    const selIds = new Set(selectedPlayers.map(s => parseInt(s, 10)).filter(n => !isNaN(n)));
    for (const pm of validMovesAll) {
      if (selIds.has(pm.player.id) && pm.moves.length > 0) {
        for (const m of pm.moves) {
          const mv = m as unknown as { from: { type: string; boardIndex: number }; to: unknown };
          if (mv.from.type === "board") boards.add(mv.from.boardIndex);
          if (mv.to && (mv.to as { type: string }).type === "board") boards.add((mv.to as { boardIndex: number }).boardIndex);
        }
      }
    }
    return boards.size > 0 ? [...boards] : [currentBoardIndex];
  }, [selectedPlayers, currentBoardIndex, validMovesAll]);

  // Derive per-slot orientation: selected player's team perspective.
  const orientationByBoard = useMemo((): BoardOrientation[] => {
    const count = variantConfig?.board.count ?? 1;
    const arr = new Array<BoardOrientation>(count).fill("normal");
    const covered = new Set<number>();

    // Determine controlling team from first selected player
    let controllingTeam = 0;
    const firstSel = selectedPlayers[0];
    if (firstSel) {
      const pid = parseInt(firstSel, 10);
      if (!isNaN(pid)) {
        const cfg = allPlayers.find(p => p.id === pid);
        if (cfg) controllingTeam = cfg.team;
      }
    }

    // 1) For each board, find player with same team as controlling player
    //    Use home_board to assign players to boards (each player has a home board)
    for (const p of allPlayers) {
      const b = p.home_board ?? 0;
      if (covered.has(b)) continue;
      if (p.team === controllingTeam) {
        covered.add(b);
        arr[b] = p.orientation ?? "normal";
      }
    }

    // 2) Remaining boards: first player whose home_board matches
    for (const p of allPlayers) {
      const b = p.home_board ?? 0;
      if (covered.has(b)) continue;
      covered.add(b);
      arr[b] = p.orientation ?? "normal";
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
          allPlayers.find((p) => p.home_board === boardIndex)?.orientation ??
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
    const selectedSet = new Set(selectedPlayers.map(Number));
    const actions: WasmAction[] = [];
    for (const pm of validMovesAll) {
      if (selectedSet.has(pm.player.id)) {
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
    if (selectedPlayers.length > 0) {
      // Store player IDs in URL
      urlState.sel = selectedPlayers;
    }
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
  }, [playerCount, selectedPlayers, drawerOpen, selectedVariant?.url, allPlayers]);

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

  // ── Logging ──
  const addLogEntry = useCallback(
    (playerId: number, action: LogAction) => {
      const id = ++logSeq;
      setLog((prev) => [
        ...prev,
        {
          id,
          timestamp: new Date().toLocaleTimeString(),
          player: playerId,
          action,
        },
      ]);
    },
    []
  );

  // ── loadScript: delegate to hook, then restore Dev-specific URL state ──
  const loadScript = useCallback(
    async (url: string, numPlayers: number) => {
      setLog([]);
      const urlPreselection = readUrlState(searchParams).sel;
      setLocalOrientationOverride({});
      await loadScriptRaw(url, numPlayers);

      // Restore selected players from URL + set controlling player
      const proxy = proxyRef.current;
      if (proxy) {
        const [allValid, allP] = await Promise.all([
          proxy.validMovesJson() as Promise<WasmPlayerMoves[]>,
          proxy.playersJson() as Promise<WasmPlayerConfig[]>,
        ]);
        // Set controllingPlayer to first active player's numeric ID
        const active = allValid
          .filter((pa) => pa.moves.length > 0)
          .map((pa) => pa.player.id);
        if (active.length > 0) {
          setControllingPlayer(String(active[0]));
        }
        // Restore selected players from URL
        if (urlPreselection && urlPreselection.length > 0) {
          const idSet = new Set(urlPreselection.map(Number));
          const restored = allP
            .filter((p) => idSet.has(p.id))
            .map((p) => String(p.id));
          setSelectedPlayers(restored.length > 0 ? restored : urlPreselection);
        } else {
          setSelectedPlayers(
            allP.map((p) => String(p.id))
          );
        }
      }
    },
    [loadScriptRaw, proxyRef, searchParams],
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

  // ── Submit an action: resolve actor → log → delegate to hook ──
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

      // Resolve acting player's numeric ID for logging
      const actingPlayerId = parseInt(actingPlayer, 10) || -1;

      // Optimistic log entries
      if (action.type === "move") {
        addLogEntry(actingPlayerId, { kind: "move", action });
      } else if (action.type === "interact") {
        addLogEntry(actingPlayerId, { kind: "ui", elementId: action.elementId });
      } else if (action.type === "select_piece") {
        addLogEntry(actingPlayerId, { kind: "ui", elementId: "select_piece", piece: action.piece });
      } else if (action.type === "cancel") {
        addLogEntry(actingPlayerId, { kind: "ui", elementId: "cancel" });
      }

      // Delegate engine interaction to the hook
      await handleSubmitActionRaw(actingPlayer, action);
    },
    [proxyRef, selectedPlayers, boardState, allPlayers, controllingPlayer, addLogEntry, handleSubmitActionRaw],
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

      {/* ── Piece selection is rendered inside the PixiJS board via derive_ui ── */}

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
              value: String(p.id),
              label: p.name || String(p.id),
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
                        player: entry.player,
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

          {/* ── Variant Config (collapsible) ── */}
          <Box mt="xs">
            <Group
              justify="space-between"
              align="center"
              style={{ cursor: "pointer" }}
              onClick={() => setShowVariantConfig((s) => !s)}
            >
              <Text size="sm" fw={600}>
                Variant Config
              </Text>
              <Text size="xs" c="dimmed">
                {showVariantConfig ? "▼" : "▶"}
              </Text>
            </Group>
            {showVariantConfig && variantConfig && (
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
                  {JSON.stringify(variantConfig, null, 2)}
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
                    const mapped = (v as WasmPlayerMoves[]).map(pm => ({
                      player: pm.player.id,
                      moves: pm.moves,
                    }));
                    setValidMovesJsonStr(JSON.stringify(mapped, null, 2));
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
                    } catch (e) {
                      console.error("[DevBoardView] validMoves prettify failed", e);
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
