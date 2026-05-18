import { useEffect, useState } from "react";
import { Alert, Button, Container, Paper, Stack, Text, Title, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useGuestLoginMutation } from "../../api/api";
import { login } from "../auth/authSlice";
import { useDispatch, useSelector } from "../../app/hooks";
import { joinLobbyById, joinLobbyByPeer, selectLobbyStatus } from "../lobby/lobbySlice";
import { selectToken } from "../auth/authSlice";
import { useParams } from "react-router-dom";
import ActiveLobbyView from "./ActiveLobbyView";

export default function LobbyView() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const lobbyStatus = useSelector(selectLobbyStatus);
  const { lobbyId, peerId } = useParams<{ lobbyId?: string; peerId?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const type: "lobby" | "peer" | null = lobbyId
    ? "lobby"
    : peerId
    ? "peer"
    : null;

  useEffect(() => {
    if (!type) setError("Invalid or missing invite link.");
  }, [type]);

  const [guestLogin, { isLoading: isGuestLoggingIn }] = useGuestLoginMutation();

  const guestForm = useForm({
    initialValues: { displayName: "" },
    validate: {
      displayName: (v) => (v.trim().length > 0 ? null : "Display name is required"),
    },
  });

  const handleGuestJoin = async (values: { displayName: string }) => {
    if (!type) return;
    try {
      const res = await guestLogin(values).unwrap();
      dispatch(login({ token: res.token, user: res.user }));
      notifications.show({ title: "Joined as guest", message: "You can now connect to the lobby.", color: "blue" });
    } catch (e: any) {
      setError(e.message || "Failed to join as guest");
    }
  };

  const handleJoin = async () => {
    if (!type) return;
    setJoining(true);
    if (type === "lobby") {
      await dispatch(joinLobbyById(lobbyId!));
    } else {
      await dispatch(joinLobbyByPeer(peerId!));
    }
    setJoining(false);
  };

  // Already hosting this lobby
  if (lobbyStatus.phase === "hosting") {
    return <ActiveLobbyView inviteUrl={lobbyStatus.inviteUrl} allowGuests={lobbyStatus.allowGuests} />;
  }

  // Already joined / active in a lobby
  if (lobbyStatus.phase === "active" || lobbyStatus.phase === "joining") {
    return <ActiveLobbyView inviteUrl="" allowGuests={false} />;
  }

  if (error) {
    return (
      <Container size="sm" pt="xl">
        <Alert color="red" title="Invalid invite">
          {error}
        </Alert>
      </Container>
    );
  }

  if (!type) return null;

  return (
    <Container size="sm" pt="xl">
      <Paper p="md" maw={480} mx="auto">
        <Stack>
          <Title order={3}>Join Lobby</Title>
          <Text size="sm" c="dimmed">
            {type === "lobby"
              ? `Lobby ID: ${lobbyId}`
              : `Direct invite from: ${peerId}`}
          </Text>
          {!token ? (
            <form onSubmit={guestForm.onSubmit(handleGuestJoin)}>
              <Stack>
                <Alert color="yellow">You are not logged in. Join as a guest by entering a display name.</Alert>
                <TextInput
                  label="Display Name"
                  placeholder="Guest Player"
                  {...guestForm.getInputProps("displayName")}
                />
                <Button type="submit" loading={isGuestLoggingIn}>
                  Continue as Guest
                </Button>
              </Stack>
            </form>
          ) : (
            <Button onClick={handleJoin} loading={joining}>
              Join Lobby
            </Button>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}

