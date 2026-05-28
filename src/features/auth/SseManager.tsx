import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import { connectSse, disconnectSse, onSseEvent } from "../../api/sseService";
import * as webrtcService from "../../api/webrtcService";
import { logout, selectToken, selectUser } from "./authSlice";
import { _lobbyInviteReceived } from "../lobby/lobbySlice";

export function SseManager() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const user = useSelector(selectUser);
  // Stable primitive — only reconnect SSE when the user account changes,
  // NOT on every silent token refresh (which creates a new token string
  // but the same user, causing NS_BINDING_ABORTED every few minutes).
  const userId = user?.id ?? null;
  // Always hold the latest token in a ref so connectSse can read it at
  // connection time without adding token to effect deps.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!userId || !tokenRef.current) return;

    connectSse(tokenRef.current, () => dispatch(logout()));

    const unsub = onSseEvent((event) => {
      switch (event.type) {
        case "lobby_invite":
          dispatch(
            _lobbyInviteReceived({
              lobbyId: event.lobbyId,
              hostUserId: event.hostUserId,
              hostDisplayName: event.hostDisplayName,
            }),
          );
          break;
        case "signal":
          webrtcService
            .handleSignal(
              event.fromUserId,
              event.signal as Parameters<typeof webrtcService.handleSignal>[1],
            )
            .catch((e) => console.error("[webrtc] signal handling failed", e));
          break;
      }
    });

    return () => {
      unsub();
      disconnectSse();
    };
  }, [userId, dispatch]);

  return null;
}
