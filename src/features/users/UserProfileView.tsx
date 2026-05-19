import { Paper, Stack, Text, Title } from "@mantine/core";
import { useSelector } from "react-redux";
import { selectUser } from "../auth/authSlice";
import ErrorDisplay from "../error/ErrorDisplay";
import useConfigureLayout from "../layout/hooks";
import PageContainer from "../layout/PageContainer";

const UserProfileView = () => {
  const user = useSelector(selectUser);
  useConfigureLayout(() => ({ navPinned: true }));

  if (!user) return <ErrorDisplay />;

  return (
    <PageContainer>
      <Stack align="flex-start">
        <Paper w="100%" p="sm" mt="lg" shadow="xs">
          <Title>{user.userName} 👋</Title>
          <Text c="dimmed" size="sm">{user.email}</Text>
        </Paper>
      </Stack>
    </PageContainer>
  );
};

export default UserProfileView;
