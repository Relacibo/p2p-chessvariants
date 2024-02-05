import {
  Button,
  Container,
  Paper,
  Space,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { validate as validateUUID } from "uuid";
import { useDispatch, useSelector } from "../../app/hooks";
import { selectUser } from "../auth/authSlice";
import useSwitchView from "../layout/hooks";
import { connectToPeer } from "../peer/peerSlice";
import UserOverview from "../users/UserOverview";

function HomeView() {
  const form = useForm({
    initialValues: {
      peerId: "",
    },
    validate: {
      peerId: (v) => (!validateUUID(v) ? "Must be valid uuid!" : null),
    },
  });

  const dispatch = useDispatch();
  useSwitchView(() => ({ sidebarAlwaysExtendedInLarge: true }));
  const user = useSelector(selectUser);
  return (
    <Container >
      <Paper p="sm" mt="lg" shadow="xs">
        <form
          onSubmit={form.onSubmit(({ peerId }) => {
            dispatch(connectToPeer(peerId));
          })}
        >
          <Title order={1}>Connect to peer</Title>
          <TextInput label="Peer ID" {...form.getInputProps("peerId")} />
          <Space h="lg"></Space>
          <Button type="submit">Submit</Button>
        </form>
      </Paper>
      <Paper p="sm" mt="lg" shadow="xs">
        <UserOverview />
      </Paper>
    </Container>
  );
}

export default HomeView;
