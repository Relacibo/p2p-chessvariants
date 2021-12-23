import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppThunk, RootState } from "../../app/store";
import { VariantsWorker } from "./worker";
import { spawn } from "threads";

export let worker: VariantsWorker | null = null;

export type LoadingState =
  | {
      type: "loading";
    }
  | { type: "loaded"; key: string }
  | {
      type: "error";
      message: string;
    };

export const {
  actions: { loadingScript, loadedScript, failedLoadingScript, loadedWorker },
  reducer,
} = createSlice({
  name: "worker",
  initialState: {
    workerState: false,
    availableScripts: new Set<string>(),
    scriptLoadingStates: {} as { [key: string]: LoadingState },
  },
  reducers: {
    loadingScript: ({ scriptLoadingStates }, action: PayloadAction<string>) => {
      scriptLoadingStates[action.payload] = { type: "loading" };
    },
    loadedScript: (
      { scriptLoadingStates },
      action: PayloadAction<{ url: string; key: string }>
    ) => {
      const { url, key } = action.payload;
      const entry = scriptLoadingStates[url];
      scriptLoadingStates[url] = {
        type: "loaded",
        key,
      };
    },
    failedLoadingScript: (
      { scriptLoadingStates },
      action: PayloadAction<{ url: string; message: string }>
    ) => {
      const { url, message } = action.payload;
      scriptLoadingStates[url] = { type: "error", message };
    },
    loadedWorker: (state, action: PayloadAction<boolean>) => {
      state.workerState = action.payload;
    },
  },
});

export const doWithWorker =
  <T>(f: (worker: VariantsWorker) => T): AppThunk<T | undefined> =>
  (_, getState) => {
    if (selectWorkerLoaded(getState())) {
      return f(worker!);
    }
  };

export const initializeWorker = (): AppThunk => async (dispatch) => {
  worker = (await spawn(new Worker("worker.ts"))) as any as VariantsWorker;
  dispatch(loadedWorker(true));
};

export const loadScript =
  (url: string): AppThunk =>
  async (dispatch) => {
    dispatch(loadingScript(url));
    try {
      const uuid = await worker!.loadScript(url);
      dispatch(loadedScript({ url, key: uuid }));
    } catch (e) {
      dispatch(failedLoadingScript({ url, message: e }));
    }
  };

export const selectWorkerLoaded = (state: RootState) =>
  state.worker.workerState;
export const selectScriptLoadingState = (key: string) => (state: RootState) =>
  state.worker.scriptLoadingStates[key];

export default reducer;
