import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../app/store";

const initialState: State = { sessionToken: null };

type State = {
  sessionToken: string | null;
};

const {
  actions: { login, logout },
  reducer,
} = createSlice({
  name: "auth",
  initialState,
  reducers: {
    login: (state, action: PayloadAction<string>) => {
      state.sessionToken = action.payload;
    },
    logout: (state) => {
      state.sessionToken = null;
    },
  },
});

export const selectSessionToken = (state: RootState) => state.auth.sessionToken;

export default reducer;
