import { User } from "../user/users";

export type LoginResponse =
  | {
      result: "success";
      token: string;
      user: User;
    }
  | {
      result: "not-registered";
      usernameSuggestion: string;
    };

export interface OauthData {
  type: string;
}

export class SigninPayload<T extends OauthData = OauthData> {
  constructor(readonly oauthData: T) {}
}

export class SignupPayload<T extends OauthData = OauthData> {
  constructor(
    readonly username: string,
    readonly oauthData: T,
  ) {}
}

export type ProviderType = "google" | "lichess";

export interface ConnectionsResponse {
  google: boolean;
  lichess: boolean;
}

export interface UnlinkPayload {
  provider: ProviderType;
}

export class LinkPayload<T extends OauthData = OauthData> {
  constructor(readonly oauthData: T) {}
}
