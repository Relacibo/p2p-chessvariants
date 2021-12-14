import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import { spawn } from "threads";
import { AppThunk, RootState } from "../../app/store";
import { Coords, VariantState } from "./gamelogic/types";
import { VariantsWorker } from "./worker";

export let worker: VariantsWorker | null = null;

export type MoveParams = {
  source: Coords;
  destination: Coords;
  playerIndex: number;
};

export type GameInfo = {
  variantKey: string;
  state: VariantState;
};

export type URLVariantInfo = {
  loadingState: "loading" | "loaded" | "error";
  url: string;
  name?: string;
};
export const {
  actions: {
    loadingScript,
    loadedScript,
    failedLoadingScript,
    startGame,
    changeGameState,
    setWorkerLoaded,
  },
  reducer,
} = createSlice({
  name: "chessboard",
  initialState: {
    games: new Map<string, GameInfo>(),
    customVariants: new Map<string, URLVariantInfo>(),
    workerLoaded: false,
  },
  reducers: {
    loadingScript: (
      { customVariants },
      action: PayloadAction<{ key: string; url: string }>
    ) => {
      const { key, url } = action.payload;
      customVariants.set(key, { loadingState: "loading", url });
    },
    loadedScript: (
      { customVariants },
      action: PayloadAction<{ key: string; name: string }>
    ) => {
      const { key, name } = action.payload;
      const entry = customVariants.get(key);
      if (entry == null) {
        return;
      }
      customVariants.set(key, {
        ...entry,
        loadingState: "loaded",
        name,
      });
    },
    failedLoadingScript: (
      { customVariants },
      action: PayloadAction<string>
    ) => {
      customVariants.delete(action.payload);
    },
    startGame: (
      { games },
      action: PayloadAction<{
        key: string;
        variantKey: string;
        state: VariantState;
      }>
    ) => {
      const { key, variantKey, state } = action.payload;
      games.set(key, {
        variantKey,
        state,
      });
    },
    changeGameState: (
      { games },
      action: PayloadAction<{ key: string; newState: VariantState }>
    ) => {
      const { key, newState } = action.payload;
      const variantState = games.get(key);
      if (!variantState) {
        return;
      }
      variantState.state = newState;
    },
    setWorkerLoaded: (state, action: PayloadAction<boolean>) => {
      state.workerLoaded = action.payload;
    },
  },
});

export const initializeWorker = (): AppThunk => async (dispatch) => {
  worker = (await spawn(new Worker("worker.ts"))) as any as VariantsWorker;
  dispatch(setWorkerLoaded(true));
};

export const loadScript =
  (url: string): AppThunk =>
  async (dispatch) => {
    dispatch(loadingScript({ key: url, url }));
    try {
      const name = await worker!.loadScript(url);
      dispatch(loadedScript({ key: url, name }));
    } catch {
      dispatch(failedLoadingScript(url));
    }
  };

export const move =
  (key: string, moveParams: MoveParams): AppThunk =>
  async (dispatch, getState) => {
    const game = selectGames(getState()).get(key);
    if (!game) {
      return;
    }
    const { variantKey, state } = game;
    let newState;
    try {
      newState = await worker!.move(variantKey, key, state, moveParams);
    } catch (e) {
      toast.error(e);
      return;
    }
    dispatch(changeGameState({ key, newState }));
  };

export const selectState = (state: RootState) => state.variantEnvironment;
export const selectGames = (state: RootState) => state.variantEnvironment.games;
export const selectWorkerLoaded = (state: RootState) =>
  state.variantEnvironment.workerLoaded;
export const selectCustomVariants = (state: RootState) =>
  state.variantEnvironment.customVariants;

export default reducer;
