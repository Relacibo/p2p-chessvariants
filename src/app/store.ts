import {
  Action,
  combineReducers,
  configureStore,
  ThunkAction,
} from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query/react";
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
} from "redux-persist";
// redux-persist/lib/storage has CJS/ESM interop issues with Vite 8 + moduleResolution:Bundler
const storage = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, item: string) => {
    localStorage.setItem(key, item);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};
import { api } from "../api/api";
import { errorHandler } from "../api/errorHandler";
import authMiddleware from "../features/auth/authMiddleware";
import auth from "../features/auth/authSlice";
import darkmode from "../features/darkmode/darkmodeSlice";
import peer from "../features/peer/peerSlice";
import variantEnvironment from "../features/variant-environment/variantsSlice";
import worker from "../features/worker/workerSlice";

const persistConfig = {
  key: "root",
  version: 1,
  storage,
  blacklist: ["worker", api.reducerPath],
};

const rootReducer = combineReducers({
  variantEnvironment,
  darkmode,
  worker,
  peer,
  auth,
  // Add the generated reducer as a specific top-level slice
  [api.reducerPath]: api.reducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(api.middleware, errorHandler, authMiddleware),
});

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

// optional, but required for refetchOnFocus/refetchOnReconnect behaviors
// see `setupListeners` docs - takes an optional callback as the 2nd arg for customization
setupListeners(store.dispatch);
