import { useEffect, useState } from "react";
import { Alert, Button, Container, Loader, Center, Paper, Stack, Text, Title, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useGuestLoginMutation } from "../../api/api";
import { login } from "../auth/authSlice";
import { useDispatch, useSelector } from "../../app/hooks";
import { joinLobbyById, joinLobbyByPeer, selectLobbyStatus, _setIdle } from "../lobby/lobbySlice";
import { selectToken } from "../auth/authSlice";
import { useParams, useNavigate } from "react-router-dom";
import useConfigureLayout from "../layout/hooks";

export default function JoinLobbyView() {
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const lobbyStatus = useSelector(selectLobbyStatus);
  const { lobbyId, peerId } = useParams<{ lobbyId?: string; peerId?: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [hasAutoJoined, setHasAutoJoined] = useState(false);

  const type: "lobby" | "peer" | null = lobbyId ? "lobby" : peerId ? "peer" : null;

  const lobbyPath = lobbyId ? `/lobby/${lobbyId}` : `/lobby/by-peer-id/${peerId}`;

  const [guestLogin, { isLoading: isGuestLoggingIn }] = useGuestLoginMutation();

  const guestForm = useForm({
    initialValues: { displayName: "" },
    validate: {
      displayName: (v) => (v.trim().length > 0 ? null : "Display name is required"),
    },
  });

  // Redirect to lobby URL once joined
  useEffect(() => {
    if (lobbyStatus.phase === "active" || lobbyStatus.phase === "hosting") {
      navigate(lobbyPath, { replace: true });
    }
  }, [lobbyStatus.phase]);

  // Auto-join when logged in
  useEffect(() => {
    if (!type) {
      setError("Invalid or missing invite link.");
      return;
    }
    if (!token || lobbyStatus.phase === "joining" || lobbyStatus.phase === "hosting" || lobbyStatus.phase === "active" || hasAutoJoined) return;
    setHasAutoJoined(true);
    const run = type === "lobby"
      ? dispatch(joinLobbyById(lobbyId!))
      : dispatch(joinLobbyByPeer(peerId!));
    Promise.resolve(run).catch((e: any) => setError(e?.message || "Failed to join lobby"));
  }, [token, type]);

  const handleGuestJoin = async (values: { displayName: string }) => {
    try {
      const res = await guestLogin(values).unwrap();
      dispatch(login({ token: res.token, user: res.user }));
      notifications.show({ title: "Joined as guest", message: "Connecting to lobby...", color: "blue" });
    } catch (e: any) {
      setError(e.message || "Failed to join as guest");
    }
  };

  if (error) {
    return (
      <Container size="sm" pt="xl">
        <Alert color="red" title="Error joining lobby">{error}</Alert>
      </Container>
    );
  }

  // Redux-level error (from joinLobbyById dispatch)
  if (lobbyStatus.phase === "error") {
    return (
      <Container size="sm" pt="xl">
        <Paper p="md" maw={480} mx="auto">
          <Stack>
            <Alert color="red" title="Failed to join lobby">{lobbyStatus.message}</Alert>
            <Button variant="default" onClick={() => { dispatch(_setIdle()); navigate("/"); }}>
              Go to Home
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  // Logged in → auto-joining, show spinner
  if (token && (lobbyStatus.phase === "joining" || hasAutoJoined)) {
    return (
      <Container size="sm" pt="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader />
            <Text c="dimmed">Joining lobby...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  // Not logged in → ask for guest name
  return (
    <Container size="sm" pt="xl">
      <Paper p="md" maw={480} mx="auto">
        <Stack>
          <Title order={3}>Join Lobby</Title>
          <form onSubmit={guestForm.onSubmit(handleGuestJoin)}>
            <Stack>
              <Alert color="yellow">You are not logged in. Enter a display name to join as a guest.</Alert>
              <TextInput
                label="Display Name"
                placeholder="Guest Player"
                {...guestForm.getInputProps("displayName")}
              />
              <Button type="submit" loading={isGuestLoggingIn}>
                Join as Guest
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Container>
  );
}

