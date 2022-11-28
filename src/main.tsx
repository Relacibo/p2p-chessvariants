import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import App from "./App";
import { persistor, store } from "./app/store";
import GoogleAutoSignin from "./features/auth/GoogleAutoSignin";
import "./index.css";

const container = document.getElementById("app");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <GoogleAutoSignin />
      {<PersistGate loading={null} persistor={persistor}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </PersistGate>}
    </Provider>
  </React.StrictMode>
);
