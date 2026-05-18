import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import { useEffect } from "react";
import { useDispatch } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import LichessLinkHandler from "./features/auth/providers/lichess/LichessLinkHandler";
import { SseManager } from "./features/auth/SseManager";
import { useTokenRefresh } from "./features/auth/useTokenRefresh";
import initializeReduxState from "./features/init/initializeReduxState";
import Layout from "./features/layout/Layout";
import AppRoutes from "./AppRoutes";

function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(initializeReduxState());
  }, [dispatch]);
  useTokenRefresh();
  return (
    <MantineProvider>
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
