// Recomputes every Tier from stored judgements. Usage: pnpm tier:recompute [--seed-thresholds] [--config path]
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  recomputeTiers,
  thresholdsByRank,
  uncappedTotals,
} from "../src/tiers/recompute";
import { loadTierConfig } from "../src/tiers/tier-config";

async function main() {
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const args = process.argv.slice(2);
  const flag = args.indexOf("--config");
  const path = flag >= 0 ? args[flag + 1] : "../../config/tier-config.json";
  const prisma = new PrismaService();
  try {
    let raw = readFileSync(path, "utf8");
    let { config, version } = loadTierConfig(raw);
    if (args.includes("--seed-thresholds")) {
      const thresholds = thresholdsByRank(await uncappedTotals(prisma, config));
      raw = `${JSON.stringify({ ...JSON.parse(raw), thresholds }, null, 2)}\n`;
      ({ config, version } = loadTierConfig(raw));
      // Rename over the config so a crash mid-write never leaves it truncated.
      writeFileSync(`${path}.tmp`, raw);
      renameSync(`${path}.tmp`, path);
      console.log(`Thresholds set: a=${thresholds.a} b=${thresholds.b}`);
    }
    const c = await recomputeTiers(prisma, config, version, console.error);
    console.log(`config ${version.slice(0, 12)}`);
    console.log(
      `found=${c.found} processed=${c.processed} skipped=${c.skipped} failed=${c.failed}`,
    );
    if (c.processed === 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
