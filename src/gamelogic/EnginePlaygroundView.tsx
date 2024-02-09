import {
  Box,
  Container,
  Paper,
  Title,
  Text,
  Group,
  useMantineColorScheme,
  Button,
  Stack,
  Center,
} from "@mantine/core";
import useConfigureLayout from "../features/layout/hooks";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ChessvariantEngine } from "chessvariant-engine";
import { handleError } from "../util/notification";
import Editor, {
  DiffEditor,
  useMonaco,
  loader,
  OnChange,
} from "@monaco-editor/react";
import { IconCircleX, IconCircleCheck } from "@tabler/icons-react";

const EnginePlaygroundView = () => {
  let { colorScheme } = useMantineColorScheme();
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));

  // const [engine, setEngine] = useState<ChessvariantEngine | null>(null);
  const [editorState, setEditorState] = useState<string>(" ");
  const [result, setResult] = useState<{
    text: string;
    icon: JSX.Element;
  } | null>(null);
  const handleEditorChange: OnChange = (value) => {
    setEditorState(value ?? "");
  };

  const onClickRun = () => {
    try {
      const engine = new ChessvariantEngine(editorState);
      const result = engine!.run_something(500);
      setResult({
        text: `${result}`,
        icon: <IconCircleCheck color="green" />,
      });
    } catch (e) {
      const { name, message } = e as any;
      setResult({
        text: `${name}: ${message}`,
        icon: <IconCircleX color="red" />,
      });
    }
  };
  return (
    <Container size="100%" pt="sm">
      <Stack align="flex-start">
        <Box w="100%">
          <Editor
            theme={colorScheme === "dark" ? "vs-dark" : "vs-light"}
            height="80vh"
            onChange={handleEditorChange}
          />
        </Box>
        <Button onClick={onClickRun}>Run</Button>

        <Paper h="6vh" w="100%" p="sm">
          {result && (
            <Center inline>
              {result.icon}
              <Text ml={"sm"}>{result.text}</Text>
            </Center>
          )}
        </Paper>
      </Stack>
    </Container>
  );
};
export default EnginePlaygroundView;
