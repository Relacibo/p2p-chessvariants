import { Box, Center, Container, Paper, Stack } from "@mantine/core";
import LoginWithGoogleButton from "./google/LoginWithGoogleButton";
import useSwitchView from "../../layout/hooks";
import LoginWithLichessButton from "./lichess/LoginWithLichessButton";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectLoginState } from "../authSlice";
import { useEffect } from "react";

type Props = {};

const LoginView = ({}: Props) => {
  const navigate = useNavigate();
  const loginState = useSelector(selectLoginState);
  const loggedIn = loginState === "logged-in";

  useEffect(() => {
    if (loggedIn) {
      navigate("/");
    }
  }, [loggedIn]);
  useSwitchView(() => ({ sidebarAlwaysExtendedInLarge: false }));
  return (
    <Container h={"100vh"}>
      <Center h={"100vh"}>
        <Stack>
          <LoginWithGoogleButton />
          <LoginWithLichessButton />
        </Stack>
      </Center>
    </Container>
  );
};

export default LoginView;
