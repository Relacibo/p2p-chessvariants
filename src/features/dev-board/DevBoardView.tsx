import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlayerSkipBack, IconSettings, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessvariantEngine } from "chessvariant-engine";
import { Chessboard } from "../chessboard/Chessboard";
import { ReservePile } from "../chessboard/ReservePile";
import useConfigureLayout from "../layout/hooks";
import {
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmReservePileState,
  WasmVariantConfig,
} from "../chessboard/types";

const PRESETS = [
  { label: "Seirawan Chess (2p)", value: "/dev-scripts/seirawan_chess.rhai", players: 2 },
  { label: "Bughouse (4p)", value: "/dev-scripts/bughouse.rhai", players: 4 },
  { label: "4-Player Chess (4p)", value: "/dev-scripts/four_player_chess.rhai", players: 4 },
];

interface LogEntry {
  id: number;
  timestamp: string;
  playerIndex: number;
  action: WasmAction;
}

let logSeq = 0;

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  try { return JSON.stringify(e); } catch { return String(e); }
}

function actionLabel(a: WasmAction): string {
  if (a.type === "move" && a.from && a.to)
    return `move (${a.from.row},${a.from.col})→(${a.to.row},${a.to.col})`;
  if (a.type === "drop" && a.piece && a.to)
    return `drop ${a.piece.color} ${a.piece.pieceType} → (${a.to.row},${a.to.col})`;
  if (a.type === "choose" && a.tag)
    return `choose ${a.tag}=${a.value ?? "?"}`;
  return JSON.stringify(a);
}

function useBoardSize(reserveVisible: boolean) {
  const compute = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const availW = reserveVisible ? vw - 160 : vw;
    return Math.floor(Math.min(vh * 0.95, availW * 0.97));
  }, [reserveVisible]);

  const [size, setSize] = useState(compute);

  useEffect(() => {
    const handler = () => setSize(compute());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [compute]);

  useEffect(() => { setSize(compute()); }, [compute]);

  return size;
}

const PLAYER_COLORS_LABEL = ["White", "Black", "Red", "Blue"];
const PLAYER_BADGE_COLORS = ["gray", "dark", "red", "blue"] as const;

export function DevBoardView() {
  useConfigureLayout(() => ({ navPinned: false }));

  const [drawerOpen, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

  const [preset, setPreset] = useState<string>(PRESETS[0].value);
  const [customUrl, setCustomUrl] = useState("");
  const [playerCount, setPlayerCount] = useState<number | string>(2);
  const [controllingPlayer, setControllingPlayer] = useState(0);

  const engineRef = useRef<ChessvariantEngine | null>(null);
  const [variantConfig, setVariantConfig] = useState<WasmVariantConfig | null>(null);
  const [boardState, setBoardState] = useState<WasmBoardState | null>(null);
  const [reservePile, setReservePile] = useState<WasmReservePileState | null>(null);
  const [validActions, setValidActions] = useState<WasmAction[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [lastAction, setLastAction] = useState<WasmAction | undefined>();
  const [selectedDropPiece, setSelectedDropPiece] = useState<WasmPiece | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const boardSize = useBoardSize(!!reservePile);

  const syncState = useCallback((engine: ChessvariantEngine, turn: number) => {
    setBoardState(JSON.parse(engine.boardStateJson()));
    setCurrentTurn(turn);
    setValidActions(JSON.parse(engine.validActionsJson(turn)));
    const rpJson = engine.reservePileJson();
    setReservePile(rpJson ? JSON.parse(rpJson) : null);
  }, []);

  const loadScript = useCallback(
    async (url: string, numPlayers: number) => {
      engineRef.current?.free();
      engineRef.current = null;
      setError(null);
      setLoading(true);
      setLog([]);
      setLastAction(undefined);
      setSelectedDropPiece(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const script = await res.text();
        const engine = new ChessvariantEngine(script, numPlayers);
        engineRef.current = engine;
        setVariantConfig(JSON.parse(engine.variantConfigJson()));
        const initTurn = engine.currentTurn();
        setControllingPlayer(initTurn);
        syncState(engine, initTurn);
      } catch (e: unknown) {
        setError(extractErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [syncState]
  );

  useEffect(() => {
    const p = PRESETS[0];
    setPlayerCount(p.players);
    loadScript(p.value, p.players);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePresetChange = (val: string | null) => {
    if (!val) return;
    setPreset(val);
    setCustomUrl("");
    const found = PRESETS.find((p) => p.value === val);
    if (found) setPlayerCount(found.players);
  };

  const handleLoad = () => {
    const url = customUrl.trim() || preset;
    const n = typeof playerCount === "number" ? playerCount : parseInt(String(playerCount), 10) || 2;
    loadScript(url, n);
    closeDrawer();
  };

  const handleSubmitAction = useCallback(
    (action: WasmAction) => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        engine.applyActionJson(currentTurn, JSON.stringify(action));
        const newTurn = engine.currentTurn();
        setLastAction(action);
        setSelectedDropPiece(null);
        setLog((prev) => [
          ...prev,
          { id: ++logSeq, timestamp: new Date().toLocaleTimeString(), playerIndex: currentTurn, action },
        ]);
        syncState(engine, newTurn);
        setControllingPlayer(newTurn);
      } catch (e: unknown) {
        setError(extractErrorMessage(e));
      }
    },
    [currentTurn, syncState]
  );

  return (
    <Box style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Dev drawer toggle */}
      <Tooltip label="Dev controls" position="left" withArrow>
        <ActionIcon
          variant="filled"
          color="dark"
          size="lg"
          radius="xl"
          style={{ position: "fixed", top: 12, right: 12, zIndex: 200 }}
          onClick={openDrawer}
        >
          <IconSettings size="1.1rem" />
        </ActionIcon>
      </Tooltip>

      {/* Board + reserve pile */}
      <Group
        gap={12}
        align="flex-start"
        justify="center"
        style={{ width: "100%", height: "100%", paddingTop: 4 }}
      >
        <Stack gap={6} align="center">
          {!loading && boardState && (
            <Group gap="xs">
              <Badge variant="light" color={PLAYER_BADGE_COLORS[currentTurn] ?? "gray"}>
                Turn: {PLAYER_COLORS_LABEL[currentTurn] ?? `Player ${currentTurn}`}
              </Badge>
              {variantConfig && (
                <Badge variant="outline" color="dimmed" size="sm">
                  {variantConfig.name}
                </Badge>
              )}
            </Group>
          )}

          {loading && <Loader mt={40} />}

          {error && (
            <Paper withBorder p="sm" style={{ maxWidth: 480 }}>
              <Text c="red" size="sm" fw={600}>Error</Text>
              <Text size="sm">{error}</Text>
              <Button size="xs" variant="subtle" mt={4} onClick={() => setError(null)}>Dismiss</Button>
            </Paper>
          )}

          {!loading && boardState && variantConfig && (
            <Chessboard
              variantConfig={variantConfig}
              boardState={boardState}
              validActions={validActions}
              playerIndex={controllingPlayer}
              onSubmitAction={handleSubmitAction}
              lastAction={lastAction}
              selectedDropPiece={selectedDropPiece}
              onClearDropPiece={() => setSelectedDropPiece(null)}
              size={boardSize}
            />
          )}
        </Stack>

        {reservePile && !loading && (
          <Box style={{ paddingTop: 32, minWidth: 140, maxWidth: 160 }}>
            <Text size="xs" fw={600} mb={6} c="dimmed">Reserve pile</Text>
            <ReservePile
              reservePile={reservePile}
              playerIndex={controllingPlayer}
              selectedPiece={selectedDropPiece}
              onSelectPiece={setSelectedDropPiece}
              tileSize={44}
            />
          </Box>
        )}
      </Group>

      {/* Dev Drawer */}
      <Drawer
        opened={drawerOpen}
        onClose={closeDrawer}
        title="Dev controls"
        position="right"
        size="sm"
        overlayProps={{ opacity: 0.3 }}
      >
        <Stack gap="md">
          <Select
            label="Preset"
            data={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            value={preset}
            onChange={handlePresetChange}
          />
          <TextInput
            label="Custom URL"
            placeholder="https://..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.currentTarget.value)}
          />
          <NumberInput
            label="Players"
            min={2}
            max={4}
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
            data={Array.from(
              { length: typeof playerCount === "number" ? playerCount : 2 },
              (_, i) => ({ value: String(i), label: `${PLAYER_COLORS_LABEL[i] ?? `Player ${i}`} (${i})` })
            )}
            value={String(controllingPlayer)}
            onChange={(v) => v != null && setControllingPlayer(Number(v))}
          />

          <Group justify="space-between" align="center">
            <Text size="sm" fw={600}>Action Log</Text>
            <ActionIcon variant="subtle" size="sm" onClick={() => setLog([])} title="Clear">
              <IconTrash size="0.85rem" />
            </ActionIcon>
          </Group>
          <ScrollArea h={400} type="auto">
            {log.length === 0 && (
              <Text size="xs" c="dimmed" fs="italic">No actions yet.</Text>
            )}
            {[...log].reverse().map((entry) => (
              <Paper key={entry.id} withBorder p={6} mb={4}>
                <Group gap="xs" mb={2}>
                  <Badge size="xs" variant="light" color="gray">{entry.timestamp}</Badge>
                  <Badge size="xs" color={PLAYER_BADGE_COLORS[entry.playerIndex] ?? "gray"}>
                    {PLAYER_COLORS_LABEL[entry.playerIndex] ?? `P${entry.playerIndex}`}
                  </Badge>
                </Group>
                <Code block fz={11} style={{ wordBreak: "break-all" }}>
                  {actionLabel(entry.action)}
                </Code>
              </Paper>
            ))}
          </ScrollArea>
        </Stack>
      </Drawer>
    </Box>
  );
}

export default DevBoardView;
