import {
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
  Box,
  Switch,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { patchLobby } from "../../api/lobbyApi";
import { selectToken } from "../auth/authSlice";
import {
  IconBrandGithub,
  IconCopy,
  IconUser,
  IconQrcode,
} from "@tabler/icons-react";
import { useDispatch, useSelector } from "../../app/hooks";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  leaveLobby,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
  selectLobbyServerLobbyId,
} from "./lobbySlice";
import { getGithubBrowseUrl } from "./scriptUrl";
import { selectAllVariants } from "./variantsSlice";

export default function ActiveLobbyView({ inviteUrl, allowGuests: initialAllowGuests }: { inviteUrl: string, allowGuests: boolean }) {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const serverLobbyId = useSelector(selectLobbyServerLobbyId);
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  const variants = useSelector(selectAllVariants);
  const players = useSelector(selectLobbyPlayers);
  const [allowGuests, setAllowGuests] = useState(initialAllowGuests);
  const isHost = inviteUrl !== "";

  const handleGuestToggle = async (val: boolean) => {
    setAllowGuests(val);
    if (serverLobbyId && token) {
       try {
         await patchLobby(serverLobbyId, { allowGuests: val }, token);
         notifications.show({ title: "Settings updated", message: "Guest permissions changed.", color: "green" });
       } catch (err) {
         notifications.show({ title: "Error", message: "Failed to update settings.", color: "red" });
         setAllowGuests(!val); // revert
       }
    }
  };

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

        
        {isHost && (
          <Box mt="md">
            <Switch
              label="Allow unauthenticated players"
              style={{ cursor: "pointer" }}
              styles={{ track: { cursor: "pointer" } }}
              description="Anyone with the link can join as a guest"
              checked={allowGuests}
              onChange={(e) => handleGuestToggle(e.currentTarget.checked)}
            />
          </Box>
        )}
        <Box>
          <Text size="sm" fw={500} mb="xs">

            Invite link
          </Text>
          <Group align="flex-start" wrap="nowrap">
            <QRCodeSVG value={inviteUrl} size={128} bgColor="#ffffff" fgColor="#000000" style={{ padding: 8, background: "white", borderRadius: 4 }} />
            <Stack style={{ flex: 1 }} gap="xs">
              <Code style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {inviteUrl}
              </Code>
              <CopyButton value={inviteUrl}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-sm"
                    variant="light"
                    color={copied ? "teal" : "blue"}
                    leftSection={
                      <IconCopy size="0.9rem" />
                    }
                    onClick={copy}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            </Stack>
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
                    {p.name?.startsWith("Guest ") && (
                      <Badge color="gray" size="sm" variant="outline" ml="xs">Guest</Badge>
                    )}
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


