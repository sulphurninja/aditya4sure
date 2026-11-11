import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB: z.string().min(1).default("aditya"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  /** Model that describes photos/video frames from imported chats. Defaults to ANTHROPIC_MODEL. */
  ANTHROPIC_MEDIA_MODEL: z.string().min(1).optional(),
  OWNER_PASSPHRASE: z.string().min(12).optional(),
  OWNER_NAME: z.string().default("Aditya Pingle"),
  SESSION_SECRET: z.string().min(32).optional(),
  DATA_ENCRYPTION_KEY: z.string().optional(),
  SEED_FILE: z.string().default("./aditya-knowledge.json"),
  /** Secret for the MCP endpoint (/api/mcp) that Claude connects to. 32+ random chars. */
  MCP_TOKEN: z.string().min(32).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Lazily validated env, never imported by client code (server-only guard above). */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Never print values, only which keys are malformed.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export type SetupStatus = {
  mongo: boolean;
  anthropic: boolean;
  auth: boolean;
  encryption: boolean;
};

export function setupStatus(): SetupStatus {
  const e = env();
  let encryption = false;
  if (e.DATA_ENCRYPTION_KEY) {
    try {
      encryption = Buffer.from(e.DATA_ENCRYPTION_KEY, "base64").length === 32;
    } catch {
      encryption = false;
    }
  }
  return {
    mongo: Boolean(e.MONGODB_URI),
    anthropic: Boolean(e.ANTHROPIC_API_KEY),
    auth: Boolean(e.OWNER_PASSPHRASE && e.SESSION_SECRET),
    encryption,
  };
}
