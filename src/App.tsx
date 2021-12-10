import React, { useEffect } from 'react';
import logo from './logo.svg';
import './App.css';
import { PlaygroundUI } from './features/playground/PlaygroundUI';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import { SetupUI } from './features/setup/SetupUI';
import { Icons, ToastContainer } from 'react-toastify';
import { Anchor, dark, Grommet, Header, Heading, Nav, ThemeType } from 'grommet';
import DarkmodeSelector from './features/darkmode/DarkmodeSelector';
import { selectDarkmodeActive } from './features/darkmode/darkmodeSlice';
import { RootState } from './app/store';
import { connect, ConnectedProps } from 'react-redux';
import theme from './theme';

function App({ darkmodeActive }: Props) {
  useEffect(() => {
    console.log(darkmodeActive);
  })
  return (
    <Grommet full theme={theme} themeMode={darkmodeActive ? "dark" : "light"}>
      <Header flex align="center" justify='between' direction="row" background="brand" pad="medium">
        <Heading level='3' margin="none">pawn-connect.org</Heading>
        <DarkmodeSelector />
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

function mapState(state: RootState) {
  return {
    darkmodeActive: selectDarkmodeActive(state)
  }
}

const connector = connect(mapState);
type Props = ConnectedProps<typeof connector>
export default connector(App);