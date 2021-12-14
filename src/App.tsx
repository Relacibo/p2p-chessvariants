import "react-toastify/dist/ReactToastify.css";
import PlaygroundUI from "./features/playground/PlaygroundUI";
import { Route, BrowserRouter, Routes, Link } from "react-router-dom";
import SetupUI from "./features/setup/SetupUI";
import { Box, Grommet, Header, Heading, Nav } from "grommet";
import DarkmodeSelector from "./features/darkmode/DarkmodeSelector";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import { useSelector } from "react-redux";
import theme from "./theme";
import AnchorLink from "./AnchorLink";
import { ToastContainer } from "react-toastify";
import style from "./App.module.css";
import Layout from "./Layout";

function App() {
  const darkmodeActive = useSelector(selectDarkmodeActive);
  return (
    <>
      <Grommet full theme={theme} themeMode={darkmodeActive ? "dark" : "light"}>
        <Layout>
          <Routes>
            <Route path="/game/*" element={<PlaygroundUI />} />
            <Route path="/" element={<SetupUI />} />
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
