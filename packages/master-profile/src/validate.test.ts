import { describe, expect, it } from "vitest";
import { validRaw, yamlOf, type Raw } from "./fixtures";
import { validateProfile } from "./validate";

function errorsFor(mutate: (raw: Raw) => void) {
  const raw = validRaw();
  mutate(raw);
  const result = validateProfile(yamlOf(raw));
  if (result.ok) throw new Error("expected the profile to be rejected");
  return result.errors;
}

const facts = (raw: Raw) => raw.facts as Record<string, unknown>[];
const skills = (raw: Raw) => raw.skills as Record<string, unknown>[];
const experiences = (raw: Raw) => raw.experiences as Record<string, unknown>[];

describe("validateProfile", () => {
  it("accepts a valid profile and returns it", () => {
    const result = validateProfile(yamlOf(validRaw()));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.facts[0].id).toBe("F1");
  });

  it("rejects text that is not YAML", () => {
    const result = validateProfile("facts: [unclosed");
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate ID and names it", () => {
    const errors = errorsFor((raw) => {
      facts(raw).push({ ...facts(raw)[0] });
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("duplicate"),
      }),
    );
  });

  it("rejects a tag outside the closed list and names the Fact", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].tags = ["back-end", "devops"];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("devops"),
      }),
    );
  });

  it("accepts every Role family, general and leadership as tags", () => {
    const raw = validRaw();
    facts(raw)[0].tags = [
      "full-stack",
      "back-end",
      "front-end",
      "cloud/ops",
      "support",
      "general",
      "leadership",
    ];
    expect(validateProfile(yamlOf(raw)).ok).toBe(true);
  });

  it("rejects a parent that is an unknown ID", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].parent = "E99";
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("E99"),
      }),
    );
  });

  it("rejects a parent that is a Do-not-claim", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].parent = "X1";
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("X1"),
      }),
    );
  });

  it("rejects a related reference to an unknown ID", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].related = ["F77"];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("F77"),
      }),
    );
  });

  it("rejects a related reference to a Do-not-claim", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].related = ["X1"];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("X1"),
      }),
    );
  });

  it("rejects Skill evidence that is an unknown ID", () => {
    const errors = errorsFor((raw) => {
      skills(raw)[0].evidence = ["F1", "F88"];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "S1",
        message: expect.stringContaining("F88"),
      }),
    );
  });

  it("rejects Skill evidence that is a Do-not-claim", () => {
    const errors = errorsFor((raw) => {
      skills(raw)[0].evidence = ["X1"];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "S1",
        message: expect.stringContaining("X1"),
      }),
    );
  });

  it("rejects a Skill with no evidence", () => {
    const errors = errorsFor((raw) => {
      skills(raw)[0].evidence = [];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "S1",
        message: expect.stringContaining("evidence"),
      }),
    );
  });

  it("rejects a Fact whose source is not in the sources list", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].sources = ["user", "diary"];
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("diary"),
      }),
    );
  });

  it("rejects a live Skill that cites a retired Fact", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].retired = true;
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "S1",
        message: expect.stringContaining("F1"),
      }),
    );
  });

  it("rejects a live Fact whose parent is retired", () => {
    const errors = errorsFor((raw) => {
      experiences(raw)[0].retired = true;
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("E1"),
      }),
    );
  });

  it("rejects a live Fact that is related to a retired Fact", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].related = ["F2"];
      facts(raw).push({
        ...facts(raw)[0],
        id: "F2",
        related: [],
        retired: true,
      });
    });
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: "F1",
        message: expect.stringContaining("F2"),
      }),
    );
  });

  it("lets a retired Fact cite a retired parent", () => {
    const raw = validRaw();
    experiences(raw)[0].retired = true;
    facts(raw)[0].retired = true;
    skills(raw)[0].retired = true;
    expect(validateProfile(yamlOf(raw)).ok).toBe(true);
  });

  it("reports every error in one pass, not only the first", () => {
    const errors = errorsFor((raw) => {
      facts(raw)[0].tags = ["devops"];
      skills(raw)[0].evidence = [];
    });
    const ids = errors.map((e) => e.id);
    expect(ids).toContain("F1");
    expect(ids).toContain("S1");
  });
});
