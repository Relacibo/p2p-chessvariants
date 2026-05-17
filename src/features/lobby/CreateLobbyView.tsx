import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import { selectToken } from "../auth/authSlice";
import { createLobby, leaveLobby, selectLobbyStatus } from "./lobbySlice";
import {
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
}: {
  opened: boolean;
  onClose: () => void;
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

  const form = useForm({
    initialValues: { scriptUrl: "", useServerLobby: canUseServerLobby },
    validate: {
      scriptUrl: (v) => {
        if (!v.trim()) return "Script URL is required";
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

  const variantOptions = variants.map((v) => ({
    value: v.url,
    label: v.name,
  }));

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
            <Select
              label="Select Variant"
              placeholder="Pick a variant"
              data={variantOptions}
              style={{ flex: 1 }}
              searchable
              {...form.getInputProps("scriptUrl")}
              renderOption={({ option, checked }) => (
                <Group justify="space-between" style={{ width: "100%" }}>
                  <Text size="sm">{option.label}</Text>
                  {!OFFICIAL_VARIANTS.some((v) => v.url === option.value) && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(removeCustomVariant(option.value));
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <IconTrash size="1rem" />
                    </ActionIcon>
                  )}
                </Group>
              )}
            />
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
      <AddCustomVariantModal opened={opened} onClose={close} />
    </>
  );
}

function HostingView({ inviteUrl }: { inviteUrl: string }) {
  const dispatch = useDispatch();
  return (
    <Stack>
      <Alert icon={<IconCheck size="1rem" />} color="green" title="Lobby created!">
        Share the invite link below with players you want to invite.
      </Alert>
      <Text size="sm" fw={500}>
        Invite link
      </Text>
      <Group gap="xs" wrap="nowrap">
        <Code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {inviteUrl}
        </Code>
        <CopyButton value={inviteUrl}>
          {({ copied, copy }) => (
            <Button
              size="compact-sm"
              variant="light"
              color={copied ? "teal" : "blue"}
              leftSection={copied ? <IconCheck size="0.9rem" /> : <IconCopy size="0.9rem" />}
              onClick={copy}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Button
        variant="subtle"
        color="red"
        size="compact-sm"
        onClick={() => dispatch(leaveLobby())}
      >
        Cancel lobby
      </Button>
    </Stack>
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
        {status.phase === "hosting" ? (
          <HostingView inviteUrl={status.inviteUrl} />
        ) : (
          <CreateLobbyForm />
        )}
      </Stack>
    </Paper>
  );
}
