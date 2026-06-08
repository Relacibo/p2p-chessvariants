import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Loader, Text } from "@mantine/core";
import { useSelector } from "../../app/hooks";
import {
  selectLobbyLocalUserId,
  selectLobbyScriptUrl,
  selectLobbyStatus,
  selectPlayerAssignments,
  selectLobbyPlayers,
} from "../lobby/lobbySlice";
import { PixiChessboard as Chessboard } from "../chessboard/PixiChessboard";
import { selectDarkmodeActive } from "../darkmode/darkmodeSlice";
import { useChessGame } from "../chessboard/useChessGame";
import useConfigureLayout from "../layout/hooks";
import * as p2pLobbyService from "../../api/p2pLobbyService";
import {
  BoardOrientation,
  getPlayerOrientation,
  WasmAction,
  WasmPlayerConfig,
} from "../chessboard/types";
import style from "./ArenaView.module.css";

export default function ArenaView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const navigate = useNavigate();
  const { lobbyId } = useParams<{ lobbyId: string }>();

  const lobbyStatus = useSelector(selectLobbyStatus);
  const localUserId = useSelector(selectLobbyLocalUserId);
  const scriptUrl = useSelector(selectLobbyScriptUrl);
  const playerAssignments = useSelector(selectPlayerAssignments);
  const players = useSelector(selectLobbyPlayers);
  const darkMode = useSelector(selectDarkmodeActive);

  // Redirect to lobby if game hasn't started (e.g. page refresh).
  useEffect(() => {
    if (
      lobbyStatus.phase !== "game_started" &&
      lobbyStatus.phase !== "active"
    ) {
      const dest = lobbyId ? `/lobby/${lobbyId}` : "/";
      navigate(dest, { replace: true });
    }
  }, [lobbyStatus.phase, navigate, lobbyId]);

  const playerCount =
    lobbyStatus.phase === "game_started" ? lobbyStatus.playerCount : players.length;
  const setupJson =
    lobbyStatus.phase === "game_started" ? lobbyStatus.setupJson : undefined;

  // Derive the local player's PlayerRef (which slot/id was assigned to us).
  const localPlayerConfigId =
    localUserId != null ? (playerAssignments[localUserId] ?? null) : null;

  // This ref is updated before passing to the hook so the initial load uses it.
  const localPlayerRefJson = useMemo<string | null>(() => {
    if (localPlayerConfigId == null) return null;
    return String(localPlayerConfigId);
  }, [localPlayerConfigId]);

  // Broadcast a submitted action to all peers.
  const handleActionSubmitted = useCallback(
    (actorPlayerRef: string, action: WasmAction) => {
      const payload = new TextEncoder().encode(
        JSON.stringify({ playerRefJson: actorPlayerRef, action }),
      );
      p2pLobbyService.broadcastGameMessage(payload);
    },
    [],
  );

  const game = useChessGame({
    controllingPlayerRef: localPlayerRefJson,
    onActionSubmitted: handleActionSubmitted,
  });

  const {
    boardState,
    variantConfig,
    validMoves,
    uiElements,
    pendingMove,
    selectedDropPiece,
    lastAction,
    allPlayers,
    loading,
    setPendingMove,
    setSelectedDropPiece,
    handleSubmitAction,
    applyRemoteAction,
    proxyRef,
  } = game;

  // Load the script once on mount.
  const loadedRef = useRef(false);
  const engineReadyRef = useRef(false);
  const pendingMessagesRef = useRef<Array<{ fromUserId: string; payload: Uint8Array }>>([]);

  const processGameMessage = useCallback(
    (fromUserId: string, payload: Uint8Array) => {
      if (fromUserId === localUserId) return;
      try {
        const decoded = new TextDecoder().decode(payload);
        const { playerRefJson, action } = JSON.parse(decoded) as {
          playerRefJson: string;
          action: WasmAction;
        };
        applyRemoteAction(playerRefJson, action).catch((e: unknown) =>
          console.error("[arena] applyRemoteAction failed", e),
        );
      } catch (e: unknown) {
        console.error("[arena] failed to parse game message", e);
      }
    },
    [localUserId, applyRemoteAction],
  );

  useEffect(() => {
    if (!scriptUrl || loadedRef.current) return;
    loadedRef.current = true;
    game
      .loadScript(scriptUrl, playerCount, setupJson)
      .then(() => {
        engineReadyRef.current = true;
        for (const msg of pendingMessagesRef.current) {
          processGameMessage(msg.fromUserId, msg.payload);
        }
        pendingMessagesRef.current = [];
      })
      .catch((e: unknown) => console.error("[arena] loadScript failed", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptUrl, playerCount]);

  // Sync state when local player assignment is known and proxy is ready.
  useEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy || !localPlayerRefJson) return;
    game.syncState(proxy, localPlayerRefJson).catch((e: unknown) =>
      console.error("[arena] syncState failed", e),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPlayerRefJson, proxyRef.current]);

  // Register incoming game message listener — buffer until engine is ready.
  useEffect(() => {
    p2pLobbyService.setGameMessageListener((fromUserId, payload) => {
      if (!engineReadyRef.current) {
        pendingMessagesRef.current.push({ fromUserId, payload });
        return;
      }
      processGameMessage(fromUserId, payload);
    });
    return () => {
      p2pLobbyService.setGameMessageListener(null);
    };
  }, [processGameMessage]);

  const activeBoardIndex = useMemo((): number => {
    if (localPlayerConfigId == null) return 0;
    return allPlayers.find((ap) => ap.id === localPlayerConfigId)?.home_board ?? 0;
  }, [allPlayers, localPlayerConfigId]);
  const orientationByBoard = useMemo((): BoardOrientation[] => {
    const count = variantConfig?.board.count ?? 1;
    const arr = new Array<BoardOrientation>(count).fill("normal");
    if (localPlayerConfigId == null) return arr;
    for (let i = 0; i < count; i++) {
      const p = allPlayers.find((ap) => ap.home_board === i);
      if (p) arr[i] = getPlayerOrientation(p, i);
    }
    // Override boards belonging to local player's team.
    const localPlayer = allPlayers.find(
      (ap: WasmPlayerConfig) => ap.id === localPlayerConfigId,
    );
    if (localPlayer) {
      for (const ap of allPlayers) {
        if (ap.team === localPlayer.team) {
          arr[ap.home_board ?? 0] = getPlayerOrientation(ap, ap.home_board ?? 0);
        }
      }
    }
    return arr;
  }, [allPlayers, variantConfig?.board.count, localPlayerConfigId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Acting player for the local user.
  const actorPlayerRef = localPlayerRefJson ?? "";

  const handleSubmit = useCallback(
    (action: WasmAction) => {
      if (!actorPlayerRef) return;
      handleSubmitAction(actorPlayerRef, action).catch((e: unknown) =>
        console.error("[arena] handleSubmitAction failed", e),
      );
    },
    [actorPlayerRef, handleSubmitAction],
  );

  return (
    <Box ref={containerRef} className={style.container}>
      {loading && (
        <Box className={style.centered}>
          <Loader />
        </Box>
      )}
      {!loading && (!boardState || !variantConfig) && (
        <Box className={style.centered}>
          <Text c="dimmed">Waiting for game state…</Text>
        </Box>
      )}
      {!loading && boardState && variantConfig && containerSize.w > 0 && containerSize.h > 0 && (
        <Chessboard
          variantConfig={variantConfig}
          boardState={boardState}
          validMoves={validMoves}
          activeBoardIndex={activeBoardIndex}
          activeBoardIndices={[activeBoardIndex]}
          orientationByBoard={orientationByBoard}
          onRotateBoard={() => {}}
          onReturnHome={() => {}}
          onSubmitAction={handleSubmit}
          lastAction={lastAction}
          selectedDropPiece={selectedDropPiece}
          onClearDropPiece={() => setSelectedDropPiece(null)}
          onSelectReservePiece={(piece) => setSelectedDropPiece(piece)}
          uiMap={uiElements ?? {}}
          stageWidth={containerSize.w}
          stageHeight={containerSize.h}
          pendingMove={pendingMove}
          onPendingMove={setPendingMove}
          darkMode={darkMode}
        />
      )}
    </Box>
  );
}
