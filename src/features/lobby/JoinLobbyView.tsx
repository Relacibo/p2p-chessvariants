import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, Text, Title, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useGuestLoginMutation } from "../../api/api";
import { login } from "../auth/authSlice";
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

  const [guestLogin, { isLoading: isGuestLoggingIn }] = useGuestLoginMutation();

  const guestForm = useForm({
    initialValues: { displayName: "" },
    validate: {
      displayName: (v) => (v.trim().length > 0 ? null : "Display name is required"),
    },
  });

  const handleGuestJoin = async (values: { displayName: string }) => {
    if (!parsed) return;
    try {
      const res = await guestLogin(values).unwrap();
      dispatch(login({ token: res.token, user: res.user }));
      // Auth is updated in store, handleJoin will be triggered or user can click Join again
      notifications.show({ title: "Joined as guest", message: "You can now connect to the lobby.", color: "blue" });
    } catch (e: any) {
      setError(e.message || "Failed to join as guest");
    }
  };

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
  );
}

