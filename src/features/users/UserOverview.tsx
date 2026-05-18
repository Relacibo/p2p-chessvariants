import { Avatar, Badge, Box, Group, Loader, Stack, Text, TextInput, Tooltip, Button, Accordion } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useListUsersQuery, useSendFriendRequestMutation } from "../../api/api";
import { PublicUser } from "../../api/types/user/users";
import { useSelector } from "../../app/hooks";
import { selectLoginState as selectAuthState, selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import { IconHeartHandshake, IconUser } from "@tabler/icons-react";

function UserOverview() {
  const authState = useSelector(selectAuthState);
  const isLoggedIn = authState === "logged-in";
  const currentUser = useSelector(selectUser);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, isSuccess } = useListUsersQuery(searchQuery);
  const [sendFriendRequest] = useSendFriendRequestMutation();
  const users = data ?? [];

  const onClickFriendRequest = (receiverId: string) => {
    if (!currentUser) return;
    sendFriendRequest({ userId: currentUser.id, receiverId })
      .unwrap()
      .then(() =>
        notifications.show({ message: "Friend request sent!", color: "green" })
      )
      .catch(() =>
        notifications.show({ message: "Could not send request", color: "red" })
      );
  };

  const content = isLoading ? (
    <Loader />
  ) : isSuccess ? (
    <Accordion variant="separated" chevronPosition="right">
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
    </Accordion>
  ) : (
    <ErrorDisplay />
  );

  return (
    <Stack>
      <TextInput
        label="Search users"
        placeholder="alice"
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
  
  const gravatar = "https://www.gravatar.com/avatar/";
  const avatarUrl = avatarHash ? gravatar + avatarHash + "?d=identicon" : null;

  return (
    <Accordion.Item value={id}>
      <Accordion.Control>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            {avatarUrl ? (
               <Avatar src={avatarUrl} radius="xl" size="sm" />
            ) : (
               <Avatar radius="xl" size="sm" color="blue">{displayName?.substring(0,2)?.toUpperCase() || "U"}</Avatar>
            )}
            <Text size="sm" fw={500}>{displayName || userName}</Text>
            {isGuest && <Badge color="gray" variant="outline" size="xs">Guest</Badge>}
          </Group>
          <Text size="xs" c="dimmed" display={{ base: 'none', sm: 'block' }}>
            Joined: {new Date(createdAt).toLocaleDateString()}
          </Text>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Group align="flex-start">
          {avatarUrl ? (
             <Avatar src={avatarUrl} radius="md" size="xl" />
          ) : (
             <Avatar radius="md" size="xl" color="blue">{displayName?.substring(0,2)?.toUpperCase() || "U"}</Avatar>
          )}
          <Stack gap="xs" style={{ flex: 1 }}>
            <Box>
              <Text fw={700} size="lg">{displayName || userName}</Text>
              <Text c="dimmed" size="sm">@{userName}</Text>
            </Box>
            <Text size="xs" c="dimmed">
              Member since {new Date(createdAt).toLocaleString()}
            </Text>
            {isGuest && <Text c="dimmed" size="xs">This is a temporary guest account.</Text>}
            
            <Group mt="xs">
              {isLoggedIn && !isGuest && (
                <Button
                  variant="light"
                  color="green"
                  size="sm"
                  leftSection={<IconHeartHandshake size={16} />}
                  onClick={(e) => { e.stopPropagation(); onFriendRequest(id); }}
                >
                  Add Friend
                </Button>
              )}
            </Group>
          </Stack>
        </Group>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export default UserOverview;
