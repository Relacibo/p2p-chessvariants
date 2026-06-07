import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Combobox,
  Group,
  InputBase,
  MultiSelect,
  NumberInput,
  Tabs,
  Text,
} from "@mantine/core";
import { useCombobox } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPlayerSkipBack,
} from "@tabler/icons-react";
import { VariantEditorContent } from "../variant-editor/VariantEditorContent";
import {
  listLocalScripts,
  loadLocalScript,
} from "../variant-editor/localScripts";
import useConfigureLayout from "../layout/hooks";
import { useSelector } from "../../app/hooks";
import {
  selectAllVariants,
  VariantEntry,
  OFFICIAL_VARIANTS,
} from "../lobby/variantsSlice";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebugPayload {
  actionLog?: string;
  gameState?: object;
  variantConfig?: object;
  validMoves?: object;
}

interface PlayerEntry {
  id: string;
  name: string;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const RESIZE_HANDLE_H = 5;

const panelStyle: React.CSSProperties = {
  background: "#1a1b1e",
  color: "#c9d1d9",
  fontFamily: "monospace",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  padding: 8,
  overflow: "auto",
  minHeight: 60,
};

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  background: "var(--mantine-color-dark-8)",
  borderBottom: "1px solid var(--mantine-color-dark-4)",
  padding: "6px 10px",
};

// ─── Variant resolution ──────────────────────────────────────────────────────

function resolveScript(
  scriptId: string,
  bundledVariants: VariantEntry[],
): { url: string } | { content: string } | null {
  if (!scriptId) return null;
  if (scriptId.startsWith("local:")) {
    const name = scriptId.slice("local:".length);
    const content = loadLocalScript(name);
    return content ? { content } : null;
  }
  const lower = scriptId.toLowerCase();
  for (const v of OFFICIAL_VARIANTS) {
    if (v.name.toLowerCase() === lower || v.url === scriptId) return { url: v.url };
  }
  for (const v of bundledVariants) {
    if (v.name.toLowerCase() === lower || v.url === scriptId) return { url: v.url };
  }
  if (scriptId.startsWith("/") || scriptId.startsWith("http")) {
    return { url: scriptId };
  }
  return null;
}

function useCompositeVariants(): VariantEntry[] {
  const bundled = useSelector(selectAllVariants);
  return useMemo(() => {
    const seen = new Set(bundled.map((v) => v.url));
    const local = listLocalScripts().map((s) => ({
      name: `📝 ${s.name}`,
      url: `local:${s.name}`,
    }));
    const extras = local.filter((l) => !seen.has(l.url));
    return [...bundled, ...extras];
  }, [bundled]);
}

function formatJson(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); }
  catch (e) { console.error("[DevEditorView] formatJson failed", e); return String(obj); }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DevEditorView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const variants = useCompositeVariants();
  const combobox = useCombobox();

  const [search, setSearch] = useState("");

  // ── Dev controls state ──
  const [selectedVariant, setSelectedVariant] = useState<VariantEntry | null>(null);
  const [playerCount, setPlayerCount] = useState<number | string>(2);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [variantName, setVariantName] = useState("");

  // ── Editor pane height (px) ──
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // ── Debug data ──
  const [actionLog, setActionLog] = useState("");
  const [gameState, setGameState] = useState<string | null>(null);
  const [variantConfig, setVariantConfig] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("log");

  // ── Send message to opener ──
  const postToOpener = useCallback((msg: object) => {
    if (!window.opener) return;
    window.opener.postMessage(msg, window.location.origin);
  }, []);

  // ── Load variant ──
  const handleLoad = useCallback(() => {
    const scriptId = selectedVariant?.url;
    if (!scriptId) {
      notifications.show({ title: "Load Error", message: "Select a variant first.", color: "red" });
      return;
    }
    const n = typeof playerCount === "number" ? playerCount : parseInt(String(playerCount), 10) || 2;
    const resolved = resolveScript(scriptId, variants);
    if (!resolved) {
      notifications.show({ title: "Load Error", message: `Cannot resolve: ${scriptId}`, color: "red" });
      return;
    }
    if ("content" in resolved) {
      postToOpener({ type: "load-variant", url: scriptId, players: n, script: resolved.content });
    } else {
      postToOpener({ type: "load-variant", url: resolved.url, players: n });
    }
  }, [selectedVariant, playerCount, variants, postToOpener]);

  // ── Controlling players changed ──
  const handlePlayersChange = useCallback((values: string[]) => {
    setSelectedPlayers(values);
    postToOpener({ type: "set-controlling-players", players: values });
  }, [postToOpener]);

  // ── Handle Test (from VariantEditorContent) → load into engine ──
  const handleTest = useCallback((scriptContent: string) => {
    const n = typeof playerCount === "number" ? playerCount : 2;
    postToOpener({ type: "load-variant", script: scriptContent, players: n, url: "__test__" });
  }, [playerCount, postToOpener]);

  // ── Notify opener we're ready; listen for engine state ──
  useEffect(() => {
    postToOpener({ type: "editor-ready" });

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      // Debug data from engine
      if (event.data?.type === "debug-data") {
        const data = event.data.data as DebugPayload;
        if (typeof data?.actionLog === "string") setActionLog(data.actionLog);
        if (data?.gameState != null) setGameState(formatJson(data.gameState));
        if (data?.variantConfig != null) setVariantConfig(formatJson(data.variantConfig));
        if (data?.validMoves != null) setValidMoves(formatJson(data.validMoves));
        return;
      }

      // Engine loaded → update dev controls
      if (event.data?.type === "engine-loaded") {
        if (event.data.variantName) setVariantName(event.data.variantName);
        if (event.data.variantUrl && selectedVariant?.url !== event.data.variantUrl) {
          const v = variants.find((v2) => v2.url === event.data.variantUrl);
          if (v) setSelectedVariant(v);
        }
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

  // ── Request game state when State tab is opened ──
  useEffect(() => {
    if (activeTab === "state" && !gameState) {
      postToOpener({ type: "request-state" });
    }
  }, [activeTab, gameState, postToOpener]);

  // ── Variant combobox select ──
  const handleVariantSelect = (url: string) => {
    const variant = variants.find((v) => v.url === url);
    if (variant) {
      setSelectedVariant(variant);
      combobox.closeDropdown();
    }
  };

  const filteredVariants = variants.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  // ── Resize handle drag logic ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = editorHeight ?? window.innerHeight * 0.65;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editorHeight]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientY - startY.current;
    const minTop = 200;
    const maxTop = window.innerHeight - 120;
    const newHeight = Math.max(minTop, Math.min(maxTop, startHeight.current + delta));
    setEditorHeight(newHeight);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // ── Render ──
  return (
    <Box
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--mantine-color-dark-9)",
      }}
    >
      {/* ── Dev controls toolbar ── */}
      <Box style={toolbarStyle}>
        <Group gap="sm" wrap="nowrap" align="center">
          {/* Variant combobox */}
          <Combobox store={combobox} withinPortal onOptionSubmit={handleVariantSelect}>
            <Combobox.Target>
              <InputBase
                component="button" type="button" pointer
                rightSection={<Text size="xs" c="dimmed">▼</Text>}
                onClick={() => combobox.toggleDropdown()}
                rightSectionPointerEvents="none"
                style={{ width: 200 }}
              >
                {selectedVariant ? (
                  <Text size="sm" truncate>{selectedVariant.name}</Text>
                ) : variantName ? (
                  <Text size="sm" truncate>{variantName}</Text>
                ) : (
                  <Text size="sm" c="dimmed">Select variant…</Text>
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

          {/* Player count */}
          <NumberInput
            size="xs" min={2} max={8}
            value={playerCount}
            onChange={setPlayerCount}
            style={{ width: 70 }}
          />

          {/* Load / Restart */}
          <Button
            size="xs"
            leftSection={<IconPlayerSkipBack size="0.85rem" />}
            onClick={handleLoad}
          >
            Load
          </Button>

          {/* Controlling players */}
          <MultiSelect
            size="xs"
            data={players.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedPlayers}
            onChange={(values) => handlePlayersChange(values)}
            clearable
            style={{ width: 200 }}
          />
        </Group>
      </Box>

      {/* ── Editor pane ── */}
      <Box
        style={{
          flex: "none", height: editorHeight ?? "55vh",
          overflow: "hidden", position: "relative",
          borderBottom: "1px solid var(--mantine-color-dark-4)",
        }}
      >
        <VariantEditorContent
          onTest={handleTest}
          showPopOut={false}
          editorHeight="100%"
        />
      </Box>

      {/* ── Resize handle ── */}
      <Box
        style={{
          flex: "none", height: RESIZE_HANDLE_H,
          cursor: "row-resize",
          background: "var(--mantine-color-dark-4)",
          transition: "background 0.15s",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* ── Debug panel ── */}
      <Box style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 80 }}>
        <Tabs value={activeTab} onChange={setActiveTab} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Tabs.List>
            <Tabs.Tab value="log"><Text size="xs" fw={activeTab === "log" ? 600 : 400}>Action Log</Text></Tabs.Tab>
            <Tabs.Tab value="state"><Text size="xs" fw={activeTab === "state" ? 600 : 400}>Game State</Text></Tabs.Tab>
            <Tabs.Tab value="config"><Text size="xs" fw={activeTab === "config" ? 600 : 400}>Variant Config</Text></Tabs.Tab>
            <Tabs.Tab value="moves"><Text size="xs" fw={activeTab === "moves" ? 600 : 400}>Valid Moves</Text></Tabs.Tab>
          </Tabs.List>

          <Box style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <Tabs.Panel value="log" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {actionLog || <Text size="xs" c="dimmed" fs="italic">No actions yet. Make a move on the board.</Text>}
              </Box>
            </Tabs.Panel>
            <Tabs.Panel value="state" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {gameState ?? <Text size="xs" c="dimmed" fs="italic">Requesting game state from engine…</Text>}
              </Box>
            </Tabs.Panel>
            <Tabs.Panel value="config" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {variantConfig ?? <Text size="xs" c="dimmed" fs="italic">Loading variant configuration…</Text>}
              </Box>
            </Tabs.Panel>
            <Tabs.Panel value="moves" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {validMoves ?? <Text size="xs" c="dimmed" fs="italic">Requesting valid moves from engine…</Text>}
              </Box>
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Box>
    </Box>
  );
}

export default DevEditorView;
