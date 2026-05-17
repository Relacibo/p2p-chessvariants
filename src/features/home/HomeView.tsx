import {
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Text,
  Space,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import useConfigureLayout from "../layout/hooks";
import * as p2p from "../../api/p2pService";
import UserOverview from "../users/UserOverview";

function HomeView() {
  const [isConnecting, setIsConnecting] = useState(false);
  const form = useForm({
    initialValues: {
      peerId: "",
    },
    validate: {
      peerId: (v) =>
        !v || v.trim().length < 10 ? "Must be a valid libp2p Peer ID" : null,
    },
  });

  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  return (
    <Container >
      <Paper p="sm" mt="lg" shadow="xs">
        <form
          onSubmit={form.onSubmit(async ({ peerId }) => {
            setIsConnecting(true);
            try {
              await p2p.connectToPeerViaRelay(peerId.trim());
              notifications.show({ message: "Connected to peer", color: "green" });
            } catch (err) {
              notifications.show({
                message:
                  err instanceof Error ? err.message : "Could not connect to peer",
                color: "red",
              });
            } finally {
              setIsConnecting(false);
            }
          })}
        >
          <Title order={1}>Connect to peer</Title>
          <TextInput label="Peer ID" {...form.getInputProps("peerId")} />
          <Space h="lg"></Space>
          <Group align="center">
            <Button type="submit" loading={isConnecting}>
              Submit
            </Button>
            {isConnecting && <Loader size="xs" />}
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Requires an active lobby/session node.
          </Text>
        </form>
      </Paper>
      <Paper p="sm" mt="lg" shadow="xs">
        <UserOverview />
      </Paper>
    </Container>
  );
}

export default HomeView;
