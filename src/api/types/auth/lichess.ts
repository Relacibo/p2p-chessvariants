import { OauthData } from "./auth";

export class LichessOauthData implements OauthData {
  type = "lichess";
  constructor(
    readonly code: string,
    readonly codeVerifier: string,
  ) {}
}
