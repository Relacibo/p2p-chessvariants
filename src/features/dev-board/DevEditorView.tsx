import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Group, Tabs, Text } from "@mantine/core";
import { VariantEditorContent } from "../variant-editor/VariantEditorContent";
import useConfigureLayout from "../layout/hooks";
import type { WasmVariantConfig, WasmPlayerMoves } from "../chessboard/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    console.error("[DevEditorView] formatJson failed", e);
    return String(obj);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebugPayload {
  actionLog?: string;
  gameState?: object;
  variantConfig?: object;
  validMoves?: object;
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

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Full-screen variant editor with tiled debug panels (VSCode-style).
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │  Toolbar (template, save, load, …)   │
 *   ├──────────────────────────────────────┤
 *   │                                      │
 *   │          Monaco Editor               │  ← resizable top pane
 *   │                                      │
 *   ├──────────────────────────────────────┤  ← drag handle
 *   │ [Action Log] [State] [Config] [Moves]│  ← tabbed debug panel
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * Communicates with parent DevBoardView via postMessage:
 *   → { type: "test-script", script: string }
 *   ← { type: "debug-data", data: DebugPayload }
 */
export function DevEditorView() {
  useConfigureLayout(() => ({ navPinned: false }));

  // ── Editor pane height (px) ──
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // ── Debug data ──
  const [actionLog, setActionLog] = useState("");
  const [gameState, setGameState] = useState<string | null>(null);
  const [variantConfig, setVariantConfig] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("log");

  // ── Request game state from opener when State tab is opened ──
  useEffect(() => {
    if (activeTab === "state" && window.opener && !gameState) {
      window.opener.postMessage({ type: "request-state" }, window.location.origin);
    }
  }, [activeTab, gameState]);

  // ── Handle Test → postMessage to opener ──
  const handleTest = useCallback((scriptContent: string) => {
    if (!window.opener) {
      console.warn("[DevEditorView] No opener window — Test will have no effect.");
      return;
    }
    window.opener.postMessage(
      { type: "test-script", script: scriptContent },
      window.location.origin,
    );
  }, []);

  // ── Listen for debug data from opener (DevBoardView) ──
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "debug-data") return;
      const data = event.data.data as DebugPayload;
      if (typeof data?.actionLog === "string") setActionLog(data.actionLog);
      if (data?.gameState != null) setGameState(formatJson(data.gameState));
      if (data?.variantConfig != null) setVariantConfig(formatJson(data.variantConfig));
      if (data?.validMoves != null) setValidMoves(formatJson(data.validMoves));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Notify opener we're ready ──
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "editor-ready" }, window.location.origin);
    }
  }, []);

  // ── Resize handle drag logic ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    // Capture current editor pane height
    startHeight.current = editorHeight ?? window.innerHeight * 0.65;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editorHeight]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientY - startY.current;
    const minTop = 200; // minimum editor height
    const maxTop = window.innerHeight - 120; // leave room for panel
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
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--mantine-color-dark-9)",
      }}
    >
      {/* ── Editor pane ── */}
      <Box
        style={{
          flex: "none",
          height: editorHeight ?? "65vh",
          overflow: "hidden",
          position: "relative",
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
          flex: "none",
          height: RESIZE_HANDLE_H,
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
      <Box
        ref={panelRef}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 80,
        }}
      >
        <Tabs value={activeTab} onChange={setActiveTab} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Tabs.List>
            <Tabs.Tab value="log">
              <Text size="xs" fw={activeTab === "log" ? 600 : 400}>Action Log</Text>
            </Tabs.Tab>
            <Tabs.Tab value="state">
              <Text size="xs" fw={activeTab === "state" ? 600 : 400}>Game State</Text>
            </Tabs.Tab>
            <Tabs.Tab value="config">
              <Text size="xs" fw={activeTab === "config" ? 600 : 400}>Variant Config</Text>
            </Tabs.Tab>
            <Tabs.Tab value="moves">
              <Text size="xs" fw={activeTab === "moves" ? 600 : 400}>Valid Moves</Text>
            </Tabs.Tab>
          </Tabs.List>

          <Box style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <Tabs.Panel value="log" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {actionLog || (
                  <Text size="xs" c="dimmed" fs="italic">
                    No actions yet. Make a move on the board.
                  </Text>
                )}
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="state" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {gameState ?? (
                  <Text size="xs" c="dimmed" fs="italic">
                    Requesting game state from engine…
                  </Text>
                )}
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="config" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {variantConfig ?? (
                  <Text size="xs" c="dimmed" fs="italic">
                    Loading variant configuration…
                  </Text>
                )}
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="moves" style={{ height: "100%" }}>
              <Box style={panelStyle}>
                {validMoves ?? (
                  <Text size="xs" c="dimmed" fs="italic">
                    Requesting valid moves from engine…
                  </Text>
                )}
              </Box>
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Box>
    </Box>
  );
}

export default DevEditorView;
