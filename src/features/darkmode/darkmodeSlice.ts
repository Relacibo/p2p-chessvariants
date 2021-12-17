import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

export const {
  actions: { setDarkmode },
  reducer,
} = createSlice({
  name: "darkmode",
  initialState: {
    dark: false,
  },
  reducers: {
    setDarkmode: (state, action: PayloadAction<boolean>) => {
      state.dark = action.payload;
    },
  },
});

export const selectDarkmodeActive = (state: RootState) => state.darkmode.dark;

export default reducer;
