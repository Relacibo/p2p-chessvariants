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
import {
  IconBrandGithub,
  IconCheck,
  IconCopy,
  IconQrcode,
  IconUser,
  IconUserOff,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useDispatch, useSelector } from "../../app/hooks";
import {
  becomeActiveHost,
  closeLobby,
  kickPlayer,
  leaveLobby,
  requestSlot,
  startGame,
  selectIsHost,
  selectHostUserId,
  selectIsPassiveHostTab,
  selectInviteUrl,
  selectLobbyAllowGuests,
  selectLobbyLocalUserId,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
  selectLobbyServerLobbyId,
  selectPlayerAssignments,
  selectVariantConfig,
  setLobbyAllowGuests,
} from "./lobbySlice";
import { getGithubBrowseUrl } from "./scriptUrl";
import { selectAllVariants } from "./variantsSlice";
import { getMaxSlots, isValidPlayerCount, formatSlotRange, getSlotLabel } from "./playerCountUtils";

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
  const playerAssignments = useSelector(selectPlayerAssignments);
  const variantConfig = useSelector(selectVariantConfig);
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const allowedPlayerCount = variantConfig?.allowed_player_count;
  const colors = variantConfig?.colors;

  const mySlot = localUserId != null ? (playerAssignments[localUserId] ?? -1) : -1;
  const slotCount = allowedPlayerCount ? getMaxSlots(allowedPlayerCount) : 0;
  const assignedCount = Object.keys(playerAssignments).length;

  const allSlotsAssigned =
    players.length > 0 &&
    assignedCount === slotCount &&
    players.every((p) => playerAssignments[p.userId] != null);
  const allPeersConnected = players.every(
    (p) => p.userId === localUserId || p.connectionStatus === "connected",
  );
  const countValid = allowedPlayerCount
    ? isValidPlayerCount(allowedPlayerCount, assignedCount)
    : players.length > 0;
  const canStartGame = isHost && allSlotsAssigned && allPeersConnected && countValid;

  const handleGuestToggle = (val: boolean) => {
    if (serverLobbyId) {
      void dispatch(setLobbyAllowGuests(val));
    }
  };

  const variantName =
    variants.find((v) => v.url === scriptUrl)?.name || "Custom Variant";
  const browseUrl = scriptUrl ? getGithubBrowseUrl(scriptUrl) : "";

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
              {assignedCount} / {allowedPlayerCount ? formatSlotRange(allowedPlayerCount) : "?"}
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
                const assignedSlot = playerAssignments[p.userId] ?? -1;
                return (
                  <List.Item key={p.userId}>
                    <Group justify="space-between" style={{ width: "100%" }}>
                      <Text>{p.name ?? p.userId.slice(0, 8)}</Text>
                      <Group gap="xs">
                        {assignedSlot >= 0 ? (
                          <Badge color="teal" size="sm" variant="filled">
                            Slot {assignedSlot + 1}
                          </Badge>
                        ) : (
                          <Badge color="gray" size="sm" variant="outline">
                            No slot
                          </Badge>
                        )}
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
                        {isHost && !isLocalPlayer && (
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            size="sm"
                            title="Kick player"
                            onClick={() => dispatch(kickPlayer(p.userId))}
                          >
                            <IconUserOff size="0.9rem" />
                          </ActionIcon>
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

        <Box>
          <Text size="sm" fw={500} mb="xs">
            Choose your slot
          </Text>
          <Group gap="sm">
            {Array.from({ length: slotCount }, (_, i) => {
              const holder = Object.entries(playerAssignments).find(
                ([, s]) => s === i,
              )?.[0];
              const takenByOther = holder != null && holder !== localUserId;
              const isMine = mySlot === i;
              const assignedPlayer = holder
                ? players.find((p) => p.userId === holder) ?? null
                : null;
              const slotLabel = getSlotLabel(
                allowedPlayerCount ?? { exact: 2 },
                i,
                colors,
              );
              return (
                <Stack key={i} gap={4} align="center">
                  <Button
                    size="xs"
                    variant={isMine ? "filled" : takenByOther ? "outline" : "light"}
                    color={isMine ? "teal" : takenByOther ? "gray" : "blue"}
                    disabled={takenByOther}
                    onClick={() => dispatch(requestSlot(isMine ? -1 : i))}
                    title={
                      takenByOther
                        ? `Taken by ${assignedPlayer?.name ?? holder?.slice(0, 8) ?? "someone"}`
                        : isMine
                          ? "Click to unclaim"
                          : `Claim ${slotLabel}`
                    }
                  >
                    {slotLabel}
                  </Button>
                  {assignedPlayer && (
                    <Text size="xs" c="dimmed" maw={80} ta="center" truncate>
                      {assignedPlayer.name ?? assignedPlayer.userId.slice(0, 8)}
                    </Text>
                  )}
                </Stack>
              );
            })}
            {slotCount === 0 && (
              <Text c="dimmed" size="sm" fs="italic">
                Waiting for variant config...
              </Text>
            )}
          </Group>
        </Box>

        <Group justify="center" mt="sm">
          {isHost && (
            <Button
              color="green"
              disabled={!canStartGame}
              title={
                !allSlotsAssigned
                  ? "All players must choose a slot"
                  : !allPeersConnected
                    ? "Wait for all players to connect"
                    : !countValid
                      ? `Player count must be ${allowedPlayerCount ? formatSlotRange(allowedPlayerCount) : "valid"}`
                      : "Start the game"
              }
              onClick={() => dispatch(startGame())}
            >
              Start Game
            </Button>
          )}
        </Group>

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
