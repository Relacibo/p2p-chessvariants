import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconCrown, IconUser } from "@tabler/icons-react";
import {
  onLobbyStateUpdate,
  requestTakeover,
  SecondaryTabState,
} from "../../api/tabCoordination";

type Props = { lobbyId: string; userId: string };

export default function SecondaryTabView({ lobbyId, userId }: Props) {
  const [state, setState] = useState<SecondaryTabState | null>(null);
  const [takingOver, setTakingOver] = useState(false);

  useEffect(() => {
    return onLobbyStateUpdate(lobbyId, (nextState) => setState(nextState));
  }, [lobbyId]);

  const handleTakeOver = async () => {
    setTakingOver(true);
    await requestTakeover(lobbyId, userId);
    window.location.reload();
  };

  return (
    <Center pt="xl">
      <Paper p="xl" maw={480} w="100%">
        <Stack gap="md">
          <Title order={3}>Spectating (Secondary Tab)</Title>
          <Text c="dimmed" size="sm">
            This lobby is already open in another tab. You are observing as a spectator.
          </Text>

          {state ? (
            <Stack gap="xs">
              <Text fw={500}>Players</Text>
              {state.players.map((player) => (
                <Group key={player.userId} gap="xs">
                  <IconUser size={16} />
                  <Text size="sm">{player.name ?? player.userId}</Text>
                  {state.hostUserId === player.userId && (
                    <Badge color="yellow" size="xs" leftSection={<IconCrown size={10} />}>
                      Host
                    </Badge>
                  )}
                </Group>
              ))}
            </Stack>
          ) : (
            <Group gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Waiting for lobby state from the primary tab...
              </Text>
            </Group>
          )}

          <Button
            onClick={handleTakeOver}
            loading={takingOver}
            leftSection={<IconCrown size={16} />}
          >
            Take Over (Become Primary)
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
