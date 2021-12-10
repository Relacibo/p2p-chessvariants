import React, { useEffect } from 'react';
import logo from './logo.svg';
import './App.css';
import PlaygroundUI from './features/playground/PlaygroundUI';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import SetupUI from './features/setup/SetupUI';
import { ToastContainer } from 'react-toastify';
import { Grommet, Header, Heading, Nav, ThemeContext, ThemeType } from 'grommet';
import DarkmodeSelector from './features/darkmode/DarkmodeSelector';
import { selectDarkmodeActive } from './features/darkmode/darkmodeSlice';
import { useSelector } from 'react-redux';
import theme from './theme';

function App() {
  const darkmodeActive = useSelector(selectDarkmodeActive);
  return (
    <Grommet full theme={theme} themeMode={darkmodeActive ? "dark" : "light"}>
      <Header flex align="center" justify='between' direction="row" background={{
        color: "brand",
        image: 'url(navbar-texture.png)',
        repeat: 'repeat',
      }} pad="medium">

        <ThemeContext.Extend value={{
          global: {
            font: {
              family: 'Strait'
            },
            colors: {
              text: "#444444",
            }
          }
        }}>
          <Heading level='3' margin="none">pawn-connect.org</Heading>
          <DarkmodeSelector />
        </ThemeContext.Extend>
      </Header>
      <BrowserRouter>
        <Routes>
          <Route path="/game/*" element={<PlaygroundUI />} />
          <Route path="/" element={<SetupUI />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </Grommet>
  )
}
