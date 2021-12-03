import React from 'react';
import logo from './logo.svg';
import './App.css';
import { PlaygroundUI } from './features/playground/PlaygroundUI';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { SetupUI } from './features/setup/SetupUI';
import { ToastContainer } from 'react-toastify';

function App() {
  return (
    <div>
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
    </div>
  )
}

export default App;
