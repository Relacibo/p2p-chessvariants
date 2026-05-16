import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconCheck, IconCopy } from "@tabler/icons-react";
import { useDispatch, useSelector } from "../../app/hooks";
import { createLobby, leaveLobby, selectLobbyStatus } from "./lobbySlice";
import { parseScriptUrl, scriptUrlErrorMessage, normalizeScriptUrl } from "./scriptUrl";

function CreateLobbyForm() {
  const dispatch = useDispatch();
  const status = useSelector(selectLobbyStatus);
  const isCreating = status.phase === "creating";

  const form = useForm({
    initialValues: { scriptUrl: "" },
    validate: {
      scriptUrl: (v) => {
        if (!v.trim()) return "Script URL is required";
        const result = parseScriptUrl(v.trim());
        if (!result.ok) return scriptUrlErrorMessage(result.error);
        return null;
      },
    },
  });

  return (
    <form
      onSubmit={form.onSubmit(({ scriptUrl }) => {
        const normalized = normalizeScriptUrl(scriptUrl.trim());
        dispatch(createLobby(normalized));
      })}
    >
      <Stack>
        <TextInput
          label="Script URL"
          description="GitHub Raw URL or GitHub browse link (must reference a commit SHA)"
          placeholder="https://raw.githubusercontent.com/... or https://github.com/.../blob/..."
          {...form.getInputProps("scriptUrl")}
        />
        <Button type="submit" loading={isCreating}>
          Create Lobby
        </Button>
      </Stack>
    </form>
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
