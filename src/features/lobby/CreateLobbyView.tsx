import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Code,
  Combobox,
  CopyButton,
  Group,
  Input,
  InputBase,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  useCombobox,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconBrandGithub,
  IconCheck,
  IconCopy,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import { selectToken } from "../auth/authSlice";
import {
  createLobby,
  leaveLobby,
  selectLobbyScriptUrl,
  selectLobbyStatus,
} from "./lobbySlice";
import {
  getGithubBrowseUrl,
  normalizeScriptUrl,
  parseScriptUrl,
  scriptUrlErrorMessage,
  validateAndGetName,
} from "./scriptUrl";
import {
  addCustomVariant,
  OFFICIAL_VARIANTS,
  removeCustomVariant,
  selectAllVariants,
} from "./variantsSlice";

function AddCustomVariantModal({
  opened,
  onClose,
  onAdded,
}: {
  opened: boolean;
  onClose: () => void;
  onAdded: (url: string) => void;
}) {
  const dispatch = useDispatch();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    setLoading(true);
    try {
      const normalized = normalizeScriptUrl(url.trim());
      const name = await validateAndGetName(normalized);
      dispatch(addCustomVariant({ name, url: normalized }));
      onAdded(normalized);
      setUrl("");
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to add variant");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add Custom Variant">
      <Stack>
        <TextInput
          label="Script URL"
          placeholder="https://raw.githubusercontent.com/..."
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          error={error}
        />
        <Button onClick={handleAdd} loading={loading}>
          Add Variant
        </Button>
      </Stack>
    </Modal>
  );
}

function CreateLobbyForm() {
  const dispatch = useDispatch();
  const status = useSelector(selectLobbyStatus);
  const token = useSelector(selectToken);
  const variants = useSelector(selectAllVariants);
  const canUseServerLobby = !!token;
  const isCreating = status.phase === "creating";

  const [opened, { open, close }] = useDisclosure(false);

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      combobox.focusTarget();
      setSearch("");
    },
    onDropdownOpen: () => {
      combobox.focusSearchInput();
    },
  });

  const [search, setSearch] = useState("");

  const form = useForm({
    initialValues: { scriptUrl: "", useServerLobby: canUseServerLobby },
    validate: {
      scriptUrl: (v) => {
        if (!v.trim()) return "Variant is required";
        const result = parseScriptUrl(v.trim());
        if (!result.ok) return scriptUrlErrorMessage(result.error);
        return null;
      },
    },
  });

  useEffect(() => {
    if (canUseServerLobby) {
      form.setFieldValue("useServerLobby", true);
    } else {
      form.setFieldValue("useServerLobby", false);
    }
  }, [canUseServerLobby]);

  const filteredVariants = variants.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const options = filteredVariants.map((item) => (
    <Combobox.Option value={item.url} key={item.url}>
      <Group justify="space-between" style={{ width: "100%" }}>
        <Text size="sm">{item.name}</Text>
        {!OFFICIAL_VARIANTS.some((v) => v.url === item.url) && (
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              dispatch(removeCustomVariant(item.url));
              if (form.values.scriptUrl === item.url) {
                form.setFieldValue("scriptUrl", "");
              }
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <IconTrash size="1rem" />
          </ActionIcon>
        )}
      </Group>
    </Combobox.Option>
  ));

  const selectedVariant = variants.find((v) => v.url === form.values.scriptUrl);

  return (
    <>
      <form
        onSubmit={form.onSubmit(({ scriptUrl, useServerLobby }) => {
          const normalized = normalizeScriptUrl(scriptUrl.trim());
          dispatch(createLobby(normalized, canUseServerLobby && useServerLobby));
        })}
      >
        <Stack>
          <Group align="flex-end">
            <Combobox
              store={combobox}
              withinPortal={false}
              onOptionSubmit={(val) => {
                form.setFieldValue("scriptUrl", val);
                combobox.closeDropdown();
              }}
            >
              <Combobox.Target>
                <InputBase
                  component="button"
                  type="button"
                  pointer
                  rightSection={<Combobox.Chevron />}
                  onClick={() => combobox.toggleDropdown()}
                  rightSectionPointerEvents="none"
                  label="Select Variant"
                  error={form.errors.scriptUrl}
                  style={{ flex: 1 }}
                >
                  {selectedVariant ? (
                    <Group justify="space-between" style={{ width: "100%" }}>
                      <Text>{selectedVariant.name}</Text>
                      <Tooltip label="View Source">
                        <ActionIcon
                          variant="transparent"
                          color="gray"
                          component="a"
                          href={getGithubBrowseUrl(selectedVariant.url)}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <IconBrandGithub size="1.2rem" />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  ) : (
                    <Input.Placeholder>Pick a variant</Input.Placeholder>
                  )}
                </InputBase>
              </Combobox.Target>

              <Combobox.Dropdown>
                <Combobox.Search
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Search variants"
                />
                <Combobox.Options>
                  {options.length > 0 ? (
                    options
                  ) : (
                    <Combobox.Empty>Nothing found</Combobox.Empty>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
            <Tooltip label="Add custom variant">
              <ActionIcon variant="light" size="lg" onClick={open}>
                <IconPlus size="1.2rem" />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Tooltip
            label={canUseServerLobby ? "" : "Login required for server lobby"}
            disabled={canUseServerLobby}
          >
            <div>
              <Checkbox
                label="Create server lobby"
                description="Enable server-side lobby tracking/events"
                disabled={!canUseServerLobby}
                {...form.getInputProps("useServerLobby", { type: "checkbox" })}
              />
            </div>
          </Tooltip>
          <Button type="submit" loading={isCreating}>
            Create Lobby
          </Button>
        </Stack>
      </form>
      <AddCustomVariantModal
        opened={opened}
        onClose={close}
        onAdded={(url) => form.setFieldValue("scriptUrl", url)}
      />
    </>
  );
}

export default function CreateLobbyView() {
  const status = useSelector(selectLobbyStatus);

  return (
    <Paper p="md" shadow="xs">
      <Stack>
        <Title order={3}>Create Lobby</Title>
        {status.phase === "error" && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            color="red"
            title="Error"
          >
            {status.message}
          </Alert>
        )}
        <CreateLobbyForm />
      </Stack>
    </Paper>
  );
}
