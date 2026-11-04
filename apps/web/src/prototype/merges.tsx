// PROTOTYPE: two merge log layouts, plus the open Lookalikes.
import { useState } from "react";
import { mergeLog, postings, byId, type MergeEntry, type Rule } from "./data";
import { useStore } from "./state";
import { Links } from "./bits";

const rules: Rule[] = ["exact key", "Indeed URL to ATS key", "text"];

function Side({ s }: { s: MergeEntry["left"] }) {
  return (
    <div className="side">
      <div className="small muted">{s.source}</div>
      <b>{s.title}</b>
      <div>{s.company}</div>
      <div className="muted">{s.location}</div>
      <a className="small" href={s.url} target="_blank" rel="noreferrer">
        {s.url}
      </a>
    </div>
  );
}

function Lookalikes() {
  const { lookalikes, resolveLookalike } = useStore();
  const open = postings.filter(
    (p) =>
      p.lookalike &&
      p.id < p.lookalike.otherId &&
      !lookalikes[p.id] &&
      !lookalikes[p.lookalike.otherId],
  );
  return (
    <section className="ml-look">
      <h3>Open Lookalikes ({open.length})</h3>
      {open.length === 0 && <p className="muted">None.</p>}
      {open.map((p) => {
        const o = byId(p.lookalike!.otherId);
        return (
          <div key={p.id} className="ml-row">
            <div className="small muted">{p.lookalike!.reason}</div>
            <div className="pair">
              {[p, o].map((x) => (
                <div key={x.id} className="side">
                  <b>{x.title}</b>
                  <div>{x.company}</div>
                  <div className="muted">{x.location}</div>
                  <Links p={x} />
                </div>
              ))}
            </div>
            <div className="row">
              <button
                className="mini"
                onClick={() => resolveLookalike(p.id, "merged")}
              >
                Merge
              </button>
              <button
                className="mini"
                onClick={() => resolveLookalike(p.id, "dismissed")}
              >
                Not the same
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------- A: a list, unreviewed first, filtered by rule, rows expand to the evidence ----------

export function MergeList() {
  const { merges, resolveMerge } = useStore();
  const [rule, setRule] = useState<Rule | "all">("text");
  const [open, setOpen] = useState<string | null>(null);
  const counts = (r: Rule) =>
    mergeLog.filter((m) => m.rule === r && !merges[m.id]).length;
  const rows = mergeLog
    .filter((m) => rule === "all" || m.rule === rule)
    .sort((a, b) => Number(!!merges[a.id]) - Number(!!merges[b.id]));
  const unreviewedExact = mergeLog.filter(
    (m) => m.rule === "exact key" && !merges[m.id],
  );
  return (
    <div className="ml">
      <div className="row wrap">
        <button
          className={`chip ${rule === "all" ? "on" : ""}`}
          onClick={() => setRule("all")}
        >
          All
        </button>
        {rules.map((r) => (
          <button
            key={r}
            className={`chip ${rule === r ? "on" : ""}`}
            onClick={() => setRule(r)}
          >
            {r} <span className="count">{counts(r)}</span>
          </button>
        ))}
        {rule === "exact key" && unreviewedExact.length > 0 && (
          <button
            onClick={() =>
              unreviewedExact.forEach((m) => resolveMerge(m.id, "reviewed"))
            }
          >
            Mark all {unreviewedExact.length} exact-key merges reviewed
          </button>
        )}
      </div>
      <table className="ml-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Rule</th>
            <th>Posting</th>
            <th>Joined</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <MergeRow
              key={m.id}
              m={m}
              open={open === m.id}
              toggle={() => setOpen(open === m.id ? null : m.id)}
            />
          ))}
        </tbody>
      </table>
      <Lookalikes />
    </div>
  );
}

function MergeRow({
  m,
  open,
  toggle,
}: {
  m: MergeEntry;
  open: boolean;
  toggle: () => void;
}) {
  const { merges, resolveMerge } = useStore();
  const st = merges[m.id];
  return (
    <>
      <tr className={st ? "done" : ""} onClick={toggle}>
        <td>{m.daysAgo === 0 ? "today" : `${m.daysAgo}d`}</td>
        <td>
          <span className={`rule rule-${m.rule.split(" ")[0]}`}>{m.rule}</span>
        </td>
        <td>
          {m.left.title} · {m.left.company}
        </td>
        <td>
          {m.left.source} + {m.right.source}
        </td>
        <td>{st ?? "unreviewed"}</td>
        <td onClick={(e) => e.stopPropagation()}>
          {!st && (
            <>
              <button
                className="mini"
                onClick={() => resolveMerge(m.id, "reviewed")}
              >
                Reviewed
              </button>
              <button
                className="mini danger"
                onClick={() => resolveMerge(m.id, "split")}
              >
                Split
              </button>
            </>
          )}
        </td>
      </tr>
      {open && (
        <tr className="expand">
          <td colSpan={6}>
            <div className="small">
              <b>Evidence:</b> {m.evidence}
            </div>
            <div className="pair">
              <Side s={m.left} />
              <Side s={m.right} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- B: one merge at a time, side by side, keyboard driven ----------

export function MergeCompare() {
  const { merges, resolveMerge } = useStore();
  const [rule, setRule] = useState<Rule | "all">("all");
  const queue = mergeLog.filter(
    (m) =>
      m.rule !== "exact key" &&
      !merges[m.id] &&
      (rule === "all" || m.rule === rule),
  );
  const m = queue[0];
  return (
    <div className="ml-compare">
      <div className="row wrap">
        {(["all", "Indeed URL to ATS key", "text"] as const).map((r) => (
          <button
            key={r}
            className={`chip ${rule === r ? "on" : ""}`}
            onClick={() => setRule(r)}
          >
            {r}{" "}
            <span className="count">
              {
                mergeLog.filter(
                  (x) =>
                    x.rule !== "exact key" &&
                    !merges[x.id] &&
                    (r === "all" || x.rule === r),
                ).length
              }
            </span>
          </button>
        ))}
        <span className="muted small">
          {mergeLog.filter((x) => x.rule === "exact key").length} exact-key
          merges arrived reviewed. Split one from its Posting.
        </span>
      </div>
      {!m ? (
        <p className="muted">Nothing left to review here.</p>
      ) : (
        <div className="compare-card">
          <div className="row between">
            <span className={`rule rule-${m.rule.split(" ")[0]}`}>
              {m.rule}
            </span>
            <span className="muted small">{queue.length} left</span>
          </div>
          <p>{m.evidence}</p>
          <div className="pair big">
            <Side s={m.left} />
            <div className="eq">=</div>
            <Side s={m.right} />
          </div>
          <div className="row">
            <button
              className="primary"
              onClick={() => resolveMerge(m.id, "reviewed")}
            >
              Same Posting, keep merged
            </button>
            <button
              className="danger"
              onClick={() => resolveMerge(m.id, "split")}
            >
              Not the same, split
            </button>
          </div>
        </div>
      )}
      <Lookalikes />
    </div>
  );
}
