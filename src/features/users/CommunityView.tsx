import { Container, Title } from "@mantine/core";
import UserOverview from "./UserOverview";

export default function CommunityView() {
  return (
    <Container size="md" pt="md">
      <Title order={2} mb="md">
        Community
      </Title>
      <UserOverview />
    </Container>
  );
}
