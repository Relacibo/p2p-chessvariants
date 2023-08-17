import { Box, Center, Container, Paper, Stack } from "@mantine/core";
import LoginWithGoogleButton from "./google/LoginWithGoogleButton";
import useSwitchView from "../../layout/hooks";
import LoginWithLichessButton from "./lichess/LoginWithLichessButton";

type Props = {};

const LoginView = ({}: Props) => {
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
