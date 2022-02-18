import { createSlice } from "@reduxjs/toolkit";
import {google} from "googleapis";

const initialState = {};

const {
  actions: {},
  reducer,
} = createSlice({
  name: "auth",
  initialState,
  reducers: {},
});

google.identitytoolkit({version: "v3", auth: });

export default reducer;
