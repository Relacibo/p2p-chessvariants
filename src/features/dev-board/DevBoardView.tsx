import {
  ActionIcon,
  Badge,
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
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EngineProxy } from "../engine/EngineProxy";
import { PixiChessboard as Chessboard } from "../chessboard/PixiChessboard";
import { PieceSelectionDialog } from "../chessboard/PieceSelectionDialog";
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
  decodeScriptUrl,
  encodeScriptUrl,
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
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  try { return JSON.stringify(e); } catch { return String(e); }
}

function coordsLabel(c: WasmAction & { from?: unknown; to?: unknown }): string {
  if ("from" in c && c.from && typeof c.from === "object") {
    const f = c.from as { type?: string; row?: number; col?: number; index?: number };
    if (f.type === "board") return `(${f.row},${f.col})`;
    return `reserve[${f.index}]`;
  }
  return "?";
}

function actionLabel(a: LogAction): string {
  if (a.kind === "move" && a.action.type === "move" && a.action.from && a.action.to)
    return `move ${coordsLabel(a.action as unknown as WasmAction & { from: unknown; to: unknown })}→${(() => {
      const t = a.action.to as { type?: string; row?: number; col?: number };
      if (t.type === "board") return `(${t.row},${t.col})`;
      return `?`;
    })()}`;
  if (a.kind === "ui") {
    const pieceStr = a.piece
      ? ` (${a.piece.color} ${a.piece.pieceType})`
      : "";
    return `ui:${a.elementId}${pieceStr}`;
  }
  return "?";
}

const PLAYER_BADGE_COLORS = ["gray", "dark", "red", "blue"] as const;

const ORIENTATION_CYCLE: BoardOrientation[] = [
  "normal",
  "clockwise",
  "flipped",
  "counterclockwise",
];

function nextOrientation(orientation: BoardOrientation): BoardOrientation {
  const idx = ORIENTATION_CYCLE.indexOf(orientation);
  return ORIENTATION_CYCLE[(idx + 1) % ORIENTATION_CYCLE.length];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DevBoardView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const navigate = useNavigate();
  const { scriptUrl: encodedParam } = useParams<{ scriptUrl?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const variants = useSelector(selectAllVariants);
  const combobox = useCombobox();

  const [search, setSearch] = useState("");

  const [drawerOpen, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(searchParams.get("panel") === "1");

  const [selectedVariant, setSelectedVariant] = useState<VariantEntry | null>(
    null
  );
  const [playerCount, setPlayerCount] = useState<number | string>(
    () => parseInt(searchParams.get("players") || "2", 10) || 2
  );
  // controllingPlayer is stored as a JSON string: '{"board":0,"color":"white"}'
  const [controllingPlayer, setControllingPlayer] = useState<string>(
    () => searchParams.get("player") || ""
  );
  const [activePlayers, setActivePlayers] = useState<PlayerRef[]>([]);
  const [allPlayers, setAllPlayers] = useState<WasmPlayerConfig[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [localOrientationOverride, setLocalOrientationOverride] = useState<
    Partial<Record<number, BoardOrientation>>
  >({});

  const proxyRef = useRef<EngineProxy | null>(null);
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
        boards.add(ref.board);
      } catch {
        /* malformed JSON — skip */
      }
    }
    return boards.size > 0 ? [...boards] : [currentBoardIndex];
  }, [selectedPlayers, currentBoardIndex]);

  // Derive per-slot orientation from engine players + local overrides.
  const orientationByBoard = useMemo((): BoardOrientation[] => {
    const count = variantConfig?.board.count ?? 1;
    const arr = new Array<BoardOrientation>(count).fill("normal");
    for (const p of allPlayers) {
      const override = localOrientationOverride[p.board];
      arr[p.board] = override ?? p.orientation ?? "normal";
    }
    return arr;
  }, [allPlayers, variantConfig?.board.count, localOrientationOverride]);

  // Rotate button cycles through all 4 orientations for the active board.
  const handleRotateBoard = useCallback(
    (boardIndex: number) => {
      setLocalOrientationOverride((prev) => {
        const current =
          prev[boardIndex] ??
          allPlayers.find((p) => p.board === boardIndex)?.orientation ??
          "normal";
        const next = nextOrientation(current);
        return { ...prev, [boardIndex]: next };
      });
    },
    [allPlayers],
  );

  // Determine if a piece selection dialog should be shown
  const selectablePieces = useMemo(() => {
    return validMoves
      .filter((a): a is WasmAction & { type: "select_piece" } => a.type === "select_piece")
      .map((a) => a.piece);
  }, [validMoves]);

  const hasCancel = useMemo(
    () => validMoves.some((a) => a.type === "cancel"),
    [validMoves],
  );

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

  // ── Sync state to URL search params ──
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (playerCount) next.set("players", String(playerCount));
    if (controllingPlayer) next.set("player", controllingPlayer);
    else next.delete("player");
    next.set("panel", drawerOpen ? "1" : "0");
    setSearchParams(next, { replace: true });
    // Don't run on mount — only when values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCount, controllingPlayer, drawerOpen]);

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
      setLog((prev) => [
        ...prev,
        {
          id: ++logSeq,
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
        setSelectedPlayers(firstPlayer ? [firstPlayer] : []);
        setActivePlayers(initPlayers);
        await syncState(proxy, firstPlayer);
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

  // ── Mount: load from URL param, or default to first variant ──
  useEffect(() => {
    if (encodedParam) {
      const url = decodeScriptUrl(encodedParam);
      const variant = variants.find((v) => v.url === url);
      if (variant) {
        setSelectedVariant(variant);
        const n = typeof playerCount === "number" ? playerCount : 2;
        loadScript(url, n);
        return;
      }
    }
    // Fallback: first variant or first official
    const first = variants[0];
    if (first) {
      setSelectedVariant(first);
      const n = typeof playerCount === "number" ? playerCount : 2;
      loadScript(first.url, n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedParam]);

  const handleVariantSelect = (url: string) => {
    const variant = variants.find((v) => v.url === url);
    if (variant) {
      setSelectedVariant(variant);
      const n = typeof playerCount === "number" ? playerCount : 2;
      loadScript(url, n);
      combobox.closeDropdown();
      navigate(`/dev/${encodeScriptUrl(url)}`, { replace: true });
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
      if (!proxy || !controllingPlayer) return;
      try {
        // Phase 1: board state + ui + game_over — arrives immediately
        const result = await proxy.submitAction(
          controllingPlayer,
          JSON.stringify(action),
          controllingPlayer,
        );
        if (result.error) {
          notifications.show({
            title: "Action failed",
            message: result.error,
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
          addLogEntry(controllingPlayer, { kind: "move", action });
        } else if (action.type === "interact") {
          addLogEntry(controllingPlayer, { kind: "ui", elementId: action.elementId });
        } else if (action.type === "select_piece") {
          addLogEntry(controllingPlayer, { kind: "ui", elementId: "select_piece", piece: action.piece });
        } else if (action.type === "cancel") {
          addLogEntry(controllingPlayer, { kind: "ui", elementId: "cancel" });
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
    [controllingPlayer, addLogEntry, deriveActivePlayers],
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
          validMoves={validMoves}
          activeBoardIndex={currentBoardIndex}
          activeBoardIndices={activeBoardIndices}
          orientationByBoard={orientationByBoard}
          onRotateBoard={handleRotateBoard}
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

      {/* ── Piece selection dialog (auto-spawned from valid_actions) ── */}
      {selectablePieces.length > 0 && (
        <PieceSelectionDialog
          selectablePieces={selectablePieces}
          hasCancel={hasCancel}
          onSubmit={handleSubmitAction}
        />
      )}

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

          <Group justify="space-between" align="center">
            <Text size="sm" fw={600}>
              Action Log
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setLog([])}
              title="Clear"
            >
              <IconTrash size="0.85rem" />
            </ActionIcon>
          </Group>
          <ScrollArea h={400} type="auto">
            {log.length === 0 && (
              <Text size="xs" c="dimmed" fs="italic">
                No actions yet.
              </Text>
            )}
            {[...log].reverse().map((entry) => (
              <Group key={entry.id} gap="xs" mb={4} wrap="nowrap">
                <Badge
                  size="xs"
                  color={
                    PLAYER_BADGE_COLORS[
                      activePlayers.findIndex(
                        (ap) =>
                          `{"board":${ap.board},"color":"${ap.color}"}` ===
                          entry.player
                      )
                    ] ?? "gray"
                  }
                >
                  {(() => {
                    const ap = activePlayers.find(
                      (a) =>
                        `{"board":${a.board},"color":"${a.color}"}` ===
                        entry.player
                    );
                    return ap
                      ? `${ap.color}${ap.board > 0 ? ` b${ap.board}` : ""}`
                      : "?";
                  })()}
                </Badge>
                <Text size="xs" style={{ flex: 1 }}>
                  {actionLabel(entry.action)}
                </Text>
                <Text size="xs" c="dimmed">
                  {entry.timestamp}
                </Text>
              </Group>
            ))}
          </ScrollArea>

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
                  maxHeight: 300,
                  overflow: "auto",
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
                Valid Actions
              </Text>
              <Text size="xs" c="dimmed">
                {showValidMoves ? "▼" : "▶"}
              </Text>
            </Group>
            {showValidMoves && validMovesJsonStr && (
              <Box
                mt={4}
                style={{
                  maxHeight: 300,
                  overflow: "auto",
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
