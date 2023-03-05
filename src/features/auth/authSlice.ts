import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "../../api/types/users";
import { RootState } from "../../app/store";

const initialState: State = {
  session: { state: "logged-out", loggedOutCause: "logged-out" },
};

type LoggedOutCause = "logged-out" | "invalid-token";

type State = {
  session:
    | { state: "logged-in"; token: string; user: User }
    | { state: "logged-out"; loggedOutCause: LoggedOutCause };
};

export const {
  actions: { login, logout },
  reducer,
} = createSlice({
  name: "auth",
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ token: string; user: User }>) => {
      state.session = { state: "logged-in", ...action.payload };
    },
    logout: (state) => {
      state.session = { state: "logged-out", loggedOutCause: "logged-out" };
    },
  },
});

export const selectSession = (state: RootState) => state.auth.session;
export const selectUser = (state: RootState) => {
  let session = state.auth.session;
  return session.state === "logged-in" ? session.user : null;
};
export const selectToken = (state: RootState) => {
  let session = state.auth.session;
  return session.state === "logged-in" ? session.token : null;
};

export const selectState = (state: RootState) => state.auth.session?.state;

export default reducer;
