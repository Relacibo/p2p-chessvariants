import React from 'react';
import logo from './logo.svg';
import { Counter } from './features/counter/Counter';
import './App.css';
import { PlaygroundUI } from './features/playground/PlaygroundUI';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { SetupUI } from './features/setup/SetupUI';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/game/*">
            <<PlaygroundUI />
        </Route>
        <Route path="/">
          <SetupUI />
        </Route>
      </Routes>
    </Router>
  )
}

export default App;
