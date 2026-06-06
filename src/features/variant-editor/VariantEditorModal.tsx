import { Modal } from "@mantine/core";
import { VariantEditorContent } from "./VariantEditorContent";

interface VariantEditorModalProps {
  opened: boolean;
  onClose: () => void;
  onTest: (scriptContent: string) => void;
}

export default function VariantEditorModal({
  opened,
  onClose,
  onTest,
}: VariantEditorModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton
      title="Variant Editor"
      styles={{ body: { padding: "8px 16px" } }}
    >
      <VariantEditorContent onTest={onTest} showPopOut />
    </Modal>
  );
}
