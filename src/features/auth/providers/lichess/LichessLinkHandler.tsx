import { useLocalStorage } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LichessOauthData } from "../../../../api/types/auth/lichess";
import useLinkProvider from "../../useLink";

type LinkStorage = { state: string; codeVerifier: string };
export const lichessLinkCallbackPath = "/auth/login/lichess/oauth";

const LichessLinkHandler = () => {
  const [link] = useLinkProvider();
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [linkState, setLinkState] = useLocalStorage<LinkStorage | null>({
    key: "lichessLink",
    defaultValue: null,
  });

  const stateParam = params.get("state");
  const code = params.get("code");

  useEffect(() => {
    if (location.pathname !== lichessLinkCallbackPath || !linkState) return;

    const { state, codeVerifier } = linkState;
    if (!stateParam || stateParam !== state || !code) return;

    setLinkState(null);
    const oauthData = new LichessOauthData(code, codeVerifier);
    link(oauthData)
      .then(() => {
        notifications.show({
          title: "Lichess verbunden",
          message: "Dein Lichess Account wurde erfolgreich verknüpft.",
          color: "green",
        });
        navigate("/account/connections");
      })
      .catch(() => {
        notifications.show({
          title: "Fehler",
          message: "Lichess konnte nicht verknüpft werden.",
          color: "red",
        });
        navigate("/account/connections");
      });
  }, [code, link, linkState, location.pathname, navigate, setLinkState, stateParam]);

  return null;
};

export default LichessLinkHandler;
