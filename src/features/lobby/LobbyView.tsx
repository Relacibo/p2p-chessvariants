import { Center, Loader } from "@mantine/core";
import { useSelector } from "../../app/hooks";
import { selectLobbyStatus } from "./lobbySlice";
import ActiveLobbyView from "./ActiveLobbyView";
import useConfigureLayout from "../layout/hooks";
import { Navigate, useParams } from "react-router-dom";
import PageContainer from "../layout/PageContainer";

export default function LobbyView() {
  useConfigureLayout(() => ({ navPinned: true }));
  const lobbyStatus = useSelector(selectLobbyStatus);
  const { lobbyId, peerId } = useParams<{ lobbyId?: string; peerId?: string }>();

  if (lobbyStatus.phase === "hosting") {
    return (
      <PageContainer>
        <ActiveLobbyView inviteUrl={lobbyStatus.inviteUrl} allowGuests={lobbyStatus.allowGuests} isPassiveHostTab={lobbyStatus.isPassiveHostTab} />
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "active" || lobbyStatus.phase === "joining") {
    return (
      <PageContainer>
        <ActiveLobbyView inviteUrl="" allowGuests={false} />
      </PageContainer>
    );
  }

  if (lobbyStatus.phase === "creating") {
    return (
      <PageContainer>
        <Center pt="xl">
          <Loader />
        </Center>
      </PageContainer>
    );
  }

  // idle or error — redirect to join flow (handles direct URL navigation)
  const joinPath = lobbyId
    ? `/lobby/${lobbyId}/join`
    : `/lobby/by-peer-id/${peerId}/join`;
  return <Navigate to={joinPath} replace />;
}
