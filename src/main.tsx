import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import { App } from "./App";

// The website build (`vite --mode web`) shows the in-browser converter.
// Other builds drop this branch, so the desktop bundle never contains
// ffmpeg.wasm.
const Root = __AUDIOFORGE_WEB__
  ? React.lazy(() =>
      import("./web/WebApp").then((m) => ({ default: m.WebApp })),
    )
  : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>
      <Root />
    </React.Suspense>
  </React.StrictMode>,
);
