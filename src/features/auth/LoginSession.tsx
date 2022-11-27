import { useSelector } from "react-redux";
import { selectSessionToken } from "./authSlice";
import GoogleAutoSignin from "./GoogleAutoSignin";
import { Stack } from "@mantine/core"

const LoginSession = () => {
  const sessionToken = useSelector(selectSessionToken);
  return <></>;
  // return <GoogleAutoSignin/>;
  // return !sessionToken ? <GoogleAutoSignin/> : <Stack></Stack>;
  // return !sessionToken ? <></> : <Stack></Stack>;
};
export default LoginSession;
