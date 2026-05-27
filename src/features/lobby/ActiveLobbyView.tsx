import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  List,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect } from "react";
import {
  IconBrandGithub,
  IconCheck,
  IconCopy,
  IconQrcode,
  IconUser,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { broadcastLobbyState } from "../../api/tabCoordination";
import { useDispatch, useSelector } from "../../app/hooks";
import {
  becomeActiveHost,
  closeLobby,
  leaveLobby,
  selectIsHost,
  selectHostUserId,
  selectIsPassiveHostTab,
  selectInviteUrl,
  selectLobbyAllowGuests,
  selectLobbyLocalUserId,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
  selectLobbyServerLobbyId,
  setLobbyAllowGuests,
} from "./lobbySlice";
import { getGithubBrowseUrl } from "./scriptUrl";
import { selectAllVariants } from "./variantsSlice";

export default function ActiveLobbyView() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const serverLobbyId = useSelector(selectLobbyServerLobbyId);
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  const variants = useSelector(selectAllVariants);
  const players = useSelector(selectLobbyPlayers);
  const localUserId = useSelector(selectLobbyLocalUserId);
  const allowGuests = useSelector(selectLobbyAllowGuests);
  const isHost = useSelector(selectIsHost);
  const hostUserId = useSelector(selectHostUserId);
  const inviteUrl = useSelector(selectInviteUrl);
  const isPassiveHostTab = useSelector(selectIsPassiveHostTab);
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const handleGuestToggle = (val: boolean) => {
    if (serverLobbyId) {
      void dispatch(setLobbyAllowGuests(val));
    }
  };

  const variantName =
    variants.find((v) => v.url === scriptUrl)?.name || "Custom Variant";
  const browseUrl = scriptUrl ? getGithubBrowseUrl(scriptUrl) : "";

  useEffect(() => {
    if (!serverLobbyId) {
      return;
    }

    broadcastLobbyState(serverLobbyId, {
      players: players.map((player) => ({
        userId: player.userId,
        name: player.name,
        connectionStatus: player.connectionStatus,
        role: player.userId === hostUserId ? "host" : undefined,
      })),
      isHost,
      hostUserId,
      scriptUrl,
    });
  }, [hostUserId, isHost, players, scriptUrl, serverLobbyId]);

  const renderConnectionBadge = (
    connectionStatus: (typeof players)[number]["connectionStatus"],
    isLocalPlayer: boolean,
  ) => {
    if (isLocalPlayer || connectionStatus === "self") {
      return null;
    }
    if (connectionStatus === "connected") {
      return (
        <ThemeIcon color="green" size={18} radius="xl" variant="light">
          <Box w={8} h={8} bg="green.6" style={{ borderRadius: "50%" }} />
        </ThemeIcon>
      );
    }
    if (connectionStatus === "failed") {
      return (
        <ThemeIcon color="red" size={18} radius="xl" variant="light">
          <Box w={8} h={8} bg="red.6" style={{ borderRadius: "50%" }} />
        </ThemeIcon>
      );
    }
    return (
      <Badge color="yellow" size="sm" variant="light">
        Connecting
      </Badge>
    );
  };

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
          {isMobile ? (
            <Stack gap="xs">
              <QRCodeSVG
                value={inviteUrl}
                style={{
                  width: "100%",
                  height: "auto",
                  padding: 8,
                  background: "white",
                  borderRadius: 4,
                  display: "block",
                }}
              />
              <CopyButton value={inviteUrl}>
                {({ copied, copy }) => (
                  <TextInput
                    value={inviteUrl}
                    readOnly
                    rightSection={
                      <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} title={copied ? "Copied!" : "Copy link"}>
                        {copied ? <IconCheck size="1rem" /> : <IconCopy size="1rem" />}
                      </ActionIcon>
                    }
                  />
                )}
              </CopyButton>
            </Stack>
          ) : (
            <Group align="flex-start" wrap="nowrap">
              <QRCodeSVG
                value={inviteUrl}
                size={128}
                bgColor="#ffffff"
                fgColor="#000000"
                style={{ padding: 8, background: "white", borderRadius: 4 }}
              />
              <CopyButton value={inviteUrl}>
                {({ copied, copy }) => (
                  <TextInput
                    value={inviteUrl}
                    readOnly
                    style={{ flex: 1 }}
                    rightSection={
                      <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} title={copied ? "Copied!" : "Copy link"}>
                        {copied ? <IconCheck size="1rem" /> : <IconCopy size="1rem" />}
                      </ActionIcon>
                    }
                  />
                )}
              </CopyButton>
            </Group>
          )}
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
              {players.map((p) => {
                const isLocalPlayer = p.userId === localUserId;
                return (
                  <List.Item key={p.userId}>
                    <Group justify="space-between" style={{ width: "100%" }}>
                      <Text>{p.name || "Anonymous"}</Text>
                      <Group gap="xs">
                        {renderConnectionBadge(p.connectionStatus, isLocalPlayer)}
                        {p.userId === hostUserId && (
                          <Badge color="yellow" size="sm" variant="light">
                            Host
                          </Badge>
                        )}
                        {p.name?.startsWith("Guest ") && (
                          <Badge color="gray" size="sm" variant="outline">
                            Guest
                          </Badge>
                        )}
                        {p.ready && (
                          <Badge color="green" size="sm">
                            Ready
                          </Badge>
                        )}
                      </Group>
                    </Group>
                  </List.Item>
                );
              })}
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
