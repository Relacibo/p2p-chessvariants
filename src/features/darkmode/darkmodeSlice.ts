import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

export type DarkmodeState = {
  dark: boolean
}

export const slice = createSlice({
  name: 'darkmode',
  initialState: {
    dark: false,
  } as DarkmodeState,
  reducers: {
    setDarkmode: (state, action: PayloadAction<boolean>) => {
      state.dark = action.payload;
    }
  }
});

export const { setDarkmode } = slice.actions;

export const selectDarkmodeActive = (state: RootState) => state.darkmode.dark;

export default slice.reducer;
