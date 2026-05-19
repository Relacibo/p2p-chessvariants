import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { useServerLogoutMutation } from "../../api/api";
import { logout, selectLoggedOutCause, selectUser } from "./authSlice";

type Props = {};

const Auth = ({}: Props) => {
  let user = useSelector(selectUser);
  let loggedOutCause = useSelector(selectLoggedOutCause);
  let dispatch = useDispatch();
  const [serverLogout] = useServerLogoutMutation();

  useEffect(() => {
    if (loggedOutCause === "invalid-token") {
      notifications.show({
        title: "Session abgelaufen",
        message: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
        color: "orange",
        autoClose: 6000,
      });
    }
  }, [loggedOutCause]);

  const handleLogout = () => {
    serverLogout().finally(() => dispatch(logout()));
  };

  return user ? (
    <Button onClick={handleLogout}>{user.userName} (Log out)</Button>
  ) : (
    <Button component={Link} to={"auth/login"}>
      Log in
    </Button>
  );
};

export default Auth;
