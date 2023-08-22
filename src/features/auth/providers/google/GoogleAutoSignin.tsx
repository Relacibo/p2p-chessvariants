import { useGoogleOneTapLogin } from "@react-oauth/google";
import { GoogleOauthData } from "../../../../api/types/auth/google";
import useLogin from "../../useLogin";
const GoogleAutoSignin = () => {
  const [login] = useLogin();

  useGoogleOneTapLogin({
    onSuccess: (response) => {
      let { credential } = response;
      if (!credential) {
        return;
      }
      const oauthData = new GoogleOauthData(credential);
      login(oauthData);
    },
    onError: () => {
      console.error("Login Failed");
    },
  });
  return <></>;
};

export default GoogleAutoSignin;
