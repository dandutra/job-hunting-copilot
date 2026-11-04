// PROTOTYPE: three feed layouts. Each shows the Posting detail its own way.
import { Fragment, useEffect, useState } from "react";
import {
  age,
  postedAt,
  postings,
  sortFeed,
  uploadHint,
  type Posting,
  type Tier,
} from "./data";
import {
  Body,
  CopyTailor,
  Correction,
  CorrectionMark,
  Flags,
  Links,
  LookalikeHint,
  TierBadge,
  Why,
} from "./bits";
import { go } from "./nav";

const feed = sortFeed(postings);
const tiers: Tier[] = ["A", "B", "C"];

function Detail({ p }: { p: Posting }) {
  return (
    <article className="detail">
      <header>
        <div className="row">
          <TierBadge tier={p.tier} />
          <h2>{p.title}</h2>
        </div>
        <div className="muted">
          {p.company} · {p.location} · {p.arrangement} · {p.roleFamily} · posted{" "}
          {age(postedAt(p))}
        </div>
        <div className="row wrap">
          <Flags p={p} />
          <CorrectionMark p={p} />
        </div>
      </header>
      <div className="row wrap">
        <CopyTailor p={p} />
        {p.hasDraft && (
          <button onClick={() => go("review")}>Review draft →</button>
        )}
        <span className="muted">
          Upload {uploadHint(p.ats)} here ({p.ats})
        </span>
      </div>
      <LookalikeHint p={p} />
      <section>
        <h4>Why {p.tier}</h4>
        <Why p={p} />
        <Correction p={p} />
      </section>
      <section>
        <h4>Sightings</h4>
        <Links p={p} />
      </section>
      <section>
        <h4>Description</h4>
        <Body p={p} />
      </section>
    </article>
  );
}

// ---------- A: triage inbox, list left and detail right, j/k to move ----------

export function FeedInbox() {
  const [sel, setSel] = useState(feed[0].id);
  const [hidden, setHidden] = useState<Record<Tier, boolean>>({
    A: false,
    B: false,
    C: true,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const visible = feed.filter((p) => !hidden[p.tier]);
      const i = visible.findIndex((p) => p.id === sel);
      if (e.key === "j" && i < visible.length - 1) setSel(visible[i + 1].id);
      if (e.key === "k" && i > 0) setSel(visible[i - 1].id);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [sel, hidden]);
  const p = feed.find((x) => x.id === sel)!;
  return (
    <div className="inbox">
      <aside className="inbox-list">
        {tiers.map((t) => {
          const group = feed.filter((x) => x.tier === t);
          return (
            <div key={t}>
              <button
                className={`group-head gh-${t}`}
                onClick={() => setHidden((h) => ({ ...h, [t]: !h[t] }))}
              >
                {hidden[t] ? "▸" : "▾"} Tier {t}{" "}
                <span className="muted">({group.length})</span>
              </button>
              {!hidden[t] &&
                group.map((x) => (
                  <div
                    key={x.id}
                    className={`inbox-item ${x.id === sel ? "sel" : ""}`}
                    onClick={() => setSel(x.id)}
                  >
                    <div className="row between">
                      <b>{x.title}</b>
                      <span className="muted">{age(postedAt(x))}</span>
                    </div>
                    <div className="muted">
                      {x.company} · {x.location}
                    </div>
                    <div className="row wrap">
                      <Flags p={x} compact />
                      <CorrectionMark p={x} />
                      {x.lookalike && <span className="flag">⧉ Lookalike</span>}
                      {x.sightings.length > 1 && (
                        <span className="flag">
                          {x.sightings.length} Sightings
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
        <p className="muted small">j / k to move. C starts collapsed.</p>
      </aside>
      <main className="inbox-detail">
        <Detail p={p} />
      </main>
    </div>
  );
}

// ---------- B: one column per Tier, detail in a drawer ----------

export function FeedColumns() {
  const [open, setOpen] = useState<string | null>(null);
  const p = open ? feed.find((x) => x.id === open)! : null;
  return (
    <div className="columns">
      {tiers.map((t) => (
        <section key={t} className={`col col-${t}`}>
          <h3>
            <TierBadge tier={t} />{" "}
            {t === "A"
              ? "Tailor and apply"
              : t === "B"
                ? "If time allows"
                : "Skip"}
          </h3>
          {feed
            .filter((x) => x.tier === t)
            .map((x) => (
              <div key={x.id} className="card" onClick={() => setOpen(x.id)}>
                <b>{x.title}</b>
                <div>{x.company}</div>
                <div className="muted">
                  {x.location} · {age(postedAt(x))}
                </div>
                <div className="row wrap">
                  <Flags p={x} compact />
                  <CorrectionMark p={x} />
                </div>
                <LookalikeHint p={x} />
                <div className="card-foot">
                  <Correction p={x} />
                </div>
              </div>
            ))}
        </section>
      ))}
      {p && (
        <div className="drawer-back" onClick={() => setOpen(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setOpen(null)}>
              ✕
            </button>
            <Detail p={p} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- C: dense table, rows expand in place ----------

export function FeedTable() {
  const [open, setOpen] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const rows = feed.filter(
    (x) => tierFilter === "all" || x.tier === tierFilter,
  );
  return (
    <div className="table-wrap">
      <div className="row">
        {(["all", ...tiers] as const).map((t) => (
          <button
            key={t}
            className={`chip ${tierFilter === t ? "on" : ""}`}
            onClick={() => setTierFilter(t)}
          >
            {t === "all" ? "All Tiers" : `Tier ${t}`}
          </button>
        ))}
      </div>
      <table className="feed-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Posted</th>
            <th>Sources</th>
            <th>Flags</th>
            <th>Correction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <Fragment key={x.id}>
              <tr
                className={open === x.id ? "sel" : ""}
                onClick={() => setOpen(open === x.id ? null : x.id)}
              >
                <td>
                  <TierBadge tier={x.tier} />
                </td>
                <td>
                  <b>{x.title}</b>
                </td>
                <td>{x.company}</td>
                <td>{x.location}</td>
                <td>{age(postedAt(x))}</td>
                <td>
                  {[...new Set(x.sightings.map((s) => s.source))].join(", ")}
                </td>
                <td>
                  <Flags p={x} compact />
                  {x.lookalike && <span className="flag">⧉</span>}
                </td>
                <td>
                  <Correction p={x} />
                </td>
              </tr>
              {open === x.id && (
                <tr className="expand">
                  <td colSpan={8}>
                    <Detail p={x} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
