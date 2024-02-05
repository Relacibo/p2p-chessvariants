import { MantineProvider, MantineThemeProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useDispatch, useSelector } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import GameListView from "./features/game/GameListView";
import PlaygroundView from "./features/game/PlaygroundView";
import HomeView from "./features/home/HomeView";
import initializeReduxState from "./features/init/initializeReduxState";
import Layout from "./features/layout/Layout";
import UserProfileView from "./features/users/UserProfileView";
import MatchFail from "./MatchFail";
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
