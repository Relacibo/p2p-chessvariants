import { Box, Button, Form, FormField, Heading, Main, TextInput } from 'grommet';
import React, { useState } from 'react';

import { useAppSelector, useAppDispatch } from '../../app/hooks';

export function SetupUI() {
    return (
        <Main tag='header'
            direction='row'
            align='start'
            justify='center'
            pad={{ top: 'medium' }}
        >
            <Box width='large' pad='small' round background="neutral-1" elevation='small'>
                <Form>
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

        </Main >
    )
}