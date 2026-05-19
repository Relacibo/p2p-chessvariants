import { useState, useEffect } from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Center,
  Stack,
  Tabs,
  Text,
  Title,
  Switch,
  TextInput,
  Paper,
  Tooltip,
} from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetConnectionsQuery,
  useUnlinkProviderMutation,
  useUpdateUserMutation,
} from "../../api/api";
import { selectUser, updateUserState } from "../auth/authSlice";
import ConnectWithGoogleButton from "../auth/providers/google/ConnectWithGoogleButton";
import ConnectWithLichessButton from "../auth/providers/lichess/ConnectWithLichessButton";
import useConfigureLayout from "../layout/hooks";
import PageContainer from "../layout/PageContainer";

type TabValue = "profile" | "connections" | "game";

const VALID_TABS: TabValue[] = ["profile", "connections", "game"];

const SettingsView = () => {
  useConfigureLayout(() => ({ navPinned: true }));
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: TabValue = VALID_TABS.includes(tab as TabValue)
    ? (tab as TabValue)
    : "profile";
  const user = useSelector(selectUser);

  const handleTabChange = (value: string | null) => {
    if (value) navigate(`/settings/${value}`);
  };

  if (!user) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Please log in to view settings.</Text>
      </Center>
    );
  }

  return (
    <PageContainer>
      <Stack maw={600} gap={0}>
        <Title order={2} mb="lg">
          Settings
        </Title>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List mb="xl">
            <Tabs.Tab value="profile">Profile</Tabs.Tab>
            <Tabs.Tab value="connections">Connections</Tabs.Tab>
            <Tabs.Tab value="game">Game</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="profile">
            <ProfileTab />
          </Tabs.Panel>

          <Tabs.Panel value="connections">
            <ConnectionsTab />
          </Tabs.Panel>

          <Tabs.Panel value="game">
            <Text c="dimmed">Game settings coming soon.</Text>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </PageContainer>
  );
};

const ProfileTab = () => {
  const user = useSelector(selectUser)!;
  const dispatch = useDispatch();
  const [updateUser] = useUpdateUserMutation();
  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user.useGravatar) {
      setGravatarUrl(null);
      return;
    }
    if (user.customAvatarHash) {
      setGravatarUrl(
        "https://www.gravatar.com/avatar/" +
          user.customAvatarHash +
          "?d=identicon",
      );
      return;
    }
    const email = user.email.trim().toLowerCase();
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(email))
      .then((buffer) => {
        const hashHex = Array.from(new Uint8Array(buffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setGravatarUrl(
          "https://www.gravatar.com/avatar/" + hashHex + "?d=identicon",
        );
      });
  }, [user.useGravatar, user.customAvatarHash, user.email]);

  const handleUpdate = async (patch: {
    useGravatar: boolean;
    customGravatarEmail?: string | null;
  }) => {
    try {
      const updatedUser = await updateUser(patch).unwrap();
      dispatch(updateUserState(updatedUser));
      notifications.show({
        title: "Profile updated",
        message: "Your settings have been saved.",
        color: "green",
      });
    } catch (err) {
      notifications.show({
        title: "Error",
        message: "Could not update profile.",
        color: "red",
      });
    }
  };

  return (
    <Stack gap="lg">
      <Group>
        {gravatarUrl ? (
          <Avatar src={gravatarUrl} size="lg" radius="xl" />
        ) : (
          <Avatar size="lg" radius="xl" color="blue">
            {user.displayName?.[0]?.toUpperCase() ?? "?"}
          </Avatar>
        )}
        <div>
          <Text fw={600} size="lg">
            {user.displayName}
          </Text>
          <Text size="sm" c="dimmed">
            @{user.userName}
          </Text>
        </div>
      </Group>
      <Divider />
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Email
          </Text>
          <Group gap="xs">
            <Text size="sm">{user.email}</Text>
            {user.verifiedEmail && (
              <Badge size="xs" color="green">
                Verified
              </Badge>
            )}
          </Group>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Username
          </Text>
          <Text size="sm">@{user.userName}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Display name
          </Text>
          <Text size="sm">{user.displayName}</Text>
        </Group>
      </Stack>

      <Paper p="md" withBorder mt="md">
        <Stack>
          <Text fw={500}>Profile Picture</Text>
          <Switch
            label="Use Gravatar"
            description="We will calculate an SHA-256 hash of your email address to fetch your profile picture from Gravatar. Your raw email address is never exposed."
            checked={!!user.useGravatar}
            onChange={(e) =>
              handleUpdate({ useGravatar: e.currentTarget.checked })
            }
          />
          {user.useGravatar && (
            <Stack gap="xs">
              {user.customAvatarHash ? (
                <Group gap="xs" align="center">
                  <Text size="xs" fw={500} c="dimmed">
                    Custom email:
                  </Text>
                  <Tooltip
                    label={user.customAvatarHash}
                    position="top"
                    withArrow
                  >
                    <Badge
                      variant="light"
                      size="sm"
                      ff="monospace"
                      pr={3}
                      rightSection={
                        <ActionIcon
                          size="xs"
                          variant="transparent"
                          color="blue"
                          aria-label="Clear custom email"
                          onClick={() =>
                            handleUpdate({
                              useGravatar: true,
                              customGravatarEmail: null,
                            })
                          }
                        >
                          <IconX size="0.6rem" />
                        </ActionIcon>
                      }
                    >
                      {user.customAvatarHash.slice(0, 8)}…
                    </Badge>
                  </Tooltip>
                </Group>
              ) : (
                <TextInput
                  size="xs"
                  label="Custom Gravatar email"
                  placeholder="email@example.com"
                  onBlur={(e) => {
                    if (e.currentTarget.value.trim() !== "") {
                      handleUpdate({
                        useGravatar: true,
                        customGravatarEmail: e.currentTarget.value,
                      });
                      e.currentTarget.value = "";
                    }
                  }}
                />
              )}
            </Stack>
          )}
        </Stack>
      </Paper>
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
        title: "Disconnected",
        message: `${provider === "google" ? "Google" : "Lichess"} account has been unlinked.`,
        color: "blue",
      });
      refetch();
    } catch {
      notifications.show({
        title: "Error",
        message:
          "Could not unlink account. Make sure you have at least one login method remaining.",
        color: "red",
      });
    }
  };

  if (isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  const totalConnections = connections
    ? Number(connections.google) + Number(connections.lichess)
    : 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={500}>Google</Text>
          <Text size="sm" c={connections?.google ? "green" : "dimmed"}>
            {connections?.google ? "Connected" : "Not connected"}
          </Text>
        </div>
        {connections?.google ? (
          <Button
            color="red"
            variant="outline"
            disabled={totalConnections <= 1}
            onClick={() => handleUnlink("google")}
          >
            Disconnect
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
            {connections?.lichess ? "Connected" : "Not connected"}
          </Text>
        </div>
        {connections?.lichess ? (
          <Button
            color="red"
            variant="outline"
            disabled={totalConnections <= 1}
            onClick={() => handleUnlink("lichess")}
          >
            Disconnect
          </Button>
        ) : (
          <ConnectWithLichessButton />
        )}
      </Group>
    </Stack>
  );
};

export default SettingsView;
