import { Box } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { GoogleLogin } from "@react-oauth/google";
import { GoogleOauthData } from "../../../../api/types/auth/google";
import useLinkProvider from "../../useLink";

type Props = {
  onConnected?: () => void;
};

const ConnectWithGoogleButton = ({ onConnected }: Props) => {
  const [link] = useLinkProvider();

  return (
    <Box style={{ width: 200 }}>
      <GoogleLogin
        onSuccess={(response) => {
          const { credential } = response;
          if (!credential) return;

          link(new GoogleOauthData(credential))
            .then(() => {
              notifications.show({
                title: "Google connected",
                message: "Your Google account has been linked successfully.",
                color: "green",
              });
              onConnected?.();
            })
            .catch((e) => {
              console.error("[ConnectWithGoogleButton] link failed", e);
              notifications.show({
                title: "Error",
                message: "Could not link Google account.",
                color: "red",
              });
            });
        }}
        onError={() => console.error("Google login failed")}
        text="continue_with"
      />
    </Box>
  );
};

export default ConnectWithGoogleButton;
