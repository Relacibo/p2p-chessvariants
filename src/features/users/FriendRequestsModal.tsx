import { Box, Divider, Modal, Stack, Table, Text } from "@mantine/core";
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
          <th>Ignore?</th>
        </tr>
      </thead>
      <tbody>
        {data.map(({ from: { userId, userName }, createdAt }) => (
          <tr key={userId}>
            <td>{userName}</td>
            <td>{createdAt.toLocaleString()}</td>
          </tr>
        ))}
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

export default FriendRequestsModal;
