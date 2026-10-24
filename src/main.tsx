import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

type BoundaryState = { error: Error | null };

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Pinefold failed to render:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#10261c", color: "#f6f0e4", fontFamily: "Outfit, system-ui, sans-serif" }}>
          <section style={{ maxWidth: 520, textAlign: "center", border: "1px solid rgba(227,154,60,.45)", borderRadius: 24, padding: 28, background: "#163526", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
            <p style={{ color: "#e8ad60", fontSize: 11, fontWeight: 800, letterSpacing: ".2em", textTransform: "uppercase" }}>Startup error</p>
            <h1 style={{ color: "#ffe08a", fontFamily: "Georgia, serif", fontSize: 40, fontStyle: "italic", margin: "10px 0" }}>The forest hit a snag.</h1>
            <p style={{ color: "rgba(246,240,228,.72)", lineHeight: 1.6 }}>Pinefold could not finish drawing the game screen. The error is shown below so it can be fixed instead of leaving you on a loading screen.</p>
            <pre style={{ maxHeight: 140, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "left", fontSize: 12, color: "#ffd5b7", background: "rgba(0,0,0,.2)", borderRadius: 12, padding: 12 }}>{this.state.error.message}</pre>
            <button onClick={() => window.location.reload()} style={{ minHeight: 46, border: 0, borderRadius: 999, background: "#e39a3c", color: "#1c1206", padding: "0 24px", fontWeight: 800, cursor: "pointer" }}>Try again</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// Keep the branded preloader separate from React's root and dismiss it after
// React gets its first paint. This prevents a stale boot overlay from covering the game.
function dismissBootScreen() {
  const screen = document.getElementById("boot-screen");
  if (!screen) return;
  screen.classList.add("boot-screen-hidden");
  window.setTimeout(() => screen.remove(), 380);
}
window.requestAnimationFrame(() => window.setTimeout(dismissBootScreen, 120));
