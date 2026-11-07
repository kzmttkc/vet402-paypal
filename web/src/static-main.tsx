import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { App } from "./App";
import { createBrowserTransport } from "./browser-api";
import { pageScorer, startPageScorer, subscribePageScore } from "./local-score";
import { setPageScoreSource } from "./page-score";
import { setTransport } from "./transport";
import "./styles.css";

setPageScoreSource({ subscribe: subscribePageScore });
startPageScorer();
setTransport(createBrowserTransport(pageScorer));

const root = document.getElementById("root");
if (!root) throw new Error("missing root");
createRoot(root).render(
  <StrictMode>
    <App simulated />
  </StrictMode>,
);
