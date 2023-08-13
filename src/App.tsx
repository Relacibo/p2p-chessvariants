import { ColorSchemeProvider, MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useDispatch, useSelector } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import LoginWithGoogleView from "./features/auth/LoginWithGoogleView";
import {
  selectDarkmodeActive,
  setDarkmode,
} from "./features/darkmode/darkmodeSlice";
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
  const darkmodeActive = useSelector(selectDarkmodeActive);
  const colorScheme = darkmodeActive ? "dark" : "light";
  const toggleColorScheme = () => dispatch(setDarkmode(!darkmodeActive));
  useEffect(() => {
    toggleColorScheme();
  }, [dispatch]);
  return (
    <ColorSchemeProvider
      colorScheme={colorScheme}
      toggleColorScheme={toggleColorScheme}
    >
      <MantineProvider
        theme={{ colorScheme }}
        withGlobalStyles
        withNormalizeCSS
      >
        <ModalsProvider>
          <Notifications />
          <LoginSession />
          <Layout>
            <AppRoutes />
          </Layout>
        </ModalsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}

export default App;
