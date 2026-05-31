import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Combobox,
  Drawer,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
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
  const variants = useSelector(selectAllVariants);
  const combobox = useCombobox();

  const [search, setSearch] = useState("");

  const [drawerOpen, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);

  const [selectedVariant, setSelectedVariant] = useState<VariantEntry | null>(
    null
  );
  const [playerCount, setPlayerCount] = useState<number | string>(2);
  // controllingPlayer is stored as a JSON string: '{"board":0,"color":"white"}'
  const [controllingPlayer, setControllingPlayer] = useState<string>("");
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
  const [error, setError] = useState<string | null>(null);
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
        if (ui) {
          for (const el of Object.values(ui)) {
            if (el.type === "reserve_pile") {
              setReservePile(el as WasmUiReservePile);
              break;
            }
          }
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
      setError(null);
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
        setError(extractErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [syncState, deriveActivePlayers]
  );

  // ── Mount: load from URL param, or default to first variant ──
  useEffect(() => {
    if (encodedParam) {
      const url = decodeScriptUrl(encodedParam);
      const variant = variants.find((v) => v.url === url);
      if (variant) {
        setSelectedVariant(variant);
        const n = 2;
        setPlayerCount(n);
        loadScript(url, n);
        return;
      }
    }
    // Fallback: first variant or first official
    const first = variants[0];
    if (first) {
      setSelectedVariant(first);
      const n = 2;
      setPlayerCount(n);
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
      try {
        const resultJson = engine.submitAction(
          controllingPlayer,
          JSON.stringify(action)
        );
        const result: WasmSubmitActionResult = JSON.parse(resultJson);
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
        // Update valid actions and active players from result
        setValidActionsAll(result.valid_actions);
        const ap = deriveActivePlayers(result.valid_actions);
        setActivePlayers(ap);
        // Check for reserve pile in UI
        if (result.ui) {
          for (const el of Object.values(result.ui)) {
            if (el.type === "reserve_pile") {
              setReservePile(el as WasmUiReservePile);
              break;
            }
          }
        }
        // Refresh board state
        setBoardState(JSON.parse(engine.boardStateJson()));
        setAllPlayers(JSON.parse(engine.playersJson()));
      } catch (e: unknown) {
        setError(extractErrorMessage(e));
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

      {/* ── Error: floating bottom-left ── */}
      {error && (
        <Paper
          withBorder
          shadow="sm"
          p="sm"
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            maxWidth: 320,
            zIndex: 100,
          }}
        >
          <Group justify="space-between" mb={4} gap="xs">
            <Text size="xs" fw={700} c="red">
              Error
            </Text>
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={() => setError(null)}
            >
              <IconX size="0.7rem" />
            </ActionIcon>
          </Group>
          <Text size="xs">{error}</Text>
        </Paper>
      )}

      {/* ── Dev gear button ── */}
      <Tooltip label="Dev controls" position="left" withArrow>
        <ActionIcon
          variant="filled"
          color="dark"
          size="lg"
          radius="xl"
          style={{ position: "absolute", top: 8, right: 8, zIndex: 200 }}
          onClick={openDrawer}
        >
          <IconSettings size="1.1rem" />
        </ActionIcon>
      </Tooltip>

      {/* ── Dev Drawer ── */}
      <Drawer
        opened={drawerOpen}
        onClose={closeDrawer}
        title="Dev controls"
        position="right"
        size="sm"
        overlayProps={{ opacity: 0.3 }}
      >
        <Stack gap="md">
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
        </Stack>
      </Drawer>
    </Box>
  );
}

export default DevBoardView;
