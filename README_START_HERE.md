# ADITYA — Kickoff package

Prepared for Aditya Pingle · 10 November 2026.

## Files

- `aditya-knowledge.json` — 92 seed facts, grouped by topic, each with provenance metadata, date, subject and sensitivity. **Candidate profile, not guaranteed complete/current.**
- `ADITYA_BRAIN_ARCHITECTURE.md` — IA, data model, memory pipeline, import requirements, Gmail OAuth and privacy/security architecture.
- `CLAUDE.md` — actionable coding agent instructions, Sprint 1 scope and acceptance tests.

## Start

1. Create an empty private repo/folder for the app.
2. Put all three files into the repo root.
3. Open folder in VS Code, start Claude Code, and say: **“Read CLAUDE.md and execute Sprint 1. Implement the app, don't just plan it.”**
4. Add your own MongoDB Atlas URI and Anthropic API key in `.env.local` following the generated `.env.example`. Never commit keys or raw conversation exports.
5. Review sensitive knowledge seed records before import; mark false/stale facts and possible mother-authored content.
6. Separately export ChatGPT through Settings → Data controls → Export data, then import after the importer exists. Per-chat WhatsApp exports can be imported in Sprint 2.
7. Configure Google OAuth within **your own app** for your multiple mailbox accounts in Sprint 3. Nothing in this package requires the ChatGPT Gmail connection.

## Privacy heads-up

This seed may include relationship, family, personal contact and health data. Keep the repo private and place any original WhatsApp/ChatGPT/email exports outside version control. If this is ever published, remove seed personal data or move it to an encrypted private fixture.
