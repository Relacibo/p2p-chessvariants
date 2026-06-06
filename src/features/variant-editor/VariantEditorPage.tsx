import { useEffect, useRef } from "react";
import { Paper, Stack, Title } from "@mantine/core";
import useConfigureLayout from "../layout/hooks";
import { VariantEditorContent } from "./VariantEditorContent";

/**
 * Standalone variant editor page (opened via pop-out from DevBoard).
 * Communicates "Test" back to the opener via BroadcastChannel.
 */
export default function VariantEditorPage() {
  useConfigureLayout(() => ({ navPinned: false }));
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    bcRef.current = new BroadcastChannel("cv-editor");
    return () => {
      bcRef.current?.close();
      bcRef.current = null;
    };
  }, []);

  const handleTest = (scriptContent: string) => {
    bcRef.current?.postMessage({ type: "test", script: scriptContent });
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
