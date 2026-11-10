import { createHash } from "node:crypto";
import {
  CAP_NAMES,
  CapName,
  ROLE_FAMILIES,
  WORK_ARRANGEMENTS,
} from "../jev/question-set";

type Role = (typeof ROLE_FAMILIES)[number];
type Work = Exclude<(typeof WORK_ARRANGEMENTS)[number], "not_stated">;

export interface TierConfig {
  // Share of the combined Score that skills covered gets; level match gets the rest.
  scoreWeight: number;
  rolePoints: Record<Role, number>;
  // not_stated is not a key: it always adds zero.
  workPoints: Record<Work, number>;
  // P(yes) at or above which a Tier cap applies.
  capThresholds: Record<CapName, number>;
  thresholds: { a: number; b: number };
}

const ROLE_ORDER = [
  "full_stack",
  "back_end",
  "front_end",
  "cloud_ops",
  "support",
  "other",
] as const;
const WORK_ORDER = ["hybrid", "remote", "on_site"] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new Error(
      `tier config: ${path} must be a number from ${min} to ${max}`,
    );
  return v;
}

function group<K extends string>(
  v: unknown,
  path: string,
  keys: readonly K[],
  min: number,
  max: number,
): Record<K, number> {
  if (!isObject(v)) throw new Error(`tier config: ${path} must be an object`);
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = num(v[k], `${path}.${k}`, min, max);
  return out;
}

function inOrder(points: Record<string, number>, order: readonly string[]) {
  for (let i = 1; i < order.length; i++)
    if (points[order[i]] > points[order[i - 1]])
      throw new Error(
        `tier config: breaks the preference order, ${order[i]} is above ${order[i - 1]}`,
      );
}

// The version is the hash of the exact bytes, so any edit, even whitespace, is a new version.
export function loadTierConfig(raw: string): {
  config: TierConfig;
  version: string;
} {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("tier config: not valid JSON");
  }
  if (!isObject(json)) throw new Error("tier config: must be an object");
  const config: TierConfig = {
    scoreWeight: num(json.scoreWeight, "scoreWeight", 0, 1),
    rolePoints: group(json.rolePoints, "rolePoints", ROLE_ORDER, 0, 1),
    workPoints: group(json.workPoints, "workPoints", WORK_ORDER, 0, 1),
    capThresholds: group(json.capThresholds, "capThresholds", CAP_NAMES, 0, 1),
    thresholds: (() => {
      const t = group(
        json.thresholds,
        "thresholds",
        ["a", "b"] as const,
        -10,
        10,
      );
      if (t.a <= t.b)
        throw new Error("tier config: thresholds.a must be above thresholds.b");
      return t;
    })(),
  };
  inOrder(config.rolePoints, ROLE_ORDER);
  inOrder(config.workPoints, WORK_ORDER);
  return {
    config,
    version: createHash("sha256").update(raw).digest("hex"),
  };
}
