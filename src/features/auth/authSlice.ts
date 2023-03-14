import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "../../api/types/auth/users";
import { RootState } from "../../app/store";
import { Claims, decodeAuthClaims } from "../../jwt";

const initialState: State = {
  session: { state: "logged-out", loggedOutCause: "logged-out" },
};

type LoggedOutCause = "logged-out" | "invalid-token";

export type State = {
  session:
    | { state: "logged-in"; token: string; user: User; claims: Claims }
    | { state: "logged-out"; loggedOutCause: LoggedOutCause };
};

export const {
  actions: { login, logout, invalidToken },
  reducer,
} = createSlice({
  name: "auth",
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ token: string; user: User }>) => {
      let { token, user } = action.payload;
      let claims = decodeAuthClaims(token);
      state.session = { state: "logged-in", claims, token, user };
    },
    logout: (state) => {
      state.session = { state: "logged-out", loggedOutCause: "logged-out" };
    },
    invalidToken: (state) => {
      state.session = { state: "logged-out", loggedOutCause: "invalid-token" };
    },
  },
});

export const selectSession = (state: RootState) => state.auth.session;

export const selectUser = (state: RootState) => {
  let session = state.auth.session;
  return session?.state === "logged-in" ? session.user : null;
};

export const selectToken = (state: RootState) => {
  let session = state.auth.session;
  return session?.state === "logged-in" ? session.token : null;
};

export const selectClaims = (state: RootState) => {
  let session = state.auth.session;
  return session?.state === "logged-in" ? session.claims : null;
};

export const selectLoggedOutCause = (state: RootState) => {
  let session = state.auth.session;
  return session?.state === "logged-out" ? session.loggedOutCause : null;
};

export const selectState = (state: RootState) => state.auth.session?.state;

export default reducer;
