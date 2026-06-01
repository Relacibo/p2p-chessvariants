import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Combobox,
  Group,
  InputBase,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChessvariantEngine } from "chessvariant-engine";
import { Chessboard } from "../chessboard/Chessboard";
import { ReservePile } from "../chessboard/ReservePile";
import useConfigureLayout from "../layout/hooks";
import style from "./DevBoardView.module.css";
import {
  PlayerRef,
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmPlayerActions,
  WasmSubmitActionResult,
  WasmUiMap,
  WasmUiReservePile,
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
  const [allPlayers, setAllPlayers] = useState<
    { color: string; board: number; team: number }[]
  >([]);

  const engineRef = useRef<ChessvariantEngine | null>(null);
  const [variantConfig, setVariantConfig] = useState<WasmVariantConfig | null>(
    null
  );
  const [boardState, setBoardState] = useState<WasmBoardState | null>(null);
  const [reservePile, setReservePile] = useState<WasmUiReservePile | null>(
    null
  );
  const [validActions, setValidActions] = useState<WasmAction[]>([]);
  const [validActionsAll, setValidActionsAll] = useState<WasmPlayerActions[]>(
    []
  );
  const [uiElements, setUiElements] = useState<WasmUiMap | null>(null);
  const [lastAction, setLastAction] = useState<WasmAction | undefined>();
  const [selectedDropPiece, setSelectedDropPiece] = useState<WasmPiece | null>(
    null
  );
  const [log, setLog] = useState<LogEntry[]>([]);
  const [gameStateJson, setGameStateJson] = useState<object | null>(null);
  const [showGameState, setShowGameState] = useState(false);
  const [validActionsJsonStr, setValidActionsJsonStr] = useState<string | null>(null);
  const [showValidActions, setShowValidActions] = useState(false);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const boardSize =
    containerSize.w > 0 && containerSize.h > 0
      ? Math.min(containerSize.w, containerSize.h)
      : 0;
  const reservePileWidth = Math.max(72, Math.round(boardSize * 0.22));
  const sideSpace = containerSize.w - boardSize;
  const showReserveSide = sideSpace >= reservePileWidth + 48;

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

  // Derive active players from valid_actions all (entries with non-empty actions)
  const deriveActivePlayers = useCallback(
    (allActions: WasmPlayerActions[]): PlayerRef[] => {
      return allActions
        .filter((pa) => pa.actions.length > 0)
        .map((pa) => ({
          board: pa.player.board,
          color: pa.player.color,
        }));
    },
    []
  );

  const syncState = useCallback(
    (engine: ChessvariantEngine, player?: string) => {
      const p = player ?? controllingPlayer;
      setBoardState(JSON.parse(engine.boardStateJson()));
      // Reserve pile comes from getUi as a ReservePile element now
      const allValid: WasmPlayerActions[] = JSON.parse(
        engine.validActionsJson()
      );
      setValidActionsAll(allValid);
      const ap = deriveActivePlayers(allValid);
      setActivePlayers(ap);
      const allP: { color: string; board: number; team: number }[] =
        JSON.parse(engine.playersJson());
      setAllPlayers(allP);
      if (p) {
        // Extract actions for the controlling player
        const playerRef: PlayerRef = JSON.parse(p);
        const playerEntry = allValid.find(
          (pa) =>
            pa.player.board === playerRef.board &&
            pa.player.color === playerRef.color
        );
        setValidActions(playerEntry?.actions ?? []);
        // Fetch UI for the current controlling player
        const uiResult = JSON.parse(engine.getUiJson(p));
        const ui = (uiResult.ui ?? null) as WasmUiMap | null;
        setUiElements(ui);
        // Check for reserve pile in UI
        let foundReserve = false;
        if (ui) {
          for (const el of Object.values(ui)) {
            if (el.type === "reserve_pile") {
              setReservePile(el as WasmUiReservePile);
              foundReserve = true;
              break;
            }
          }
        }
        if (!foundReserve) setReservePile(null);
        // Fetch full game state as JSON
        try {
          setGameStateJson(JSON.parse(engine.stateJson()));
        } catch {
          setGameStateJson(null);
        }
      } else {
        setValidActions([]);
        setUiElements(null);
      }
    },
    [controllingPlayer, deriveActivePlayers]
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
      engineRef.current?.free();
      engineRef.current = null;
      notifications.clean();
      setLoading(true);
      setLog([]);
      setLastAction(undefined);
      setSelectedDropPiece(null);
      setVariantConfig(null);
      setBoardState(null);
      setReservePile(null);
      setValidActions([]);
      setValidActionsAll([]);
      setUiElements(null);
      try {
        const script = await fetchScriptText(url);
        const engine = new ChessvariantEngine(script, numPlayers);
        engineRef.current = engine;
        const config: WasmVariantConfig = JSON.parse(
          engine.variantConfigJson()
        );
        setVariantConfig(config);
        // Get initial valid actions to determine active players
        const initialValid: WasmPlayerActions[] = JSON.parse(
          engine.validActionsJson()
        );
        setValidActionsAll(initialValid);
        const initPlayers = deriveActivePlayers(initialValid);
        const firstPlayerJson = initPlayers[0]
          ? JSON.stringify(initPlayers[0])
          : "";
        setControllingPlayer(firstPlayerJson);
        setActivePlayers(initPlayers);
        syncState(engine, firstPlayerJson);
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
    [syncState, deriveActivePlayers]
  );

  // ── Sync when controlling player changes ──
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !controllingPlayer) return;
    syncState(engine, controllingPlayer);
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

  // ── Submit an action via submitAction ──
  const handleSubmitAction = useCallback(
    (action: WasmAction) => {
      const engine = engineRef.current;
      if (!engine || !controllingPlayer) return;
      const resultJson = engine.submitAction(
        controllingPlayer,
        JSON.stringify(action)
      );
      const result: WasmSubmitActionResult & { error?: string } =
        JSON.parse(resultJson);
      if (result.error) {
        notifications.show({
          title: "Action failed",
          message: result.error,
          color: "red",
          withBorder: true,
          autoClose: false,
        });
        return;
      }
      setUiElements(result.ui);
      setLastAction(action);
      setSelectedDropPiece(null);
      if (action.type === "move") {
        addLogEntry(controllingPlayer, { kind: "move", action });
      } else if (action.type === "interact") {
        addLogEntry(controllingPlayer, {
          kind: "ui",
          elementId: action.elementId,
        });
      } else if (action.type === "select_piece") {
        addLogEntry(controllingPlayer, {
          kind: "ui",
          elementId: "select_piece",
          piece: action.piece,
        });
      } else if (action.type === "cancel") {
        addLogEntry(controllingPlayer, {
          kind: "ui",
          elementId: "cancel",
        });
      }
      // Update valid actions from result if present (backward compat),
      // otherwise fetch asynchronously to avoid blocking the UI.
      if (result.valid_actions) {
        setValidActionsAll(result.valid_actions);
        const ap = deriveActivePlayers(result.valid_actions);
        setActivePlayers(ap);
        const cpRef2: PlayerRef = JSON.parse(controllingPlayer);
        const cpEntry2 = result.valid_actions.find(
          (pa) =>
            pa.player.board === cpRef2.board &&
            pa.player.color === cpRef2.color
        );
        setValidActions(cpEntry2?.actions ?? []);
      } else {
        // Defer valid_actions fetch — it's computed in WASM and can block the main thread
        requestAnimationFrame(() => {
          const engine2 = engineRef.current;
          if (!engine2) return;
          try {
            const allValid: WasmPlayerActions[] = JSON.parse(
              engine2.validActionsJson()
            );
            setValidActionsAll(allValid);
            const ap = deriveActivePlayers(allValid);
            setActivePlayers(ap);
            const cpRef3: PlayerRef = JSON.parse(controllingPlayer);
            const cpEntry3 = allValid.find(
              (pa) =>
                pa.player.board === cpRef3.board &&
                pa.player.color === cpRef3.color
            );
            setValidActions(cpEntry3?.actions ?? []);
          } catch {
            // valid_actions fetch can fail if state became invalid
          }
        });
      }
      // Check for reserve pile in UI
      let foundReserve = false;
      if (result.ui) {
        for (const el of Object.values(result.ui)) {
          if (el.type === "reserve_pile") {
            setReservePile(el as WasmUiReservePile);
            foundReserve = true;
            break;
          }
        }
      }
      if (!foundReserve) setReservePile(null);
      // Refresh board state
      setBoardState(JSON.parse(engine.boardStateJson()));
      setAllPlayers(JSON.parse(engine.playersJson()));
      // Refresh game state JSON
      try {
        setGameStateJson(JSON.parse(engine.stateJson()));
      } catch {
        setGameStateJson(null);
      }
    },
    [controllingPlayer, addLogEntry, deriveActivePlayers]
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
      {!loading && boardState && variantConfig && (
        <Chessboard
          variantConfig={variantConfig}
          boardState={boardState}
          validActions={validActions}
          player={controllingPlayer}
          onSubmitAction={handleSubmitAction}
          lastAction={lastAction}
          selectedDropPiece={selectedDropPiece}
          onClearDropPiece={() => setSelectedDropPiece(null)}
          size={boardSize}
          stageWidth={containerSize.w}
          stageHeight={containerSize.h}
        />
      )}

      {/* ── Reserve pile ── */}
      {reservePile && !loading && (
        <Box
          style={
            showReserveSide
              ? {
                  position: "absolute",
                  right: Math.max(8, sideSpace - reservePileWidth - 8),
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: reservePileWidth,
                }
              : {
                  position: "absolute",
                  bottom: 56,
                  right: 8,
                  width: reservePileWidth,
                  opacity: 0.92,
                }
          }
        >
          <ReservePile
            reservePile={{
              reserve_piles: [reservePile.pieces],
            }}
            player={controllingPlayer}
            selectedPiece={selectedDropPiece}
            onSelectPiece={setSelectedDropPiece}
            tileSize={44}
          />
        </Box>
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

          <Select
            label="Controlling player (local)"
            data={allPlayers.map((p) => ({
              value: JSON.stringify({ board: p.board, color: p.color }),
              label: `${p.color} ${p.board > 0 ? `(board ${p.board})` : ""}`,
            }))}
            value={controllingPlayer}
            onChange={(v) => v != null && setControllingPlayer(v)}
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
                  try {
                    setGameStateJson(
                      JSON.parse(engineRef.current!.stateJson())
                    );
                  } catch { /* ignore */ }
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
                if (!showValidActions && !validActionsJsonStr) {
                  // Fetch on first expand
                  try {
                    setValidActionsJsonStr(
                      engineRef.current!.validActionsJson()
                    );
                  } catch { /* ignore */ }
                }
                setShowValidActions((s) => !s);
              }}
            >
              <Text size="sm" fw={600}>
                Valid Actions
              </Text>
              <Text size="xs" c="dimmed">
                {showValidActions ? "▼" : "▶"}
              </Text>
            </Group>
            {showValidActions && validActionsJsonStr && (
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
                        JSON.parse(validActionsJsonStr),
                        null,
                        2
                      );
                    } catch {
                      return validActionsJsonStr;
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
