import { Group, Paper } from "@mantine/core";
import { User } from "../../api/types/user/users";

type Props = {
  user: User;
};

const UserDisplay = ({ user }: Props) => {
  return (
    <Group>
      <Paper>{user!.userName}</Paper>
    </Group>
  );
};

export default UserDisplay;
