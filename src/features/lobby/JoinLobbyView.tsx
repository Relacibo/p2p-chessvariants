import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, Text, Title } from "@mantine/core";
import { useDispatch, useSelector } from "../../app/hooks";
import { joinLobbyById, joinLobbyByPeer } from "../lobby/lobbySlice";
import { parseInviteFragment, InviteFragment } from "../lobby/scriptUrl";
import { selectToken } from "../auth/authSlice";

export default function JoinLobbyView() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const [parsed, setParsed] = useState<InviteFragment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const result = parseInviteFragment(window.location.hash);
    if (!result) {
      setError("Invalid or missing invite link.");
    } else {
      setParsed(result);
    }
  }, []);

  const handleJoin = async () => {
    if (!parsed) return;
    setJoining(true);
    if (parsed.type === "lobby") {
      await dispatch(joinLobbyById(parsed.lobbyId));
    } else {
      await dispatch(joinLobbyByPeer(parsed.hostUserId));
    }
    setJoining(false);
  };

  if (error) {
    return (
      <Alert color="red" title="Invalid invite">
        {error}
      </Alert>
    );
  }

  if (!parsed) return null;

  return (
    <Paper p="md" maw={480} mx="auto" mt="xl">
      <Stack>
        <Title order={3}>Join Lobby</Title>
        <Text size="sm" c="dimmed">
          {parsed.type === "lobby"
            ? `Lobby ID: ${parsed.lobbyId}`
            : `Direct invite from: ${parsed.hostUserId}`}
        </Text>
        {!token && (
          <Alert color="yellow">You must be logged in to join a lobby.</Alert>
        )}
        <Button onClick={handleJoin} loading={joining} disabled={!token}>
          Join Lobby
        </Button>
      </Stack>
    </Paper>
  );
}

