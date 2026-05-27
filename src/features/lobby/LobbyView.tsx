import {
  Alert,
  Button,
  Center,
  Divider,
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
import * as p2pLobbyService from "../../api/p2pLobbyService";
import {
  broadcastLobbyState,
  checkIsPrimary,
  onTakeoverRequest,
  registerAsPrimary,
  yieldPrimary,
} from "../../api/tabCoordination";
import * as webrtcService from "../../api/webrtcService";
import { useDispatch, useSelector } from "../../app/hooks";
import { login, selectToken, selectUser } from "../auth/authSlice";
import useConfigureLayout from "../layout/hooks";
import PageContainer from "../layout/PageContainer";
import ActiveLobbyView from "./ActiveLobbyView";
import SecondaryTabView from "./SecondaryTabView";
import {
  becomeActiveHost,
  joinLobbyById,
  joinLobbyByPeer,
  selectIsHost,
  selectHostUserId,
  selectIsPassiveHostTab,
  selectLobbyPlayers,
  selectLobbyScriptUrl,
  selectLobbyStatus,
  selectLobbyServerLobbyId,
  _setIdle,
  _setIsPrimaryTab,
} from "./lobbySlice";
import { Navigate, useNavigate, useParams, useLocation } from "react-router-dom";

const JOIN_TIMEOUT_MS = 10_000;

export default function LobbyView() {
  useConfigureLayout(() => ({ navPinned: true }));
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const user = useSelector(selectUser);
  const lobbyStatus = useSelector(selectLobbyStatus);
  const isPassiveHostTab = useSelector(selectIsPassiveHostTab);
  const serverLobbyId = useSelector(selectLobbyServerLobbyId);
  const players = useSelector(selectLobbyPlayers);
  const isHost = useSelector(selectIsHost);
  const hostUserId = useSelector(selectHostUserId);
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  const { lobbyId, peerId } = useParams<{
    lobbyId?: string;
    peerId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasAutoJoined, setHasAutoJoined] = useState(false);
  const [tabRole, setTabRole] = useState<"checking" | "primary" | "secondary">("checking");
  const [timedOut, setTimedOut] = useState(false);
  const [broadcastTrigger, setBroadcastTrigger] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTokenRef = useRef<string | null>(null);

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

  // When token changes from null → new token (re-login after expiry), reset auto-join
  useEffect(() => {
    if (token && token !== prevTokenRef.current) {
      prevTokenRef.current = token;
      if (hasAutoJoined) {
        setHasAutoJoined(false);
        if (lobbyStatus.phase === "error") {
          dispatch(_setIdle());
        }
      }
    } else if (!token) {
      prevTokenRef.current = null;
    }
  }, [dispatch, hasAutoJoined, lobbyStatus.phase, token]);

  useEffect(() => {
    if (!token || !type) {
      return;
    }
    if (type !== "lobby" || !lobbyId || !user) {
      setTabRole("primary");
      return;
    }

    let cancelled = false;
    setTabRole("checking");
    void checkIsPrimary(lobbyId, user.id).then((isPrimary) => {
      if (!cancelled) {
        setTabRole(isPrimary ? "primary" : "secondary");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lobbyId, token, type, user]);

  useEffect(() => {
    dispatch(_setIsPrimaryTab(tabRole !== "secondary"));
  }, [dispatch, tabRole]);

  useEffect(() => {
    if (tabRole !== "primary" || type !== "lobby" || !lobbyId || !user) {
      return;
    }

    return registerAsPrimary(lobbyId, user.id, () => {
      // A secondary tab just opened — immediately push current state to it
      setBroadcastTrigger((n) => n + 1);
    });
  }, [lobbyId, tabRole, type, user]);

  useEffect(() => {
    if (tabRole !== "primary" || type !== "lobby" || !lobbyId || !user) {
      return;
    }

    return onTakeoverRequest(lobbyId, user.id, () => {
      p2pLobbyService.resetP2PLobby();
      webrtcService.reset();
      dispatch(_setIdle());
      setHasAutoJoined(false);
      setTimedOut(false);
      setTabRole("secondary");
      yieldPrimary(lobbyId);
    });
  }, [dispatch, lobbyId, tabRole, type, user]);

  useEffect(() => {
    if (tabRole === "primary" && lobbyStatus.phase === "active" && isPassiveHostTab) {
      void dispatch(becomeActiveHost());
    }
  }, [dispatch, isPassiveHostTab, lobbyStatus.phase, tabRole]);

  // Broadcast lobby state to secondary tabs whenever state changes or a new secondary tab appears
  useEffect(() => {
    if (tabRole !== "primary" || lobbyStatus.phase !== "active" || !serverLobbyId) {
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
  // broadcastTrigger is intentionally included to force a broadcast when secondary tab joins
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastTrigger, hostUserId, isHost, players, scriptUrl, serverLobbyId, tabRole, lobbyStatus.phase]);

  // Auto-join when token is available and we haven't joined yet
  useEffect(() => {
    if (!type || !token || hasAutoJoined || tabRole !== "primary") return;
    if (lobbyStatus.phase === "joining") return;
    setHasAutoJoined(true);
    const run =
      type === "lobby"
        ? dispatch(joinLobbyById(lobbyId!))
        : dispatch(joinLobbyByPeer(peerId!));
    Promise.resolve(run).catch(() => {});
  }, [dispatch, hasAutoJoined, lobbyId, lobbyStatus.phase, peerId, tabRole, token, type]);

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

  useEffect(() => {
    if (lobbyStatus.phase === "closed") {
      p2pLobbyService.resetP2PLobby();
      webrtcService.reset();
      dispatch(_setIdle());
      navigate("/");
    }
  }, [dispatch, lobbyStatus.phase, navigate]);

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

  if (token && type === "lobby" && tabRole === "checking") {
    return (
      <PageContainer>
        <Center>
          <Stack align="center" gap="md">
            <Loader />
            <Text c="dimmed">Checking for an active tab...</Text>
          </Stack>
        </Center>
      </PageContainer>
    );
  }

  if (token && type === "lobby" && tabRole === "secondary" && lobbyId && user) {
    return (
      <PageContainer>
        <SecondaryTabView lobbyId={lobbyId} userId={user.id} />
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "active") {
    return (
      <PageContainer>
        <ActiveLobbyView />
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

  // Not logged in → offer guest login or full login
  if (!token) {
    const loginRedirect = `/auth/login?redirect=${encodeURIComponent(location.pathname)}`;
    return (
      <PageContainer>
        <Paper p="md" maw={480} mx="auto">
          <Stack>
            <Title order={3}>Join Lobby</Title>
            <Button
              variant="default"
              onClick={() => navigate(loginRedirect)}
            >
              Login with account
            </Button>
            <Divider label="or join as guest" labelPosition="center" />
            <form onSubmit={guestForm.onSubmit(handleGuestJoin)}>
              <Stack>
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
