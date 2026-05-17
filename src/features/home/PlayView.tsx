import { Container, Title, Stack, Grid, Paper } from "@mantine/core";
import { useSelector } from "react-redux";
import CreateLobbyView from "../lobby/CreateLobbyView";
import GameListView from "../game/GameListView";
import ActiveLobbyView from "../lobby/ActiveLobbyView";
import { selectLobbyStatus } from "../lobby/lobbySlice";

export default function PlayView() {
  const lobbyStatus = useSelector(selectLobbyStatus);
  const inLobby = lobbyStatus.phase === "hosting" || lobbyStatus.phase === "joining" || lobbyStatus.phase === "active";

  return (
    <Container size="xl" pt="md">
      {inLobby ? (
        <ActiveLobbyView inviteUrl={lobbyStatus.phase === "hosting" ? lobbyStatus.inviteUrl : ""} />
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack>
              <CreateLobbyView />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Paper p="md" shadow="xs">
              <Title order={3} mb="sm">
                Active Games & Lobbies
              </Title>
              <GameListView />
            </Paper>
          </Grid.Col>
        </Grid>
      )}
    </Container>
  );
}
