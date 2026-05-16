import { Button, Container, Divider, Paper, Stack, Text, Title } from "@mantine/core";
import { useSelector } from "react-redux";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import useConfigureLayout from "../layout/hooks";
import FriendRequestsModal from "./FriendRequestsModal";
import FriendsList from "./FriendsList";

const UserProfileView = () => {
  const user = useSelector(selectUser);
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  const navigate = useNavigate();

  if (!user) return <ErrorDisplay />;

  return (
    <Container>
      <Stack align="flex-start">
        <Paper w="100%" p="sm" mt="lg" shadow="xs">
          <Title>{user.userName} 👋</Title>
          <Text c="dimmed" size="sm">{user.email}</Text>
        </Paper>

        <Paper w="100%" p="sm" shadow="xs">
          <Title order={3} mb="sm">Friends</Title>
          <FriendsList userId={user.id} />
        </Paper>

        <Divider w="100%" />

        <Button component={Link} to="friend-requests" leftSection={<span>👥</span>}>
          Friend Requests
        </Button>

        <Routes>
          <Route
            path="friend-requests"
            element={
              <FriendRequestsModal
                onClose={() => navigate("/user-profile")}
                userId={user.id}
              />
            }
          />
        </Routes>
      </Stack>
    </Container>
  );
};

export default UserProfileView;
