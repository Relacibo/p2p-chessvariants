import { Stack } from "@mantine/core";
import { useSelector } from "react-redux";
import { selectSession } from "./authSlice";
import GoogleAutoSignin from "./GoogleAutoSignin";

const LoginSession = () => {
  const sessionToken = useSelector(selectSession);
  return !sessionToken ? <GoogleAutoSignin /> : <></>;
};
export default LoginSession;
