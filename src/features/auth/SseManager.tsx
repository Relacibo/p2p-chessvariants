import { useEffect } from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import { selectToken } from "./authSlice";
import { connectSse, disconnectSse, onSseEvent } from "../../api/sseService";
import * as webrtcService from "../../api/webrtcService";
import * as lobbyApi from "../../api/lobbyApi";
import {
  _lobbyDeleted,
  _gameStarted,
  _lobbyInviteReceived,
  handleSseMemberJoined,
  handleSseMemberLeft,
  selectLobbyServerLobbyId,
} from "../lobby/lobbySlice";
import { selectUser } from "./authSlice";

export function SseManager() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);
  const user = useSelector(selectUser);
  const lobbyId = useSelector(selectLobbyServerLobbyId);

  useEffect(() => {
    if (!token) return;

    connectSse(token);

    const unsub = onSseEvent((event) => {
      switch (event.type) {
        case "lobby_member_joined":
          dispatch(handleSseMemberJoined(event.lobbyId, event.member));
          break;
        case "lobby_member_left":
          dispatch(handleSseMemberLeft(event.lobbyId, event.userId));
          break;
        case "lobby_deleted":
          dispatch(_lobbyDeleted({ lobbyId: event.lobbyId }));
          break;
        case "lobby_game_started":
          dispatch(_gameStarted(event));
          if (user) {
            const memberIds = event.members.map((m) => m.userId);
            webrtcService.init((toUserId, signal) =>
              lobbyApi.sendSignal(event.lobbyId, toUserId, signal, token)
            );
            webrtcService.connectToPeers(memberIds, user.id).catch((e) =>
              console.error("[webrtc] connect failed", e)
            );
          }
          break;
        case "lobby_invite":
          dispatch(
            _lobbyInviteReceived({
              lobbyId: event.lobbyId,
              hostUserId: event.hostUserId,
              hostDisplayName: event.hostDisplayName,
              scriptUrl: event.scriptUrl,
            })
          );
          break;
        case "signal":
          webrtcService
            .handleSignal(event.fromUserId, event.signal as Parameters<typeof webrtcService.handleSignal>[1])
            .catch((e) => console.error("[webrtc] signal handling failed", e));
          break;
      }
    });

    return () => {
      unsub();
      disconnectSse();
      webrtcService.reset();
    };
  }, [token, dispatch, user]);

  return null;
}
