import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconRefresh, IconTrash } from "@tabler/icons-react";
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

// ── Preset scripts served from /dev-scripts/ ─────────────────────────────────
const PRESETS = [
  { label: "Simple Chess (2p)", value: "/dev-scripts/simple_chess.rhai", players: 2 },
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

function actionLabel(a: WasmAction): string {
  if (a.type === "move" && a.from && a.to)
    return `move (${a.from.row},${a.from.col})→(${a.to.row},${a.to.col})`;
  if (a.type === "drop" && a.piece && a.to)
    return `drop ${a.piece.color} ${a.piece.pieceType} → (${a.to.row},${a.to.col})`;
  if (a.type === "choose" && a.tag)
    return `choose ${a.tag}=${a.value ?? "?"}`;
  return JSON.stringify(a);
}

export function DevBoardView() {
  useConfigureLayout(() => ({ navPinned: false }));

  // ── Config ────────────────────────────────────────────────────────────────
  const [preset, setPreset] = useState<string>(PRESETS[0].value);
  const [customUrl, setCustomUrl] = useState("");
  const [playerCount, setPlayerCount] = useState<number | string>(2);
  const [controllingPlayer, setControllingPlayer] = useState(0);

  // ── Engine state ──────────────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
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
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [syncState]
  );

  // Auto-load first preset on mount
  useEffect(() => {
    const p = PRESETS[0];
    setPlayerCount(p.players);
    loadScript(p.value, p.players);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When preset changes, update default player count
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
  };

  // ── Action handler ────────────────────────────────────────────────────────
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
          {
            id: ++logSeq,
            timestamp: new Date().toLocaleTimeString(),
            playerIndex: currentTurn,
            action,
          },
        ]);
        syncState(engine, newTurn);

        // In local dev mode: auto-advance controlling player to whoever's turn it is
        setControllingPlayer(newTurn);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [currentTurn, syncState]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const PLAYER_COLORS_LABEL = ["White", "Black", "Red", "Blue"];

  return (
    <Stack gap="md" h="100%">
      {/* ── Header ── */}
      <Group justify="space-between" align="flex-end">
        <Title order={3}>Board Dev View</Title>
        <Group gap="xs">
          <Select
            size="xs"
            label="Preset"
            data={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            value={preset}
            onChange={handlePresetChange}
            w={200}
          />
          <TextInput
            size="xs"
            label="Custom URL"
            placeholder="https://..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.currentTarget.value)}
            w={240}
          />
          <NumberInput
            size="xs"
            label="Players"
            min={2}
            max={4}
            value={playerCount}
            onChange={setPlayerCount}
            w={80}
          />
          <Button
            size="xs"
            mt={18}
            leftSection={<IconRefresh size="0.85rem" />}
            onClick={handleLoad}
            loading={loading}
          >
            Load
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Error" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ── Main layout ── */}
      <Group align="flex-start" gap="md" style={{ flex: 1, minHeight: 0 }}>
        {/* Board */}
        <Box>
          {loading && <Loader />}
          {!loading && boardState && variantConfig && (
            <Stack gap="xs">
              <Group gap="xs">
                <Badge variant="light" color="blue">
                  Turn: {PLAYER_COLORS_LABEL[currentTurn] ?? `Player ${currentTurn}`}
                </Badge>
                <Badge variant="outline">
                  Controlling: {PLAYER_COLORS_LABEL[controllingPlayer] ?? `Player ${controllingPlayer}`}
                </Badge>
              </Group>
              <Chessboard
                variantConfig={variantConfig}
                boardState={boardState}
                validActions={validActions}
                playerIndex={controllingPlayer}
                onSubmitAction={handleSubmitAction}
                lastAction={lastAction}
                selectedDropPiece={selectedDropPiece}
                onClearDropPiece={() => setSelectedDropPiece(null)}
                size={480}
              />
            </Stack>
          )}
        </Box>

        {/* Reserve Pile */}
        {reservePile && (
          <Box w={160}>
            <Text size="sm" fw={600} mb="xs">
              Reserve Pile
            </Text>
            <ReservePile
              reservePile={reservePile}
              playerIndex={controllingPlayer}
              selectedPiece={selectedDropPiece}
              onSelectPiece={setSelectedDropPiece}
              tileSize={36}
            />
          </Box>
        )}

        <Divider orientation="vertical" />

        {/* Event Log */}
        <Stack gap="xs" style={{ flex: 1, minWidth: 220, maxWidth: 340 }}>
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              Action Log
            </Text>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setLog([])}
              title="Clear log"
            >
              <IconTrash size="0.85rem" />
            </ActionIcon>
          </Group>
          <ScrollArea h={480} type="auto">
            {log.length === 0 && (
              <Text size="xs" c="dimmed" fs="italic">
                No actions yet.
              </Text>
            )}
            {log.map((entry) => (
              <Paper key={entry.id} withBorder p={6} mb={4}>
                <Group gap="xs" mb={2}>
                  <Badge size="xs" variant="light" color="gray">
                    {entry.timestamp}
                  </Badge>
                  <Badge
                    size="xs"
                    color={
                      entry.playerIndex === 0
                        ? "gray"
                        : entry.playerIndex === 1
                        ? "dark"
                        : entry.playerIndex === 2
                        ? "red"
                        : "blue"
                    }
                  >
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
      </Group>
    </Stack>
  );
}

export default DevBoardView;
