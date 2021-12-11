import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import PlaygroundUI from './features/playground/PlaygroundUI';
import { Route, BrowserRouter, Routes, Link } from 'react-router-dom';
import SetupUI from './features/setup/SetupUI';
import { Anchor, Box, Grommet, Header, Heading, Nav } from 'grommet';
import DarkmodeSelector from './features/darkmode/DarkmodeSelector';
import { selectDarkmodeActive } from './features/darkmode/darkmodeSlice';
import { useSelector } from 'react-redux';
import theme from './theme';
import AnchorLink from './AnchorLink';
import * as Icons from 'grommet-icons';
import { ToastContainer } from 'react-toastify';

function App() {
  const darkmodeActive = useSelector(selectDarkmodeActive);
  return (
    <div>
      <Grommet full theme={theme} themeMode={darkmodeActive ? "dark" : "light"}>
        <Header flex height="xsmall" align='center' justify='start' direction="row" background={{
          color: "brand",
          image: 'url(navbar-texture.png)',
          repeat: 'repeat',
        }} pad="medium">
          <Link className="navbar-title" to={'/'}>
            <Heading level='2' margin="none">pawn-connect.org</Heading>
          </Link>
          <Nav direction="row" pad="medium" align='center'>
            <AnchorLink to={'game'}>Games</AnchorLink>
          </Nav>
          <Box margin={{ left: 'auto' }}>
            <DarkmodeSelector />
          </Box>
        </Header>
        <Routes>
          <Route path="/game/*" element={<PlaygroundUI />} />
          <Route path="/" element={<SetupUI />} />
        </Routes>
      </Grommet >
      <ToastContainer position="bottom-right" theme={darkmodeActive ? "dark" : "light"}/>
    </div>
  )
}

export default App;
