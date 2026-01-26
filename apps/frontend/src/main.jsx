import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SpeechProvider } from "./hooks/useSpeech"; // ✅ Importação com chaves!
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SpeechProvider>
      <App />
    </SpeechProvider>
  </React.StrictMode>
);