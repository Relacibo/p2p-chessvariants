import { Button } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { generateId, sha256 } from "../../../../util/crypto";
import { useEffect, useState } from "react";
import { useSignInMutation } from "../../../../api/api";
import { SignupResult } from "../../SignupModal";
import useLogin from "../../useLogin";
import { LichessOauthData } from "../../../../api/types/auth/lichess";
import base64Url from "base64-url";

const lichessClientId = import.meta.env.VITE_LICHESS_CLIENT_ID;
const baseUrl = import.meta.env.VITE_BASE_URL;
const lichessTokenPathName = "/auth/login/lichess/oauth";
const redirectUri = `${baseUrl}${lichessTokenPathName}`;
const lichessHost = "https://lichess.org";
const scope = "email:read";

type OauthLocalStorage = { state: string; codeVerifier: string };

const LoginWithLichessButton = () => {
  const [login] = useLogin();
  const location = useLocation();
  const [oauthState, setOauthState] = useLocalStorage<OauthLocalStorage | null>(
    { key: "lichessOauth", defaultValue: null },
  );
  const [codeChallenge, setCodeChallenge] = useState<string | null>(null);
  const [params] = useSearchParams();
  const stateFromLichess = params.get("state");
  const code = params.get("code");
  const [redirect, setRedirect] = useState(false);
  useEffect(() => {
    const { pathname } = location;
    if (pathname === lichessTokenPathName && oauthState !== null) {
      const { state, codeVerifier } = oauthState;
      if (
        stateFromLichess === null ||
        stateFromLichess === "" ||
        stateFromLichess !== state ||
        code === null
      ) {
        return;
      }
      const oauthData = new LichessOauthData(code, codeVerifier);
      login(oauthData);
      setOauthState(null);
    }
  }, [stateFromLichess, code, oauthState]);

  useEffect(() => {
    if (redirect && oauthState && codeChallenge) {
      const { state } = oauthState;
      window.location.href =
        `${lichessHost}/oauth?` +
        `response_type=code&` +
        `client_id=${lichessClientId}&` +
        `redirect_uri=${redirectUri}&` +
        `code_challenge_method=S256&&` +
        `code_challenge=${codeChallenge}&` +
        `scope=${scope}&` +
        `state=${state}&`;
    }
  }, [redirect, oauthState, codeChallenge]);

  const loginWithLichess: React.MouseEventHandler<HTMLButtonElement> = async (
    event,
  ) => {
    const codeVerifier = generateId(64);
    const state = generateId(30);
    let codeChallenge = base64Url.encode(await sha256(codeVerifier));
    alert(codeVerifier);
    alert(codeChallenge);
    setOauthState({ state, codeVerifier });
    setCodeChallenge(codeChallenge);
    setRedirect(true);
  };
  return <Button onClick={loginWithLichess}>Login with lichess</Button>;
};

export default LoginWithLichessButton;
