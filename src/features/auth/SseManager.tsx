import { useEffect } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import { selectToken } from "./authSlice";
import { connectSse, disconnectSse, onSseEvent } from "../../api/sseService";
import * as webrtcService from "../../api/webrtcService";
import { _lobbyInviteReceived } from "../lobby/lobbySlice";

export function SseManager() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);

  useEffect(() => {
    if (!token) return;

    connectSse(token);

    const unsub = onSseEvent((event) => {
      switch (event.type) {
        case "lobby_invite":
          dispatch(
            _lobbyInviteReceived({
              lobbyId: event.lobbyId,
              hostUserId: event.hostUserId,
              hostDisplayName: event.hostDisplayName,
            })
          );
          break;
        case "signal":
          webrtcService
            .handleSignal(
              event.fromUserId,
              event.signal as Parameters<typeof webrtcService.handleSignal>[1]
            )
            .catch((e) => console.error("[webrtc] signal handling failed", e));
          break;
      }
    });

    return () => {
      unsub();
      disconnectSse();
    };
  }, [token, dispatch]);

  return null;
}

