import React from 'react';
import logo from './logo.svg';
import './App.css';
import { PlaygroundUI } from './features/playground/PlaygroundUI';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { SetupUI } from './features/setup/SetupUI';
import { ToastContainer } from 'react-toastify';
import { Grommet, ThemeType } from 'grommet';

const theme: ThemeType = {
  global: {
    font: {
      family: 'Roboto',
      size: '18px',
      height: '20px',
    },
  },
};

function App() {
  return (
    <Grommet theme={theme}>
      <Router>
        <Routes>
          <Route path="/game/*">
            <PlaygroundUI />
          </Route>
          <Route path="/">
            <SetupUI />
          </Route>
        </Routes>
      </Router>
      <ToastContainer />
    </Grommet>
  )
}

export default App;
