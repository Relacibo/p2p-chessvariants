import { Box, Container, Paper, Title } from "@mantine/core";
import useConfigureLayout from "../features/layout/hooks";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AppError, ChessvariantEngine } from "chessvariant-engine";
import { showError } from "../util/notification";

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
      return engine!.run_something(12);
    } catch (e: any) {
      let err = e as AppError;
      showError(`${err.type}: ${err.message}`);
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
