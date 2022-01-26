import { connectToPeer } from "../peer/peerSlice";
import { useAppDispatch } from "../../app/hooks";
import { validate as validateUUID } from "uuid";
import { useForm } from "@mantine/hooks";
import { useLayoutConfigSetter } from "../layout/hooks";
import { Button, Container, Paper, Space, TextInput, Title } from "@mantine/core";

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

  const dispatch = useAppDispatch();
  useLayoutConfigSetter({
    sidebarCollapsed: false,
    sidebarCollapsable: false,
  });
  return (
    <Container>
      <Paper
        padding="sm"
        mt="lg"
        sx={(theme) => ({
          borderRadius: ".5rem",
          border:
            theme.colorScheme === "dark"
              ? "none"
              : `${theme.colors.green[1]} 1px solid`,
        })}
      >
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
