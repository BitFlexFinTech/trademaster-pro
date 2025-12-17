import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";

// Initialize Sentry for production error tracking
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
