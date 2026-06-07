import { useCallback, useEffect } from "react";
import { VariantEditorContent } from "../variant-editor/VariantEditorContent";
import useConfigureLayout from "../layout/hooks";

/**
 * Full-screen variant editor opened in a separate pop-up window.
 * Communicates with the parent DevBoardView window via postMessage:
 * - `{ type: "test-script", script: string }`  → load script into engine
 */
export function DevEditorView() {
  useConfigureLayout(() => ({ navPinned: false }));

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

  // Notify opener when the popup is ready to receive (optional, for future extensions)
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage(
        { type: "editor-ready" },
        window.location.origin,
      );
    }
  }, []);

  return (
    <VariantEditorContent
      onTest={handleTest}
      showPopOut={false}
    />
  );
}

export default DevEditorView;
