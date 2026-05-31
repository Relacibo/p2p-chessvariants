import {
  Action,
  combineReducers,
  configureStore,
  ThunkAction,
} from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query/react";
import { api } from "../api/api";
import { errorHandler } from "../api/errorHandler";
import authMiddleware from "../features/auth/authMiddleware";
import auth from "../features/auth/authSlice";
import darkmode from "../features/darkmode/darkmodeSlice";
import lobby from "../features/lobby/lobbySlice";
import lobbyVariants from "../features/lobby/variantsSlice";
import { loadState, persistenceMiddleware } from "./persistence";

const rootReducer = combineReducers({
  darkmode,
  auth,
  lobby,
  lobbyVariants,
  [api.reducerPath]: api.reducer,
});

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: loadState(),
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      api.middleware,
      errorHandler,
      authMiddleware,
      persistenceMiddleware,
    ),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof rootReducer>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

setupListeners(store.dispatch);
