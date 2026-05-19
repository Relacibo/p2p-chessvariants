import { useEffect } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import { logout, selectToken } from "./authSlice";
import { connectSse, disconnectSse, onSseEvent } from "../../api/sseService";
import * as webrtcService from "../../api/webrtcService";
import * as p2pLobbyService from "../../api/p2pLobbyService";
import { _lobbyInviteReceived } from "../lobby/lobbySlice";

export function SseManager() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);

  // Keep p2pLobbyService token in sync so heartbeat never uses a stale JWT
  useEffect(() => {
    if (token) p2pLobbyService.updateAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    connectSse(token, () => dispatch(logout()));

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

