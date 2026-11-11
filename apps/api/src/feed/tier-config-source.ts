import { readFileSync } from "node:fs";
import { loadTierConfig, TierConfig } from "../tiers/tier-config";

// Abstract classes double as Nest injection tokens; tests replace this one with a fixed config.
export abstract class TierConfigSource {
  abstract load(): { config: TierConfig; version: string };
}

// Read on every call so an edit to the file shows without a restart. The path is relative to apps/api, like tier:recompute's.
export class FileTierConfigSource extends TierConfigSource {
  load(): { config: TierConfig; version: string } {
    const path =
      process.env.TIER_CONFIG_PATH ?? "../../config/tier-config.json";
    return loadTierConfig(readFileSync(path, "utf8"));
  }
}
