import { Middleware } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";
import { invalidToken, selectSession } from "./authSlice";

const authMiddleware: Middleware = (store) => (next) => (action) => {
  if (action.type === "persist/REHYDRATE") {
    next(action);
    const state: RootState = store.getState();
    const session = selectSession(state);
    if (!session) {
      return;
    }
    const isTokenInvalid =
      session.state === "logged-in" &&
      new Date(session.claims.exp) < new Date(Date.now());
    if (isTokenInvalid) {
      store.dispatch(invalidToken());
    }
    return;
  }
  next(action);
};

export default authMiddleware;
