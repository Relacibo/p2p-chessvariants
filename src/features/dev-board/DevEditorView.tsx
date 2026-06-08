import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box, Group, MultiSelect, Select, Tabs, Text,
} from "@mantine/core";
import { VariantEditorContent } from "../variant-editor/VariantEditorContent";
import useConfigureLayout from "../layout/hooks";
import style from "./DevEditorView.module.css";

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
const PLAYER_COUNT_OPTIONS = ["2","3","4","5","6","7","8"];

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
  const [initialTemplate, setInitialTemplate] = useState<string | null>(null);
  const [initialName, setInitialName] = useState("");

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

  const handleScriptChange = useCallback(
    (info: { name: string; template: string | null }) => {
      postToOpener({ type: "editor-script-change", name: info.name, template: info.template });
    },
    [postToOpener],
  );

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
        // Sync template/name from main window
        if (event.data.variantUrl) setInitialTemplate(event.data.variantUrl);
        if (event.data.variantName) setInitialName(event.data.variantName);
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
    <Box className={style.container}>
      {/* ── Single toolbar: editor controls + dev controls ── */}
      {/* Dev controls are rendered as toolbarRight inside VariantEditorContent's toolbar */}
      <Box className={style.editorPane} style={{
        height: editorHeight ?? "55vh",
      }}>
        <VariantEditorContent
          onTest={handleTest}
          onScriptChange={handleScriptChange}
          initialTemplate={initialTemplate}
          initialName={initialName}
            showPopOut={false}
            editorHeight="100%"
          toolbarRight={
            <Group gap="sm" wrap="nowrap">
              <Select size="xs"
                data={PLAYER_COUNT_OPTIONS}
                value={String(playerCount)}
                onChange={(v) => v && setPlayerCount(Number(v))}
                style={{ width: 62 }}
              />
              <MultiSelect size="xs"
                data={players.map((p) => ({ value: p.id, label: p.name }))}
                value={selectedPlayers} onChange={(values) => handlePlayersChange(values)}
                clearable style={{ width: 220 }} placeholder="Control"
              />
            </Group>
          }
        />
      </Box>

      {/* ── Resize handle ── */}
      <Box className={style.resizeHandle} style={{ height: RESIZE_HANDLE_H }}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      />

      {/* ── Debug panel ── */}
      <Box className={style.debugWrap}>
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

          <Box className={style.tabContent}>
            <Tabs.Panel value="log" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Box className={style.panel}>{actionLog || <Text size="xs" c="dimmed" fs="italic">No actions yet.</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="progress" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Box className={style.panel}>{gameProgress ?? <Text size="xs" c="dimmed" fs="italic" style={{ fontFamily: "monospace", fontStyle: "normal" }}>{"{\"progress\": \"waiting…\"}"}</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="ui" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Box className={style.panel}>{uiElements ?? <Text size="xs" c="dimmed" fs="italic">No UI elements yet.</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="state" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Box className={style.panel}>{gameState ?? <Text size="xs" c="dimmed" fs="italic">Click State tab to request…</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="config" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Box className={style.panel}>{variantConfig ?? <Text size="xs" c="dimmed" fs="italic">Loading…</Text>}</Box>
            </Tabs.Panel>
            <Tabs.Panel value="moves" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Box className={style.panel}>{validMoves ?? <Text size="xs" c="dimmed" fs="italic">Loading…</Text>}</Box>
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Box>
    </Box>
  );
}

export default DevEditorView;
