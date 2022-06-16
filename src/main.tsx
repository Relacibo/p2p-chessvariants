import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./app/store";
import GoogleAutoSignin from "./features/auth/GoogleAutoSignin";
import "./index.css";

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <GoogleAutoSignin />
      {/* <PersistGate loading={null} persistor={persistor}>
        <BrowserRouter basename={import.meta.env.PUBLIC_URL}>
          <App />
        </BrowserRouter>
      </PersistGate> */}
    </Provider>
  </React.StrictMode>
);
