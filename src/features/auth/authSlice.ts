import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "../../api/types/users";
import { RootState } from "../../app/store";

const initialState: State = { session: null };

type State = {
  session: { token: string; user: User } | null;
};

export const {
  actions: { login, logout },
  reducer,
} = createSlice({
  name: "auth",
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ token: string; user: User }>) => {
      state.session = action.payload;
    },
    logout: (state) => {
      state.session = null;
    },
  },
});

export const selectSession = (state: RootState) => state.auth.session;

export default reducer;
