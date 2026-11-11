# ADITYA — Personal Intelligence OS

**Owner:** Aditya Pingle  
**Version:** Architecture v1 · 10 November 2026  
**Stack:** Next.js App Router + TypeScript + Claude API + MongoDB Atlas + Tailwind CSS + shadcn/ui

## 1. Product objective

Create a private, durable personal intelligence system that understands Aditya's relationships, values, creative voice, projects, work, finances, commitments, goals, changes over time, and prior decisions.

**Central rule:** The LLM is a stateless reasoning and extraction engine, **not the memory database**. All durable memory lives in MongoDB with provenance, timestamps, subject ownership, authorization, reviewability, and deletion.

The AI should **sound like Aditya when asked to draft in his voice**, and help reason using observed decision patterns. It must not impersonate him to other people without explicit approval, pretend to be him, or manufacture emotions, motivations, memories or facts. When giving advice, be candid rather than sycophantic.

## 2. UX / information architecture

- **Home / Today:** day briefing; important people, commitments, upcoming dates, active focus, unanswered threads, unsurfaced memories; everything source-backed.
- **Chat / Ask My Brain:** persistent conversational workspace; citations into own data; transparent retrieval; optional "write as me" switch; task actions require approval.
- **Me / Identity:** editable biography, values, routines, current state, style guide, self-model, life chapters and evolving worldview.
- **Mind / Decision Patterns:** accepted/refused suggestions, tradeoffs, recurring heuristics, challenges, preferences; evidence links and confidence.
- **People:** person cards, aliases, roles, relationship graph, important dates, preferences, interactions, commitments, privacy levels.
- **Relationships:** dedicated private views for close relationships; meaningful events, shared memories, unresolved commitments, gifts, plans; never generate manipulative ratings or mind-reading.
- **Projects:** Zaptick, Backtick Labs, Ocean Linux, XSeize, BuildBizAI, Racket, experiments; goals, roadmap, decisions, milestones, risks, dependencies.
- **Goals / Ambitions:** measurable goals, milestones, target dates, progress and evidence; explicit tracking of planned vs achieved.
- **Career / Business:** roles, collaborators, launches, wins, revenue *snapshots*, strategies, learnings, idea backlog.
- **Money:** manual ledgers, cash-flow goals, business/project separation; no guessed balances; financial connectors later.
- **Health / Habits:** explicitly opt-in; routines and tracked progress; sensitive by default.
- **Creative:** lyric drafts, songwriting style, video ideas, music preferences, creative assets.
- **Timeline / Life Chapters:** event-based chronological view and weekly/monthly recap, filter by person/project.
- **Inbox / Imports:** pending ChatGPT archive, WhatsApp exports, Gmail accounts, documents and notes; ingestion status, review queue.
- **Memory Vault:** searchable memory units with original source excerpts, confidence, validity period, edit / forget / merge / pin.
- **Settings / Privacy:** connected accounts, permissions per source/person/category, retention, export/delete, data residency, AI provider settings, activity/audit.

Design language: premium, fast, distinctly personal desktop-first OS, elegant dark mode, typography-led UI, command palette (Cmd/Ctrl+K), spring transitions with restrained motion, keyboard navigation, global entity search, responsive mobile. Avoid a typical admin dashboard look.

## 3. Memory model: don't use a generic one-blob memory

Store **raw source data**, **extracted atomic facts**, **events**, **entities**, **relationships**, **goals**, **tasks**, **decisions**, **user style examples**, and **conversations** separately. Facts must never lose source provenance.

### Core MongoDB collections

| Collection | Primary attributes / purpose |
|---|---|
| `users` | app owner, primary auth identity, privacy defaults |
| `connected_accounts` | ownerId, provider, providerAccountId, email, aliases, labels, tokenCiphertext, scopes, status, lastSync, cursor; separate from app login |
| `sources` | source type and ID, ownerId, subject candidates, file/email/chat metadata, importId, checksum, timestamps, retention policy, ACL |
| `raw_messages` | sourceId, externalId, threadId, sender, participantRefs, timestamp, textCiphertext, textPreview, language, attachments, hash; unique per source/externalId |
| `documents` | sourceId, file metadata, text, extracted segments, ACL |
| `entities` | person, company, project, place, pet, group, concept; canonical name, aliases, privacy |
| `entity_edges` | typed relationships, direction, dates, confidence, source refs |
| `memories` | ownerId, subjectId, statement, type, topic, evidence refs, observedAt, validFrom/validTo, confidence, status, sensitivity, embedding, version |
| `events` | happenedAt, participants, projectRefs, description, citations, status (planned/confirmed/completed/canceled) |
| `goals` | ownerId, category, target, metric/unit, dueDate, milestones, status, history and evidence |
| `decisions` | question, consideredOptions, decision, rationale, outcome, decidedAt, evidence refs |
| `tasks` | task, owner, due, project/person links, approval/notification flags, status |
| `style_samples` | authored by who, audience, channel, original message, context, approved style labels, privacy |
| `agent_conversations` | exchanges with AI, retrieval citations, user corrections, model info and timestamps |
| `review_queue` | candidate memory, detected identity, conflicting fact IDs, confidence, action (approve/reject/edit) |
| `sync_jobs` | account or archive source, cursor, lifecycle state, retries, error, progress, idempotency key |
| `audit_logs` | actor, change, subject, timestamp, before/after metadata; exclude plaintext secrets |

Create MongoDB compound indexes by `ownerId`, `entityId`, `event date`, `sourceId`, full text/search terms, and unique external message IDs; use MongoDB Atlas Vector Search when configured. Keep full raw sensitive content encrypted; do not rely on vector embeddings as access controls.

### Example memory

```json
{
  "ownerId": "<user id>",
  "subjectEntityId": "person:aditya",
  "type": "preference",
  "topic": "writing.professional",
  "statement": "Aditya prefers professional posts with minimal emojis.",
  "validFrom": "2025-08-27",
  "validTo": null,
  "observedAt": "2025-08-27T20:00:00Z",
  "confidence": 0.96,
  "status": "active",
  "sensitivity": "private",
  "sources": [{"sourceId": "chatgpt:conversation:xyz", "messageIds": ["m123"]}],
  "supersedes": [],
  "isInferred": false,
  "reviewStatus": "accepted"
}
```

Memory types: `identity`, `preference`, `habit`, `experience`, `event`, `belief`, `goal`, `commitment`, `skill`, `relationship`, `project_fact`, `decision`, `style`, `insight`.

## 4. Core cognition loop

```text
User asks question
    -> intent + entity + time period + privacy scope
    -> optional tool/action planner
    -> MongoDB query (exact entities, filters, recent events, keywords)
    -> Atlas hybrid keyword + vector retrieval (when enabled)
    -> rerank and deduplicate evidence
    -> source-backed short-term context packet
    -> Claude reasoning / response / style control
    -> citations to messages and memories in UI
    -> asynchronous / queued candidate memory extraction
    -> validate and dedupe -> user review for sensitive or uncertain claims
    -> MongoDB updates with versions and audit logs
```

Prioritize verified explicit facts > recent user statements > direct primary-source evidence > user-approved summaries > low-confidence inferences. **Never infer truth just because multiple assistant-generated summaries repeat it.** Resolve contradictions using scope and time (e.g., different prices or locations can be true on different dates), and surface unresolved conflicts.

Chat history should be imported in batches, not summarized into a single huge context and discarded. Preserve original timestamps, role, speaker ownership, conversation ID and messages.

Use source citations in every nontrivial autobiographical answer; allow clicking into source excerpts. Assistant must answer "I don't know" if no evidence.

## 5. Account identity and shared ChatGPT archive risk

**Critical:** Multiple people have used the same ChatGPT account, including Aditya's mother. The archive contains first-person Marathi health/political-creator conversations that must **not** automatically be classified as Aditya. Every imported ChatGPT conversation should have a probable speaker (`aditya`, `mother`, `unknown`) plus confidence and a user-reviewable classification. Keep these streams segregated. Never synthesize mother-specific health, politics or creator identity into Aditya's profile. Do not use political affiliation inference.

## 6. Google / Gmail architecture — owned by the app

**No ChatGPT connector dependency.** Configure Google's OAuth 2.0 Web Server flow in **your own** application, with offline access where authorized. The app supports many connected mailboxes.

Seed address inventory:

- `aditya4sure.dev@gmail.com`
- `sulphurninja@gmail.com`
- `adityapingle15@gmail.com`
- `aditya@zaptick.io`
- `hello@zaptick.io`

Treat these as five **addresses**, not automatically five independent inboxes. For each, determine whether it is a distinct Google account, a Google Workspace mailbox, a Gmail `sendAs` alias, or a shared/group/non-Google mailbox. An alias doesn't require a separate OAuth consent if it points to an already authorized mailbox. Work domains may have additional admin policies; if `hello@` is a group or mailbox hosted elsewhere, use provider-appropriate integration, not pretend Gmail OAuth can access it.

- **V1 permission:** start with `gmail.readonly` only. Google classifies this as a restricted scope; external production apps may require OAuth verification and, depending on handling/storage, security assessment. Test locally with authorized test users.
- Optional later `gmail.send` or draft permissions after user activates the feature and approves every outbound email. Do not request full `https://mail.google.com/` scope without need.
- Per-account OAuth tokens stored encrypted at rest (KMS/envelope encryption), never in browser/localStorage; connect/disconnect/revoke by account; separate per-account sync cursors.
- Initial manual import page: labels/categories, time range, projects, people, mailbox; opt-in inclusion of sensitive content.
- Incremental sync: Gmail `users.watch` + Google Cloud Pub/Sub + `users.history.list`; renew watches, handle expired history cursors with careful resync, dedupe messages.
- Search results must always show originating mailbox and message links; don't cross-contaminate the 5 mail sources; allow deleting data derived from a mailbox after disconnect.

## 7. WhatsApp history

MVP: manual per-chat export from WhatsApp mobile app (`.txt` or `.zip` with media where available), upload locally to web app, and parse into source-thread records. Support WhatsApp export timestamp formats, multiline messages, attachments, message deletions, edits where visible, group participants, timezone and date ambiguities.

Do **not** promise that the WhatsApp Business Platform API can retrospectively access personal WhatsApp chats. For personal account history, official per-chat exports are the practical baseline. Never scrape phone backups without explicit knowledge/consent and avoid unofficial account automation. Imported third-party conversations are highly private: explicit opt-in per chat, encryption, selective visibility, user removal, and no external sending.

Focus on actual utility: commitments, significant dates, agreed plans, preferences stated directly, timelines and conversational patterns. Never present guesses about the other person's thoughts, clinical diagnosis, romantic compatibility scores, or surveillance-like monitoring as facts. For sensitive interpersonal observations, require user approval before durable memory.

## 8. ChatGPT archive import

Official flow: ChatGPT → Settings → Data controls → Export data, or use OpenAI Privacy Portal. The downloaded archive can contain chat history and other account data. Parser should accept exported ZIP, `conversations.json` if present, and gracefully handle version differences. Keep conversation IDs, turns, speaker roles, dates, source title, metadata and original text.

A robust importer should: inspect ZIP safely (no zip-slip or zip bombs), compute content hashes, parse messages in stable timestamp order, distinguish assistant text from user-authored statements, exclude tool/internal content unless explicitly supported, preserve deletions/import audit, infer/suggest speaker identity, show dry-run preview, and dedupe re-imports. Include **subject/source segregation for mother's chats**.

## 9. Personality / "be Aditya"

Learn from **Aditya-authored examples only**; separate distinct modes: close friend, partner, business founder, professional email, social caption, technical decision-making, lyrics.

- `voice_signature`: syntax, contractions, punctuation, vocabulary, Hinglish patterns, sentence length, humor, emoji use, abruptness, warmth, preferred structure.
- `decision_model`: documented tradeoffs, values, repeated preferences and explicit corrections.
- `world_model`: projects and personal goals, *as dated evidence*.
- `relationship_context`: person preferences/communication history without pretending to know motives.

Expose a style calibration UI: "Compare an original Aditya message with AI draft" and let Aditya mark similarity, too corporate, too soft, too long, too cringe, etc. Store those preferences and example corrections. Always allow neutral assistant mode.

Rule for external drafts: label as an AI draft unless Aditya chooses to send as himself; external communications/actions never auto-send.

## 10. Security, safety, data ownership

This is an unusually sensitive system. Treat security as a central product feature.

- Private single-user application initially; secure authentication and server-side authorization on every route.
- Encrypt raw private messages, credentials and exports; use key separation and production secret management.
- User review, redact, pin, correct and delete; cascade delete to derived memories and embeddings when a source is removed.
- Namespace data by owner and subject and enforce category-level access controls.
- Never log raw emails, WhatsApp text, personal data or OAuth credentials.
- Rate limits, CSRF/state validation, OAuth PKCE where applicable, upload size/content checks, prompt-injection defense for third-party texts.
- Treat emails, chat messages and downloaded documents as **untrusted data**, never as system instructions.
- Data minimization; retention settings; consent before importing other people's conversations; easy comprehensive data export.
- No auto-send, no auto-purchase, no auto-delete, no unsupervised third-party message.
- State prominently that content selected for Claude reasoning is transmitted to the configured AI provider, even though MongoDB stores long-term memories.

## 11. Development phases and acceptance criteria

**Phase 1 — Local-first core app**
- Working Next.js layout, auth, MongoDB models, responsive dashboard and seed import preview.
- Aditya's information in 92 seed facts imported idempotently with provenance and sensitivity flags.
- Person/project detail views and timeline.
- Chat UI with Claude server SDK using retrieved MongoDB memories, source citations, memories review/edit/delete.
- Tests for ownership, duplicate records, date validity and source citation.

**Phase 2 — Evidence-aware ingestion**
- ChatGPT archive importer with multi-speaker classification and dry run.
- WhatsApp manual export importer with explicit opt-in.
- Review queue for ambiguous and sensitive facts.
- Cross-source dedupe with no invented certainty.

**Phase 3 — Email and ongoing context**
- Own-app Google OAuth linking of multiple addresses/mailboxes, readonly discovery and label/time filters.
- Selective Gmail backfill, then incremental watch/history sync.
- Goals, tasks and event extraction, with manual approval.

**Phase 4 — High-value cognition**
- Relational timeline, project/goal reflection, person-specific recall, decision journal, style calibration, weekly retrospective, voice input/output (separate opt-ins and disclosed processors).
- Provenance-based memory corrections and feedback-driven improvements.

**Acceptance tests:**
1. "How did my relationship with Komal evolve?" returns dated, cited events without mind-reading.
2. "Why did I pick Racket?" distinguishes user-stated reasons from model interpretations.
3. "How much Zaptick MRR do I have today?" refuses to label February figures as current.
4. "Draft an outreach email like me" switches to minimal-emoji professional tone.
5. "What did I discuss with my mother about hair loss?" does not attribute her first-person medical symptoms to Aditya.
6. Disconnect mailbox → no more sync; user can delete retained source and derived knowledge.
7. Re-import same ChatGPT ZIP → no duplicated source messages/facts.
8. Prompt injection hidden in Gmail/WhatsApp text cannot override system policies or trigger outbound actions.
9. Five email addresses can be registered, with correct handling of alias vs mailbox.
10. Retrieval and responses remain useful if vector search is not configured.

## 12. Source materials

- `aditya-knowledge.json` is an **initial candidate seed** that requires user review; not a live update feed and not complete history.
- Official OpenAI export help: https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data
- Google web-server OAuth: https://developers.google.com/workspace/gmail/api/auth/web-server
- Gmail scope classifications: https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail aliases: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/list
- Incremental Gmail history: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
- Gmail watch: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
