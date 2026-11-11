import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/ApiContext";
import type { components } from "../api/schema";
import "./labels.css";

type Posting = components["schemas"]["QueuePostingDto"];
type Choice = components["schemas"]["SubmitLabelDto"]["label"];

const BATCH = 10;
const CHOICES: { key: string; label: Choice; text: string }[] = [
  { key: "1", label: "A", text: "A: Tailor and apply on sight" },
  { key: "2", label: "B", text: "B: Apply if time allows" },
  { key: "3", label: "C", text: "C: Skip" },
  { key: "4", label: "cant_tell", text: "Can't tell" },
];

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "card"; posting: Posting }
  | { kind: "done"; ms: number };

export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function LabelScreen() {
  const api = useApi();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [count, setCount] = useState(0);
  const busy = useRef(false);
  const startedAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  const showNext = useCallback(
    async (answered: number) => {
      const { data, response } = await api.GET("/label-queue/next");
      // Release before the render, so a key pressed right after the card appears is not dropped.
      busy.current = false;
      if (data) {
        startedAt.current ??= Date.now();
        setState({ kind: "card", posting: data });
      } else if (answered > 0 && startedAt.current !== null) {
        setState({ kind: "done", ms: Date.now() - startedAt.current });
      } else {
        setState({ kind: "empty" });
      }
      return response;
    },
    [api],
  );

  useEffect(() => {
    let live = true;
    void api.GET("/label-queue/next").then(({ data }) => {
      if (!live) return;
      if (data) {
        startedAt.current ??= Date.now();
        setState({ kind: "card", posting: data });
      } else setState({ kind: "empty" });
    });
    return () => {
      live = false;
    };
  }, [api]);

  const answer = useCallback(
    async (label: Choice) => {
      if (busy.current || state.kind !== "card") return;
      busy.current = true;
      try {
        const { data } = await api.POST("/label-queue/labels", {
          body: { postingId: state.posting.postingId, label },
        });
        if (!data) return;
        const answered = count + 1;
        setCount(answered);
        if (data.batchDone) {
          setState({
            kind: "done",
            ms: Date.now() - (startedAt.current ?? Date.now()),
          });
        } else {
          await showNext(answered);
        }
      } finally {
        busy.current = false;
      }
    },
    [api, state, count, showNext],
  );

  const undo = useCallback(async () => {
    if (busy.current || state.kind !== "card" || count === 0) return;
    busy.current = true;
    try {
      const { error } = await api.DELETE("/label-queue/labels/last");
      if (error) return;
      setCount(count - 1);
      await showNext(count - 1);
    } finally {
      busy.current = false;
    }
  }, [api, state, count, showNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const choice = CHOICES.find((c) => c.key === e.key);
      if (choice) void answer(choice.label);
      else if (e.key === "u") void undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, undo]);

  const postingId = state.kind === "card" ? state.posting.postingId : null;
  useEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0;
  }, [postingId]);

  if (state.kind === "loading")
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  if (state.kind === "empty")
    return (
      <main className="page">
        <h1>Label queue</h1>
        <p className="muted">Nothing to label right now.</p>
      </main>
    );
  if (state.kind === "done")
    return (
      <main className="page label-done">
        <h1>Batch done</h1>
        <p>
          {count} {count === 1 ? "Label" : "Labels"} stored in{" "}
          {duration(state.ms)}.
        </p>
      </main>
    );

  const shown = Math.min(count, BATCH);
  const { posting } = state;
  return (
    <main className="page label-screen">
      <div className="label-progress">
        <progress value={shown} max={BATCH} aria-label="Batch progress" />
        <span>
          {shown} of {BATCH}
        </span>
        {count > 0 && (
          <button type="button" className="link" onClick={() => void undo()}>
            Undo (u)
          </button>
        )}
      </div>
      <article className="label-card" ref={cardRef} tabIndex={-1}>
        <h1>{posting.title}</h1>
        <p className="muted">
          {posting.company} · {posting.location}
        </p>
        <div className="label-text">{posting.text}</div>
      </article>
      <div className="label-buttons">
        {CHOICES.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => void answer(c.label)}
          >
            <kbd>{c.key}</kbd> {c.text}
          </button>
        ))}
      </div>
    </main>
  );
}
