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
import { IconPlayerSkipBack, IconSettings, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessvariantEngine } from "chessvariant-engine";
import { Chessboard } from "../chessboard/Chessboard";
import { ReservePile } from "../chessboard/ReservePile";
import useConfigureLayout from "../layout/hooks";
import style from "./DevBoardView.module.css";
import {
  WasmAction,
  WasmBoardState,
  WasmPiece,
  WasmReservePileState,
  WasmVariantConfig,
} from "../chessboard/types";

const GITHUB_RAW_ORIGIN = "https://raw.githubusercontent.com";
const OWNER = "reinhard";
const REPO = "p2p-chessvariants";
const SHA = "e6502636abbd30370a84b705fa7db7fe263c3e3d";

const BASE_RAW_URL = `${GITHUB_RAW_ORIGIN}/${OWNER}/${REPO}/${SHA}`;

const PRESETS = [
  { label: "Seirawan Chess (2p)", value: `${BASE_RAW_URL}/variants/seirawan_chess.rhai`, players: 2 },
  { label: "Bughouse (4p)", value: `${BASE_RAW_URL}/variants/bughouse.rhai`, players: 4 },
  { label: "4-Player Chess (4p)", value: `${BASE_RAW_URL}/variants/four_player_chess.rhai`, players: 4 },
];

interface LogEntry {
  id: number;
  timestamp: string;
  player: string;
  action: WasmAction;
}

let logSeq = 0;

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
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

const PLAYER_COLORS_LABEL = ["White", "Black", "Red", "Blue"];
const PLAYER_BADGE_COLORS = ["gray", "dark", "red", "blue"] as const;

export function DevBoardView() {
  useConfigureLayout(() => ({ navPinned: false }));

  const [drawerOpen, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

  const [preset, setPreset] = useState<string>(PRESETS[0].value);
  const [customUrl, setCustomUrl] = useState("");
  const [playerCount, setPlayerCount] = useState<number | string>(2);
  const [controllingPlayer, setControllingPlayer] = useState<string>("");
  const [activePlayers, setActivePlayers] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<{name: string; color: string; board: number; team: number}[]>([]);

  const engineRef = useRef<ChessvariantEngine | null>(null);
  const [variantConfig, setVariantConfig] = useState<WasmVariantConfig | null>(null);
  const [boardState, setBoardState] = useState<WasmBoardState | null>(null);
  const [reservePile, setReservePile] = useState<WasmReservePileState | null>(null);
  const [validActions, setValidActions] = useState<WasmAction[]>([]);
  const [lastAction, setLastAction] = useState<WasmAction | undefined>();
  const [selectedDropPiece, setSelectedDropPiece] = useState<WasmPiece | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  // ── Measure container for accurate board sizing ─────────────────────────
  // Container uses top: header-height (not paddingTop) so contentRect = exact usable area.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: window.innerWidth, h: window.innerHeight - 70 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boardSize = Math.floor(Math.min(containerSize.h, containerSize.w));
  const reservePileWidth = 148;
  // Space left of the centered board for reserve pile
  const sideSpace = Math.floor((containerSize.w - boardSize) / 2);
  const showReserveSide = sideSpace >= reservePileWidth + 8;

  // ── Engine helpers ────────────────────────────────────────────────────────
  const syncState = useCallback((engine: ChessvariantEngine) => {
    setBoardState(JSON.parse(engine.boardStateJson()));
    
    const ap: string[] = JSON.parse(engine.activePlayersJson());
    setActivePlayers(ap);
    
    const allP: {name: string; color: string; board: number; team: number}[] = JSON.parse(engine.playersJson());
    setAllPlayers(allP);
    
    // Dev-mode: if no controllingPlayer set, use first active player
    if (!controllingPlayer || !ap.includes(controllingPlayer)) {
      setControllingPlayer(ap[0] ?? "");
    }
    
    // Valid actions for controlling player
    if (controllingPlayer) {
      let va: WasmAction[] = [];
      try {
        va = JSON.parse(engine.validActionsJson(controllingPlayer));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("validActionsJson threw:", err);
      }
      // eslint-disable-next-line no-console
      console.log("syncState: player", controllingPlayer, "validActions", va.length, "first:", JSON.stringify(va[0]));
      setValidActions(va);
    }
    
    const rpJson = engine.reservePileJson();
    setReservePile(rpJson ? JSON.parse(rpJson) : null);
  }, [controllingPlayer]);

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
        const initPlayers: string[] = JSON.parse(engine.activePlayersJson());
        setControllingPlayer(initPlayers[0] ?? "");
        setActivePlayers(initPlayers);
        syncState(engine);
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
      if (!engine || !controllingPlayer) return;
      try {
        engine.applyActionJson(controllingPlayer, JSON.stringify(action));
        setLastAction(action);
        setSelectedDropPiece(null);
        setLog((prev) => [
          ...prev,
          { id: ++logSeq, timestamp: new Date().toLocaleTimeString(), player: controllingPlayer, action },
        ]);
        syncState(engine);
      } catch (e: unknown) {
        setError(extractErrorMessage(e));
      }
    },
    [controllingPlayer, syncState]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box
      ref={containerRef}
      className={style.container}
    >
      {/* ── Fullscreen Stage — board is centered inside it ── */}
      {loading && (
        <Box style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
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

      {/* ── Reserve pile: right of board when space allows, else below-right overlay ── */}
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
             reservePile={reservePile}
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
            <Text size="xs" fw={700} c="red">Error</Text>
            <ActionIcon size="xs" variant="subtle" onClick={() => setError(null)}>
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
          <NumberInput label="Players" min={2} max={4} value={playerCount} onChange={setPlayerCount} />
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
             data={allPlayers.map(p => ({ value: p.name, label: `${p.color} (${p.name})` })) ?? []}
             value={controllingPlayer}
             onChange={(v) => v != null && setControllingPlayer(v)}
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
                  <Badge size="xs" color={PLAYER_BADGE_COLORS.find(c => c === entry.player) ?? "gray"}>
                    {PLAYER_COLORS_LABEL.find(c => c.toLowerCase() === entry.player) ?? entry.player}
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
