import { Title, Stack, Grid, Paper } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import CreateLobbyView from "../lobby/CreateLobbyView";
import GameListView from "../game/GameListView";
import { selectLobbyStatus } from "../lobby/lobbySlice";
import PageContainer from "../layout/PageContainer";

export default function PlayView() {
  const lobbyStatus = useSelector(selectLobbyStatus);
  const navigate = useNavigate();

  useEffect(() => {
    if (lobbyStatus.phase === "hosting") {
      const url = new URL(lobbyStatus.inviteUrl);
      // Navigate to the lobby room (strip /join suffix from invite URL)
      const lobbyPath = url.pathname.replace(/\/join$/, "");
      navigate(lobbyPath, { replace: true });
    }
  }, [lobbyStatus.phase]);

  return (
    <PageContainer>
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
    </PageContainer>
  );
}
