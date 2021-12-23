import { Box, Button, Form, FormField, Heading, TextInput } from "grommet";
import { useContext, useLayoutEffect } from "react";
import { toast } from "react-toastify";
import { LayoutContext } from "../layout/Layout";

function HomeView() {
  const { extendDefault } = useContext(LayoutContext);
  useLayoutEffect(() => {
    extendDefault({ sidebarCollapsed: false, sidebarCollapsable: false });
  }, [extendDefault]);
  return (
    <Box
      tag="header"
      direction="row"
      align="start"
      justify="center"
      pad={{ top: "medium" }}
    >
      <Form onSubmit={() => toast.info("Hier gibt es wirklich nichts!")}>
        <Heading textAlign="center" margin={{ top: "small", bottom: "medium" }}>
          Setup
        </Heading>
        <FormField align="center" label="Gebe was ein!">
          <TextInput />
        </FormField>
        <FormField align="center" label="es wird nichts ausmachen!">
          <TextInput />
        </FormField>
        <Box justify="center" direction="row" gap="medium">
          <Button type="submit" primary label="Submit" />
          <Button type="reset" label="Reset" />
        </Box>
      </Form>
    </Box>
  );
}

export default HomeView;
