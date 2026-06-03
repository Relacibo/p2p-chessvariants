import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

export interface VariantEntry {
  name: string;
  url: string;
}

export const OFFICIAL_VARIANTS: VariantEntry[] = [
  {
    name: "Chess",
    url: "/variants/chess.rhai",
  },
  {
    name: "Simple Chess",
    url: "/variants/simple_chess.rhai",
  },
  {
    name: "Seirawan Chess",
    url: "/variants/seirawan_chess.rhai",
  },
  {
    name: "Bughouse",
    url: "/variants/bughouse.rhai",
  },
  {
    name: "4-Player Chess",
    url: "/variants/4player.rhai",
  },
];

export interface VariantsState {
  customVariants: VariantEntry[];
}

const initialState: VariantsState = {
  customVariants: [],
};

const variantsSlice = createSlice({
  name: "lobbyVariants",
  initialState,
  reducers: {
    addCustomVariant: (state, action: PayloadAction<VariantEntry>) => {
      if (!state.customVariants.find((v) => v.url === action.payload.url)) {
        state.customVariants.push(action.payload);
      }
    },
    removeCustomVariant: (state, action: PayloadAction<string>) => {
      state.customVariants = state.customVariants.filter(
        (v) => v.url !== action.payload
      );
    },
  },
});

export const { addCustomVariant, removeCustomVariant } = variantsSlice.actions;
export const selectCustomVariants = (state: RootState) =>
  state.lobbyVariants.customVariants;
export const selectAllVariants = createSelector(
  selectCustomVariants,
  (customVariants) => [...OFFICIAL_VARIANTS, ...customVariants],
);

export default variantsSlice.reducer;
