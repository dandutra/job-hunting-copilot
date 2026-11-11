import { Link } from "react-router";
import {
  age,
  capReason,
  TIERS,
  type FeedItem,
  type TierLetter,
} from "./format";

export type GroupKey = TierLetter | "closed";

function Row({
  item,
  selected,
  correction,
}: {
  item: FeedItem;
  selected: boolean;
  correction: TierLetter | null;
}) {
  return (
    <Link
      to={`/postings/${item.id}`}
      className={`feed-item${selected ? " selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <span className="feed-item-top">
        <b>{item.title}</b>
        <span className="muted">{age(item.postedAt)}</span>
      </span>
      <span className="muted">
        {item.company} · {item.location}
      </span>
      <span className="flags">
        {item.state !== "open" && (
          <span className="flag flag-state">
            {item.state === "closed" ? "Closed" : "Stale"}
          </span>
        )}
        {item.thin && <span className="flag">Thin</span>}
        {item.capsApplied.length > 0 && (
          <span className="flag" title={capReason(item.capsApplied)}>
            Capped
          </span>
        )}
        {item.hasLookalike && <span className="flag">Lookalike</span>}
        {item.sightingCount > 1 && (
          <span className="flag">{item.sightingCount} Sightings</span>
        )}
        {correction && (
          <span className="flag flag-you">you said {correction}</span>
        )}
      </span>
    </Link>
  );
}

export function PostingList({
  items,
  open,
  toggle,
  selectedId,
  correctionOf,
}: {
  items: FeedItem[];
  open: Record<GroupKey, boolean>;
  toggle: (key: GroupKey) => void;
  selectedId: number | undefined;
  correctionOf: (item: FeedItem) => TierLetter | null;
}) {
  const live = items.filter((i) => i.state === "open");
  const gone = items.filter((i) => i.state !== "open");
  const groups: { key: GroupKey; title: string; rows: FeedItem[] }[] = [
    ...TIERS.map((t) => ({
      key: t,
      title: `Tier ${t}`,
      rows: live.filter((i) => i.tier === t),
    })),
    ...(gone.length > 0
      ? [{ key: "closed" as const, title: "Closed and stale", rows: gone }]
      : []),
  ];
  return (
    <>
      {groups.map(({ key, title, rows }) => (
        <section key={key}>
          <button
            type="button"
            className={`group-head ${key === "closed" ? "" : `tier-tint-${key}`}`}
            aria-expanded={open[key]}
            onClick={() => toggle(key)}
          >
            <span>
              {open[key] ? "▾" : "▸"} {title}
            </span>
            <span className="muted">({rows.length})</span>
          </button>
          {open[key] &&
            rows.map((item) => (
              <Row
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                correction={correctionOf(item)}
              />
            ))}
        </section>
      ))}
    </>
  );
}
