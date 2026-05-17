import { ActionIcon, Loader, Stack, Table, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useListUsersQuery, useSendFriendRequestMutation } from "../../api/api";
import { PublicUser } from "../../api/types/user/users";
import { useSelector } from "../../app/hooks";
import { selectLoginState as selectAuthState, selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import { IconHeartHandshake } from "@tabler/icons-react";

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
          <Table.Th>Username</Table.Th>
          <Table.Th>Created at</Table.Th>
          <Table.Th>Actions</Table.Th>
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
  const { id, userName, createdAt } = user;
  return (
    <Table.Tr>
      <Table.Td>{userName}</Table.Td>
      <Table.Td>{new Date(createdAt).toLocaleString()}</Table.Td>
      <Table.Td>
        {isLoggedIn && (
          <Tooltip label="Send friend request">
            <ActionIcon
              color="green"
              variant="subtle"
              onClick={() => onFriendRequest(id)}
            >
              <IconHeartHandshake size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

export default UserOverview;
