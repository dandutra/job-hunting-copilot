import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useApi } from "../api/ApiContext";
import "./feed.css";
import {
  METRO_OPTIONS,
  type FeedItem,
  type Metro,
  type PostingDetail as Detail,
  type TierLetter,
} from "./format";
import { PostingDetail } from "./PostingDetail";
import { PostingList, type GroupKey } from "./PostingList";

type Loaded<T> = { key: string; data: T } | { key: string; missing: true };

// The newest Feed correction is on the server; a click that has not been reloaded yet, or a toggle-off, lives here.
type Overrides = Record<number, TierLetter | null>;

const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

function typing(target: EventTarget | null) {
  return (
    (target instanceof HTMLInputElement &&
      target.type !== "checkbox" &&
      target.type !== "radio") ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function FeedScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const [showClosed, setShowClosed] = useState(false);
  // Taken when the box is ticked, because a render must not read the clock.
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [place, setPlace] = useState<Metro | "all">("all");
  const [entryOnly, setEntryOnly] = useState(false);
  const [version, setVersion] = useState(0);
  const [list, setList] = useState<{ key: string; items: FeedItem[] } | null>(
    null,
  );
  const [open, setOpen] = useState<Record<GroupKey, boolean>>({
    A: true,
    B: true,
    C: false,
    closed: true,
  });
  const [overrides, setOverrides] = useState<Overrides>({});
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const listKey = `${showClosed}:${version}`;
  useEffect(() => {
    let live = true;
    void api
      .GET("/postings", {
        params: { query: showClosed ? { include: "closed" } : {} },
      })
      .then(({ data }) => {
        if (live && data) setList({ key: listKey, items: data });
      });
    return () => {
      live = false;
    };
  }, [api, showClosed, listKey]);

  const loaded = list?.items;
  const inPlace = useMemo(
    () =>
      place === "all"
        ? (loaded ?? [])
        : (loaded ?? []).filter((i) => i.metros.includes(place)),
    [loaded, place],
  );
  // The API decides what is entry level; the screen only reads the flag.
  const inEntry = useMemo(
    () => (entryOnly ? inPlace.filter((i) => i.entryLevel) : inPlace),
    [inPlace, entryOnly],
  );
  const items = useMemo(
    () =>
      cutoff === null
        ? inEntry
        : inEntry.filter((i) => Date.parse(i.postedAt) >= cutoff),
    [inEntry, cutoff],
  );
  const visible = useMemo(
    () =>
      items.filter((i) => (i.state === "open" ? open[i.tier] : open.closed)),
    [items, open],
  );
  const parsed = idParam === undefined ? NaN : Number(idParam);
  const selectedId = Number.isInteger(parsed) ? parsed : visible[0]?.id;

  const detailKey = `${selectedId}:${version}`;
  const [detail, setDetail] = useState<Loaded<Detail> | null>(null);
  useEffect(() => {
    if (selectedId === undefined) return;
    let live = true;
    void api
      .GET("/postings/{id}", { params: { path: { id: selectedId } } })
      .then(({ data }) => {
        if (!live) return;
        setDetail(
          data ? { key: detailKey, data } : { key: detailKey, missing: true },
        );
      });
    return () => {
      live = false;
    };
  }, [api, selectedId, detailKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k") return;
      const at = visible.findIndex((i) => i.id === selectedId);
      const next = visible[e.key === "j" ? at + 1 : at - 1];
      if (next && at !== -1) void navigate(`/postings/${next.id}`);
      else if (e.key === "j" && at === -1 && visible[0])
        void navigate(`/postings/${visible[0].id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, navigate]);

  const correctionOf = (item: {
    id: number;
    feedCorrection: TierLetter | null;
  }) => (item.id in overrides ? overrides[item.id] : item.feedCorrection);

  async function correct(posting: Detail, tier: TierLetter) {
    if (correctionOf(posting) === tier) {
      // The API keeps its log of corrections and has no undo, so this only clears the mark here.
      setOverrides((o) => ({ ...o, [posting.id]: null }));
      return;
    }
    const { error } = await api.POST("/postings/{id}/feed-correction", {
      params: { path: { id: posting.id } },
      body: { tier },
    });
    if (!error) setOverrides((o) => ({ ...o, [posting.id]: tier }));
  }

  async function merge(lookalikeId: number) {
    const { data } = await api.POST("/lookalikes/{id}/merge", {
      params: { path: { id: lookalikeId } },
    });
    if (!data) return;
    setVersion((v) => v + 1);
    void navigate(`/postings/${data.postingId}`);
  }

  async function dismiss(lookalikeId: number) {
    const { error } = await api.POST("/lookalikes/{id}/dismiss", {
      params: { path: { id: lookalikeId } },
    });
    if (error) return;
    setHidden((h) => new Set(h).add(lookalikeId));
    setVersion((v) => v + 1);
  }

  const shown = detail && detail.key === detailKey ? detail : null;
  return (
    <div className="feed">
      <aside className="feed-list">
        <label className="closed-toggle">
          Location{" "}
          <select
            value={place}
            onChange={(e) => {
              setPlace(e.target.value as Metro | "all");
              // A focused select swallows j and k, so give the keys back to the list.
              e.target.blur();
            }}
          >
            <option value="all">All locations</option>
            {METRO_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="closed-toggle">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Closed and stale
        </label>
        <label className="closed-toggle">
          <input
            type="checkbox"
            checked={entryOnly}
            onChange={(e) => setEntryOnly(e.target.checked)}
          />
          Entry level
        </label>
        <label className="closed-toggle">
          <input
            type="checkbox"
            checked={cutoff !== null}
            onChange={(e) =>
              setCutoff(e.target.checked ? Date.now() - RECENT_MS : null)
            }
          />
          Last 3 days
        </label>
        {list && list.items.length === 0 && (
          <p className="muted page">No Postings yet.</p>
        )}
        {list && list.items.length > 0 && inPlace.length === 0 && (
          <p className="muted page">No Postings in this location.</p>
        )}
        {inPlace.length > 0 && inEntry.length === 0 && (
          <p className="muted page">
            {place === "all"
              ? "No entry-level Postings."
              : "No entry-level Postings in this location."}
          </p>
        )}
        {inEntry.length > 0 && items.length === 0 && (
          <p className="muted page">No Postings in the last 3 days.</p>
        )}
        <PostingList
          items={items}
          open={open}
          toggle={(key) => setOpen((o) => ({ ...o, [key]: !o[key] }))}
          selectedId={selectedId}
          correctionOf={correctionOf}
        />
        <p className="muted small">j / k to move. C starts collapsed.</p>
      </aside>
      <main className="feed-detail">
        {shown && "data" in shown ? (
          <PostingDetail
            posting={shown.data}
            correction={correctionOf(shown.data)}
            onCorrect={(t) => void correct(shown.data, t)}
            hidden={hidden}
            onMerge={(l) => void merge(l)}
            onDismiss={(l) => void dismiss(l)}
          />
        ) : shown ? (
          <p className="muted page">Posting not found.</p>
        ) : (
          <p className="muted page">
            {selectedId === undefined ? "Nothing selected." : "Loading."}
          </p>
        )}
      </main>
    </div>
  );
}
