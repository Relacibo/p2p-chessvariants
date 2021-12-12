import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import assert from "assert";
import axios from "axios";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Coords, VariantState } from "./types";
import { VariantDescription } from "./types";
import * as hardcoded from "./hardcodedVariants";
import { getPieceAt } from "./util";
import { spawn, Thread, Worker } from "threads"

export type DescriptionLocation = { source: "url", url: string } | { source: "hardcoded", key: string }
export type DescriptionInfo = { name: string, description?: string };

(async () => {
  const worker = await spawn(new Worker('../../worker/worker.ts'))
})()


export const { actions: {
  setVariantState,
  saveVariantDescriptionInfo
}, reducer } = createSlice({
  name: 'chessboard',
  initialState: {
    descriptions: new Map<DescriptionLocation, DescriptionInfo>(),
    games: new Map<string, { descriptionLocation: DescriptionLocation, state: VariantState }>()
  },
  reducers: {
    setVariantState: ({ games }, action: PayloadAction<{ key: string, newState: VariantState }>) => {
      const {
        key,
        newState
      } = action.payload;
      const variantState = games.get(key);
      if (!variantState) {
        return;
      }
      variantState.state = newState;
    },
    saveVariantDescriptionInfo: ({ descriptions }, action: PayloadAction<{ location: DescriptionLocation, info: DescriptionInfo }>) => {
      const {
        location, info
      } = action.payload;
      descriptions.set(location, info);
    }
  }
});

export const move = (key: string, source: Coords, destination: Coords, playerIndex: number, possibleDestinations?: Coords[]): AppThunk => async (
  dispatch,
  getState
) => {
  const { games } = selectState(getState());
  const variant = games.get(key);
  if (!variant) {
    return;
  }
  const { descriptionLocation, state } = variant;
  const description = await dispatch(getDescription(descriptionLocation));
  if (!description ||
    (
      (typeof state.onMoveIndex == 'number' && state.onMoveIndex != playerIndex) ||
      (Array.isArray(state.onMoveIndex) && !state.onMoveIndex.includes(playerIndex))
    ) ||
    (getPieceAt(state, source)?.color != description.playerIndex2Color(playerIndex))) {
    return;
  }
  if (typeof possibleDestinations == "undefined") {
    possibleDestinations = description.possibleDestinations(state, source, playerIndex);
  }

  const isMovePossible = typeof possibleDestinations.find((possible) => destination.equals(possible)) != "undefined";
  if (!isMovePossible) {
    return;
  }

  let newState: VariantState | null = null;
  try {
    newState = description.move(state, source, destination, playerIndex);
    if (newState === null) {
      toast.error("Calculated state is null after making move!")
    }
  } catch (e) {
    toast.error(`Error executing move! ${source} -> ${destination} ${playerIndex ? `Player: ${playerIndex}` : ""}`)
    return;
  }
  toast(`Move: ${source} -> ${destination} ${playerIndex ? `Player: ${playerIndex}` : ""}`)
  dispatch(setVariantState({ key, newState }));
};

export const selectState = (state: RootState) => state.variantEnvironment
export const selectGames = (state: RootState) => state.variantEnvironment.games
export const selectDescriptions = (state: RootState) => state.variantEnvironment.descriptions

export default reducer;
