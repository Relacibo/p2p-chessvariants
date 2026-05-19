import { useGetUserQuery } from "../../api/api";
import UserDisplay from "./UserDisplay";
import type React from "react";

type Props = {
  id: string;
  placeholder?: React.JSX.Element;
};
const UserFetcher = ({ id, placeholder }: Props) => {
  let { data, isSuccess } = useGetUserQuery(id);
  return isSuccess && data ? (
    <UserDisplay user={data}></UserDisplay>
  ) : (
    (placeholder ?? <></>)
  );
};
export default UserFetcher;
