import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!client) client = new Anthropic({ apiKey: key, maxRetries: 2 });
  return client;
}

export function modelConfig() {
  const e = env();
  return { model: e.ANTHROPIC_MODEL, effort: e.ANTHROPIC_EFFORT };
}

/** Models that accept the server-side refusal fallback in "default" routing mode. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export function fallbackParams(model: string): { betas?: string[]; fallbacks?: "default" } {
  return FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}

export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to the configured model.";
  if (err instanceof Anthropic.NotFoundError) return "The configured model wasn't found. Check ANTHROPIC_MODEL.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic is rate limiting, try again in a sec.";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your network.";
  if (err instanceof Anthropic.APIError) return `Anthropic error (${err.status ?? "?"}).`;
  return "The model call failed.";
}
