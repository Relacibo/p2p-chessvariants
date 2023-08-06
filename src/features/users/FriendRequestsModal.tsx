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
import { IconHeartHandshake } from "@tabler/icons-react";
import {
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
    <Modal opened={true} onClose={onClose}>
      <Stack>
        <Box>
          <Text>Incoming requests</Text>
          <FriendRequestToList userId={userId} />
        </Box>
        <Divider my="sm" variant="dashed" />
        <Box>
          <Text>Sent requests</Text>
          <FriendRequestFromList userId={userId} />
        </Box>
      </Stack>
    </Modal>
  );
};

const FriendRequestToList = ({ userId }: { userId: string }) => {
  const { data, isLoading, isSuccess, isError, error } =
    useListFriendRequestsToQuery(userId);
  return isLoading ? (
    <AppLoader />
  ) : isSuccess ? (
    <Table>
      <thead>
        <tr>
          <th>User name</th>
          <th>Sent at</th>
          <th>Message</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.friendRequests.map(
          ({ receiver: { id, userName }, createdAt, message }) => (
            <tr key={id}>
              <td>{userName}</td>
              <td>{createdAt.toLocaleString()}</td>
              <td>{message ?? "-"}</td>
              <td>
                <Tooltip label="Accept friend request">
                  <ActionIcon color="green" onClick={() => onClickAccept(id)}>
                    <IconHeartHandshake />
                  </ActionIcon>
                </Tooltip>
              </td>
            </tr>
          )
        )}
      </tbody>
    </Table>
  ) : (
    <ErrorDisplay />
  );
};

const FriendRequestFromList = ({ userId }: { userId: string }) => {
  const { data, isLoading, isSuccess, isError, error } =
    useListFriendRequestsFromQuery(userId);
  return isLoading ? <AppLoader /> : isSuccess ? <></> : <ErrorDisplay />;
};

function onClickAccept(id: string) {}

export default FriendRequestsModal;
