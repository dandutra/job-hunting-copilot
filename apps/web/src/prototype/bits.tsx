// PROTOTYPE content pieces the feed variants share. Layout stays per variant.
import { byId, linksOf, type Posting, type Tier } from "./data";
import { useStore } from "./state";

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`tier tier-${tier}`}>{tier}</span>;
}

export function Flags({ p, compact }: { p: Posting; compact?: boolean }) {
  return (
    <>
      {p.thin && (
        <span
          className="flag flag-thin"
          title="No full description yet; out of the Label queue"
        >
          Thin
        </span>
      )}
      {p.cap && (
        <span className="flag flag-cap" title={`Tier cap: ${p.cap}`}>
          {compact ? "Capped" : `Capped at C: ${p.cap}`}
        </span>
      )}
    </>
  );
}

export function Correction({ p }: { p: Posting }) {
  const { corrections, correct } = useStore();
  const current = corrections[p.id];
  return (
    <span
      className="correction"
      title="Feed correction: reports a wrong Tier. Never counts as a Label."
    >
      <span className="muted">Wrong Tier? Should be</span>
      {(["A", "B", "C"] as Tier[])
        .filter((t) => t !== p.tier)
        .map((t) => (
          <button
            key={t}
            className={`mini ${current === t ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              correct(p.id, current === t ? null : t);
            }}
          >
            {t}
          </button>
        ))}
    </span>
  );
}

export function CorrectionMark({ p }: { p: Posting }) {
  const { corrections } = useStore();
  const c = corrections[p.id];
  return c ? <span className="flag flag-corr">you said {c}</span> : null;
}

export function LookalikeHint({ p }: { p: Posting }) {
  const { lookalikes, resolveLookalike } = useStore();
  if (!p.lookalike || lookalikes[p.id] || lookalikes[p.lookalike.otherId])
    return null;
  const other = byId(p.lookalike.otherId);
  return (
    <div className="lookalike" onClick={(e) => e.stopPropagation()}>
      <span>
        ⧉ Lookalike: <b>{other.title}</b> at {other.company}, {other.location} (
        {other.tier}). <span className="muted">{p.lookalike.reason}</span>
      </span>
      <span>
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
      </span>
    </div>
  );
}

export function Links({ p }: { p: Posting }) {
  return (
    <ul className="links">
      {linksOf(p).map(({ url, sources }) => (
        <li key={url}>
          <a href={url} target="_blank" rel="noreferrer">
            {sources[0]}
          </a>
          {sources.length > 1 && (
            <span className="muted" title={sources.join(", ")}>
              {" "}
              +{sources.length - 1} more source{sources.length > 2 ? "s" : ""}{" "}
              with this URL ({sources.slice(1).join(", ")})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CopyTailor({ p }: { p: Posting }) {
  const { notify } = useStore();
  return (
    <button
      className="primary"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(`/tailor ${p.id}`);
        notify(`Copied "/tailor ${p.id}". Paste it into Claude Code.`);
      }}
    >
      Copy /tailor {p.id}
    </button>
  );
}

export function Why({ p }: { p: Posting }) {
  return (
    <ul className="why">
      {p.why.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

export function Body({ p }: { p: Posting }) {
  if (!p.text)
    return (
      <p className="muted">
        No description yet. Open a source link to read it.
      </p>
    );
  return <div className="posting-text">{p.text}</div>;
}
