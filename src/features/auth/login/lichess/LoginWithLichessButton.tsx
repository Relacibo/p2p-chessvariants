import { Button } from "@mantine/core";

const lichessClientId = import.meta.env.VITE_LICHESS_API_ACCESS_TOKEN;

const LoginWithLichessButton = () => {
  const loginWithLichess: React.MouseEventHandler<HTMLButtonElement> = (
    event,
  ) => {};
  return <Button onClick={loginWithLichess}>Login with lichess</Button>;
};

export default LoginWithLichessButton;
