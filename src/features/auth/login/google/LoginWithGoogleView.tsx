import { useDispatch } from "react-redux";
import LoginWithGoogleButton from "./LoginWithGoogleButton";
import useSwitchView from "../../../layout/hooks";

type Props = {};
const LoginWithGoogleView = ({}: Props) => {
  const dispatch = useDispatch();
  useSwitchView(() => ({ sidebarAlwaysExtendedInLarge: true }));

  return <LoginWithGoogleButton />;
};
export default LoginWithGoogleView;