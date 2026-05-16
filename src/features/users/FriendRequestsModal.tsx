import {
  ActionIcon,
  Box,
  Divider,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconHeartHandshake, IconX } from "@tabler/icons-react";
import {
  useAcceptFriendRequestMutation,
  useCancelFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useListFriendRequestsFromQuery,
  useListFriendRequestsToQuery,
} from "../../api/api";
import ErrorDisplay from "../error/ErrorDisplay";
import AppLoader from "../loader/AppLoader";

type Props = {
  onClose: () => void;
  userId: string;
};

const FriendRequestsModal = ({ userId, onClose }: Props) => {
  return (
    <Modal opened={true} onClose={onClose} title="Friend Requests">
      <Stack>
        <Box>
          <Text fw={600} mb="xs">
            Incoming requests
          </Text>
          <IncomingFriendRequestList userId={userId} />
        </Box>
        <Divider my="sm" variant="dashed" />
        <Box>
          <Text fw={600} mb="xs">
            Sent requests
          </Text>
          <OutgoingFriendRequestList userId={userId} />
        </Box>
      </Stack>
    </Modal>
  );
};

const IncomingFriendRequestList = ({ userId }: { userId: string }) => {
  const { data, isLoading, isSuccess } = useListFriendRequestsFromQuery(userId);
  const [accept] = useAcceptFriendRequestMutation();
  const [decline] = useDeclineFriendRequestMutation();

  if (isLoading) return <AppLoader />;
  if (!isSuccess) return <ErrorDisplay />;
  if (data.friendRequests.length === 0)
    return <Text c="dimmed">No incoming requests</Text>;

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Username</Table.Th>
          <Table.Th>Sent at</Table.Th>
          <Table.Th>Message</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.friendRequests.map(({ sender, createdAt, message }) => (
          <Table.Tr key={sender.id}>
            <Table.Td>{sender.userName}</Table.Td>
            <Table.Td>{new Date(createdAt).toLocaleDateString()}</Table.Td>
            <Table.Td>{message ?? "-"}</Table.Td>
            <Table.Td>
              <Tooltip label="Accept">
                <ActionIcon
                  color="green"
                  variant="subtle"
                  onClick={() =>
                    accept({ userId, senderId: sender.id })
                  }
                >
                  <IconCheck size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Decline">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() =>
                    decline({ userId, senderId: sender.id })
                  }
                >
                  <IconX size={16} />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

const OutgoingFriendRequestList = ({ userId }: { userId: string }) => {
  const { data, isLoading, isSuccess } = useListFriendRequestsToQuery(userId);
  const [cancel] = useCancelFriendRequestMutation();

  if (isLoading) return <AppLoader />;
  if (!isSuccess) return <ErrorDisplay />;
  if (data.friendRequests.length === 0)
    return <Text c="dimmed">No sent requests</Text>;

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Username</Table.Th>
          <Table.Th>Sent at</Table.Th>
          <Table.Th>Message</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.friendRequests.map(({ receiver, createdAt, message }) => (
          <Table.Tr key={receiver.id}>
            <Table.Td>{receiver.userName}</Table.Td>
            <Table.Td>{new Date(createdAt).toLocaleDateString()}</Table.Td>
            <Table.Td>{message ?? "-"}</Table.Td>
            <Table.Td>
              <Tooltip label="Cancel request">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() =>
                    cancel({ userId, receiverId: receiver.id })
                  }
                >
                  <IconX size={16} />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

export default FriendRequestsModal;
