import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box, Group, MultiSelect, NumberInput, Tabs, Text,
} from "@mantine/core";
import { VariantEditorContent } from "../variant-editor/VariantEditorContent";
import useConfigureLayout from "../layout/hooks";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebugPayload {
  actionLog?: string;
  gameState?: object;
  variantConfig?: object;
  validMoves?: object;
  gameProgress?: object;
  uiElements?: object;
}

interface PlayerEntry { id: string; name: string }

// ─── Styles ──────────────────────────────────────────────────────────────────

const RESIZE_HANDLE_H = 5;
const panelStyle: React.CSSProperties = {
  background: "#1a1b1e", color: "#c9d1d9", fontFamily: "monospace",
  fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all",
  padding: 8, overflow: "auto", minHeight: 60,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatJson(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); }
  catch (e) { console.error("[DevEditorView] formatJson failed", e); return String(obj); }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DevEditorView() {
  useConfigureLayout(() => ({ navPinned: false }));

  // ── Dev control state ──
  const [playerCount, setPlayerCount] = useState<number | string>(2);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  // ── Editor pane height ──
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // ── Debug data ──
  const [actionLog, setActionLog] = useState("");
  const [gameState, setGameState] = useState<string | null>(null);
  const [variantConfig, setVariantConfig] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string | null>(null);
  const [gameProgress, setGameProgress] = useState<string | null>(null);
  const [uiElements, setUiElements] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("log");

  // ── postMessage ──
  const postToOpener = useCallback((msg: object) => {
    if (!window.opener) return;
    window.opener.postMessage(msg, window.location.origin);
  }, []);

  // ── Handlers ──
  const handlePlayersChange = useCallback((values: string[]) => {
    setSelectedPlayers(values);
    postToOpener({ type: "set-controlling-players", players: values });
  }, [postToOpener]);

  const handleTest = useCallback((scriptContent: string) => {
    const n = typeof playerCount === "number" ? playerCount : 2;
    postToOpener({ type: "load-variant", script: scriptContent, players: n, url: "__test__" });
  }, [playerCount, postToOpener]);

  // ── Messages from DevBoardView ──
  useEffect(() => {
    postToOpener({ type: "editor-ready" });
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "debug-data") {
        const data = event.data.data as DebugPayload;
        if (typeof data?.actionLog === "string") setActionLog(data.actionLog);
        if (data?.gameState != null) setGameState(formatJson(data.gameState));
        if (data?.variantConfig != null) setVariantConfig(formatJson(data.variantConfig));
        if (data?.validMoves != null) setValidMoves(formatJson(data.validMoves));
        if (data?.gameProgress != null) setGameProgress(formatJson(data.gameProgress));
        if (data?.uiElements != null) setUiElements(formatJson(data.uiElements));
        return;
      }
      if (event.data?.type === "engine-loaded") {
        if (event.data.playerCount) setPlayerCount(event.data.playerCount);
        if (event.data.players) {
          const pl = event.data.players as PlayerEntry[];
          setPlayers(pl);
          if (event.data.selectedPlayers && Array.isArray(event.data.selectedPlayers)) {
            setSelectedPlayers(event.data.selectedPlayers);
          } else if (pl.length > 0) {
            setSelectedPlayers([pl[0].id]);
          }
        }
        return;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postToOpener]);

  useEffect(() => {
    if (activeTab === "state" && !gameState) postToOpener({ type: "request-state" });
  }, [activeTab, gameState, postToOpener]);

  // ── Resize drag ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true; startY.current = e.clientY;
    startHeight.current = editorHeight ?? window.innerHeight * 0.65;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editorHeight]);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = e.clientY - startY.current;
    setEditorHeight(Math.max(200, Math.min(window.innerHeight - 120, startHeight.current + d)));
  }, []);
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // ── Render ──
  return (
    <Box style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      display: "flex", flexDirection: "column", overflow: "hidden",
      background: "var(--mantine-color-dark-9)",
    }}>
      {/* ── Single toolbar: editor controls + dev controls ── */}
      {/* Dev controls are rendered as toolbarRight inside VariantEditorContent's toolbar */}
      <Box style={{
        flex: "none", height: editorHeight ?? "55vh",
        overflow: "hidden", position: "relative",
        borderBottom: "1px solid var(--mantine-color-dark-4)",
      }}>
        <VariantEditorContent
          onTest={handleTest}
          showPopOut={false}
          editorHeight="100%"
          toolbarRight={
            <Group gap="sm" wrap="nowrap">
              <NumberInput size="xs" min={2} max={8} value={playerCount} onChange={setPlayerCount}
                style={{ width: 65 }} />
              <MultiSelect size="xs"
                data={players.map((p) => ({ value: p.id, label: p.name }))}
                value={selectedPlayers} onChange={(values) => handlePlayersChange(values)}
                clearable style={{ width: 170 }} placeholder="Control"
              />
            </Group>
          }
        />
      </Box>

      {/* ── Resize handle ── */}
      <Box style={{
        flex: "none", height: RESIZE_HANDLE_H, cursor: "row-resize",
        background: "var(--mantine-color-dark-4)", transition: "background 0.15s",
      }}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      />

      {/* ── Debug panel ── */}
      <Box style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 80 }}>
        <Tabs value={activeTab} onChange={setActiveTab}
          style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Tabs.List>
            <Tabs.Tab value="log"><Text size="xs">Log</Text></Tabs.Tab>
            <Tabs.Tab value="progress"><Text size="xs">Progress</Text></Tabs.Tab>
            <Tabs.Tab value="ui"><Text size="xs">UI</Text></Tabs.Tab>
            <Tabs.Tab value="state"><Text size="xs">State</Text></Tabs.Tab>
            <Tabs.Tab value="config"><Text size="xs">Config</Text></Tabs.Tab>
            <Tabs.Tab value="moves"><Text size="xs">Moves</Text></Tabs.Tab>
          </Tabs.List>

          <Box style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <Tabs.Panel value="log" style={{ height: "100%" }}>
              <Box style={panelStyle}>{actionLog || <Text size="xs" c="dimmed" fs="italic">No actions yet.</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="progress" style={{ height: "100%" }}>
              <Box style={panelStyle}>{gameProgress ?? <Text size="xs" c="dimmed" fs="italic">In progress…</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="ui" style={{ height: "100%" }}>
              <Box style={panelStyle}>{uiElements ?? <Text size="xs" c="dimmed" fs="italic">No UI elements yet.</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="state" style={{ height: "100%" }}>
              <Box style={panelStyle}>{gameState ?? <Text size="xs" c="dimmed" fs="italic">Click State tab to request…</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="config" style={{ height: "100%" }}>
              <Box style={panelStyle}>{variantConfig ?? <Text size="xs" c="dimmed" fs="italic">Loading…</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="moves" style={{ height: "100%" }}>
              <Box style={panelStyle}>{validMoves ?? <Text size="xs" c="dimmed" fs="italic">Loading…</Text>}</Box>
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Box>
    </Box>
  );
}

export default DevEditorView;
