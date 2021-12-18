import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Coords, VariantState } from "../../gamelogic/types";
import { VariantsWorker } from "../worker/worker";
import { doWithWorker } from "../worker/workerSlice";

export type MoveParams = {
  source: Coords;
  destination: Coords;
  playerIndex: number;
};

export type GameInfo = {
  variant: string;
  state: VariantState;
};

export const {
  actions: { startGame, changeGameState },
  reducer,
} = createSlice({
  name: "variantsSlice",
  initialState: {
    games: new Map<string, GameInfo>(),
  },
  reducers: {
    startGame: (
      { games },
      action: PayloadAction<{
        key: string;
        variant: string;
        state: VariantState;
      }>
    ) => {
      const { key, variant, state } = action.payload;
      games.set(key, { variant, state });
    },
    changeGameState: (
      { games },
      action: PayloadAction<{
        key: string;
        newState: VariantState;
      }>
    ) => {
      const { key, newState } = action.payload;
      const variantState = games.get(key);
      if (!variantState) {
        return;
      }
      variantState.state = newState;
    },
  },
});

export const move =
  (key: string, moveParams: MoveParams): AppThunk =>
  async (dispatch, getState) => {
    const game = selectGame(key)(getState());
    if (!game) {
      return;
    }
    const { variant, state } = game;
    let newState: VariantState;
    try {
      newState = await dispatch(
        doWithWorker((worker: VariantsWorker) => {
          return worker.move(variant, key, state, moveParams);
        })
      )!;
    } catch (e) {
      toast.error(e);
      return;
    }
    dispatch(changeGameState({ key, newState }));
  };

export const selectState = (state: RootState) => state.variantEnvironment;
export const selectGames = (state: RootState) => state.variantEnvironment.games;
export const selectGame = (id: string) => (state: RootState) =>
  state.variantEnvironment.games.get(id);

export default reducer;
