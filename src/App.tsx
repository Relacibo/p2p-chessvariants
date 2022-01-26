import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import PlaygroundView from "./features/game/PlaygroundView";
import HomeView from "./features/home/HomeView";
import Layout from "./features/layout/Layout";
import GameListView from "./features/game/GameListView";
import MatchFail from "./MatchFail";
import { useAppDispatch } from "./app/hooks";
import initializeReduxState from "./features/init/initializeReduxState";
import { NotificationsProvider } from "@mantine/notifications";

function App() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(initializeReduxState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const colorScheme = useSelector(selectDarkmodeActive) ? "dark" : "light";
  return (
    <MantineProvider theme={{ colorScheme }}>
      <NotificationsProvider>
        <Layout>
          <Routes>
            <Route path="/game/" element={<GameListView />} />
            <Route path="/game/:id" element={<PlaygroundView />} />
            <Route path="/" element={<HomeView />} />
            <Route path="*" element={<MatchFail />} />
          </Routes>
        </Layout>
      </NotificationsProvider>
    </MantineProvider>
  );
}

export default App;
