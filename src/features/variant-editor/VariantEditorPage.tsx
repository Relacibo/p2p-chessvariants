import { useEffect } from "react";
import { Paper, Stack, Title } from "@mantine/core";
import useConfigureLayout from "../layout/hooks";
import { VariantEditorContent } from "./VariantEditorContent";

/**
 * Standalone variant editor page (opened via pop-out from DevBoard).
 * Communicates "Test" back to the opener window via postMessage.
 */
export default function VariantEditorPage() {
  useConfigureLayout(() => ({ navPinned: false }));

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cv-editor-draft" && e.newValue) {
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
      <Stack h="100%" gap="xs">
        <Title order={3}>Variant Editor</Title>
        <VariantEditorContent onTest={handleTest} />
      </Stack>
    </Paper>
  );
}
