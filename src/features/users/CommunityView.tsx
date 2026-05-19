import { Title, Tabs, Text } from "@mantine/core";
import {
  IconUsers,
  IconUserSearch,
  IconHeartHandshake,
} from "@tabler/icons-react";
import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { selectLoginState, selectUser } from "../auth/authSlice";
import useConfigureLayout from "../layout/hooks";
import FriendRequests from "./FriendRequests";
import FriendsList from "./FriendsList";
import UserOverview from "./UserOverview";
import PageContainer from "../layout/PageContainer";

export default function CommunityView() {
  useConfigureLayout(() => ({ navPinned: true }));

  const authState = useSelector(selectLoginState);
  const user = useSelector(selectUser);
  const isLoggedIn = authState === "logged-in" && user != null;

  const navigate = useNavigate();
  const location = useLocation();

  let activeTab = "users";
  if (location.pathname.endsWith("/friends")) activeTab = "friends";
  if (location.pathname.endsWith("/requests")) activeTab = "requests";

  return (
    <PageContainer>
      <Title order={2} mb="md">
        Community
      </Title>

      <Tabs
        value={activeTab}
        onChange={(val) => navigate(`/community/${val}`)}
        keepMounted={false}
      >
        <Tabs.List mb="md">
          <Tabs.Tab
            value="users"
            leftSection={<IconUserSearch size="1.2rem" />}
          >
            Find Users
          </Tabs.Tab>
          {isLoggedIn && (
            <Tabs.Tab
              value="friends"
              leftSection={<IconUsers size="1.2rem" />}
            >
              Friends
            </Tabs.Tab>
          )}
          {isLoggedIn && (
            <Tabs.Tab
              value="requests"
              leftSection={<IconHeartHandshake size="1.2rem" />}
            >
              Requests
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="users">
          <UserOverview />
        </Tabs.Panel>

        <Tabs.Panel value="friends">
          {isLoggedIn ? (
            <FriendsList userId={user.id} />
          ) : (
            <Text c="dimmed">Please log in to see your friends.</Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="requests">
          {isLoggedIn ? (
            <FriendRequests userId={user.id} />
          ) : (
            <Text c="dimmed">Please log in to manage friend requests.</Text>
          )}
        </Tabs.Panel>
      </Tabs>
    </PageContainer>
  );
}
