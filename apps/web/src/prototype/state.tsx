// PROTOTYPE in-memory state. Nothing persists; a reload starts over.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { LabelAnswer, Tier } from "./data";

interface Store {
  corrections: Record<string, Tier>;
  correct: (id: string, tier: Tier | null) => void;
  labels: { postingId: string; answer: LabelAnswer }[];
  addLabel: (postingId: string, answer: LabelAnswer) => void;
  undoLabel: () => void;
  lookalikes: Record<string, "merged" | "dismissed">;
  resolveLookalike: (id: string, how: "merged" | "dismissed") => void;
  merges: Record<string, "reviewed" | "split">;
  resolveMerge: (id: string, how: "reviewed" | "split") => void;
  toast: string | null;
  notify: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [corrections, setCorrections] = useState<Record<string, Tier>>({});
  const [labels, setLabels] = useState<Store["labels"]>([]);
  const [lookalikes, setLookalikes] = useState<Store["lookalikes"]>({});
  const [merges, setMerges] = useState<Store["merges"]>({});
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  };

  const store: Store = {
    corrections,
    correct: (id, tier) => {
      setCorrections((c) => {
        const next = { ...c };
        if (tier) next[id] = tier;
        else delete next[id];
        return next;
      });
      notify(
        tier
          ? `Stored a Feed correction (${tier}) for ${id}. Not a Label.`
          : `Cleared the Feed correction for ${id}.`,
      );
    },
    labels,
    addLabel: (postingId, answer) => {
      setLabels((l) => [...l, { postingId, answer }]);
      notify(
        `Stored Label ${answer === "cant_tell" ? "can't tell" : answer} for ${postingId}.`,
      );
    },
    undoLabel: () => {
      setLabels((l) => l.slice(0, -1));
      notify("Undid the last Label.");
    },
    lookalikes,
    resolveLookalike: (id, how) => {
      setLookalikes((l) => ({ ...l, [id]: how }));
      notify(
        how === "merged"
          ? `Merged the Lookalike into ${id}; the merge is logged.`
          : `Dismissed the Lookalike on ${id}; the pair won't relink.`,
      );
    },
    merges,
    resolveMerge: (id, how) => {
      setMerges((m) => ({ ...m, [id]: how }));
      notify(
        how === "split"
          ? `Split ${id}: the Sighting is its own Posting and the pair won't rejoin.`
          : `Marked ${id} reviewed.`,
      );
    },
    toast,
    notify,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
