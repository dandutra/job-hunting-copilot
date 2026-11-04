// PROTOTYPE for "Feed and review screens" (#12). Throwaway: lives on the prototype/feed-and-review-screens branch only.
// Four screens, each with 2 or 3 layouts, switched by ?screen= and ?variant= and the bar at the bottom.
import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { FeedColumns, FeedInbox, FeedTable } from "./feed";
import { LabelCard, LabelReader } from "./label";
import { MergeCompare, MergeList } from "./merges";
import { go, readNav } from "./nav";
import { ReviewDocument, ReviewTable } from "./review";
import { StoreProvider, useStore } from "./state";
import "./prototype.css";

const screens: Record<
  string,
  { title: string; variants: Record<string, [ComponentType, string]> }
> = {
  feed: {
    title: "Feed",
    variants: {
      A: [FeedInbox, "Triage inbox"],
      B: [FeedColumns, "Tier columns"],
      C: [FeedTable, "Dense table"],
    },
  },
  label: {
    title: "Label queue",
    variants: {
      A: [LabelCard, "Card and big buttons"],
      B: [LabelReader, "Reader with side rail"],
    },
  },
  review: {
    title: "Resume review",
    variants: {
      A: [ReviewTable, "Line table"],
      B: [ReviewDocument, "Document and inspector"],
    },
  },
  merges: {
    title: "Merge log",
    variants: {
      A: [MergeList, "Filtered list"],
      B: [MergeCompare, "One pair at a time"],
    },
  },
};

function useNav() {
  const [nav, setNav] = useState(readNav);
  useEffect(() => {
    const on = () => setNav(readNav());
    addEventListener("prototype-nav", on);
    return () => removeEventListener("prototype-nav", on);
  }, []);
  return nav;
}

function Switcher({ screen, variant }: { screen: string; variant: string }) {
  const keys = Object.keys(screens[screen].variants);
  const step = (d: number) =>
    go(screen, keys[(keys.indexOf(variant) + d + keys.length) % keys.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return (
    <div className="switcher">
      <button onClick={() => step(-1)}>‹</button>
      <span>
        {variant} ({screens[screen].variants[variant]?.[1]})
      </span>
      <button onClick={() => step(1)}>›</button>
    </div>
  );
}

function App() {
  const { screen, variant } = useNav();
  const { toast, labels, corrections } = useStore();
  const s = screens[screen] ?? screens.feed;
  const [View] = s.variants[variant] ?? Object.values(s.variants)[0];
  return (
    <>
      <nav className="topnav">
        <b>Job hunting copilot</b>
        {Object.entries(screens).map(([k, v]) => (
          <button
            key={k}
            className={k === screen ? "on" : ""}
            onClick={() => go(k, "A")}
          >
            {v.title}
          </button>
        ))}
        <span className="muted small state">
          state: {labels.length} Labels · {Object.keys(corrections).length} Feed
          corrections
        </span>
      </nav>
      <div className="page">
        <View key={`${screen}-${variant}`} />
      </div>
      {toast && <div className="toast">{toast}</div>}
      <Switcher
        screen={screens[screen] ? screen : "feed"}
        variant={s.variants[variant] ? variant : "A"}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
