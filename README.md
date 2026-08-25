# Acebot

Voice-bot prompt generator for low-latency, cost-constrained deployments.

Acebot writes production system prompts **from first principles** — there is no reference prompt.
The logic lives in two documents that are the single source of truth:

| File | Role |
|---|---|
| [`docs/platform-rules.md`](docs/platform-rules.md) | Identical for every bot. Pasted into every generated prompt **verbatim**. |
| [`docs/prompt-structure.md`](docs/prompt-structure.md) | The method — how prompts are derived. Condensed into the generator's system prompt. |

Every rule in them exists because a real call broke without it.

## Run

```bash
cp .env.example .env      # paste ANTHROPIC_API_KEY
npm install
npm run build
npm start                 # http://localhost:3000
```

For frontend development, `npm run dev` proxies `/api` to the server on port 3000, so run
`npm start` alongside it.

## The Builder

One section for now. It collects what the generator cannot infer:

- **Client, industry, direction, goal** — direction changes the opener; the goal is what the bot
  must *earn* before asking for.
- **Persona and gender** — languages that inflect for speaker gender need the verb forms stated.
- **Languages** — first is primary. More than one generates switching rules; one generates none.
- **Tools** — the six the platform exposes. Each selection changes the prompt: Hangup makes closures
  tool-bound, Transfer turns escalations into a real handoff, API Request makes claims tool-gated,
  Date Time carries the past-date rules.
- **Knowledge base** — PDF, DOCX, images or text. Only speakable facts are extracted.
- **Requirements** — anything the industry and goal don't imply.

Output carries a token meter against the 4,000 ceiling.

## Prompt anatomy

```
# PLATFORM RULES          ~1,500 tok   constant, verbatim, never edited per client
---
# USE CASE                ~2,700 tok   the only half that is generated
  Who you are · Check before every turn · Facts
  Boundary requests · Steps · Closures · Objections · Capture
```

A use-case section may never restate or soften a platform rule. If a client needs different
behaviour, the platform rule changes for everyone.

## Worked example

`prompts/` holds the healthcare bot this method was developed against, versioned so each fix is
traceable. `prompts/baseline/` is the original production prompt with 29 defects, kept as the
measured before.

## Carried over from Bob the Builder

The Anthropic proxy in `server.js`, largely unchanged — SSE reassembly so long generations never hit
undici's header timeout, keep-alive whitespace so a reverse proxy never returns 504, and retry on
both HTTP status and thrown socket errors. The rest of Acebot is a different tool: Bob adapted a
reference prompt, Acebot derives one.
