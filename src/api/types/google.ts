import { User } from "./users";

export const google = 0;
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

export type SigninPayload = {
  credential: string;
};

export type SignupPayload = {
  username: String;
  credential: string;
};
