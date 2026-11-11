import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ApiProvider } from "./api/ApiContext";
import { createApiClient } from "./api/client";
import "./tiers.css";

const client = createApiClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApiProvider>
  </StrictMode>,
);
