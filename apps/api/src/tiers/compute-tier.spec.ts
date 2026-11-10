import { CAP_NAMES } from "../jev/question-set";
import { computeTier } from "./compute-tier";
import { loadTierConfig, TierConfig } from "./tier-config";

const config: TierConfig = loadTierConfig(
  JSON.stringify({
    scoreWeight: 0.5,
    rolePoints: {
      full_stack: 0.2,
      back_end: 0.1,
      front_end: 0.05,
      cloud_ops: 0.02,
      support: 0.01,
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
  }),
).config;

function answers(
  o: {
    skills?: number;
    level?: number;
    role?: string;
    work?: string;
    nouls?: Record<string, number>;
  } = {},
) {
  const a: Record<string, unknown> = {
    skills_covered: { type: "score", score: o.skills ?? 0 },
    level_match: { type: "score", score: o.level ?? 0 },
    role_family: { type: "choice", choice: o.role ?? "other" },
    work_arrangement: { type: "choice", choice: o.work ?? "not_stated" },
  };
  for (const n of CAP_NAMES) a[n] = { type: "noul", noul: o.nouls?.[n] ?? 0 };
  return a;
}

describe("computeTier", () => {
  it("puts both Scores on 0 to 1 by levels minus 1 and weights them", () => {
    // Both levels have 4 entries, so a score of 3 is 1.
    const r = computeTier(answers({ skills: 3, level: 1.5 }), config);
    expect(r.total).toBeCloseTo(0.5 * 1 + 0.5 * 0.5);
  });

  it("adds Role family and Work arrangement points", () => {
    const r = computeTier(
      answers({ skills: 3, level: 3, role: "back_end", work: "hybrid" }),
      config,
    );
    expect(r.total).toBeCloseTo(1.2);
  });

  it("cuts at the thresholds, with the total equal to a threshold landing in the higher Tier", () => {
    // skills=level=s gives a combined 0.1 * 0 + s/3; role other, work not_stated add nothing.
    const at = (combined: number) =>
      computeTier(
        answers({ skills: combined * 3, level: combined * 3 }),
        config,
      ).tier;
    expect(at(0.9)).toBe("A");
    expect(at(0.8999)).toBe("B");
    expect(at(0.6)).toBe("B");
    expect(at(0.5999)).toBe("C");
  });

  it("adds zero for not_stated and no more than support for other", () => {
    const base = computeTier(answers({ skills: 2, level: 2 }), config).total;
    expect(
      computeTier(answers({ skills: 2, level: 2, work: "not_stated" }), config)
        .total,
    ).toBe(base);
    const support = computeTier(
      answers({ skills: 2, level: 2, role: "support" }),
      config,
    ).total;
    const other = computeTier(
      answers({ skills: 2, level: 2, role: "other" }),
      config,
    ).total;
    expect(other).toBeLessThanOrEqual(support);
  });

  it.each(CAP_NAMES)(
    "%s at its threshold holds a strong Posting at C and names the cap",
    (cap) => {
      const strong = {
        skills: 3,
        level: 3,
        role: "full_stack",
        work: "hybrid",
      };
      expect(computeTier(answers(strong), config).tier).toBe("A");
      const t = config.capThresholds[cap];
      const capped = computeTier(
        answers({ ...strong, nouls: { [cap]: t } }),
        config,
      );
      expect(capped.tier).toBe("C");
      expect(capped.capsApplied).toEqual([cap]);
      expect(capped.total).toBeGreaterThan(config.thresholds.a);
      const below = computeTier(
        answers({ ...strong, nouls: { [cap]: t - 0.01 } }),
        config,
      );
      expect(below.tier).toBe("A");
      expect(below.capsApplied).toEqual([]);
    },
  );

  it("records every cap that applied", () => {
    const r = computeTier(
      answers({
        skills: 3,
        level: 3,
        nouls: { us_only: 0.9, requires_french: 0.8 },
      }),
      config,
    );
    expect(r.capsApplied).toEqual(["us_only", "requires_french"]);
  });

  it("throws on answers that fail validation", () => {
    expect(() => computeTier({ skills_covered: {} }, config)).toThrow(/Score/);
  });
});
