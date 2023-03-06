import { useDispatch } from "react-redux";
import useSwitchView from "../layout/hooks";
import LoginWithGoogleButton from "./LoginWithGoogleButton";

type Props = {};
const LoginWithGoogleView = ({}: Props) => {
  const dispatch = useDispatch();
  useSwitchView(() => ({ sidebarAlwaysExtendedInLarge: true }));

  return <LoginWithGoogleButton />;
};
export default LoginWithGoogleView;
