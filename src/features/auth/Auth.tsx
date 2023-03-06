import { Button, Paper } from "@mantine/core";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logout, selectUser } from "./authSlice";
import LoginWithGoogleButton from "./LoginWithGoogleButton";

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
        <LoginWithGoogleButton />
      )}
    </Paper>
  );
};

export default Auth;
