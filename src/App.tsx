import { MantineProvider, createTheme, Switch, Checkbox } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { useEffect } from "react";
import { useDispatch } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import LichessLinkHandler from "./features/auth/providers/lichess/LichessLinkHandler";
import { SseManager } from "./features/auth/SseManager";
import { useTokenRefresh } from "./features/auth/useTokenRefresh";
import Layout from "./features/layout/Layout";
import AppRoutes from "./AppRoutes";

const theme = createTheme({
  components: {
    Switch: Switch.extend({
      styles: {
        track: { cursor: "pointer" },
        root: { cursor: "pointer" },
        label: { cursor: "pointer" },
      },
    }),
    Checkbox: Checkbox.extend({
      styles: {
        input: { cursor: "pointer" },
        root: { cursor: "pointer" },
        label: { cursor: "pointer" },
      },
    }),
  },
});

function App() {
  const dispatch = useDispatch();
  useTokenRefresh();
  return (
    <MantineProvider theme={theme}>
      <ModalsProvider>
        <Notifications />
        <LoginSession />
        <LichessLinkHandler />
        <SseManager />
        <Layout>
          <AppRoutes />
        </Layout>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
