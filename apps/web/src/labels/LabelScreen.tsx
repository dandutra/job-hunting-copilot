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
  | { kind: "error"; message: string }
  | { kind: "card"; posting: Posting }
  | { kind: "done"; ms: number };

type NextResult = { data?: Posting; response: Response };

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

const UNREACHABLE = "Could not reach the API.";

export function LabelScreen() {
  const api = useApi();
  const [state, setStateOnly] = useState<State>({ kind: "loading" });
  const [count, setCountOnly] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // The key listener reads these, so a key pressed before React re-subscribes still sees the card on screen.
  const stateRef = useRef<State>(state);
  const countRef = useRef(0);
  const busy = useRef(false);
  const startedAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  const setState = useCallback((s: State) => {
    stateRef.current = s;
    setStateOnly(s);
  }, []);
  const setCount = useCallback((n: number) => {
    countRef.current = n;
    setCountOnly(n);
  }, []);

  const finish = useCallback(() => {
    setState({
      kind: "done",
      ms: Date.now() - (startedAt.current ?? Date.now()),
    });
  }, [setState]);

  const apply = useCallback(
    ({ data, response }: NextResult) => {
      if (data) {
        startedAt.current ??= Date.now();
        setState({ kind: "card", posting: data });
      } else if (response.status !== 204) {
        setState({
          kind: "error",
          message: `The queue did not answer (HTTP ${response.status}).`,
        });
      } else if (countRef.current > 0) {
        finish();
      } else {
        setState({ kind: "empty" });
      }
    },
    [setState, finish],
  );

  const showNext = useCallback(async () => {
    try {
      apply(await api.GET("/label-queue/next"));
    } catch {
      setState({ kind: "error", message: UNREACHABLE });
    }
  }, [api, apply, setState]);

  useEffect(() => {
    let live = true;
    api.GET("/label-queue/next").then(
      (r) => {
        if (live) apply(r);
      },
      () => {
        if (live) setState({ kind: "error", message: UNREACHABLE });
      },
    );
    return () => {
      live = false;
    };
  }, [api, apply, setState]);

  const answer = useCallback(
    async (label: Choice) => {
      const shown = stateRef.current;
      if (busy.current || shown.kind !== "card") return;
      busy.current = true;
      setNotice(null);
      try {
        const { data, response } = await api.POST("/label-queue/labels", {
          body: { postingId: shown.posting.postingId, label },
        });
        if (!data) {
          if (response.status === 409) {
            setNotice(
              "That Posting was no longer in the queue, so nothing was stored. This is the one it shows now.",
            );
            await showNext();
          } else {
            setNotice(`The Label was not stored (HTTP ${response.status}).`);
          }
          return;
        }
        setCount(countRef.current + 1);
        if (data.batchDone) finish();
        else await showNext();
      } catch {
        setNotice(`${UNREACHABLE} The Label was not stored.`);
      } finally {
        busy.current = false;
      }
    },
    [api, showNext, setCount, finish],
  );

  const undo = useCallback(async () => {
    if (
      busy.current ||
      stateRef.current.kind !== "card" ||
      countRef.current === 0
    )
      return;
    busy.current = true;
    setNotice(null);
    try {
      const { error, response } = await api.DELETE("/label-queue/labels/last");
      if (error !== undefined || !response.ok) {
        setNotice(
          response.status === 409
            ? "Nothing to undo: the batch is done or its window has closed."
            : `The undo failed (HTTP ${response.status}).`,
        );
        return;
      }
      setCount(countRef.current - 1);
      await showNext();
    } catch {
      setNotice(`${UNREACHABLE} Nothing was undone.`);
    } finally {
      busy.current = false;
    }
  }, [api, showNext, setCount]);

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
  if (state.kind === "error")
    return (
      <main className="page">
        <h1>Label queue</h1>
        <p role="alert">{state.message}</p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "loading" });
            void showNext();
          }}
        >
          Retry
        </button>
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
      {notice && (
        <p className="label-notice" role="alert">
          {notice}
        </p>
      )}
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
