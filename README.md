# ADITYA — second brain

Private, single-owner personal intelligence app. **MongoDB is the memory; Claude is only the reasoning layer.** Every memory has provenance, dates, a review state and can be corrected, redacted or deleted.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

| Variable | What |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Atlas (or local) — all long-term memory |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `ANTHROPIC_EFFORT` | Reasoning + memory extraction |
| `OWNER_PASSPHRASE` | Single-owner sign-in |
| `SESSION_SECRET` | 48 random bytes, base64 — signs the session cookie |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64 — AES-256-GCM for chat messages, wallpapers, future tokens. **Back it up**: losing it makes imported chats unreadable. |

Checks: `npm run check` (typecheck + lint + 60 unit tests). On Windows run it from `D:\Aditya`, not `d:\Aditya` (vitest breaks on a lowercase drive letter).

## What works

- **Chat (home)** — five modes: Brain (candid second brain), Me·casual, Me·pro, Me·warm, Creative. Streaming answers with clickable `[M#]` citations into the vault. Answers "I don't know" without evidence, never presents historical snapshots as current, never attributes Mom's content to you. Per-chat **wallpapers** (presets or your own photo). "Learn" proposes memories from a chat — saved only after approval.
- **WhatsApp & Instagram** (`/chats`) — import a WhatsApp export (`.txt`/`.zip`, iOS + Android formats) or the Instagram "Download your information" zip (JSON). Parsing happens **in the browser**; only the chosen conversation is uploaded, encrypted per message. Re-imports merge without duplicates. Each chat: WhatsApp-style viewer with wallpaper, in-chat search, **Ask about this chat**, **Learn memories**, **Teach my voice** (turns your own messages into style samples), full delete.
- **Chat media**: exports with media (even 700 MB+) are read by random access in the browser. Photos and one frame per video are shrunk to ~60 KB and stored as encrypted files on local disk (`private/media`, git-ignored, override with `MEDIA_DIR`), never in MongoDB. MongoDB only keeps the text Claude writes when it describes them on demand ("describe photos", with a cost estimate; `ANTHROPIC_MEDIA_MODEL` picks the model). Descriptions feed search, "ask about this chat" and learning. Voice notes are kept as markers: the Claude API can't take audio, so transcription needs a speech-to-text provider (planned).
- **Memory** — seed importer (dry-run, exclusions, idempotent, never overwrites what you reviewed), vault with filters, detail pages with provenance/versions/audit, correct (supersede, never overwrite), confirm/reject, pin, redact, hard delete. Review queue with bulk-confirm for non-sensitive facts.
- **Life views** — People, Relationships, Projects (snapshots vs direction), Goals, Career, Money, Health (blurred), Creative, Timeline, Pulse dashboard, Me & voice studio, Ctrl+K search, 5 accent themes, light/dark.
- **Security** — passphrase login with signed HttpOnly SameSite=Strict cookie, proxy + per-route auth, same-origin check on every mutation, login rate-limit, Zod on every input, typed confirmation for destructive actions, imported text treated as data (prompt-injection-safe evidence escaping), no telemetry. Sensitive memories can be excluded from what's sent to Claude.

## Claude connection (MCP)

The brain is also an MCP server, so Claude (Claude Code, desktop, phone, scheduled routines) can use it on your Claude subscription, next to Claude's own Gmail / Calendar / Drive connectors. The app's own chat keeps using `LLM_PROVIDER` (OpenAI by default). Both read and write the same MongoDB.

- Endpoint: `/api/mcp`, secured by `MCP_TOKEN` (32+ random chars) as `Authorization: Bearer <token>`, or as a secret path `/api/mcp/<token>` for the Claude app's custom connectors (they can't send headers). Stateless, no sessions.
- Tools: `brain_context`, `search_memory`, `list_memories`, `get_person`, `search_chats`, `remember`, `correct_memory`, `forget_memory`, `list_tasks`, `add_task`, `update_task`, `voice`. Facts Claude only inferred (from mail etc.) go to the review queue; things you tell it are saved directly. Corrections supersede, never overwrite.
- Every tool call is written to the audit log (tool name only) and shown in Settings, "what claude did lately".
- Claude Code here: `claude mcp add --transport http -s local aditya http://localhost:3000/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"` (Settings shows the exact command). Local scope keeps the token out of the repo.
- Claude app (desktop/phone): needs the app on a public HTTPS address (VPS or tunnel). Add `https://<host>/api/mcp/<MCP_TOKEN>` as a custom connector.
- Slash commands in `.claude/commands`: `/brief` (morning brief from brain + Gmail + Calendar) and `/sweep [days]` (pulls promises, follow-ups and facts from recent mail into the brain, after you approve). Neither ever sends, replies or edits events.
- **Todos** (`/todos`): todos, promises (commitment), follow-ups and reminders, grouped by overdue / today / this week. Claude adds to the same list; those show a bot tag with their source.
- Chat search speed: Atlas free tier is slow for whole-chat reads, so each chat keeps an encrypted local copy in `private/media/threads` (rebuilt automatically when the chat changes). First search of a big chat takes ~1 to 3 min, then a few seconds.

## Voice mode (/talk)

An animated orb you talk to, like Jarvis. Speech goes to ElevenLabs Scribe (speech-to-text), the brain answers through the normal chat pipeline (same memories, money, todos), and the reply is spoken with ElevenLabs Flash, sentence by sentence as it streams so it starts talking fast. Tap the orb (or space) to talk, tap again to interrupt, esc to stop. Hands-free keeps listening after each reply.

- Env: `ELEVENLABS_API_KEY` (required), `ELEVENLABS_VOICE_ID` (optional, default a premade voice), `ELEVENLABS_TTS_MODEL` / `ELEVENLABS_STT_MODEL` overrides.
- Cost control: Flash TTS (cheapest model), spoken replies forced to 1 to 3 sentences, recordings stop on silence and cap at 45 s, and hard monthly caps (`VOICE_MONTHLY_CHAR_CAP`, `VOICE_MONTHLY_STT_MINUTES`) metered in `voice_usage`. The page shows usage plus what ElevenLabs reports for the plan. "Text replies" mode skips TTS entirely.
- The key never reaches the browser; audio is sent to ElevenLabs only for that turn and not stored by the app.

## Not built yet

- ChatGPT archive importer with Aditya/Mother speaker classification (Sprint 2 — export your data now).
- Gmail / Calendar now come through Claude's own connectors over MCP (see above), not an in-app OAuth sync. Only your main Google account is connected there; other addresses need forwarding or their own connector.
- Deploy (VPS + HTTPS) so the Claude app and scheduled routines can reach the brain.
- Vector search (keyword + entity + section retrieval works without it), voice, proactive insights.
- Playwright E2E tests (unit tests + a scripted API smoke test were run).

## Privacy notes

`aditya-knowledge.json`, `.env*`, `/imports`, `/private` and `*.zip` are git-ignored. Content the model reasons over (retrieved memories, chat excerpts, style samples for the active mode) is sent to the configured provider (OpenAI or Anthropic) per request. When you use Claude over MCP, whatever its tools return goes to Anthropic under your Claude account. Everything else stays in your database and on your disk.
