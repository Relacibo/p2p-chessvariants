import { useGetUserQuery } from "../../api/api";
import UserDisplay from "./UserDisplay";

type Props = {
  id: string;
  placeholder?: JSX.Element;
};
const UserFetcher = ({ id, placeholder }: Props) => {
  let { data, isSuccess } = useGetUserQuery(id);
  return isSuccess && data ? (
    <UserDisplay user={data}></UserDisplay>
  ) : (
    placeholder ?? <></>
  );
};
export default UserFetcher;
