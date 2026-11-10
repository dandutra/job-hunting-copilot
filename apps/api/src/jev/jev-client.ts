import { TypeSafeClient } from "@typesafe-ai/sdk";
import { JevResponse, questions } from "./question-set";

// An alias such as jev-latest moves on each release, so thresholds tuned on one version would drift.
export const JEV_MODEL_DEFAULT = "jev-1.14.0";
const PINNED = /^jev-\d+\.\d+\.\d+$/;

export class JevCallError extends Error {
  constructor(
    // Only the status and kind are kept: an SDK error message can quote the request body.
    readonly kind: "http" | "invalid" | "network",
    readonly status?: number,
  ) {
    super(`Jev ${kind}${status ? ` ${status}` : ""}`);
  }
}

// An abstract class doubles as the Nest injection token.
export abstract class JevClient {
  abstract readonly model: string;
  abstract ask(state: unknown): Promise<JevResponse>;
}

export interface JevClientConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  backoffInitialMs?: number;
}

export function jevConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): JevClientConfig | null {
  const apiKey = env.TYPESAFE_API_KEY ?? "";
  if (!apiKey) return null;
  return {
    apiKey,
    model: env.JEV_MODEL || JEV_MODEL_DEFAULT,
    baseURL: env.TYPESAFE_BASE_URL || undefined,
  };
}

export class TypeSafeJevClient extends JevClient {
  readonly model: string;
  private readonly client: TypeSafeClient;

  constructor(config: JevClientConfig) {
    super();
    if (!PINNED.test(config.model))
      throw new Error(
        `JEV_MODEL must be a pinned version like ${JEV_MODEL_DEFAULT}`,
      );
    this.model = config.model;
    this.client = new TypeSafeClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultModel: config.model,
      // The SDK would log request details; the state holds the Master profile.
      logLevel: "off",
      compression: false,
      timeout: 60_000,
      // Only rate limits and overload retry; a 500 waits for the next poll.
      retry: {
        maxRetries: 3,
        httpStatuses: new Set([429, 529]),
        backoffInitialMs: config.backoffInitialMs ?? 1000,
        backoffMaxMs: 30_000,
      },
    });
  }

  async ask(state: unknown): Promise<JevResponse> {
    let result;
    try {
      result = await this.client.systemOne({
        model: this.model,
        state: state as never,
        questions: questions() as never,
      });
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      if (typeof status === "number") throw new JevCallError("http", status);
      throw new JevCallError("network");
    }
    const { model, answers, usage } = result as unknown as {
      model?: unknown;
      answers?: unknown;
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    };
    if (typeof model !== "string" || !model) throw new JevCallError("invalid");
    const count = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
    return {
      model,
      answers: answers as Record<string, unknown>,
      usage: {
        inputTokens: count(usage?.input_tokens),
        outputTokens: count(usage?.output_tokens),
      },
    };
  }
}
