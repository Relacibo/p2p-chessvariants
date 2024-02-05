import { ActionIcon, Image, Loader, Table, Tooltip } from "@mantine/core";
import { useListUsersQuery } from "../../api/api";
import { PublicUser } from "../../api/types/user/users";
import { useDispatch, useSelector } from "../../app/hooks";
import { selectLoginState as selectAuthState } from "../auth/authSlice";
import { openConfirmModal } from "../confirmModal/ConfirmModal";
import ErrorDisplay from "../error/ErrorDisplay";
import { IconHeartHandshake } from "@tabler/icons-react";

function UserOverview() {
  const authState = useSelector(selectAuthState);
  const isLoggedIn = authState == "logged-in";
  const { data, isLoading, isSuccess, isError, error } = useListUsersQuery();
  const users = data ?? [];
  return isLoading ? (
    <Loader />
  ) : isSuccess ? (
    <Table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Created at</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>{users.map((user) => userRow(isLoggedIn, user))}</tbody>
    </Table>
  ) : (
    <ErrorDisplay />
  );
}

function userRow(isLoggedIn: boolean, user: PublicUser) {
  let { id, userName, createdAt } = user;
  return (
    <tr key={id}>
      <td>{userName}</td>
      <td>{new Date(createdAt).toLocaleString()}</td>
      <td>
        {isLoggedIn && (
          <Tooltip label="Friend request">
            <ActionIcon color="green" onClick={() => onClickFriendRequest(id)}>
              <IconHeartHandshake />
            </ActionIcon>
          </Tooltip>
        )}
      </td>
    </tr>
  );
}

function onClickFriendRequest(userId: string) {
  const onConfirmCallback = () => {};
  openConfirmModal(onConfirmCallback);
}

export default UserOverview;
