import { Container, Center, Loader } from "@mantine/core";
import { useSelector } from "../../app/hooks";
import { selectLobbyStatus } from "./lobbySlice";
import ActiveLobbyView from "./ActiveLobbyView";
import useConfigureLayout from "../layout/hooks";
import { Navigate, useParams } from "react-router-dom";

export default function LobbyView() {
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  const lobbyStatus = useSelector(selectLobbyStatus);
  const { lobbyId, peerId } = useParams<{ lobbyId?: string; peerId?: string }>();

  if (lobbyStatus.phase === "hosting") {
    return (
      <Container size="xl" pt="md">
        <ActiveLobbyView inviteUrl={lobbyStatus.inviteUrl} allowGuests={lobbyStatus.allowGuests} />
      </Container>
    );
  }

  if (lobbyStatus.phase === "active" || lobbyStatus.phase === "joining") {
    return (
      <Container size="xl" pt="md">
        <ActiveLobbyView inviteUrl="" allowGuests={false} />
      </Container>
    );
  }

  if (lobbyStatus.phase === "creating") {
    return (
      <Container size="xl" pt="md">
        <Center pt="xl">
          <Loader />
        </Center>
      </Container>
    );
  }

  // Not in lobby state — redirect to join
  const joinPath = lobbyId
    ? `/lobby/${lobbyId}/join`
    : `/lobby/by-peer-id/${peerId}/join`;
  return <Navigate to={joinPath} replace />;
}
