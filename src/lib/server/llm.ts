import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { claude, describeApiError as describeAnthropicError, fallbackParams, modelConfig as anthropicConfig } from "./claude";
import { env } from "./env";

/**
 * One switch for the model provider (LLM_PROVIDER=anthropic|openai).
 * Everything in the app (chat, learning, digests, voice, photos) goes through here.
 */

export type Provider = "anthropic" | "openai";
/** "none" = no reasoning (fast rewrites); Anthropic has no such level, so it maps to "low" there. */
export type Effort = "none" | "low" | "medium" | "high";
const anthropicEffort = (e: Effort) => (e === "none" ? "low" : e);
export type LlmImage = { base64: string; mediaType: "image/jpeg" };
export type LlmMessage = { role: "user" | "assistant"; content: string };

export function provider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (p === "openai") return "openai";
  if (p === "anthropic") return "anthropic";
  return env().ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : "anthropic";
}

export function llmInfo() {
  if (provider() === "openai") {
    const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
    return { provider: "openai" as const, model, bulkModel: process.env.OPENAI_BULK_MODEL ?? model, configured: Boolean(process.env.OPENAI_API_KEY) };
  }
  const { model } = anthropicConfig();
  return { provider: "anthropic" as const, model, bulkModel: env().ANTHROPIC_MEDIA_MODEL ?? model, configured: Boolean(env().ANTHROPIC_API_KEY) };
}

let oa: OpenAI | null = null;
function openai(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  if (!oa) oa = new OpenAI({ apiKey: key, maxRetries: 2 });
  return oa;
}

export class LlmError extends Error {}

export function describeLlmError(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) return "OpenAI rejected the API key. Check OPENAI_API_KEY.";
    if (err.status === 429) return /quota|billing/i.test(err.message) ? "OpenAI says you're out of credits." : "OpenAI is rate limiting, try again in a sec.";
    if (err.status === 404) return "That OpenAI model isn't available on your key. Check OPENAI_MODEL.";
    return `OpenAI error (${err.status ?? "?"}): ${err.message.slice(0, 160)}`;
  }
  if (err instanceof Anthropic.APIError || err instanceof Anthropic.APIConnectionError) return describeAnthropicError(err);
  return err instanceof Error ? err.message : "The model call failed.";
}

type StreamEvent = { type: "text"; delta: string } | { type: "done"; model: string; refused: boolean; usage: { input: number; output: number; cacheRead: number } };

/** Stream a chat answer as text deltas, then a final "done" event. */
export async function* streamText(args: { system: string; messages: LlmMessage[]; maxTokens?: number; effort?: Effort }): AsyncGenerator<StreamEvent> {
  const info = llmInfo();
  if (info.provider === "openai") {
    const stream = await openai().chat.completions.create({
      model: info.model,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: args.maxTokens ?? 8000,
      ...(/^(gpt-5|gpt-6|o\d)/.test(info.model) ? { reasoning_effort: args.effort ?? "low" } : {}),
      messages: [{ role: "system", content: args.system }, ...args.messages],
    });
    let model = info.model;
    let usage = { input: 0, output: 0, cacheRead: 0 };
    let refused = false;
    for await (const chunk of stream) {
      model = chunk.model ?? model;
      const d = chunk.choices[0]?.delta;
      if (d?.content) yield { type: "text", delta: d.content };
      if (d?.refusal) refused = true;
      if (chunk.usage) usage = { input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens, cacheRead: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0 };
    }
    yield { type: "done", model, refused, usage };
    return;
  }
  const s = claude().beta.messages.stream({
    model: info.model,
    max_tokens: args.maxTokens ?? 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: args.effort ? anthropicEffort(args.effort) : anthropicConfig().effort },
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: args.messages,
    ...fallbackParams(info.model),
  });
  for await (const ev of s) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", delta: ev.delta.text };
  const final = await s.finalMessage();
  yield { type: "done", model: final.model, refused: final.stop_reason === "refusal", usage: { input: final.usage.input_tokens, output: final.usage.output_tokens, cacheRead: final.usage.cache_read_input_tokens ?? 0 } };
}

/** Structured JSON output validated against a Zod schema. Optional images (vision). */
export async function parseJson<S extends z.ZodType>(args: {
  system: string;
  user: string;
  schema: S;
  name: string;
  images?: LlmImage[];
  maxTokens?: number;
  effort?: Effort;
  bulk?: boolean;
}): Promise<{ data: z.infer<S>; model: string }> {
  const info = llmInfo();
  const model = args.bulk ? info.bulkModel : info.model;
  if (info.provider === "openai") {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      ...(args.images ?? []).map((i) => ({ type: "image_url" as const, image_url: { url: `data:${i.mediaType};base64,${i.base64}`, detail: "low" as const } })),
      { type: "text" as const, text: args.user },
    ];
    const res = await openai().chat.completions.parse({
      model,
      max_completion_tokens: args.maxTokens ?? 16000,
      ...(/^(gpt-5|gpt-6|o\d)/.test(model) ? { reasoning_effort: args.effort ?? "medium" } : {}),
      response_format: zodResponseFormat(args.schema, args.name),
      messages: [
        { role: "system", content: args.system },
        { role: "user", content },
      ],
    });
    const msg = res.choices[0]?.message;
    if (!msg || msg.refusal || !msg.parsed) throw new LlmError(msg?.refusal ? "The model declined." : "The model returned nothing usable.");
    return { data: msg.parsed as z.infer<S>, model: res.model };
  }
  const res = await claude().messages.parse({
    model,
    max_tokens: args.maxTokens ?? 16000,
    output_config: { effort: anthropicEffort(args.effort ?? "medium"), format: zodOutputFormat(args.schema) },
    system: args.system,
    messages: [
      {
        role: "user",
        content: [...(args.images ?? []).map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.base64 } })), { type: "text" as const, text: args.user }],
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new LlmError("The model declined.");
  return { data: res.parsed_output as z.infer<S>, model: res.model };
}
