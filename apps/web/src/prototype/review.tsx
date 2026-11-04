// PROTOTYPE: two Tailored resume review layouts. Approve and Reject are the only actions.
import { useState } from "react";
import {
  byId,
  doNotClaims,
  draft,
  facts,
  uploadHint,
  type DraftLine,
} from "./data";
import { TierBadge } from "./bits";
import { useStore } from "./state";

type Status = "draft" | "rejecting" | "rejected" | "approved";

function VerdictTag({ l }: { l: DraftLine }) {
  const v = l.verdict;
  if (v.kind === "pass") return <span className="verdict pass">pass</span>;
  if (v.kind === "dnc")
    return <span className="verdict bad">breaks {v.dncId}</span>;
  return <span className="verdict warn">{v.note}</span>;
}

function useReview() {
  const { notify } = useStore();
  const [status, setStatus] = useState<Status>("draft");
  const [faulty, setFaulty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  return {
    status,
    setStatus,
    faulty,
    note,
    setNote,
    toggleFaulty: (id: string) =>
      setFaulty((f) => {
        const next = { ...f };
        if (id in next) delete next[id];
        else next[id] = "";
        return next;
      }),
    setDnc: (id: string, dnc: string) =>
      setFaulty((f) => ({ ...f, [id]: dnc })),
    approve: () => {
      setStatus("approved");
      notify(
        "Approved. The API reran the Trace check and rendered PDF and DOCX.",
      );
    },
    reject: () => {
      setStatus("rejected");
      notify(
        `Rejected with ${Object.keys(faulty).length} faulty lines. Run /tailor again to redo it.`,
      );
    },
  };
}

type R = ReturnType<typeof useReview>;

const posting = byId(draft.postingId);
const all = [...draft.lines, ...draft.cover];
const flagged = all.filter((l) => l.verdict.kind !== "pass").length;

function Header() {
  return (
    <header className="rv-head">
      <div className="row">
        <TierBadge tier={posting.tier} />
        <h2>
          Tailored resume for {posting.title}, {posting.company}
        </h2>
      </div>
      <div className="muted">
        Draft 2 · profile v7 · Trace check passed · Claim review: {all.length}{" "}
        lines read, {all.length - flagged} passed, {flagged} flagged
      </div>
    </header>
  );
}

function Actions({ r }: { r: R }) {
  if (r.status === "approved")
    return (
      <div className="rv-actions approved">
        <b>Approved.</b>
        <button className="primary">Resume PDF</button>
        <button className="primary">Resume DOCX</button>
        <button>Cover letter PDF</button>
        <button>Cover letter DOCX</button>
        <span className="hint">
          {posting.ats} → upload the <b>{uploadHint(posting.ats)}</b>. Low
          confidence rule.
        </span>
      </div>
    );
  if (r.status === "rejected")
    return (
      <div className="rv-actions">
        <b>Rejected.</b> Run <code>/tailor {posting.id}</code> again; it will
        read your note and the marked lines.
      </div>
    );
  if (r.status === "rejecting")
    return (
      <div className="rv-actions">
        <textarea
          placeholder="What's wrong with this draft?"
          value={r.note}
          onChange={(e) => r.setNote(e.target.value)}
        />
        <span className="muted small">
          {Object.keys(r.faulty).length} lines marked
        </span>
        <button className="danger" onClick={r.reject}>
          Send rejection
        </button>
        <button onClick={() => r.setStatus("draft")}>Cancel</button>
      </div>
    );
  return (
    <div className="rv-actions">
      <button className="primary" onClick={r.approve}>
        Approve resume and cover letter
      </button>
      <button className="danger" onClick={() => r.setStatus("rejecting")}>
        Reject…
      </button>
      <span className="muted small">
        No editing here. Changes happen in Claude Code.
      </span>
    </div>
  );
}

function FaultyMark({ r, l }: { r: R; l: DraftLine }) {
  if (r.status !== "rejecting") return null;
  const marked = l.id in r.faulty;
  return (
    <span className="faulty" onClick={(e) => e.stopPropagation()}>
      <label>
        <input
          type="checkbox"
          checked={marked}
          onChange={() => r.toggleFaulty(l.id)}
        />{" "}
        faulty
      </label>
      {marked && (
        <select
          value={r.faulty[l.id]}
          onChange={(e) => r.setDnc(l.id, e.target.value)}
        >
          <option value="">no Do-not-claim</option>
          {doNotClaims.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

function DncList() {
  return (
    <div className="dnc">
      <h4>Do-not-claims</h4>
      <ul>
        {doNotClaims.map((d) => (
          <li key={d.id}>
            <b>{d.id}</b> {d.text}
          </li>
        ))}
      </ul>
      <h4>Pasted Posting text</h4>
      <p className="muted small">
        {draft.pastedText ?? "None. The draft used the Posting's stored text."}
      </p>
    </div>
  );
}

// ---------- A: three-column table, one row per line ----------

export function ReviewTable() {
  const r = useReview();
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const rows = (ls: DraftLine[]) =>
    ls.filter((l) => !onlyFlagged || l.verdict.kind !== "pass");
  const block = (title: string, ls: DraftLine[]) => (
    <>
      <tr className="sec">
        <td colSpan={3}>{title}</td>
      </tr>
      {rows(ls).map((l) => (
        <tr key={l.id} className={l.verdict.kind === "pass" ? "" : "flagged"}>
          <td>
            <div className="small muted">{l.section}</div>
            {l.text}
            <FaultyMark r={r} l={l} />
          </td>
          <td>
            {l.cites.map((c) => (
              <div key={c} className="fact">
                <b>{c}</b> {facts[c].text}{" "}
                {facts[c].ownership && (
                  <span className="flag">{facts[c].ownership}</span>
                )}
              </div>
            ))}
          </td>
          <td>
            <VerdictTag l={l} />
          </td>
        </tr>
      ))}
    </>
  );
  return (
    <div className="rv">
      <Header />
      <div className="rv-grid">
        <div>
          <label className="small">
            <input
              type="checkbox"
              checked={onlyFlagged}
              onChange={(e) => setOnlyFlagged(e.target.checked)}
            />{" "}
            Only flagged lines
          </label>
          <table className="rv-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Cited Facts</th>
                <th>Claim review</th>
              </tr>
            </thead>
            <tbody>
              {block("Tailored resume", draft.lines)}
              {block("Tailored cover letter", draft.cover)}
            </tbody>
          </table>
        </div>
        <DncList />
      </div>
      <Actions r={r} />
    </div>
  );
}

// ---------- B: the resume as it will read, flagged lines marked, a side panel for the selected line ----------

export function ReviewDocument() {
  const r = useReview();
  const firstFlag = all.find((l) => l.verdict.kind !== "pass")!;
  const [sel, setSel] = useState(firstFlag.id);
  const line = all.find((l) => l.id === sel)!;
  const sections = [...new Set(draft.lines.map((l) => l.section))];
  return (
    <div className="rv">
      <Header />
      <div className="rv-doc-grid">
        <div className="paper">
          <h3>Alex Sample</h3>
          <div className="muted small">Toronto, ON · alex@example.com</div>
          {sections.map((s) => (
            <section key={s}>
              <h5>{s}</h5>
              {draft.lines
                .filter((l) => l.section === s)
                .map((l) => (
                  <p
                    key={l.id}
                    className={`pline ${l.verdict.kind !== "pass" ? "pflag" : ""} ${sel === l.id ? "psel" : ""}`}
                    onClick={() => setSel(l.id)}
                  >
                    {l.verdict.kind !== "pass" && (
                      <span className="pin">!</span>
                    )}
                    {l.text}
                    <FaultyMark r={r} l={l} />
                  </p>
                ))}
            </section>
          ))}
          <hr />
          <h5>Cover letter</h5>
          {draft.cover.map((l) => (
            <p
              key={l.id}
              className={`pline ${l.verdict.kind !== "pass" ? "pflag" : ""} ${sel === l.id ? "psel" : ""}`}
              onClick={() => setSel(l.id)}
            >
              {l.text}
              <FaultyMark r={r} l={l} />
            </p>
          ))}
        </div>
        <aside className="inspector">
          <h4>Selected line</h4>
          <p>{line.text}</p>
          <VerdictTag l={line} />
          <h4>Cited Facts</h4>
          {line.cites.map((c) => (
            <div key={c} className="fact">
              <b>{c}</b> {facts[c].text}
              <div className="small muted">
                {facts[c].ownership && `${facts[c].ownership} · `}
                {facts[c].source}
              </div>
            </div>
          ))}
          <div className="row">
            <button
              onClick={() =>
                setSel(
                  all[(all.indexOf(line) + all.length - 1) % all.length].id,
                )
              }
            >
              ↑ Prev
            </button>
            <button
              onClick={() =>
                setSel(all[(all.indexOf(line) + 1) % all.length].id)
              }
            >
              Next ↓
            </button>
          </div>
          <DncList />
        </aside>
      </div>
      <Actions r={r} />
    </div>
  );
}
