import { useState, useEffect } from "react";
import {
  Stack,
  Group,
  Text,
  Badge,
  Avatar,
  Button,
  Loader,
  Center,
  Paper,
  Pagination,
  Tooltip,
  Anchor,
} from "@mantine/core";
import { useDispatch, useSelector } from "../../app/hooks";
import { useListUsersByIdsQuery } from "../../api/api";
import { listLobbies, type LobbyInfo } from "../../api/lobbyApi";
import { selectToken } from "../auth/authSlice";
import { joinLobbyById } from "../lobby/lobbySlice";
import { useNavigate } from "react-router-dom";
import { getGithubBrowseUrl } from "../lobby/scriptUrl";

const PAGE_SIZE = 10;

const STATUS_COLORS: Record<string, string> = {
  waiting: "green",
  inGame: "blue",
  finished: "gray",
};

const STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting",
  inGame: "In Game",
  finished: "Finished",
};

function gravatarUrl(avatarHash: string | undefined): string | undefined {
  return avatarHash ? `https://www.gravatar.com/avatar/${avatarHash}?d=identicon` : undefined;
}

function LobbyRow({ lobby, hostUser }: { lobby: LobbyInfo; hostUser?: { userName: string; avatarHash?: string } }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector(selectToken);

  const handleJoin = async () => {
    if (!token) {
      navigate(`/lobby/${lobby.id}/join`);
      return;
    }
    await dispatch(joinLobbyById(lobby.id));
    navigate(`/lobby/${lobby.id}`);
  };

  const browseUrl = getGithubBrowseUrl(lobby.scriptUrl);
  const scriptName = browseUrl
    ? lobby.scriptUrl.replace(/.*\/blob\/[^/]+\//, "")
    : lobby.scriptUrl;

  return (
    <Paper p="sm" withBorder radius="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Tooltip label={hostUser ? `@${hostUser.userName}` : "Guest host"} withArrow>
            <Avatar
              src={gravatarUrl(hostUser?.avatarHash)}
              size="md"
              radius="xl"
              color="blue"
            >
              {(hostUser?.userName?.[0] ?? "?").toUpperCase()}
            </Avatar>
          </Tooltip>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={500} size="sm" truncate>
              {hostUser ? `@${hostUser.userName}` : "Guest"}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {browseUrl ? (
                <Anchor href={browseUrl} target="_blank" size="xs" c="dimmed">
                  {scriptName}
                </Anchor>
              ) : scriptName}
            </Text>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Badge color={STATUS_COLORS[lobby.status] ?? "gray"} size="sm">
            {STATUS_LABELS[lobby.status] ?? lobby.status}
          </Badge>
          <Text size="xs" c="dimmed" w={50} ta="right">
            {lobby.playerCount}{lobby.maxPlayers != null ? `/${lobby.maxPlayers}` : ""} 👤
          </Text>
          {lobby.status === "waiting" && (
            <Button size="xs" onClick={handleJoin}>
              Join
            </Button>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

export default function GameListView() {
  const [page, setPage] = useState(0);
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listLobbies({ page, limit: PAGE_SIZE, status: "waiting" })
      .then((res) => {
        setLobbies(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  // Collect unique host user IDs (only registered users have UUIDs)
  const hostUserIds = [...new Set(lobbies.map((l) => l.hostUserId).filter(Boolean))];
  const { data: hostUsers } = useListUsersByIdsQuery(hostUserIds, { skip: hostUserIds.length === 0 });
  const userMap = Object.fromEntries((hostUsers?.items ?? []).map((u) => [u.id, u]));

  if (loading) {
    return <Center py="xl"><Loader size="sm" /></Center>;
  }

  if (error) {
    return <Text c="red" size="sm">Failed to load lobbies: {error}</Text>;
  }

  if (lobbies.length === 0) {
    return <Text c="dimmed" size="sm" ta="center" py="xl">No open lobbies right now.</Text>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Stack gap="xs">
      {lobbies.map((lobby) => (
        <LobbyRow key={lobby.id} lobby={lobby} hostUser={userMap[lobby.hostUserId]} />
      ))}
      {totalPages > 1 && (
        <Pagination
          total={totalPages}
          value={page + 1}
          onChange={(p) => setPage(p - 1)}
          size="sm"
          mt="xs"
        />
      )}
    </Stack>
  );
}

