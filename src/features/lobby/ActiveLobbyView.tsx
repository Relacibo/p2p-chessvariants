import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  List,
  ThemeIcon,
  Badge,
} from "@mantine/core";
import {
  IconBrandGithub,
  IconCheck,
  IconCopy,
  IconUser,
} from "@tabler/icons-react";
import { useDispatch, useSelector } from "../../app/hooks";
import {
  leaveLobby,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
} from "./lobbySlice";
import { getGithubBrowseUrl } from "./scriptUrl";
import { selectAllVariants } from "./variantsSlice";

export default function ActiveLobbyView({ inviteUrl }: { inviteUrl: string }) {
  const dispatch = useDispatch();
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  const variants = useSelector(selectAllVariants);
  const players = useSelector(selectLobbyPlayers);

  const variantName =
    variants.find((v) => v.url === scriptUrl)?.name || "Custom Variant";
  const browseUrl = scriptUrl ? getGithubBrowseUrl(scriptUrl) : "";

  // Note: Min/Max players would ideally be fetched from the engine,
  // but for now we just show the active players.

  return (
    <Paper p="xl" shadow="sm" radius="md" withBorder>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Waiting for players...</Title>
            <Text c="dimmed" size="sm" mt="xs">
              Variant: {variantName}
            </Text>
          </div>
          {scriptUrl && (
            <Button
              component="a"
              href={browseUrl}
              target="_blank"
              variant="light"
              leftSection={<IconBrandGithub size="0.9rem" />}
            >
              Source
            </Button>
          )}
        </Group>

        <Alert
          icon={<IconCheck size="1rem" />}
          color="green"
          title="Lobby created!"
        >
          Share the invite link below with players you want to invite.
        </Alert>

        <Box>
          <Text size="sm" fw={500} mb="xs">
            Invite link
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Code
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {inviteUrl}
            </Code>
            <CopyButton value={inviteUrl}>
              {({ copied, copy }) => (
                <Button
                  size="compact-sm"
                  variant="light"
                  color={copied ? "teal" : "blue"}
                  leftSection={
                    copied ? (
                      <IconCheck size="0.9rem" />
                    ) : (
                      <IconCopy size="0.9rem" />
                    )
                  }
                  onClick={copy}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Box>

        <Box>
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={500}>
              Connected Players
            </Text>
            <Badge size="lg" variant="light">
              {players.length}
            </Badge>
          </Group>
          <Paper withBorder p="md" radius="md">
            <List
              spacing="sm"
              size="sm"
              center
              icon={
                <ThemeIcon color="blue" size={24} radius="xl" variant="light">
                  <IconUser size="1rem" />
                </ThemeIcon>
              }
            >
              {players.map((p) => (
                <List.Item key={p.userId}>
                  <Group justify="space-between" style={{ width: "100%" }}>
                    <Text>{p.name || "Anonymous"}</Text>
                    {p.ready && (
                      <Badge color="green" size="sm">
                        Ready
                      </Badge>
                    )}
                  </Group>
                </List.Item>
              ))}
              {players.length === 0 && (
                <Text c="dimmed" fs="italic">
                  Waiting for others to join...
                </Text>
              )}
            </List>
          </Paper>
        </Box>

        <Button
          variant="subtle"
          color="red"
          onClick={() => dispatch(leaveLobby())}
        >
          Cancel lobby
        </Button>
      </Stack>
    </Paper>
  );
}

// Ensure Box is imported for the new view layout
import { Box } from "@mantine/core";
