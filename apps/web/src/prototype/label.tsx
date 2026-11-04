// PROTOTYPE: two Label queue layouts. Neither may show a Tier, a Jev answer or a draw reason.
import { useEffect, useState } from "react";
import { byId, labelBatch, type LabelAnswer } from "./data";
import { useStore } from "./state";

const answers: {
  key: string;
  answer: LabelAnswer;
  label: string;
  meaning: string;
}[] = [
  { key: "1", answer: "A", label: "A", meaning: "Tailor and apply on sight" },
  { key: "2", answer: "B", label: "B", meaning: "Apply if time allows" },
  { key: "3", answer: "C", label: "C", meaning: "Skip" },
  {
    key: "4",
    answer: "cant_tell",
    label: "Can't tell",
    meaning: "Not enough to judge",
  },
];

function useQueue() {
  const { labels, addLabel, undoLabel } = useStore();
  const done = labels.length;
  const current = done < labelBatch.length ? byId(labelBatch[done]) : null;
  const [startedAt] = useState(() => Date.now());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      const a = answers.find((x) => x.key === e.key);
      if (a) addLabel(current.id, a.answer);
      if (e.key === "u" && done > 0) undoLabel();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return {
    current,
    done,
    total: labelBatch.length,
    startedAt,
    addLabel,
    undoLabel,
    labels,
  };
}

function Done({
  labels,
  startedAt,
}: {
  labels: { answer: LabelAnswer }[];
  startedAt: number;
}) {
  const [endedAt] = useState(() => Date.now());
  const mins = ((endedAt - startedAt) / 60000).toFixed(1);
  return (
    <div className="lq-done">
      <h2>Batch done</h2>
      <p>
        {labels.length} Labels in {mins} min. Come back tomorrow for the next
        10.
      </p>
      <p className="muted small">
        The Tiers stay hidden here, even after you answer.
      </p>
    </div>
  );
}

// ---------- A: one card, big buttons, keys 1 to 4 ----------

export function LabelCard() {
  const q = useQueue();
  if (!q.current) return <Done labels={q.labels} startedAt={q.startedAt} />;
  const p = q.current;
  return (
    <div className="lq-card-wrap">
      <div className="progress">
        <div style={{ width: `${(q.done / q.total) * 100}%` }} />
      </div>
      <div className="muted small">
        {q.done + 1} of {q.total}
      </div>
      <article className="lq-card">
        <h2>{p.title}</h2>
        <div className="muted">
          {p.company} · {p.location}
        </div>
        <div className="posting-text clamp">{p.text}</div>
      </article>
      <div className="lq-buttons">
        {answers.map((a) => (
          <button
            key={a.key}
            className={`big ans-${a.answer}`}
            onClick={() => q.addLabel(p.id, a.answer)}
          >
            <span className="big-key">{a.key}</span>
            <b>{a.label}</b>
            <span className="small">{a.meaning}</span>
          </button>
        ))}
      </div>
      {q.done > 0 && (
        <button className="link" onClick={q.undoLabel}>
          Undo last (u)
        </button>
      )}
    </div>
  );
}

// ---------- B: full reading column, answers on a side rail, batch dots ----------

export function LabelReader() {
  const q = useQueue();
  if (!q.current) return <Done labels={q.labels} startedAt={q.startedAt} />;
  const p = q.current;
  return (
    <div className="lq-reader">
      <main>
        <div className="dots">
          {labelBatch.map((id, i) => (
            <span
              key={i}
              className={`dot ${i < q.done ? "done" : i === q.done ? "now" : ""}`}
              title={i < q.done ? "answered" : ""}
            />
          ))}
        </div>
        <h1>{p.title}</h1>
        <div className="muted">
          {p.company} · {p.location}
        </div>
        <div className="posting-text">{p.text}</div>
      </main>
      <aside className="lq-rail">
        <h4>What would you do with it?</h4>
        {answers.map((a) => (
          <button
            key={a.key}
            className={`rail-btn ans-${a.answer}`}
            onClick={() => q.addLabel(p.id, a.answer)}
          >
            <kbd>{a.key}</kbd> <b>{a.label}</b>
            <div className="small muted">{a.meaning}</div>
          </button>
        ))}
        <hr />
        <div className="small muted">
          Last answers:{" "}
          {q.labels
            .slice(-3)
            .map((l) => (l.answer === "cant_tell" ? "?" : l.answer))
            .join(" ") || "none"}
        </div>
        {q.done > 0 && (
          <button className="link" onClick={q.undoLabel}>
            Undo last (u)
          </button>
        )}
      </aside>
    </div>
  );
}
