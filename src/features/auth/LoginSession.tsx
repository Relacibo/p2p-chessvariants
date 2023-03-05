import { useSelector } from "react-redux";
import { selectState } from "./authSlice";
import GoogleAutoSignin from "./GoogleAutoSignin";

const LoginSession = () => {
  const sessionState = useSelector(selectState);
  return sessionState === "logged-out" ? <GoogleAutoSignin /> : <></>;
};
export default LoginSession;
