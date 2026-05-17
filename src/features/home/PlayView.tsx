import { Container, Title, Stack, Grid, Paper } from "@mantine/core";
import CreateLobbyView from "../lobby/CreateLobbyView";
import GameListView from "../game/GameListView";

export default function PlayView() {
  return (
    <Container size="xl" pt="md">
      <Grid>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            <CreateLobbyView />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" shadow="xs">
            <Title order={3} mb="sm">
              Active Games & Lobbies
            </Title>
            <GameListView />
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
