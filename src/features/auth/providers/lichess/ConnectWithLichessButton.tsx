import { Button } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { generateId, sha256Base64Url } from "../../../../util/crypto";
import { lichessLinkCallbackPath } from "./LichessLinkHandler";

type LinkStorage = { state: string; codeVerifier: string };

const lichessClientId = import.meta.env.VITE_LICHESS_CLIENT_ID;
const baseUrl = import.meta.env.VITE_BASE_URL;
const redirectUri = `${baseUrl}${lichessLinkCallbackPath}`;
const lichessHost = "https://lichess.org";
const scope = "email:read";

const ConnectWithLichessButton = () => {
  const [linkState, setLinkState] = useLocalStorage<LinkStorage | null>({
    key: "lichessLink",
    defaultValue: null,
  });
  const [codeChallenge, setCodeChallenge] = useState<string | null>(null);
  const [redirect, setRedirect] = useState(false);

  useEffect(() => {
    if (redirect && linkState && codeChallenge) {
      const { state } = linkState;
      const p = new URLSearchParams({
        response_type: "code",
        client_id: lichessClientId,
        redirect_uri: redirectUri,
        scope,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
        state,
      });
      window.location.href = `${lichessHost}/oauth?${p.toString()}`;
    }
  }, [codeChallenge, linkState, redirect]);

  const connect: React.MouseEventHandler<HTMLButtonElement> = async () => {
    const codeVerifier = generateId(64);
    const state = generateId(30);
    const challenge = await sha256Base64Url(codeVerifier);
    setLinkState({ state, codeVerifier });
    setCodeChallenge(challenge);
    setRedirect(true);
  };

  return <Button onClick={connect}>Lichess verbinden</Button>;
};

export default ConnectWithLichessButton;
