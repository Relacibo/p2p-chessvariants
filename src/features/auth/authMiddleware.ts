import { Middleware } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";
import { invalidToken, selectSession } from "./authSlice";

const authMiddleware: Middleware = (store) => (next) => (action) => {
  if (action.type === "persist/REHYDRATE") {
    next(action);
    let state: RootState = store.getState();
    let session = selectSession(state);
    if (session.state === "logged-in") {
      if (new Date(session.claims.exp) < new Date(Date.now())) {
        store.dispatch(invalidToken());
      }
    }
    return;
  }
  next(action);
};

export default authMiddleware;
