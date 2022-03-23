import {
  Button,
  Container,
  Paper,
  Space,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/hooks";
import { validate as validateUUID } from "uuid";
import { useDispatch } from "../../app/hooks";
import { useLayoutConfigSetter } from "../layout/hooks";
import { connectToPeer } from "../peer/peerSlice";

function HomeView() {
  const form = useForm({
    initialValues: {
      peerId: "",
    },
    validationRules: {
      peerId: validateUUID,
    },
    errorMessages: {
      peerId: "Must be valid uuid!",
    },
  });

  const dispatch = useDispatch();
  useLayoutConfigSetter({
    sidebarCollapsed: false,
    sidebarCollapsable: false,
  });
  return (
    <Container>
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
    </Container>
  );
}

export default HomeView;
