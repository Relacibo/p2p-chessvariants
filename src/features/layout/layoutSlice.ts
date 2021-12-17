import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

export const {
  actions: { setSidebarCollapsed },
  reducer,
} = createSlice({
  name: "layout",
  initialState: {
    sidebarCollapsed: false,
  },
  reducers: {
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
  },
});

export function selectSidebarCollapsed(state: RootState) {
  return state.layout.sidebarCollapsed;
}

export default reducer;
