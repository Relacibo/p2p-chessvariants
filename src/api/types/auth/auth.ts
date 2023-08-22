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
