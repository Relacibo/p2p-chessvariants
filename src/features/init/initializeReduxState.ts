import { AppThunk } from "../../app/store";
import { initializePeer } from "../peer/peerSlice";
import { initializeWorker } from "../worker/workerSlice";

export default function initializeReduxState(): AppThunk {
  return (dispatch) => {
    dispatch(initializePeer());
    //dispatch(initializeWorker());
  };
}
