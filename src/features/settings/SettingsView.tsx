import {
  Avatar,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Loader,
  Center,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { useGetConnectionsQuery, useUnlinkProviderMutation } from "../../api/api";
import { selectUser } from "../auth/authSlice";
import ConnectWithGoogleButton from "../auth/providers/google/ConnectWithGoogleButton";
import ConnectWithLichessButton from "../auth/providers/lichess/ConnectWithLichessButton";

type TabValue = "profile" | "connections" | "game";

const VALID_TABS: TabValue[] = ["profile", "connections", "game"];

const SettingsView = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: TabValue =
    VALID_TABS.includes(tab as TabValue) ? (tab as TabValue) : "profile";
  const user = useSelector(selectUser);

  const handleTabChange = (value: string | null) => {
    if (value) navigate(`/settings/${value}`);
  };

  if (!user) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Bitte einloggen um die Einstellungen zu sehen.</Text>
      </Center>
    );
  }

  return (
    <Container maw={600} pt="xl">
      <Title order={2} mb="lg">
        Einstellungen
      </Title>
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Tabs.List mb="xl">
          <Tabs.Tab value="profile">Profil</Tabs.Tab>
          <Tabs.Tab value="connections">Verbindungen</Tabs.Tab>
          <Tabs.Tab value="game">Spiel</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profile">
          <ProfileTab />
        </Tabs.Panel>

        <Tabs.Panel value="connections">
          <ConnectionsTab />
        </Tabs.Panel>

        <Tabs.Panel value="game">
          <Text c="dimmed">Spieleinstellungen folgen demnächst.</Text>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
};

const ProfileTab = () => {
  const user = useSelector(selectUser)!;
  return (
    <Stack gap="lg">
      <Group>
        <Avatar size="lg" radius="xl" color="blue">
          {user.displayName?.[0]?.toUpperCase() ?? "?"}
        </Avatar>
        <div>
          <Text fw={600} size="lg">{user.displayName}</Text>
          <Text size="sm" c="dimmed">@{user.userName}</Text>
        </div>
      </Group>
      <Divider />
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">E-Mail</Text>
          <Group gap="xs">
            <Text size="sm">{user.email}</Text>
            {user.verifiedEmail && <Badge size="xs" color="green">Verifiziert</Badge>}
          </Group>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Benutzername</Text>
          <Text size="sm">@{user.userName}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Anzeigename</Text>
          <Text size="sm">{user.displayName}</Text>
        </Group>
      </Stack>
    </Stack>
  );
};

const ConnectionsTab = () => {
  const { data: connections, isLoading, refetch } = useGetConnectionsQuery();
  const [unlinkProvider] = useUnlinkProviderMutation();

  const handleUnlink = async (provider: "google" | "lichess") => {
    try {
      await unlinkProvider({ provider }).unwrap();
      notifications.show({
        title: "Verbindung getrennt",
        message: `${provider === "google" ? "Google" : "Lichess"} Account wurde getrennt.`,
        color: "blue",
      });
      refetch();
    } catch {
      notifications.show({
        title: "Fehler",
        message:
          "Verbindung konnte nicht getrennt werden. Stell sicher, dass du noch mindestens eine Anmeldeoption hast.",
        color: "red",
      });
    }
  };

  if (isLoading) {
    return <Center><Loader /></Center>;
  }

  const totalConnections =
    connections ? Number(connections.google) + Number(connections.lichess) : 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={500}>Google</Text>
          <Text size="sm" c={connections?.google ? "green" : "dimmed"}>
            {connections?.google ? "Verbunden" : "Nicht verbunden"}
          </Text>
        </div>
        {connections?.google ? (
          <Button
            color="red"
            variant="outline"
            disabled={totalConnections <= 1}
            onClick={() => handleUnlink("google")}
          >
            Trennen
          </Button>
        ) : (
          <ConnectWithGoogleButton onConnected={() => refetch()} />
        )}
      </Group>

      <Divider />

      <Group justify="space-between" align="center">
        <div>
          <Text fw={500}>Lichess</Text>
          <Text size="sm" c={connections?.lichess ? "green" : "dimmed"}>
            {connections?.lichess ? "Verbunden" : "Nicht verbunden"}
          </Text>
        </div>
        {connections?.lichess ? (
          <Button
            color="red"
            variant="outline"
            disabled={totalConnections <= 1}
            onClick={() => handleUnlink("lichess")}
          >
            Trennen
          </Button>
        ) : (
          <ConnectWithLichessButton />
        )}
      </Group>
    </Stack>
  );
};

export default SettingsView;
