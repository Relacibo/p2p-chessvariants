import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useDispatch, useSelector } from "./app/hooks";
import LoginSession from "./features/auth/LoginSession";
import LoginWithGoogleView from "./features/auth/LoginWithGoogleView";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import GameListView from "./features/game/GameListView";
import PlaygroundView from "./features/game/PlaygroundView";
import HomeView from "./features/home/HomeView";
import initializeReduxState from "./features/init/initializeReduxState";
import Layout from "./features/layout/Layout";
import UserProfileView from "./features/users/UserProfileView";
import MatchFail from "./MatchFail";

function App() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(initializeReduxState());
  }, [dispatch]);
  const colorScheme = useSelector(selectDarkmodeActive) ? "dark" : "light";
  return (
    <MantineProvider theme={{ colorScheme }}>
      <ModalsProvider>
          <Notifications />
          <LoginSession />
          <Layout>
            <Routes>
              <Route
                path="/auth/google/login"
                element={<LoginWithGoogleView />}
              />
              <Route path="/game/" element={<GameListView />} />
              <Route path="/game/:id" element={<PlaygroundView />} />
              <Route path="/user-profile/*" element={<UserProfileView />}/>
              <Route path="/" element={<HomeView />} />
              <Route path="*" element={<MatchFail />} />
            </Routes>
          </Layout>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
