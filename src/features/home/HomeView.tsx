import { Box, Button, Form, FormField, Heading, TextInput } from "grommet";
import { useContext, useLayoutEffect, useState } from "react";
import { LayoutContext } from "../layout/Layout";
import { connectToPeer } from "../peer/peerSlice";
import { useAppDispatch } from "../../app/hooks";

function HomeView() {
  const dispatch = useAppDispatch();
  const { extendDefault } = useContext(LayoutContext);
  const [peerId, setPeerId] = useState("");
  useLayoutEffect(() => {
    extendDefault({ sidebarCollapsed: false, sidebarCollapsable: false });
  }, []);
  return (
    <Box
      tag="header"
      direction="row"
      align="start"
      justify="center"
      pad={{ top: "medium" }}
    >
      <Form onSubmit={() => dispatch(connectToPeer(peerId))}>
        <Heading textAlign="center" margin={{ top: "small", bottom: "medium" }}>
          Connect to peer
        </Heading>
        <FormField align="center" label="Peer ID">
          <TextInput value={peerId} onChange={(e) => setPeerId(e.target.value)}/>
        </FormField>
        <Box justify="center" direction="row" gap="medium">
          <Button type="submit" primary label="Submit" />
        </Box>
      </Form>
    </Box>
  );
}

export default HomeView;
