import { useDispatch } from "react-redux";
import useConfigureLayout from "../layout/hooks";
import LoginWithGoogleButton from "./LoginWithGoogleButton";

type Props = {};
const LoginWithGoogleView = ({}: Props) => {
  const dispatch = useDispatch();
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));

  return <LoginWithGoogleButton />;
};
export default LoginWithGoogleView;
