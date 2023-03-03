import { User } from "./users";

export const google = 0;
export type LoginResponse = {
  token: string;
  user: User;
};

export type OAuthPayload = {
  // g_csrf_token: string;
  credential: string;
}
