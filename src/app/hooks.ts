import { TypedUseSelectorHook, useDispatch as reactReduxUseDispatch, useSelector as reactReduxUseSelector } from "react-redux";
import type { AppDispatch, RootState } from "./store";

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useDispatch = () => reactReduxUseDispatch<AppDispatch>();
export const useSelector: TypedUseSelectorHook<RootState> = reactReduxUseSelector;
