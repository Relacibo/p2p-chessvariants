import { Avatar, Badge, Box, Collapse, Group, Loader, Stack, Table, Text, TextInput, Tooltip, Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
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
    <Table>
            <Table.Thead>
        <Table.Tr>
          <Table.Th>User</Table.Th>
          <Table.Th>Joined</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
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
      </Table.Tbody>
    </Table>
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
  const [opened, { toggle }] = useDisclosure(false);
  const isGuest = userName.startsWith("Guest ");
  
  const gravatar = "https://www.gravatar.com/avatar/";
  const avatarUrl = avatarHash ? gravatar + avatarHash + "?d=identicon" : null;

  return (
    <>
      <Table.Tr onClick={toggle} style={{ cursor: "pointer" }}>
        <Table.Td>
          <Group gap="sm">
            {avatarUrl ? (
               <Avatar src={avatarUrl} radius="xl" size="sm" />
            ) : (
               <Avatar radius="xl" size="sm" color="blue">{displayName?.substring(0,2)?.toUpperCase() || "U"}</Avatar>
            )}
            <Text size="sm" fw={500}>{displayName || userName}</Text>
            {isGuest && <Badge color="gray" variant="outline" size="xs">Guest</Badge>}
          </Group>
        </Table.Td>
        <Table.Td>{new Date(createdAt).toLocaleString()}</Table.Td>
      </Table.Tr>
      <Table.Tr>
        <Table.Td colSpan={2} p={0} style={{ borderBottom: opened ? undefined : 'none' }}>
          {opened && (
            <Box p="md" bg="var(--mantine-color-gray-0)">
              <Group>
                {avatarUrl ? (
                   <Avatar src={avatarUrl} radius="xl" size="lg" />
                ) : (
                   <Avatar radius="xl" size="lg" color="blue">{displayName?.substring(0,2)?.toUpperCase() || "U"}</Avatar>
                )}
                <Stack gap={0}>
                  <Text fw={700} size="lg">{displayName || userName}</Text>
                  <Text c="dimmed" size="sm">@{userName}</Text>
                  {isGuest && <Text c="dimmed" size="xs">This is a temporary guest account.</Text>}
                </Stack>
                {isLoggedIn && !isGuest && (
                  <Button
                    variant="light"
                    color="green"
                    leftSection={<IconHeartHandshake size={16} />}
                    onClick={(e) => { e.stopPropagation(); onFriendRequest(id); }}
                    ml="auto"
                  >
                    Add Friend
                  </Button>
                )}
              </Group>
            </Box>
          )}
        </Table.Td>
      </Table.Tr>
    </>
  );
}
export default UserOverview;
