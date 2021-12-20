import { ThunkMiddleware } from "redux-thunk";
import Peer, { DataConnection } from "peerjs";
import { AppDispatch, RootState } from "../../app/store";
import { PayloadAction } from "@reduxjs/toolkit";
import { receivedMessageFromPeer } from "./peerSlice";
import { handleMessage } from "./messageHandler";

const middleware: ThunkMiddleware =
  (api) => (next) => (action: PayloadAction<string>) => {
    const { dispatch }: { dispatch: AppDispatch } = api;
    let history = next(action);
    if (receivedMessageFromPeer.match(action)) {
      dispatch(handleMessage(receivedMessageFromPeer));
    }
    return history;
  };

export default middleware;
