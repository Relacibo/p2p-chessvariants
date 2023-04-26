import { Container, Paper } from "@mantine/core";
import { useSelector } from "react-redux";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import useSwitchView from "../layout/hooks";
import FriendRequestsModal from "./FriendRequestsModal";

const UserProfileView = () => {
  const user = useSelector(selectUser);
  useSwitchView(() => ({ sidebarAlwaysExtendedInLarge: true }));
  let navigate = useNavigate();
  return (
    <Container>
      {user ? (
        <>
          <Paper p="sm" mt="lg" shadow="xs"></Paper>
          <Link to="friend-requests">Friend requests</Link>
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
        </>
      ) : (
        <ErrorDisplay />
      )}
    </Container>
  );
};

export default UserProfileView;
