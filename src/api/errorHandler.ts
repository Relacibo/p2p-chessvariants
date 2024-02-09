import {
  isRejected,
  isRejectedWithValue,
  Middleware,
  MiddlewareAPI,
} from "@reduxjs/toolkit";
import { invalidToken } from "../features/auth/authSlice";
import { handleError } from "../util/notification";
import { BackendError } from "./types/backendError";

export const errorHandler: Middleware =
  (api: MiddlewareAPI) => (next) => (action) => {
    // RTK Query uses `createAsyncThunk` from redux-toolkit under the hood, so we're able to utilize these matchers!
    if (isRejected(action)) {
      const {message} = action.error;
      console.error(JSON.stringify(action))
      handleError(message);
    } else if (isRejectedWithValue(action)) {
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
    handleError(error);
    if (error === "authentication-failed") {
      api.dispatch(invalidToken());
    }
  }
};
