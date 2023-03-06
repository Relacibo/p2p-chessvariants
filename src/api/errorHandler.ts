import {
  isRejectedWithValue,
  Middleware,
  MiddlewareAPI,
} from "@reduxjs/toolkit";
import { invalidToken } from "../features/auth/authSlice";
import { showError } from "../util/notification";
import { BackendError } from "./types/backendError";

export const errorHandler: Middleware =
  (api: MiddlewareAPI) => (next) => (action) => {
    // RTK Query uses `createAsyncThunk` from redux-toolkit under the hood, so we're able to utilize these matchers!
    if (isRejectedWithValue(action)) {
      console.warn("We got a rejected action!");
      const payload = action.payload;
      const status = payload.status;
      if (typeof status !== "undefined") {
        handleBackendError(api, payload);
      }
    }
    return next(action);
  };

const handleBackendError = (api: MiddlewareAPI, payload: BackendError) => {
  if (payload.data?.error) {
    let error = payload.data.error;
    showError(error);
    if (error === "authentication-failed") {
      api.dispatch(invalidToken());
    }
  }
};
