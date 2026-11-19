import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useApi } from "../api/ApiContext";
import "./review.css";
import {
  allLines,
  counts,
  isFlagged,
  verdictOf,
  type Drafts,
  type LineView,
  type Resume,
} from "./lines";

type Loaded = {
  key: string;
  resume: Resume;
  title: string;
  company: string;
  history: Drafts;
  pastedText: string | null;
};

type Faulty = Record<string, string>;

const FILES = [
  ["resume.pdf", "Resume PDF"],
  ["resume.docx", "Resume DOCX"],
  ["cover-letter.pdf", "Cover letter PDF"],
  ["cover-letter.docx", "Cover letter DOCX"],
] as const;

export function ReviewScreen() {
  const api = useApi();
  const id = Number(useParams().id);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const key = `${id}:${version}`;

  useEffect(() => {
    let live = true;
    void (async () => {
      const params = { params: { path: { id } } };
      const { data: resume } = await api.GET("/tailored-resumes/{id}", params);
      if (!live) return;
      if (!resume) return setMissing(key);
      const at = { params: { path: { id: resume.postingId } } };
      const [posting, history, text] = await Promise.all([
        api.GET("/postings/{id}", at),
        api.GET("/postings/{id}/tailored-resumes", at),
        api.GET("/tailored-resumes/{id}/posting-text", params),
      ]);
      if (!live) return;
      if (!posting.data || !history.data || !text.data) return setMissing(key);
      setLoaded({
        key,
        resume,
        title: posting.data.title,
        company: posting.data.company,
        history: history.data,
        pastedText: text.data.text,
      });
    })();
    return () => {
      live = false;
    };
  }, [api, id, key]);

  if (missing === key)
    return (
      <main className="page">
        <h1>Tailored resume review</h1>
        <p className="muted">This draft could not be loaded.</p>
      </main>
    );
  if (loaded?.key !== key)
    return (
      <main className="page">
        <p className="muted">Loading the draft.</p>
      </main>
    );
  return <Review data={loaded} reload={() => setVersion((v) => v + 1)} />;
}

function Review({ data, reload }: { data: Loaded; reload: () => void }) {
  const api = useApi();
  const { resume, history } = data;
  const lines = allLines(resume);
  const first = lines.find((l) => isFlagged(verdictOf(resume, l.line)));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = lines.find((l) => l.line === picked) ?? first ?? lines[0];
  const [rejecting, setRejecting] = useState(false);
  const [faulty, setFaulty] = useState<Faulty>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = counts(resume);
  const number = history.drafts.findIndex((d) => d.id === resume.id) + 1;
  const open = resume.status === "draft";

  const step = (by: number) => {
    const at = lines.findIndex((l) => l === selected);
    setPicked(lines[(at + by + lines.length) % lines.length].line);
  };

  async function approve() {
    setBusy(true);
    setMessage(null);
    const { error, response } = await api.POST(
      "/tailored-resumes/{id}/approve",
      { params: { path: { id: resume.id } } },
    );
    setBusy(false);
    if (!error) return reload();
    if (response?.status === 422) {
      const count = (error as { failures?: unknown[] }).failures?.length ?? 0;
      setMessage(
        `The Trace check failed on ${count} lines, so nothing was approved. Run /tailor to submit a new draft.`,
      );
    } else if (response?.status === 409) {
      // Someone else closed the draft; the reload shows what it is now.
      reload();
    } else if (response?.status === 500) {
      setMessage(
        "The files could not be rendered, so the draft is still open. Try again.",
      );
    } else setMessage("Approve did not go through. Try again.");
  }

  async function reject() {
    setBusy(true);
    setMessage(null);
    const { error } = await api.POST("/tailored-resumes/{id}/reject", {
      params: { path: { id: resume.id } },
      body: {
        note,
        lines: Object.entries(faulty).map(([line, doNotClaimId]) =>
          doNotClaimId ? { line, doNotClaimId } : { line },
        ),
      },
    });
    setBusy(false);
    if (error) return setMessage("The rejection was not saved.");
    setRejecting(false);
    reload();
  }

  const toggleFaulty = (line: string) =>
    setFaulty((f) => {
      const next = { ...f };
      if (line in next) delete next[line];
      else next[line] = "";
      return next;
    });

  const row = (l: LineView) => {
    const flagged = isFlagged(verdictOf(resume, l.line));
    const isSelected = l === selected;
    return (
      <li key={l.line} className="pline-row">
        <button
          type="button"
          className={`pline${flagged ? " flagged" : ""}${isSelected ? " selected" : ""}`}
          aria-pressed={isSelected}
          onClick={() => setPicked(l.line)}
        >
          {flagged && (
            <>
              <span className="pin" aria-hidden="true">
                !
              </span>
              <span className="visually-hidden">Flagged </span>
            </>
          )}
          {l.text}
        </button>
        {rejecting && (
          <span className="faulty">
            <label>
              <input
                type="checkbox"
                checked={l.line in faulty}
                onChange={() => toggleFaulty(l.line)}
              />{" "}
              faulty
              <span className="visually-hidden"> {l.line}</span>
            </label>
            {l.line in faulty && (
              <select
                aria-label={`Do-not-claim broken by ${l.line}`}
                value={faulty[l.line]}
                onChange={(e) =>
                  setFaulty((f) => ({ ...f, [l.line]: e.target.value }))
                }
              >
                <option value="">no Do-not-claim</option>
                {resume.doNotClaims.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id}
                  </option>
                ))}
              </select>
            )}
          </span>
        )}
      </li>
    );
  };

  const verdict = verdictOf(resume, selected?.line ?? "");
  const { contact } = resume;
  return (
    <main className="review">
      <section className="rv-head" aria-label="Draft status">
        <h2>
          Tailored resume for {data.title}, {data.company}
        </h2>
        <div className="muted">
          Draft {number} · profile {resume.profileVersion.slice(0, 8)} · Trace
          check passed ·{" "}
          {resume.verdicts
            ? `Claim review: ${n.read} lines read, ${n.passed} passed, ${n.flagged} flagged`
            : "Claim review: not run"}
        </div>
      </section>
      <div className="rv-grid">
        <article className="paper" aria-label="Tailored resume">
          <h3>{contact.name}</h3>
          <div className="muted small">
            {[contact.city, contact.email, contact.phone]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <h4>Highlights of Qualifications</h4>
          <ul>{resume.summary.map(row)}</ul>
          <h4>Experience</h4>
          {resume.experiences.map((e) => (
            <section key={e.id}>
              <p className="entry">
                <b>{e.titles.join(" / ")}</b>, {e.employer} · {e.start} to{" "}
                {e.end ?? "Present"}
              </p>
              {e.fixed ? (
                <p className="muted small">Filled from the profile.</p>
              ) : (
                <ul>{e.bullets.map(row)}</ul>
              )}
            </section>
          ))}
          <h4>Projects</h4>
          {resume.projects.map((p) => (
            <section key={p.id}>
              <p className="entry">
                <b>{p.name}</b>
              </p>
              <ul>{p.bullets.map(row)}</ul>
            </section>
          ))}
          <h4>Education</h4>
          {resume.education.map((d) => (
            <p key={d.id} className="entry">
              <b>{d.program}</b>, {d.school}
            </p>
          ))}
          <h4>Skills</h4>
          <p>{resume.skills.map((s) => s.text).join(", ")}</p>
          {resume.coverLetter && (
            <>
              <h4>Cover letter</h4>
              <p className="muted small">{resume.coverLetter.greeting}</p>
              <ul>{resume.coverLetter.paragraphs.map(row)}</ul>
            </>
          )}
        </article>
        <aside className="inspector" aria-label="Line inspector">
          {selected && (
            <>
              <h4>Selected line</h4>
              <p>{selected.text}</p>
              <p className={isFlagged(verdict) ? "verdict bad" : "verdict"}>
                {!verdict && "Not reviewed"}
                {verdict?.status === "pass" && "Claim review: pass"}
                {verdict?.status === "do-not-claim" &&
                  `Breaks ${verdict.doNotClaimId}`}
                {verdict?.status === "overstatement" && verdict.note}
              </p>
              <h4>Cited Facts</h4>
              {selected.cites.map((c) => (
                <div key={c.id} className="fact">
                  <b>{c.id}</b> <span>{c.text}</span>
                  {c.ownership && <span className="flag">{c.ownership}</span>}
                  {c.ownershipNote && (
                    <div className="small muted">{c.ownershipNote}</div>
                  )}
                  {c.sources && (
                    <div className="small muted">
                      Source: {c.sources.join(", ")}
                    </div>
                  )}
                </div>
              ))}
              <div className="row">
                <button type="button" onClick={() => step(-1)}>
                  ↑ Prev
                </button>
                <button type="button" onClick={() => step(1)}>
                  Next ↓
                </button>
              </div>
            </>
          )}
          <h4>Do-not-claims</h4>
          <ul>
            {resume.doNotClaims.map((d) => (
              <li key={d.id}>
                <b>{d.id}</b> {d.text}
              </li>
            ))}
          </ul>
          <h4>Pasted Posting text</h4>
          <p className="muted small posting-text">
            {data.pastedText ??
              "No pasted text. The draft used the Posting's stored text."}
          </p>
        </aside>
      </div>
      <section className="rv-actions" aria-label="Actions">
        {open && !rejecting && (
          <>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void approve()}
            >
              {resume.coverLetter
                ? "Approve resume and cover letter"
                : "Approve resume"}
            </button>
            <button type="button" onClick={() => setRejecting(true)}>
              Reject…
            </button>
            <span className="muted small">
              No editing here. Changes happen in Claude Code.
            </span>
          </>
        )}
        {open && rejecting && (
          <>
            <textarea
              aria-label="Why is this draft rejected?"
              placeholder="What's wrong with this draft?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="muted small">
              {Object.keys(faulty).length} lines marked
            </span>
            <button
              type="button"
              className="danger"
              disabled={busy || note.trim() === ""}
              onClick={() => void reject()}
            >
              Send rejection
            </button>
            <button type="button" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </>
        )}
        {resume.status === "rejected" && (
          <p>
            <b>Rejected.</b> Run <code>/tailor {resume.postingId}</code> again;
            it reads the note
            {resume.rejectNote ? `: "${resume.rejectNote}"` : ""}
            {resume.rejectLines?.length
              ? ` and ${resume.rejectLines.length} marked lines (${resume.rejectLines.map((l) => l.line).join(", ")}).`
              : "."}
          </p>
        )}
        {resume.status === "superseded" && !resume.approvedAt && (
          <p>
            <b>Superseded</b> by a newer draft.
          </p>
        )}
        {resume.approvedAt && (
          <>
            <b>
              {resume.status === "approved"
                ? "Approved."
                : "Approved, since superseded."}
            </b>
            {FILES.filter(
              ([name]) => resume.coverLetter || !name.startsWith("cover"),
            ).map(([name, label]) => (
              <a
                key={name}
                className={`button${name.endsWith(history.uploadFormat) && name.startsWith("resume") ? " primary" : ""}`}
                href={`/api/tailored-resumes/${resume.id}/files/${name}`}
                download
              >
                {label}
              </a>
            ))}
            <span className="hint">
              {history.ats ?? "No ATS named"}: upload the{" "}
              <b>{history.uploadFormat.toUpperCase()}</b>. Low confidence rule.
            </span>
          </>
        )}
        {message && <p role="alert">{message}</p>}
      </section>
      <section aria-label="Drafts of this Posting">
        <h4>Drafts of this Posting</h4>
        <ul>
          {history.drafts.map((d, i) => (
            <li key={d.id}>
              {d.id === resume.id ? (
                <span aria-current="page">
                  Draft {i + 1} ({d.status}), shown
                </span>
              ) : (
                <Link to={`/resumes/${d.id}`}>
                  Draft {i + 1} ({d.status})
                </Link>
              )}
              {d.approvedAt && " · has files"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
