import {
  Button,
  Container,
  Paper,
  Space,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDispatch } from "../../app/hooks";
import useConfigureLayout from "../layout/hooks";
import { connectToPeer } from "../peer/peerSlice";
import UserOverview from "../users/UserOverview";

function HomeView() {
  const form = useForm({
    initialValues: {
      peerId: "",
    },
    validate: {
      peerId: (v) =>
        !v || v.trim().length < 10 ? "Must be a valid libp2p Peer ID" : null,
    },
  });

  const dispatch = useDispatch();
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  return (
    <Container >
      <Paper p="sm" mt="lg" shadow="xs">
        <form
          onSubmit={form.onSubmit(({ peerId }) => {
            dispatch(connectToPeer(peerId.trim()));
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

