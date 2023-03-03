import { Image, Loader, Table } from "@mantine/core";
import moment from "moment";
import { useListUsersQuery } from "../../api/api";
import { PublicUser } from "../../api/types/users";

function UserOverview() {
  let { data, isLoading, isSuccess, isError, error } = useListUsersQuery();
  let users = data ?? [];
  let out = null;
  return isLoading ? (
    <Loader />
  ) : isSuccess ? (
    <Table>
      <thead>
        <tr>
          <th>Picture</th>
          <th>Nickname</th>
          <th>Created at</th>
        </tr>
      </thead>
      <tbody>{users.map(userRow)}</tbody>
    </Table>
  ) : (
    <>{error}</>
  );
}

function userRow(user: PublicUser) {
  let { id, nickName, picture, createdAt } = user;
  return (
    <tr key={id}>
      <td>{picture ? <Image src={picture} width={40} height={40} /> : "-"}</td>
      <td>{nickName ?? "-"}</td>
      <td>{moment(createdAt).format("DD.MM.YYYY hh:mm:ss")}</td>
    </tr>
  );
}

export default UserOverview;
