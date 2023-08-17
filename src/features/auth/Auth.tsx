import { Button, Paper } from "@mantine/core";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { logout, selectUser } from "./authSlice";

type Props = {};

const Auth = ({}: Props) => {
  let user = useSelector(selectUser);
  let dispatch = useDispatch();
  return (
    <Paper>
      {user ? (
        <Button onClick={() => dispatch(logout())}>
          {user.userName} (Log out)
        </Button>
      ) : (
        <Button component={Link} to={"auth/login"}>
          Log in
        </Button>
      )}
    </Paper>
  );
};

export default Auth;
