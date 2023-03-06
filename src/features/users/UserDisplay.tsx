import { Group, Paper } from "@mantine/core";
import { User } from "../../api/types/auth/users";

type Props = {
  user: User;
};

const UserDisplay = ({ user }: Props) => {
  return (
    <Group>
      <Paper>{user!.name}</Paper>
    </Group>
  );
};

export default UserDisplay;
