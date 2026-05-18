import { Middleware } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";
import { invalidToken, selectSession } from "./authSlice";

const authMiddleware: Middleware = (store) => (next) => (action: unknown) => {
  if (typeof action === 'object' && action !== null && 'type' in action && (action as { type: string }).type === "persist/REHYDRATE") {
    next(action);
    const state: RootState = store.getState();
    const session = selectSession(state);
    // session will not be null
    // exp is in seconds (Unix timestamp), multiply by 1000 for ms
    const isTokenInvalid =
      session.state === "logged-in" &&
      new Date(session.claims.exp * 1000) < new Date(Date.now());
    if (isTokenInvalid) {
      store.dispatch(invalidToken());
    }
    return;
  }
  next(action);
};

export default authMiddleware;
