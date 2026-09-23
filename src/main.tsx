import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Analytics } from "@vercel/analytics/react";
import { App } from "./App";
import "./theme.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      {/* Page views and referrers, shown in the Vercel dashboard (no-op in local dev). */}
      <Analytics />
    </ConvexAuthProvider>
  </StrictMode>,
);
