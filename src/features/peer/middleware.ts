import { ThunkMiddleware } from "redux-thunk";
import Peer, { DataConnection } from "peerjs";
import { AppDispatch, AppThunk, RootState } from "../../app/store";
import { PayloadAction } from "@reduxjs/toolkit";


const middleware: ThunkMiddleware =
  (api) => (next) => (action: PayloadAction<string>) => {
    const {
      dispatch,
      getState,
    }: { dispatch: AppDispatch; getState: () => RootState } = api;
    switch (action.type) {
      // Action from peerjs-module.
      case RECEIVED_DATA_FROM_PEER: {
        console.log(action);
        const { message, peerId }: { message: PeerMessage; peerId: string } = (
          action as any
        ).payload;
        let playerPoolState = getState().playerPool.playerPoolState;
        const isHost =
          playerPoolState.type != "disconnected" && playerPoolState.host.isHost;
        const isFromHost =
          playerPoolState.type != "disconnected" &&
          !playerPoolState.host.isHost &&
          playerPoolState.host.peerId == peerId;
        switch (message.type) {
          case "ok": {
            const { answerTo } = message;
            switch (answerTo) {
              case "subscribe": {
                if (!isHost && playerPoolState.type == "connecting") {
                  result = next(action);
                  dispatch({
                    type: PLAYER_POOL_SUBSCRIPTION_SUCCESS,
                    payload: {
                      peerId,
                    },
                  });
                  return result;
                }
              }
            }
            return next(action);
          }
          case "subscribe": {
            result = next(action);
            if (!isHost || playerPoolState.type != "connected") {
              return result;
            }
            const { lichessId } = message;
            if (lichessId) {
              dispatch({
                type: RECEIVED_SUBSCRIBE_REQUEST,
                payload: { lichessId, peerId },
              });
            }
            playerPoolState = getState().playerPool.playerPoolState;
            if (playerPoolState.type != "connected") {
              return result;
            }
            const success = playerPoolState.members.has(lichessId);
            if (success) {
              dispatch(
                sendPeerMessage(peerId, {
                  type: "ok",
                  answerTo: "subscribe",
                })
              );
              dispatch(updateClients());
            } else {
              dispatch(
                sendPeerMessage(peerId, {
                  type: "error",
                  answerTo: "subscribe",
                })
              );
            }
            break;
          }
          case "unsubscribe": {
            if (playerPoolState.type != "connected" || !isHost) {
              return next(action);
            }
            dispatch({
              type: RECEIVED_UNSUBSCRIBE_REQUEST,
              payload: { peerId },
            });
            result = next(action);
            const success = !playerPoolState.members.has(peerId);
            if (success) {
              dispatch(updateClients());
              dispatch(
                sendPeerMessage(peerId, {
                  type: "ok",
                  answerTo: "unsubscribe",
                })
              );
            } else {
              dispatch(
                sendPeerMessage(peerId, {
                  type: "error",
                  answerTo: "unsubscribe",
                })
              );
            }
            break;
          }
          case "update_members": {
            if (!isFromHost) {
              return next(action);
            }
            const { peerIds, lichessIds } = message;
            dispatch({
              type: RECEIVED_MEMBERS_UPDATE,
              payload: {
                peerId,
                peerIds,
                lichessIds,
              },
            });
            return next(action);
          }
          case "challenge": {
            if (!isFromHost) {
              break;
            }
            const { lichessId, params } = message;
            // send lichess challenge
            dispatch(sendChallenge(lichessId, params));
            return next(action);
          }
          case "accept_challenge": {
            if (!isFromHost) {
              break;
            }
            const { lichessId } = message;
            dispatch({
              type: RECEIVED_LICHESS_ACCEPT_CHALLENGE_COMMAND,
              payload: { lichessId },
            });
            return next(action);
          }
          default:
            return next(action);
        }
        break;
      }
      default: {
        return next(action);
      }
    }
    return result!;
  };

export default middleware;
