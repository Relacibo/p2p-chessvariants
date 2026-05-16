import {
  Alert,
  Badge,
  Button,
  Container,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useEffect } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import useConfigureLayout from "../layout/hooks";
import CreateLobbyView from "./CreateLobbyView";
import {
  joinLobby,
  leaveLobby,
  LobbyPlayer,
  selectLobbyLocalPeerId,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
  selectLobbyStatus,
} from "./lobbySlice";
import { parseInviteFragment } from "./scriptUrl";

function PlayerList() {
  const players = useSelector(selectLobbyPlayers);
  const localPeerId = useSelector(selectLobbyLocalPeerId);
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Players ({players.length})
      </Text>
      {players.map((p: LobbyPlayer) => (
        <Paper key={p.peerId} p="xs" withBorder>
          <Text size="sm" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {p.peerId === localPeerId ? "You" : p.name ?? p.peerId.slice(0, 16) + "…"}
            {p.peerId === localPeerId && (
              <Badge ml="xs" size="xs" color="blue">
                host
              </Badge>
            )}
          </Text>
        </Paper>
      ))}
    </Stack>
  );
}

function JoiningView() {
  return (
    <Stack align="center" py="xl">
      <Loader />
      <Text>Connecting to lobby…</Text>
    </Stack>
  );
}

function ActiveView() {
  const dispatch = useDispatch();
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  return (
    <Stack>
      <Alert color="green" title="Connected to lobby!">
        Waiting for host to start the game.
      </Alert>
      {scriptUrl && (
        <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
          Script: {scriptUrl}
        </Text>
      )}
      <PlayerList />
      <Button
        variant="subtle"
        color="red"
        size="compact-sm"
        onClick={() => dispatch(leaveLobby())}
      >
        Leave lobby
      </Button>
    </Stack>
  );
}

function LobbyContent() {
  const status = useSelector(selectLobbyStatus);

  if (status.phase === "idle") {
    return <CreateLobbyView />;
  }
  if (status.phase === "creating") {
    return (
      <Stack align="center" py="xl">
        <Loader />
        <Text>Starting lobby…</Text>
      </Stack>
    );
  }
  if (status.phase === "hosting") {
    return (
      <Stack>
        <CreateLobbyView />
        <PlayerList />
      </Stack>
    );
  }
  if (status.phase === "joining") {
    return <JoiningView />;
  }
  if (status.phase === "active") {
    return <ActiveView />;
  }
  if (status.phase === "error") {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} color="red" title="Error">
        {status.message}
      </Alert>
    );
  }
  return null;
}

export default function LobbyView() {
  const dispatch = useDispatch();
  const status = useSelector(selectLobbyStatus);
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));

  // Auto-join if the URL fragment contains an invite
  useEffect(() => {
    const fragment = window.location.hash;
    if (!fragment) return;
    const invite = parseInviteFragment(fragment);
    if (!invite) return;
    // Only auto-join if we're currently idle
    if (status.phase === "idle") {
      dispatch(joinLobby(invite.hostPeerId, invite.scriptUrl));
    }
  // Run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container size="sm" py="lg">
      <Paper p="md" shadow="xs">
        <Stack>
          <Title order={2}>Lobby</Title>
          <LobbyContent />
        </Stack>
      </Paper>
    </Container>
  );
}
