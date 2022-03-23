import { AnyAction } from "@reduxjs/toolkit";
import { Dispatch } from "react";
import { TypedUseSelectorHook, useDispatch as reactReduxUseDispatch, useSelector as reactReduxUseSelector } from "react-redux";
import type { AppDispatch, AppThunk, RootState } from "./store";

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useDispatch = () => reactReduxUseDispatch<AppDispatch>() as Dispatch<AnyAction | AppThunk>;
export const useSelector: TypedUseSelectorHook<RootState> = reactReduxUseSelector;
