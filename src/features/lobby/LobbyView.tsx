import {
  Alert,
  Button,
  Center,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { useGuestLoginMutation } from "../../api/api";
import { useDispatch, useSelector } from "../../app/hooks";
import { login, selectToken } from "../auth/authSlice";
import useConfigureLayout from "../layout/hooks";
import PageContainer from "../layout/PageContainer";
import ActiveLobbyView from "./ActiveLobbyView";
import {
  joinLobbyById,
  joinLobbyByPeer,
  selectLobbyStatus,
  _setIdle,
} from "./lobbySlice";
import { Navigate, useNavigate, useParams } from "react-router-dom";

const JOIN_TIMEOUT_MS = 10_000;

export default function LobbyView() {
  useConfigureLayout(() => ({ navPinned: true }));
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const lobbyStatus = useSelector(selectLobbyStatus);
  const { lobbyId, peerId } = useParams<{
    lobbyId?: string;
    peerId?: string;
  }>();
  const navigate = useNavigate();
  const [hasAutoJoined, setHasAutoJoined] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [guestLogin, { isLoading: isGuestLoggingIn }] = useGuestLoginMutation();
  const guestForm = useForm({
    initialValues: { displayName: "" },
    validate: {
      displayName: (v) =>
        v.trim().length > 0 ? null : "Display name is required",
    },
  });

  const type: "lobby" | "peer" | null = lobbyId
    ? "lobby"
    : peerId
      ? "peer"
      : null;

  // Auto-join when token is available and we haven't joined yet
  useEffect(() => {
    if (!type || !token || hasAutoJoined) return;
    if (
      lobbyStatus.phase === "hosting" ||
      lobbyStatus.phase === "active" ||
      lobbyStatus.phase === "joining"
    )
      return;
    setHasAutoJoined(true);
    const run =
      type === "lobby"
        ? dispatch(joinLobbyById(lobbyId!))
        : dispatch(joinLobbyByPeer(peerId!));
    Promise.resolve(run).catch(() => {});
  }, [token, type]);

  // Start/clear join timeout
  useEffect(() => {
    if (lobbyStatus.phase === "joining") {
      timeoutRef.current = setTimeout(() => setTimedOut(true), JOIN_TIMEOUT_MS);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setTimedOut(false);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [lobbyStatus.phase]);

  const handleGuestJoin = async (values: { displayName: string }) => {
    try {
      const res = await guestLogin(values).unwrap();
      dispatch(login({ token: res.token, user: res.user }));
      notifications.show({
        title: "Joined as guest",
        message: "Connecting to lobby...",
        color: "blue",
      });
    } catch (e: any) {
      notifications.show({
        title: "Error",
        message: e.message || "Failed to join as guest",
        color: "red",
      });
    }
  };

  if (lobbyStatus.phase === "hosting") {
    return (
      <PageContainer>
        <ActiveLobbyView
          inviteUrl={lobbyStatus.inviteUrl}
          isPassiveHostTab={lobbyStatus.isPassiveHostTab}
        />
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "active") {
    return (
      <PageContainer>
        <ActiveLobbyView inviteUrl="" />
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "creating") {
    return (
      <PageContainer>
        <Center pt="xl">
          <Loader />
        </Center>
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "error") {
    return (
      <PageContainer>
        <Paper p="md" maw={480} mx="auto">
          <Stack>
            <Alert color="red" title="Failed to join lobby">
              {lobbyStatus.message}
            </Alert>
            <Button
              variant="default"
              onClick={() => {
                dispatch(_setIdle());
                navigate("/");
              }}
            >
              Go to Home
            </Button>
          </Stack>
        </Paper>
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "joining" || (token && hasAutoJoined)) {
    if (timedOut) {
      return (
        <PageContainer>
          <Paper p="md" maw={480} mx="auto">
            <Stack>
              <Alert color="orange" title="Connection timed out">
                Could not connect to the lobby after {JOIN_TIMEOUT_MS / 1000}{" "}
                seconds.
              </Alert>
              <Button
                variant="default"
                onClick={() => {
                  dispatch(_setIdle());
                  navigate("/");
                }}
              >
                Go to Home
              </Button>
              <Button
                onClick={() => {
                  setTimedOut(false);
                  setHasAutoJoined(false);
                  dispatch(_setIdle());
                }}
              >
                Retry
              </Button>
            </Stack>
          </Paper>
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <Center>
          <Stack align="center" gap="md">
            <Loader />
            <Text c="dimmed">Joining lobby...</Text>
          </Stack>
        </Center>
      </PageContainer>
    );
  }

  // Not logged in → guest login form
  if (!token) {
    return (
      <PageContainer>
        <Paper p="md" maw={480} mx="auto">
          <Stack>
            <Title order={3}>Join Lobby</Title>
            <form onSubmit={guestForm.onSubmit(handleGuestJoin)}>
              <Stack>
                <Alert color="yellow">
                  You are not logged in. Enter a display name to join as a
                  guest.
                </Alert>
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
      </PageContainer>
    );
  }

  // idle + no type → invalid URL
  if (!type) {
    return <Navigate to="/" replace />;
  }

  // idle + token but not yet triggered auto-join — show spinner while effect fires
  return (
    <PageContainer>
      <Center>
        <Loader />
      </Center>
    </PageContainer>
  );
}
