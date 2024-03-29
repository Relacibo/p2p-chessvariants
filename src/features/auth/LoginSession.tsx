import { useSelector } from "react-redux";
import { selectLoginState } from "./authSlice";
import GoogleAutoSignin from "./providers/google/GoogleAutoSignin";

const LoginSession = () => {
  const sessionState = useSelector(selectLoginState);
  return sessionState === "logged-out" ? <GoogleAutoSignin /> : <></>;
};
export default LoginSession;
