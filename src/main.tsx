import { GoogleOAuthProvider } from "@react-oauth/google";
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import App from "./App";
import { persistor, store } from "./app/store";
import "./index.css";
import { Loader, Paper } from "@mantine/core";

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      {/* <PersistGate loading={<Loader />} persistor={persistor}> */}
      <GoogleOAuthProvider
        clientId={import.meta.env.VITE_GOOGLE_IDENTITY_CLIENT_ID}
      >
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Paper>Why the fuck doesn't this work?</Paper>
          {/* <App /> */}
        </BrowserRouter>
      </GoogleOAuthProvider>
      {/* </PersistGate> */}
    </Provider>
  </React.StrictMode>,
);
