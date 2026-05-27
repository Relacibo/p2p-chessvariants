import { Box, Center, Container, Paper, Stack } from "@mantine/core";
import LoginWithGoogleButton from "./providers/google/LoginWithGoogleButton";
import useSwitchView from "../layout/hooks";
import LoginWithLichessButton from "./providers/lichess/LoginWithLichessButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectLoginState } from "./authSlice";
import { useEffect } from "react";

type Props = {};

const LoginView = ({}: Props) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginState = useSelector(selectLoginState);
  const loggedIn = loginState === "logged-in";

  useEffect(() => {
    if (loggedIn) {
      const redirect = searchParams.get("redirect");
      navigate(redirect ?? "/");
    }
  }, [loggedIn]);
  useSwitchView(() => ({ navPinned: false }));
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
