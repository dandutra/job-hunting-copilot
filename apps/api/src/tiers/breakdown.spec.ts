import { computeTotal } from "./compute-tier";
import { tierBreakdown } from "./breakdown";
import { loadTierConfig } from "./tier-config";

const { config } = loadTierConfig(
  JSON.stringify({
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
  }),
);

const answers = (work = "hybrid") => ({
  skills_covered: { type: "score", score: 3 },
  level_match: { type: "score", score: 1 },
  role_family: { type: "choice", choice: "full_stack" },
  work_arrangement: { type: "choice", choice: work },
  closed_to_juniors: { type: "noul", noul: 0 },
  outside_gta: { type: "noul", noul: 0 },
  us_only: { type: "noul", noul: 0 },
  security_clearance: { type: "noul", noul: 0 },
  requires_french: { type: "noul", noul: 0 },
});

describe("tierBreakdown", () => {
  it("lists the points of each factor and they add up to the total", () => {
    const b = tierBreakdown(answers(), config)!;
    expect(b.roleFamily).toBe("full_stack");
    expect(b.workArrangement).toBe("hybrid");
    expect(b.factors.map((f) => f.factor)).toEqual([
      "skills_covered",
      "level_match",
      "role_family",
      "work_arrangement",
    ]);
    const sum = b.factors.reduce((s, f) => s + f.points, 0);
    expect(sum).toBeCloseTo(computeTotal(answers(), config));
    expect(b.total).toBeCloseTo(sum);
  });

  it("gives a not-stated Work arrangement zero points", () => {
    const b = tierBreakdown(answers("not_stated"), config)!;
    expect(b.factors[3]).toMatchObject({ answer: "not_stated", points: 0 });
  });

  it("returns null for answers that no longer validate", () => {
    expect(tierBreakdown({}, config)).toBeNull();
  });
});
