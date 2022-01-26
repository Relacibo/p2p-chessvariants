import { createSlice, PayloadAction } from "@reduxjs/toolkit";
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
    games: {} as { [key: string]: GameInfo },
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
      games[key] = { variant, state };
    },
    changeGameState: (
      { games },
      action: PayloadAction<{
        key: string;
        newState: VariantState;
      }>
    ) => {
      const { key, newState } = action.payload;
      const variantState = games[key];
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
      console.log(e);
      return;
    }
    dispatch(changeGameState({ key, newState }));
  };

export const selectState = (state: RootState) => state.variantEnvironment;
export const selectGames = (state: RootState) => state.variantEnvironment.games;
export const selectGame = (id: string) => (state: RootState) =>
  state.variantEnvironment.games[id];

export default reducer;
