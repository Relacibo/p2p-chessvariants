import { Container, Paper, Stack, Text, Title } from "@mantine/core";
import { useSelector } from "react-redux";
import { selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import useConfigureLayout from "../layout/hooks";

const UserProfileView = () => {
  const user = useSelector(selectUser);
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));

  if (!user) return <ErrorDisplay />;

  return (
    <Container>
      <Stack align="flex-start">
        <Paper w="100%" p="sm" mt="lg" shadow="xs">
          <Title>{user.userName} 👋</Title>
          <Text c="dimmed" size="sm">{user.email}</Text>
        </Paper>
      </Stack>
    </Container>
  );
};

export default UserProfileView;
