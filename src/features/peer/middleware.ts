import { ThunkMiddleware } from "redux-thunk";
import Peer, { DataConnection } from "peerjs";
import { AppDispatch, RootState } from "../../app/store";
import { PayloadAction } from "@reduxjs/toolkit";
import { receivedMessageFromPeer } from "./peerSlice";
import { handlePacket } from "./messageHandler";

const middleware: ThunkMiddleware =
  api => next => <T>(action: PayloadAction<T>) => {
    const { dispatch }: { dispatch: AppDispatch } = api;
    let history = next(action);
    if (receivedMessageFromPeer.match(action)) {
      dispatch(handlePacket(action.payload));
    }
    return history;
  };

export default middleware;
