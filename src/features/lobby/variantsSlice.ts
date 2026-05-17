import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

export interface VariantEntry {
  name: string;
  url: string;
}

export const OFFICIAL_VARIANTS: VariantEntry[] = [
  {
    name: "Bughouse",
    url: "https://raw.githubusercontent.com/Relacibo/p2p-chessvariants/be9983ee0604a3c6f15bae6e050ec8cd9d845775/variants/bughouse.rhai",
  },
  {
    name: "4 Player Chess",
    url: "https://raw.githubusercontent.com/Relacibo/p2p-chessvariants/be9983ee0604a3c6f15bae6e050ec8cd9d845775/variants/four_player_chess.rhai",
  },
  {
    name: "Seirawan Chess",
    url: "https://raw.githubusercontent.com/Relacibo/p2p-chessvariants/be9983ee0604a3c6f15bae6e050ec8cd9d845775/variants/seirawan_chess.rhai",
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
export const selectAllVariants = (state: RootState) => [
  ...OFFICIAL_VARIANTS,
  ...state.lobbyVariants.customVariants,
];

export default variantsSlice.reducer;
