import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import assert from "assert";
import axios from "axios";
import { toast } from "react-toastify";
import { AppThunk, RootState } from "../../app/store";
import { Coords, Ongoing, SquareCoords, TileDataType, VariantState, VariantStatusType } from "./Types";
import { VariantDescription } from "./variantDescription";
import * as hardcoded from "./hardcodedVariants";

export type DescriptionLocation = { source: "online", url: string } | { source: "hardcoded", key: string }
export type DescriptionInfo = { name: string, description?: string };

const temporaryVariantDescriptions = new Map<DescriptionLocation, VariantDescription>();

export const slice = createSlice({
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

export const { setVariantState, saveVariantDescriptionInfo } = slice.actions;

export const move = (key: string, source: Coords, destination: Coords, playerIndex: number): AppThunk => async (
    dispatch,
    getState
) => {
    const { descriptions, games } = selectState(getState());
    const variant = games.get(key);
    if (!variant) {
        return;
    }
    const { descriptionLocation, state } = variant;
    if (state.status.type !== VariantStatusType.Ongoing) {
        return;
    }
    const description = await dispatch(getDescription(descriptionLocation));
    if (!description) {
        return;
    }
    let newState: VariantState | null = null;
    try {
        newState = description.move(state as VariantState<Ongoing>, source, destination, playerIndex);
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

export const variantEnvironmentReducer = slice.reducer;

const getDescription = (location: DescriptionLocation): AppThunk<Promise<VariantDescription | null>> => {
    return async (dispatch, getState) => {
        let description = temporaryVariantDescriptions.get(location);
        if (description) {
            return description;
        }
        switch (location.source) {
            case "online": {
                let descriptionString = selectDescriptions(getState()).get(location)?.description;
                if (!descriptionString) {
                    let res;
                    try {
                        res = await axios.get(location.url);
                    } catch (e) {
                        toast.error("Could not fetch variant url!");
                        return null;
                    }
                    descriptionString = res.data;
                    if (!descriptionString) {
                        toast.error("Could not fetch variant url!");
                        return null;
                    }
                }
                try {
                    description = eval(descriptionString) as VariantDescription;
                } catch (e) {
                    if (e instanceof Error) {
                        toast.error(e.message);
                    }
                    return null;
                }
                dispatch(saveVariantDescriptionInfo({
                    location,
                    info: { name: description.name, description: descriptionString }
                }));
                break;
            }
            default:
                return null;
        }
        temporaryVariantDescriptions.set(location, description);
        return description;
    }
}

export const loadHardcodedVariants = (): AppThunk => (dispatch, getState) => {
    for (const key in hardcoded) {
        const value: VariantDescription = (hardcoded as any)[key];
        const location: DescriptionLocation = { source: "hardcoded", key }
        temporaryVariantDescriptions.set(location, value);
        dispatch(saveVariantDescriptionInfo({ location, info: { name: value.name } }));
    }
}