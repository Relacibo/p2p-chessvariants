import {
  Avatar,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Button,
  UnstyledButton,
  Collapse,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useListUsersQuery, useSendFriendRequestMutation } from "../../api/api";
import { PublicUser } from "../../api/types/user/users";
import { useSelector } from "../../app/hooks";
import {
  selectLoginState as selectAuthState,
  selectUser,
} from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import { IconChevronDown, IconChevronUp, IconHeartHandshake } from "@tabler/icons-react";

function UserOverview() {
  const authState = useSelector(selectAuthState);
  const isLoggedIn = authState === "logged-in";
  const currentUser = useSelector(selectUser);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, isSuccess } = useListUsersQuery(
    searchQuery ? { q: searchQuery } : undefined,
  );
  const [sendFriendRequest] = useSendFriendRequestMutation();
  const users = data?.items ?? [];

  const onClickFriendRequest = (receiverId: string) => {
    if (!currentUser) return;
    sendFriendRequest({ userId: currentUser.id, receiverId })
      .unwrap()
      .then(() =>
        notifications.show({ message: "Friend request sent!", color: "green" }),
      )
      .catch((e) => {
        console.error("[UserOverview] send request failed", e);
        notifications.show({ message: "Could not send request", color: "red" });
      });
  };

  const content = isLoading ? (
    <Loader />
  ) : isSuccess ? (
    <Stack gap="xs">
      {users
        .filter((u) => u.id !== currentUser?.id)
        .map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isLoggedIn={isLoggedIn}
            onFriendRequest={onClickFriendRequest}
          />
        ))}
    </Stack>
  ) : (
    <ErrorDisplay />
  );

  return (
    <Stack>
      <TextInput
        label="Search users"
        placeholder="mario"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
      />
      {content}
    </Stack>
  );
}

type UserRowProps = {
  user: PublicUser;
  isLoggedIn: boolean;
  onFriendRequest: (userId: string) => void;
};

function UserRow({ user, isLoggedIn, onFriendRequest }: UserRowProps) {
  const { id, userName, displayName, avatarHash, createdAt } = user;
  const isGuest = userName.startsWith("Guest ");
  const [opened, { toggle }] = useDisclosure(false);

  const gravatar = "https://www.gravatar.com/avatar/";
  const avatarUrl = avatarHash ? gravatar + avatarHash + "?d=identicon" : null;
  const ChevronIcon = opened ? IconChevronUp : IconChevronDown;

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      {/* Collapsed row — hidden when open */}
      {!opened && (
        <UnstyledButton onClick={toggle} style={{ width: "100%" }}>
          <Group p="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              {avatarUrl ? (
                <Avatar src={avatarUrl} radius="xl" size="sm" />
              ) : (
                <Avatar radius="xl" size="sm" color="blue">
                  {displayName?.substring(0, 2)?.toUpperCase() || "U"}
                </Avatar>
              )}
              <Text size="sm" fw={500}>
                {displayName || userName}
              </Text>
              {isGuest && (
                <Badge color="gray" variant="outline" size="xs">
                  Guest
                </Badge>
              )}
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed" display={{ base: "none", sm: "block" }}>
                Joined: {new Date(createdAt).toLocaleDateString()}
              </Text>
              <ChevronIcon size="0.9rem" />
            </Group>
          </Group>
        </UnstyledButton>
      )}

      {/* Expanded detail — shown instead of the row */}
      <Collapse expanded={opened}>
        <Box p="md">
          <Group align="flex-start">
            {avatarUrl ? (
              <Avatar src={avatarUrl} radius="md" size="xl" />
            ) : (
              <Avatar radius="md" size="xl" color="blue">
                {displayName?.substring(0, 2)?.toUpperCase() || "U"}
              </Avatar>
            )}
            <Stack gap="xs" style={{ flex: 1 }}>
              <Box>
                <Text fw={700} size="lg">
                  {displayName || userName}
                </Text>
                <Text c="dimmed" size="sm">
                  @{userName}
                </Text>
              </Box>
              <Text size="xs" c="dimmed">
                Member since {new Date(createdAt).toLocaleString()}
              </Text>
              {isGuest && (
                <Text c="dimmed" size="xs">
                  This is a temporary guest account.
                </Text>
              )}
              <Group mt="xs" justify="space-between">
                {isLoggedIn && !isGuest && (
                  <Button
                    variant="light"
                    color="green"
                    size="sm"
                    leftSection={<IconHeartHandshake size={16} />}
                    onClick={() => onFriendRequest(id)}
                  >
                    Add Friend
                  </Button>
                )}
                <Button
                  variant="subtle"
                  size="sm"
                  leftSection={<IconChevronUp size="0.9rem" />}
                  onClick={toggle}
                  ml="auto"
                >
                  Collapse
                </Button>
              </Group>
            </Stack>
          </Group>
        </Box>
      </Collapse>
    </Paper>
  );
}

export default UserOverview;
