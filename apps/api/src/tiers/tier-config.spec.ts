import { loadTierConfig } from "./tier-config";

const base = {
  scoreWeight: 0.6,
  rolePoints: {
    full_stack: 0.15,
    back_end: 0.1,
    front_end: 0.05,
    cloud_ops: 0.02,
    support: 0,
    other: 0,
  },
  workPoints: { hybrid: 0.1, remote: 0.05, on_site: 0 },
  capThresholds: {
    closed_to_juniors: 0.7,
    outside_gta: 0.5,
    us_only: 0.7,
    security_clearance: 0.7,
    requires_french: 0.7,
  },
  thresholds: { a: 0.9, b: 0.6 },
};

const load = (change: (c: typeof base) => void) => {
  const c = structuredClone(base);
  change(c);
  return loadTierConfig(JSON.stringify(c));
};

describe("loadTierConfig", () => {
  it("accepts a config in preference order and versions it by SHA-256", () => {
    const raw = JSON.stringify(base);
    const { config, version } = loadTierConfig(raw);
    expect(config.thresholds.a).toBe(0.9);
    expect(version).toMatch(/^[0-9a-f]{64}$/);
    expect(loadTierConfig(raw + " ").version).not.toBe(version);
  });

  it("accepts equal points, because the order is non-strict", () => {
    expect(() => load((c) => (c.rolePoints.back_end = 0.15))).not.toThrow();
    expect(() => load((c) => (c.workPoints.remote = 0.1))).not.toThrow();
  });

  it.each([
    [
      "back-end above full-stack",
      (c: typeof base) => (c.rolePoints.back_end = 0.2),
    ],
    [
      "front-end above back-end",
      (c: typeof base) => (c.rolePoints.front_end = 0.11),
    ],
    [
      "cloud/ops above front-end",
      (c: typeof base) => (c.rolePoints.cloud_ops = 0.06),
    ],
    [
      "support above cloud/ops",
      (c: typeof base) => (c.rolePoints.support = 0.03),
    ],
    ["other above support", (c: typeof base) => (c.rolePoints.other = 0.01)],
    ["remote above hybrid", (c: typeof base) => (c.workPoints.remote = 0.2)],
    ["on-site above remote", (c: typeof base) => (c.workPoints.on_site = 0.06)],
  ])("rejects %s", (_name, change) => {
    expect(() => load(change)).toThrow(/preference order/);
  });

  it("rejects thresholds out of order, weights out of range and missing keys", () => {
    expect(() => load((c) => (c.thresholds.b = 0.95))).toThrow(/thresholds/);
    expect(() => load((c) => (c.scoreWeight = 1.2))).toThrow(/scoreWeight/);
    expect(() => load((c) => (c.capThresholds.us_only = 2))).toThrow(/us_only/);
    expect(() =>
      load((c) => delete (c.capThresholds as Record<string, number>).us_only),
    ).toThrow(/us_only/);
    expect(() => loadTierConfig("{")).toThrow(/JSON/);
  });

  it("holds no personal data: the committed file loads and has only the known keys", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require("node:fs").readFileSync(
      "../../config/tier-config.json",
      "utf8",
    );
    const { config } = loadTierConfig(raw);
    expect(Object.keys(config).sort()).toEqual([
      "capThresholds",
      "rolePoints",
      "scoreWeight",
      "thresholds",
      "workPoints",
    ]);
  });
});
