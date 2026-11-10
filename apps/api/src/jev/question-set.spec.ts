import { CAP_NAMES, capsStated } from "./question-set";

const answers = (nouls: Record<string, number>) =>
  Object.fromEntries(
    CAP_NAMES.map((name) => [name, { type: "noul", noul: nouls[name] ?? 0 }]),
  );

describe("capsStated", () => {
  it("applies outside_gta from 0.5", () => {
    expect(capsStated(answers({ outside_gta: 0.52 }))).toEqual(["outside_gta"]);
    expect(capsStated(answers({ outside_gta: 0.49 }))).toEqual([]);
  });

  it("keeps the other caps at 0.7", () => {
    expect(
      capsStated(answers({ closed_to_juniors: 0.61, requires_french: 0.7 })),
    ).toEqual(["requires_french"]);
  });
});
