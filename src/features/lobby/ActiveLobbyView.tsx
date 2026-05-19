import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  List,
  Paper,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBrandGithub,
  IconCopy,
  IconQrcode,
  IconUser,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { usePatchLobbyMutation } from "../../api/api";
import { useDispatch, useSelector } from "../../app/hooks";
import {
  becomeActiveHost,
  closeLobby,
  leaveLobby,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
  selectLobbyServerLobbyId,
} from "./lobbySlice";
import { getGithubBrowseUrl } from "./scriptUrl";
import { selectAllVariants } from "./variantsSlice";

export default function ActiveLobbyView({
  inviteUrl,
  allowGuests: initialAllowGuests,
  isPassiveHostTab,
}: {
  inviteUrl: string;
  allowGuests: boolean;
  isPassiveHostTab?: boolean;
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const serverLobbyId = useSelector(selectLobbyServerLobbyId);
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  const variants = useSelector(selectAllVariants);
  const players = useSelector(selectLobbyPlayers);
  const [allowGuests, setAllowGuests] = useState(initialAllowGuests);
  const [patchLobbyMutation] = usePatchLobbyMutation();
  const isHost = inviteUrl !== "";

  const handleGuestToggle = async (val: boolean) => {
    setAllowGuests(val);
    if (serverLobbyId) {
      try {
        await patchLobbyMutation({
          id: serverLobbyId,
          patch: { allowGuests: val },
        }).unwrap();
        notifications.show({
          title: "Settings updated",
          message: "Guest permissions changed.",
          color: "green",
        });
      } catch (err) {
        notifications.show({
          title: "Error",
          message: "Failed to update settings.",
          color: "red",
        });
        setAllowGuests(!val);
      }
    }
  };

  const variantName =
    variants.find((v) => v.url === scriptUrl)?.name || "Custom Variant";
  const browseUrl = scriptUrl ? getGithubBrowseUrl(scriptUrl) : "";

  return (
    <Paper p="xl" shadow="sm" radius="md" withBorder>
      <Stack gap="lg">
        {isPassiveHostTab && (
          <Alert color="yellow" title="Not the active host tab">
            Another tab is the active host for this lobby and is sending
            heartbeats.
            <Button
              size="xs"
              variant="filled"
              color="yellow"
              mt="xs"
              onClick={() => dispatch(becomeActiveHost())}
            >
              Make this tab the active host
            </Button>
          </Alert>
        )}
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
            <QRCodeSVG
              value={inviteUrl}
              size={128}
              bgColor="#ffffff"
              fgColor="#000000"
              style={{ padding: 8, background: "white", borderRadius: 4 }}
            />
            <Group
              style={{ flex: 1, minWidth: 0 }}
              gap="xs"
              align="center"
              wrap="nowrap"
            >
              <Code
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {inviteUrl}
              </Code>
              <CopyButton value={inviteUrl}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-sm"
                    variant="light"
                    color={copied ? "teal" : "blue"}
                    leftSection={<IconCopy size="0.9rem" />}
                    onClick={copy}
                    style={{ flexShrink: 0 }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            </Group>
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
                      <Badge color="gray" size="sm" variant="outline" ml="xs">
                        Guest
                      </Badge>
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

        <Group justify="center" mt="sm">
          {isHost ? (
            <Button
              variant="subtle"
              color="red"
              size="sm"
              onClick={async () => {
                await dispatch(closeLobby());
                navigate("/", { replace: true });
              }}
            >
              Close lobby
            </Button>
          ) : (
            <Button
              variant="subtle"
              color="orange"
              size="sm"
              onClick={async () => {
                await dispatch(leaveLobby());
                navigate("/", { replace: true });
              }}
            >
              Leave lobby
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
