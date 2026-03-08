import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SpeechProvider } from "./hooks/useSpeech";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <SpeechProvider>
    <App />
  </SpeechProvider>
);
