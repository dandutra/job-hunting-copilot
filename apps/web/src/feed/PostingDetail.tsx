import { useState } from "react";
import { TierBadge } from "../TierBadge";
import {
  age,
  capReason,
  factorLabel,
  word,
  type PostingDetail as Detail,
  TIERS,
  type TierLetter,
} from "./format";

function CopyTailor({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className="primary"
        onClick={() => {
          void navigator.clipboard?.writeText(`/tailor ${id}`);
          setCopied(true);
        }}
      >
        Copy /tailor {id}
      </button>
      {copied && (
        <span className="muted" role="status">
          Copied. Paste it into Claude Code.
        </span>
      )}
    </>
  );
}

export function PostingDetail({
  posting,
  correction,
  onCorrect,
  hidden,
  onMerge,
  onDismiss,
}: {
  posting: Detail;
  correction: TierLetter | null;
  onCorrect: (tier: TierLetter) => void;
  hidden: Set<number>;
  onMerge: (lookalikeId: number) => void;
  onDismiss: (lookalikeId: number) => void;
}) {
  const hints = posting.lookalikes.filter((l) => !hidden.has(l.id));
  const meta = [
    posting.company,
    posting.location,
    posting.workArrangement && word(posting.workArrangement),
    posting.roleFamily && word(posting.roleFamily),
    `posted ${age(posting.postedAt)}`,
  ].filter(Boolean);
  const why = posting.why;
  return (
    <article className="detail">
      <header>
        <div className="row">
          {posting.tier && <TierBadge tier={posting.tier} />}
          <h2>{posting.title}</h2>
          {posting.state !== "open" && (
            <span className="flag flag-state">
              {posting.state === "closed" ? "Closed" : "Stale"}
            </span>
          )}
        </div>
        <div className="muted">{meta.join(" · ")}</div>
        <div className="flags">
          {posting.thin && <span className="flag">Thin</span>}
          {correction && (
            <span className="flag flag-you">you said {correction}</span>
          )}
        </div>
        {posting.capsApplied.length > 0 && (
          <p>Capped at C: {capReason(posting.capsApplied)}</p>
        )}
      </header>
      <div className="row">
        <CopyTailor id={posting.id} />
      </div>
      {hints.map((l) => (
        <div key={l.id} className="lookalike">
          <span>
            Lookalike: <b>{l.other.title}</b> at {l.other.company},{" "}
            {l.other.location}
            {l.other.tier ? ` (Tier ${l.other.tier})` : ""}.{" "}
            <span className="muted">{l.reason.replace(/_/g, " ")}</span>
          </span>
          <span className="row">
            <button type="button" onClick={() => onMerge(l.id)}>
              Merge
            </button>
            <button type="button" onClick={() => onDismiss(l.id)}>
              Not the same
            </button>
          </span>
        </div>
      ))}
      {posting.tier && (
        <section>
          <h3>Why {posting.tier}</h3>
          {why ? (
            <>
              <ul className="why">
                {why.factors.map((f) => (
                  <li key={f.factor}>
                    +{f.points.toFixed(2)} {factorLabel(f.factor)} (
                    {f.factor === "role_family" ||
                    f.factor === "work_arrangement"
                      ? word(f.answer)
                      : f.answer}
                    )
                  </li>
                ))}
              </ul>
              <p className="muted">
                Total {why.total.toFixed(2)}. A from {why.thresholds.a}, B from{" "}
                {why.thresholds.b}.
              </p>
              {why.stale && (
                <p role="note">
                  The tier config changed after this Tier was computed, so these
                  points may not match it until tier:recompute runs.
                </p>
              )}
            </>
          ) : (
            <p className="muted">The points are not available.</p>
          )}
          <div role="group" aria-label="Feed correction" className="row">
            <span className="muted">Wrong Tier? Should be</span>
            {TIERS.filter((t) => t !== posting.tier).map((t) => (
              <button
                key={t}
                type="button"
                className={correction === t ? "on" : ""}
                aria-pressed={correction === t}
                onClick={() => onCorrect(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>Sightings</h3>
        <ul className="links">
          {posting.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.jobSources[0]}
              </a>
              {l.jobSources.length > 1 && (
                <span className="muted">
                  {" "}
                  also reported by {l.jobSources.slice(1).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Description</h3>
        {posting.description === "" ? (
          <p className="muted">
            No description yet. Open a link above to read the posting.
          </p>
        ) : (
          <>
            {posting.thin && (
              <p className="muted">
                Only a snippet so far. Open a link above for the rest.
              </p>
            )}
            <div className="posting-text">{posting.description}</div>
          </>
        )}
      </section>
    </article>
  );
}
