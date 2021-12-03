import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import assert from "assert";
import { AppThunk, RootState } from "../../app/store";
import { Coords, SquareCoords, TileDataType, VariantState } from "./Types";
import { VariantDescription } from "./variantDescription";

export const slice = createSlice({
    name: 'chessboard',
    initialState: new Map<string, { description: VariantDescription, state: VariantState }>(),
    reducers: {
        setVariantState: (state, action: PayloadAction<{ key: string, newState: VariantState }>) => {
            const {
                key,
                newState
            } = action.payload;
            const variantState = state.get(key);
            if (!variantState) {
                return;
            }
            variantState.state = newState;
        }
    }
});

export const { setVariantState } = slice.actions;

export const move = (key: string, source: Coords, destination: Coords, playerIndex?: number): AppThunk => (
    dispatch,
    getState
) => {
    const variantState = selectMap(getState()).get(key);
    if (!variantState) {
        return;
    }
    const { description, state } = variantState;
    const newState = description.move(state, source, destination, playerIndex);
    dispatch(setVariantState({ key, newState }));
};

export const selectMap = (state: RootState) => state.variantEnvironment

export const variantEnvironmentReducer = slice.reducer;