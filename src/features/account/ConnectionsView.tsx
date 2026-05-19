import {
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useGetConnectionsQuery, useUnlinkProviderMutation } from "../../api/userApi";
import ConnectWithGoogleButton from "../auth/providers/google/ConnectWithGoogleButton";
import ConnectWithLichessButton from "../auth/providers/lichess/ConnectWithLichessButton";
import PageContainer from "../layout/PageContainer";

const ConnectionsView = () => {
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
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const totalConnections =
    connections ? Number(connections.google) + Number(connections.lichess) : 0;

  return (
    <PageContainer>
      <Stack maw={600} gap="md">
        <Title order={2}>
          Verbundene Accounts
        </Title>

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
    </PageContainer>
  );
};

export default ConnectionsView;
