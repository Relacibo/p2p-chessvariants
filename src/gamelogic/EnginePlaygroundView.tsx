import { Box, Container, Paper, Title } from "@mantine/core";
import useConfigureLayout from "../features/layout/hooks";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { CvJsError, ChessvariantEngine } from "chessvariant-engine";
import { handleError } from "../util/notification";

const EnginePlaygroundView = () => {
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
  // const [engine, setEngine] = useState<ChessvariantEngine | null>(null);
  const engineResult = useMemo(() => {
    const script = `
fn my_js_fun(param0, param1) {
  param0 - add3(param1) + 70 + ten * number
}
    `;
    try {
      const engine = new ChessvariantEngine(script);
      // setEngine(engine);
      return engine!.run_something(500);
    } catch (e) {
      handleError(e);
      return null;
    }
  }, []);
  return (
    <Container>
      <Paper p="sm" mt="lg" shadow="xs">
        <Title>Test</Title>
        {engineResult}
      </Paper>
    </Container>
  );
};
export default EnginePlaygroundView;
