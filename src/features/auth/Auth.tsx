import { Button, Paper } from "@mantine/core";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { User } from "../../api/types/users";
import { logout, selectUser } from "./authSlice";

type Props = {};

const Auth = ({}: Props) => {
  let user = useSelector(selectUser);
  let navigate = useNavigate();
  return (
    <Paper>
      {user ? (
        <UserInfo user={user}></UserInfo>
      ) : (
        <Button
          onClick={() => {
            navigate("/auth/google/login");
          }}
        >
          Log In
        </Button>
      )}
    </Paper>
  );
};

const UserInfo = ({ user }: { user: User }) => {
  let dispatch = useDispatch();
  let { userName } = user;
  return (
    <Button onClick={() => dispatch(logout())}>
      {userName} (Log out)
    </Button>
  );
};

export default Auth;
