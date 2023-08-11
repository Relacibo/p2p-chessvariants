import { Anchor, Button, Container, Paper, Stack, Title } from "@mantine/core";
import { useSelector } from "react-redux";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import useConfigureLayout from "../layout/hooks";
import FriendRequestsModal from "./FriendRequestsModal";
import MainLink from "../layout/MainLink";

const UserProfileView = () => {
  const user = useSelector(selectUser);
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  let navigate = useNavigate();
  return (
    <Container>
      {user ? (
        <Stack align="flex-start">
          <Paper w="100%" p="sm" mt="lg" shadow="xs"><Title>pyro! 👋</Title></Paper>
          <Button component={Link} to="friend-requests">Friend requests</Button>
          <Routes>
            <Route
              path="friend-requests"
              element={
                <FriendRequestsModal
                  onClose={() => {
                    navigate("");
                  }}
                  userId={user.id}
                />
              }
            ></Route>
          </Routes>
        </Stack>
      ) : (
        <ErrorDisplay />
      )}
    </Container>
  );
};

export default UserProfileView;
