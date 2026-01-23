import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@babylonjs/loaders";


createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
