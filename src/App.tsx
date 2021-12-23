import { Grommet } from "grommet";
import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import PlaygroundView from "./features/game/PlaygroundView";
import HomeView from "./features/home/HomeView";
import Layout from "./features/layout/Layout";
import theme from "./theme";
import GameListView from "./features/game/GameListView";
import MatchFail from "./MatchFail";
import { useAppDispatch } from "./app/hooks"
import initializeReduxState from "./features/init/initializeReduxState";

function App() {
  const darkmodeActive = useSelector(selectDarkmodeActive);
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(initializeReduxState());
  }, [dispatch])
  return (
    <>
      <Grommet full theme={theme} themeMode={darkmodeActive ? "dark" : "light"}>
        <Layout>
          <Routes>
            <Route path="/game/" element={<GameListView />} />
            <Route path="/game/:id" element={<PlaygroundView />} />
            <Route path="/" element={<HomeView />} />
            <Route path="*" element={<MatchFail />} />
          </Routes>
        </Layout>
      </Grommet>
      <ToastContainer
        position="bottom-right"
        theme={darkmodeActive ? "dark" : "light"}
      />
    </>
  );
}

export default App;
