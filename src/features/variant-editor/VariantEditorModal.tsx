import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Editor } from "@monaco-editor/react";
import { IconDeviceFloppy, IconFolderOpen, IconPlayerPlay } from "@tabler/icons-react";
import { registerRhaiLanguage } from "./rhaiLanguage";
import {
  listLocalScripts,
  loadLocalScript,
  saveLocalScript,
} from "./localScripts";

/** Minimal working Rhai variant skeleton. */
const EMPTY_TEMPLATE = `fn config() {
    #{ api_version: 1, name: "My Variant", version: "0.1.0", colors: ["white", "black"],
       allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } }
}

fn setup_players(variant_config, player_count) {
    #{ players: [
        #{ id: 0, name: "White", team: 0, data: #{ color: "white" } },
        #{ id: 1, name: "Black", team: 1, data: #{ color: "black" } },
    ] }
}

fn init(variant_config, setup) {
    #{ board: standard_start_position(),
       data: #{ turn: 0 } }
}

fn valid_moves(state, player) {
    // TODO: implement move generation
    []
}

fn derive_game_progress(state, all_valid_moves) {
    for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } }
    Draw()
}

fn handle_action(state, player, action) {
    // TODO: implement move logic
    state
}
`;

interface TemplateOption {
  value: string;
  label: string;
}

const TEMPLATES: TemplateOption[] = [
  { value: "/variants/chess.rhai", label: "Chess (Standard)" },
  { value: "/variants/seirawan_chess.rhai", label: "Seirawan Chess" },
  { value: "/variants/bughouse.rhai", label: "Bughouse" },
  { value: "/variants/4player.rhai", label: "4-Player" },
  { value: "__empty__", label: "Empty Skeleton" },
];

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
  const [scriptContent, setScriptContent] = useState(EMPTY_TEMPLATE);
  const [scriptName, setScriptName] = useState("");
  const [template, setTemplate] = useState<string | null>("__empty__");

  // Load template when dropdown changes
  useEffect(() => {
    if (!template) return;
    if (template === "__empty__") {
      setScriptContent(EMPTY_TEMPLATE);
      return;
    }
    fetch(template)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => setScriptContent(text))
      .catch((e) => {
        console.error("[VariantEditor] failed to load template", e);
        notifications.show({
          title: "Template Error",
          message: `Failed to load ${template}: ${e.message}`,
          color: "red",
        });
      });
  }, [template]);

  const handleSave = useCallback(() => {
    const name = scriptName.trim();
    if (!name) {
      notifications.show({
        title: "Save Error",
        message: "Please enter a script name.",
        color: "red",
      });
      return;
    }
    saveLocalScript(name, scriptContent);
    notifications.show({
      title: "Saved",
      message: `"${name}" saved to local storage.`,
      color: "green",
    });
  }, [scriptName, scriptContent]);

  const handleTest = useCallback(() => {
    if (!scriptContent.trim()) return;
    onTest(scriptContent);
    onClose();
  }, [scriptContent, onTest, onClose]);

  // Load dialog
  const [loadOpened, { open: openLoad, close: closeLoad }] = useDisclosure(false);
  const [savedScripts, setSavedScripts] = useState<{ name: string; savedAt: number }[]>([]);

  const handleOpenLoad = useCallback(() => {
    setSavedScripts(listLocalScripts());
    openLoad();
  }, [openLoad]);

  const handleLoadScript = useCallback(
    (name: string) => {
      const script = loadLocalScript(name);
      if (script) {
        setScriptContent(script);
        setScriptName(name);
        setTemplate(null); // clear template selection
        closeLoad();
        notifications.show({
          title: "Loaded",
          message: `"${name}" loaded.`,
          color: "green",
        });
      }
    },
    [closeLoad],
  );

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        fullScreen
        withCloseButton
        title="Variant Editor"
        styles={{ body: { padding: "8px 16px" } }}
      >
        <Stack h="100%" gap="xs">
          {/* Toolbar */}
          <Group wrap="nowrap">
            <Select
              data={TEMPLATES}
              value={template}
              onChange={setTemplate}
              placeholder="Template"
              clearable
              style={{ width: 200 }}
            />
            <TextInput
              placeholder="Script name"
              value={scriptName}
              onChange={(e) => setScriptName(e.currentTarget.value)}
              style={{ width: 180 }}
            />
            <Button
              variant="light"
              leftSection={<IconDeviceFloppy size="1.1rem" />}
              onClick={handleSave}
            >
              Save
            </Button>
            <Button
              variant="light"
              leftSection={<IconFolderOpen size="1.1rem" />}
              onClick={handleOpenLoad}
            >
              Load
            </Button>
            <Button
              variant="filled"
              leftSection={<IconPlayerPlay size="1.1rem" />}
              onClick={handleTest}
            >
              Test
            </Button>
          </Group>

          {/* Monaco Editor */}
          <Editor
            height="calc(100vh - 100px)"
            language="rhai"
            theme="vs-dark"
            value={scriptContent}
            onChange={(v) => setScriptContent(v ?? "")}
            beforeMount={(monaco) => registerRhaiLanguage(monaco)}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </Stack>
      </Modal>

      {/* Load dialog */}
      <Modal
        opened={loadOpened}
        onClose={closeLoad}
        title="Load Script"
        size="sm"
      >
        {savedScripts.length === 0 ? (
          <span>No saved scripts.</span>
        ) : (
          <Stack>
            {savedScripts.map((s) => (
              <Group key={s.name} justify="space-between">
                <div>
                  <div>{s.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {new Date(s.savedAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => handleLoadScript(s.name)}
                >
                  Load
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Modal>
    </>
  );
}
