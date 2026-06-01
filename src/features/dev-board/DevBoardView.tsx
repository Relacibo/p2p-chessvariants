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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EngineProxy } from "../engine/EngineProxy";
import { Chessboard } from "../chessboard/Chessboard";
import { ReservePile } from "../chessboard/ReservePile";
import { PieceSelectionDialog } from "../chessboard/PieceSelectionDialog";
import useConfigureLayout from "../layout/hooks";
import style from "./DevBoardView.module.css";
import {
  PlayerRef,
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmPlayerActions,
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

  const proxyRef = useRef<EngineProxy | null>(null);
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

  // Derive board index and orientation from the controlling player's full identity.
  const playerRef = useMemo((): PlayerRef | null => {
    if (!controllingPlayer) return null;
    try { return JSON.parse(controllingPlayer) as PlayerRef; }
    catch { return null; }
  }, [controllingPlayer]);
  const currentBoardIndex = playerRef?.board ?? 0;
  const currentFlipped = playerRef?.color === "black";

  // Determine if a piece selection dialog should be shown
  const selectablePieces = useMemo(() => {
    return validActions
      .filter((a): a is WasmAction & { type: "select_piece" } => a.type === "select_piece")
      .map((a) => a.piece);
  }, [validActions]);

  const hasCancel = useMemo(
    () => validActions.some((a) => a.type === "cancel"),
    [validActions],
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
    async (proxy: EngineProxy, player?: string) => {
      const p = player ?? controllingPlayer;
      const [boardState, allValid, allP] = await Promise.all([
        proxy.boardStateJson() as Promise<WasmBoardState>,
        proxy.validActionsJson() as Promise<WasmPlayerActions[]>,
        proxy.playersJson() as Promise<{ color: string; board: number; team: number }[]>,
      ]);
      setBoardState(boardState);
      setValidActionsAll(allValid);
      setActivePlayers(deriveActivePlayers(allValid));
      setAllPlayers(allP);
      if (p) {
        const ref: PlayerRef = JSON.parse(p);
        const entry = allValid.find(pa =>
          pa.player.board === ref.board && pa.player.color === ref.color
        );
        setValidActions(entry?.actions ?? []);
        const uiResult = await proxy.getUiJson(p) as { ui: WasmUiMap };
        const ui = (uiResult.ui ?? null) as WasmUiMap | null;
        setUiElements(ui);
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
      } else {
        setValidActions([]);
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
      setReservePile(null);
      setValidActions([]);
      setValidActionsAll([]);
      setUiElements(null);
      try {
        const script = await fetchScriptText(url);
        const proxy = new EngineProxy();
        const init = await proxy.init(script, numPlayers);
        proxyRef.current = proxy;
        setVariantConfig(init.variantConfig as WasmVariantConfig);
        setBoardState(init.boardState as WasmBoardState);
        const initialValid = init.validActions as WasmPlayerActions[];
        setValidActionsAll(initialValid);
        const initPlayers = deriveActivePlayers(initialValid);
        const firstPlayer = initPlayers[0] ? JSON.stringify(initPlayers[0]) : "";
        setControllingPlayer(firstPlayer);
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

  // ── Register validActions follow-up callback on the current proxy ──
  useEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy) return;
    proxy.onValidActions = (payload) => {
      const va = payload.validActions as WasmPlayerActions[];
      setValidActionsAll(va);
      setActivePlayers(deriveActivePlayers(va));
      const ref: PlayerRef = JSON.parse(controllingPlayer);
      const entry = va.find(
        pa => pa.player.board === ref.board && pa.player.color === ref.color
      );
      setValidActions(entry?.actions ?? []);
      setAllPlayers(payload.players as { color: string; board: number; team: number }[]);
      setGameStateJson(payload.stateJson as object);
    };
    return () => { proxy.onValidActions = null; };
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
        );
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
        // ── Render board immediately ──
        setUiElements(result.ui as WasmUiMap);
        setLastAction(action);
        setSelectedDropPiece(null);
        if (result.board_state) setBoardState(result.board_state as WasmBoardState);
        if (action.type === "move") {
          addLogEntry(controllingPlayer, { kind: "move", action });
        } else if (action.type === "interact") {
          addLogEntry(controllingPlayer, { kind: "ui", elementId: action.elementId });
        } else if (action.type === "select_piece") {
          addLogEntry(controllingPlayer, { kind: "ui", elementId: "select_piece", piece: action.piece });
        } else if (action.type === "cancel") {
          addLogEntry(controllingPlayer, { kind: "ui", elementId: "cancel" });
        }
        let foundReserve = false;
        const ui = result.ui as WasmUiMap | null;
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
        // Phase 2: valid_actions arrive asynchronously via proxy.onValidActions
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
      {!loading && boardState && variantConfig && (
        <Chessboard
          variantConfig={variantConfig}
          boardState={boardState}
          validActions={validActions}
          boardIndex={currentBoardIndex}
          flipped={currentFlipped}
          onSubmitAction={handleSubmitAction}
          lastAction={lastAction}
          selectedDropPiece={selectedDropPiece}
          onClearDropPiece={() => setSelectedDropPiece(null)}
          size={boardSize}
          stageWidth={containerSize.w}
          stageHeight={containerSize.h}
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
                  void proxyRef.current?.stateJson().then(v => {
                    try { setGameStateJson(v as object); } catch { /* ignore */ }
                  });
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
                  void proxyRef.current?.validActionsJson().then(v => {
                    try { setValidActionsJsonStr(JSON.stringify(v, null, 2)); } catch { /* ignore */ }
                  });
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
