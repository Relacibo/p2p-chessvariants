import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import { useEffect } from "react";
import { useDispatch } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import initializeReduxState from "./features/init/initializeReduxState";
import Layout from "./features/layout/Layout";
import AppRoutes from "./AppRoutes";

function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(initializeReduxState());
  }, [dispatch]);
  return (
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <LoginSession />
        <Layout>
          <AppRoutes />
        </Layout>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
