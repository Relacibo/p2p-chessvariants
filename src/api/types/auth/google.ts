import { SigninPayload, SignupPayload, OauthData } from "./auth";

export class GoogleOauthData implements OauthData {
  type = "google";
  constructor(readonly credential: string) {}
}
