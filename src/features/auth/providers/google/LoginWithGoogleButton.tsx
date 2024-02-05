import { Box } from "@mantine/core";
import { GoogleLogin } from "@react-oauth/google";
import useLogin from "../../useLogin";
import { GoogleOauthData } from "../../../../api/types/auth/google";

const LoginWithGoogleButton = () => {
  const [login] = useLogin();
  return (
    <Box style={{ width: 200 }}>
      <GoogleLogin
        onSuccess={(response) => {
          let { credential } = response;
          if (!credential) {
            return;
          }
          // Get's activated, if the user clicks on the one tap
          const oauthData = new GoogleOauthData(credential);
          login(oauthData);
        }}
        onError={() => {
          console.log("Login Failed");
        }}
        // autoSelect doesn't seem to work: https://github.com/MomenSherif/react-oauth/issues/210
        // auto_select={autoSelect}
        // useOneTap={autoSelect}
      />
    </Box>
  );
};

export default LoginWithGoogleButton;
