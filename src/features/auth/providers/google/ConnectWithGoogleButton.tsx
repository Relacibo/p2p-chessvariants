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
                title: "Google verbunden",
                message: "Dein Google Account wurde erfolgreich verknüpft.",
                color: "green",
              });
              onConnected?.();
            })
            .catch(() => {
              notifications.show({
                title: "Fehler",
                message: "Google konnte nicht verknüpft werden.",
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
