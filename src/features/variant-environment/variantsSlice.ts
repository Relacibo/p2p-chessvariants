import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Coords, VariantState } from "../../gamelogic/types";
import { getPieceAt } from "../../gamelogic/util";
import { spawn, Worker } from "threads";
import { DescriptionLocation } from "../../gameworker/gameworker";

(async () => {
  const worker = await spawn(new Worker("../../worker/worker.ts"));
})();

export type GameInfo = {
  variantKey: string;
  state: VariantState;
};

export type URLVariantInfo = {
  name: string;
  url: string;
};

export const {
  actions: { changeGameState, addCustomVariant },
  reducer,
} = createSlice({
  name: "chessboard",
  initialState: {
    games: new Map<string, GameInfo>(),
    customVariants: new Map<string, URLVariantInfo>(),
  },
  reducers: {
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
    addCustomVariant: (
      { customVariants },
      action: PayloadAction<{ key: string; name: string; url: string }>
    ) => {
      const { key, name, url } = action.payload;
      customVariants.set(key, { name, url });
    },
  },
});

export const move =
  (
    key: string,
    source: Coords,
    destination: Coords,
    playerIndex: number,
    possibleDestinations?: Coords[]
  ): AppThunk =>
  async (dispatch, getState) => {
    const { games } = selectState(getState());
    const variant = games.get(key);
    if (!variant) {
      return;
    }
    const { descriptionLocation, state } = variant;
    const description = await dispatch(getDescription(descriptionLocation));
    if (
      !description ||
      (typeof state.onMoveIndex == "number" &&
        state.onMoveIndex != playerIndex) ||
      (Array.isArray(state.onMoveIndex) &&
        !state.onMoveIndex.includes(playerIndex)) ||
      getPieceAt(state, source)?.color !=
        description.playerIndex2Color(playerIndex)
    ) {
      return;
    }
    if (typeof possibleDestinations == "undefined") {
      possibleDestinations = description.possibleDestinations(
        state,
        source,
        playerIndex
      );
    }

    const isMovePossible =
      typeof possibleDestinations.find((possible) =>
        destination.equals(possible)
      ) != "undefined";
    if (!isMovePossible) {
      return;
    }

    let newState: VariantState | null = null;
    try {
      newState = description.move(state, source, destination, playerIndex);
      if (newState === null) {
        toast.error("Calculated state is null after making move!");
      }
    } catch (e) {
      toast.error(
        `Error executing move! ${source} -> ${destination} ${
          playerIndex ? `Player: ${playerIndex}` : ""
        }`
      );
      return;
    }
    toast(
      `Move: ${source} -> ${destination} ${
        playerIndex ? `Player: ${playerIndex}` : ""
      }`
    );
    dispatch(setVariantState({ key, newState }));
  };

export const selectState = (state: RootState) => state.variantEnvironment;
export const selectGames = (state: RootState) => state.variantEnvironment.games;
export const selectCustomVariants = (state: RootState) =>
  state.variantEnvironment.customVariants;

export default reducer;
