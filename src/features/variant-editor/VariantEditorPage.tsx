import { useEffect } from "react";
import { Paper } from "@mantine/core";
import useConfigureLayout from "../layout/hooks";
import { VariantEditorContent } from "./VariantEditorContent";

/**
 * Standalone variant editor page (opened via pop-out from DevBoard).
 * Communicates "Test" back to the opener window via postMessage.
 */
export default function VariantEditorPage() {
  useConfigureLayout(() => ({ navPinned: false }));

  // Listen for localStorage changes from the main window
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cv-editor-draft" && e.newValue) {
        // The opener saved a draft — reload to pick it up
        window.location.reload();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleTest = (scriptContent: string) => {
    if (window.opener) {
      window.opener.postMessage(
        { type: "cv-test-script", script: scriptContent },
        window.location.origin,
      );
    }
  };

  return (
    <Paper p="md" h="100vh" style={{ borderRadius: 0 }}>
      <VariantEditorContent onTest={handleTest} />
    </Paper>
  );
}
