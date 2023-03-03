import { Stack } from "@mantine/core";
import { useSelector } from "react-redux";
import { selectSessionToken } from "./authSlice";
import GoogleAutoSignin from "./GoogleAutoSignin";

const LoginSession = () => {
  const sessionToken = useSelector(selectSessionToken);
  return !sessionToken ? <GoogleAutoSignin /> : <Stack></Stack>;
};
export default LoginSession;
