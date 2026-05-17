import { Container, Title, Tabs, Text } from "@mantine/core";
import {
  IconUsers,
  IconUserSearch,
  IconHeartHandshake,
} from "@tabler/icons-react";
import { useSelector } from "react-redux";
import { selectLoginState, selectUser } from "../auth/authSlice";
import FriendRequests from "./FriendRequests";
import FriendsList from "./FriendsList";
import UserOverview from "./UserOverview";

export default function CommunityView() {
  const authState = useSelector(selectLoginState);
  const user = useSelector(selectUser);
  const isLoggedIn = authState === "logged-in" && user != null;

  return (
    <Container size="md" pt="md">
      <Title order={2} mb="md">
        Community
      </Title>
      
      <Tabs defaultValue="friends" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab
            value="friends"
            leftSection={<IconUsers size="1.2rem" />}
            disabled={!isLoggedIn}
          >
            Friends
          </Tabs.Tab>
          <Tabs.Tab
            value="requests"
            leftSection={<IconHeartHandshake size="1.2rem" />}
            disabled={!isLoggedIn}
          >
            Requests
          </Tabs.Tab>
          <Tabs.Tab
            value="search"
            leftSection={<IconUserSearch size="1.2rem" />}
          >
            Find Users
          </Tabs.Tab>
        </Tabs.List>

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

        <Tabs.Panel value="search">
          <UserOverview />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
