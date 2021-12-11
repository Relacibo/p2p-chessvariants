import { Box, Button, Form, FormField, Heading, TextInput } from 'grommet';
import { useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';


function SetupUI() {
  return (
    <Box tag='header'
      direction='row'
      align='start'
      justify='center'
      pad={{ top: 'medium' }}
    >
      <Box width='large' pad={{ horizontal: 'small', bottom: 'medium', top: 'small' }} round background="neutral-1" elevation='small'>
        <Form onSubmit={() => toast.info("Hier gibt es wirklich nichts!")}>
          <Heading textAlign='center' margin={{ top: "small", bottom: "medium" }}>Setup</Heading>
          <FormField align='center' label="Gebe was ein!">
            <TextInput />
          </FormField>
          <FormField align='center' label="es wird nichts ausmachen!">
            <TextInput />
          </FormField>
          <Box justify='center' direction="row" gap="medium">
            <Button type="submit" primary label="Submit" />
            <Button type="reset" label="Reset" />
          </Box>
        </Form>
      </Box>

    </Box >
  )
}

export default SetupUI;
