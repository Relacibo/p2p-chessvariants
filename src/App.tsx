import { Grommet } from "grommet";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { selectDarkmodeActive } from "./features/darkmode/darkmodeSlice";
import PlaygroundUI from "./features/playground/PlaygroundUI";
import SetupUI from "./features/setup/SetupUI";
import Layout from "./Layout";
import theme from "./theme";

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
