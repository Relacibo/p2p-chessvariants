import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type State = {
  lobby?: {
    isHosting: boolean;
  };
};

export const {
  actions: { createLobby, tryJoiningLobby, joinLobby },
  reducer,
} = createSlice({
  name: "lobby",
  initialState: {} as State,
  reducers: {
    createLobby: (state, action: PayloadAction<{}>) => {},
    tryJoiningLobby: (state, action: PayloadAction<{}>) => {},
    joinLobby: (state, action: PayloadAction<string>) => {},
  },
});

export default reducer;
