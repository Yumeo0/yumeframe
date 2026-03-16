import React from "react";
import ReactDOM from "react-dom/client";
import { RelicOverlayWindow } from "@/components/app/RelicOverlayWindow";
import "@/overlay.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RelicOverlayWindow />
  </React.StrictMode>,
);
