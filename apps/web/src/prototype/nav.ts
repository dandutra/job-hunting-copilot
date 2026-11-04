// PROTOTYPE routing through ?screen= and ?variant=, so every view is a shareable URL.
export function readNav() {
  const q = new URLSearchParams(location.search);
  return {
    screen: q.get("screen") ?? "feed",
    variant: q.get("variant") ?? "A",
  };
}

export function go(screen: string, variant?: string) {
  const q = new URLSearchParams(location.search);
  q.set("screen", screen);
  q.set(
    "variant",
    variant ?? (screen === readNav().screen ? readNav().variant : "A"),
  );
  history.replaceState(null, "", `?${q}`);
  dispatchEvent(new Event("prototype-nav"));
}
