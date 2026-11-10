// Manual check with a real key: imports data/master-profile.yaml, judges N Postings with a full description, prints the answers.
// Usage: pnpm --filter api jev:sample [count]. Sends the profile's fit summary to TypeSafe and is billed.
import { existsSync, readFileSync } from "node:fs";
import { jevConfigFromEnv, TypeSafeJevClient } from "../src/jev/jev-client";
import { JevRunner } from "../src/jev/jev-runner";
import { CAP_NAMES } from "../src/jev/question-set";
import { MasterProfileService } from "../src/master-profile/master-profile.service";
import { PrismaService } from "../src/prisma/prisma.service";

async function main() {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const count = Number(process.argv[2] ?? 10);
  const config = jevConfigFromEnv();
  if (!config) throw new Error("TYPESAFE_API_KEY is empty in .env");
  const prisma = new PrismaService();
  try {
    const yaml = readFileSync("../../data/master-profile.yaml", "utf8");
    const imported = await new MasterProfileService(prisma).import(yaml);
    console.log(`Profile version ${imported.version.slice(0, 12)}`);

    const postings = await prisma.posting.findMany({
      where: { descriptionKind: "full", jevJudgements: { none: {} } },
      orderBy: { id: "asc" },
      take: count,
      select: { id: true },
    });
    const ids = postings.map((p) => p.id);
    const counts = await new JevRunner(
      prisma,
      new TypeSafeJevClient(config),
    ).run({ postingIds: ids });

    const rows = await prisma.jevJudgement.findMany({
      where: { postingId: { in: ids } },
      include: { posting: { select: { title: true } } },
      orderBy: { postingId: "asc" },
    });
    for (const r of rows) {
      const a = r.answers as Record<string, Record<string, unknown>>;
      const caps = CAP_NAMES.map(
        (c) => `${c}=${Number(a[c]?.noul).toFixed(2)}`,
      ).join(" ");
      console.log(
        `\n#${r.postingId} ${r.posting.title}\n  model=${r.model} tokens=${r.inputTokens}` +
          `\n  skills=${a.skills_covered?.score} level=${a.level_match?.score}` +
          ` role=${a.role_family?.choice} work=${a.work_arrangement?.choice}\n  ${caps}`,
      );
    }
    console.log(
      `\nfound=${counts.found} judged=${counts.judged} failed=${counts.failed}`,
    );
    if (counts.judged === 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
