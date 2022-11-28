import { MantineProvider } from "@mantine/core";
import { NotificationsProvider } from "@mantine/notifications";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import GameListView from "./features/game/GameListView";
import PlaygroundView from "./features/game/PlaygroundView";
import HomeView from "./features/home/HomeView";
import initializeReduxState from "./features/init/initializeReduxState";
import Layout from "./features/layout/Layout";
import MatchFail from "./MatchFail";

function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(initializeReduxState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const colorScheme = useSelector(selectDarkmodeActive) ? "dark" : "light";
  let location = useLocation();
  return (
    <MantineProvider theme={{ colorScheme }}>
      <NotificationsProvider>
        <LoginSession />
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
