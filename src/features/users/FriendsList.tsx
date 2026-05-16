import { ActionIcon, Table, Text, Tooltip } from "@mantine/core";
import { IconUserMinus } from "@tabler/icons-react";
import { useListFriendsQuery, useRemoveFriendMutation } from "../../api/api";
import AppLoader from "../loader/AppLoader";
import ErrorDisplay from "../error/ErrorDisplay";

type Props = {
  userId: string;
};

const FriendsList = ({ userId }: Props) => {
  const { data, isLoading, isSuccess } = useListFriendsQuery(userId);
  const [removeFriend] = useRemoveFriendMutation();

  if (isLoading) return <AppLoader />;
  if (!isSuccess) return <ErrorDisplay />;
  if (data.friends.length === 0)
    return <Text c="dimmed">No friends yet</Text>;

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Username</Table.Th>
          <Table.Th>Friends since</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.friends.map(({ friend, createdAt }) => (
          <Table.Tr key={friend.id}>
            <Table.Td>{friend.userName}</Table.Td>
            <Table.Td>{new Date(createdAt).toLocaleDateString()}</Table.Td>
            <Table.Td>
              <Tooltip label="Remove friend">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() =>
                    removeFriend({ userId, friendId: friend.id })
                  }
                >
                  <IconUserMinus size={16} />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

export default FriendsList;
