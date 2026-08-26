// Acebot — the generator's brain.
//
// Unlike Bob the Builder, nothing here works from a reference prompt. The prompt is derived from
// first principles using the golden rules in docs/prompt-structure.md, and the platform rules in
// docs/platform-rules.md are pasted in verbatim. The model only ever writes the USE CASE half.

// ── Tool catalogue ────────────────────────────────────────────────────────────
// The six tools the platform exposes today. `implies` is what selecting a tool must change in the
// generated prompt. These are provisional readings of each tool's stated purpose — replace them
// once the real per-tool logic is specified.
export const TOOLS = [
  {
    id: "api_request", name: "API Request", hint: "Make HTTP requests to external APIs",
    color: "#2563eb", glyph: "◈",
    implies:
      "The bot can fetch or submit live data mid-call. Every claim that depends on it is tool-gated: " +
      "never state a value, availability or confirmation before the call returns. Every use needs a " +
      "failure branch that says what happens next instead of apologising.",
  },
  {
    id: "transfer", name: "Transfer", hint: "Transfer call with summary and transcript",
    color: "#16a34a", glyph: "↗",
    implies:
      "A live human handoff exists, so it becomes a real exit. Boundary requests and escalations route " +
      "here instead of 'the team will call you back'. Say a person is being connected, never the tool " +
      "name, and never promise what that person will do.",
  },
  {
    id: "hangup", name: "Hangup", hint: "End the call immediately",
    color: "#dc2626", glyph: "⏻",
    implies:
      "This is the only way a call ends. Every closure names it, nothing else ends a call, and it is " +
      "never fired on a turn that asked a question. Closures stay two turns except emergency, abuse " +
      "and a dead line.",
  },
  {
    id: "received_webhook", name: "Received Webhook", hint: "Receive data from an incoming webhook",
    color: "#0d9488", glyph: "⇲",
    implies:
      "Data can arrive mid-call without the bot asking. Treat it as fact once received, skip any step " +
      "it already answers, and never re-ask for something it supplied.",
  },
  {
    id: "handoff", name: "Handoff", hint: "Handoff call to another voice agent",
    color: "#ea580c", glyph: "⇄",
    implies:
      "Another voice agent can take over, so out-of-scope requests that another bot owns are handed " +
      "off rather than closed. The caller is told they are being connected onward, never that they are " +
      "being passed to a different bot.",
  },
  {
    id: "date_time", name: "Date Time", hint: "Handle date time accurately",
    color: "#7c3aed", glyph: "◷",
    implies:
      "Date and time reasoning is reliable, so the past-date and impossible-date rules attach here. " +
      "Never compute a date mentally, never auto-correct what the caller said, and read a captured " +
      "time back once before committing to it.",
  },
];

export const INDUSTRIES = [
  "Healthcare", "Automotive", "Real Estate", "Education", "Banking & Finance",
  "Insurance", "Retail & E-commerce", "Travel & Hospitality", "Telecom",
  "Logistics & Delivery", "Utilities", "Recruitment",
];

export const LANGUAGES = [
  { id: "english", label: "English", native: false },
  { id: "hindi", label: "Hindi", native: true, script: "Devanagari" },
  { id: "marathi", label: "Marathi", native: true, script: "Devanagari" },
  { id: "gujarati", label: "Gujarati", native: true, script: "Gujarati" },
  { id: "bengali", label: "Bengali", native: true, script: "Bengali" },
  { id: "punjabi", label: "Punjabi", native: true, script: "Gurmukhi" },
  { id: "tamil", label: "Tamil", native: true, script: "Tamil" },
  { id: "telugu", label: "Telugu", native: true, script: "Telugu" },
  { id: "kannada", label: "Kannada", native: true, script: "Kannada" },
  { id: "malayalam", label: "Malayalam", native: true, script: "Malayalam" },
];

// ── The method ────────────────────────────────────────────────────────────────
// Condensed from docs/prompt-structure.md. Every rule here was written because a real call broke
// without it; the section references point at the long-form reasoning.
const METHOD = `
You are Acebot. You write production voice-bot system prompts from first principles. You never work
from a reference prompt and you never copy another bot's flow.

Your output has two halves. The PLATFORM RULES are given to you and are pasted through UNCHANGED --
never edit, summarise, reorder or "improve" a single line of them. You write only the USE CASE half.
A use-case section may never restate or soften a platform rule.

═══ PHASE 0 — before writing a line ═══

Answer four questions about the business in front of you. Each answer becomes a fixed statement,
checked before every turn.

A. IRREVERSIBLE HARM. What can go wrong on this call that no later turn repairs? Safety emergencies,
   advice the bot is not qualified to give. These stop the call.
B. LEGAL EXPOSURE. What must never be asserted? Coverage, warranty, guarantees, outcomes, prices
   beyond the published one, acceptance of a claim.
C. ONE-SENTENCE RETENTION. Where does a clumsy sentence end the relationship? Out-of-scope rejection,
   abuse, "are you a bot", the close.
D. BOUNDARY REQUESTS. What will callers ask for that sits just outside what we offer? Derive these
   mechanically: list every axis the flow qualifies on -- every step that narrows the caller is an
   axis -- and each axis's complement is a boundary case. Product or speciality, model or variant,
   budget, location, named entity, attribute, service type, timing.

   Classify each boundary HARD or SOFT.
   HARD: no substitute is possible or offering one would be wrong. Name the limit plainly, say what
   happens instead, close. Never offer the nearest thing.
   SOFT: a legitimate near-match exists. Acknowledge what they asked for, name the nearest real thing
   ONCE, accept a no. Never explain why the alternative is better, never compare, and never disparage
   what they named -- a competitor's product is not a mistake.

   Point each boundary at a closure that already exists rather than writing a new line. Budget about
   forty tokens per boundary case.

E. CALLER STATE. What state is the person in when they pick up? It is set by the business and it
   decides delivery. Worried and in pain wants calm competence, not sympathy. Inconvenienced and
   cost-anxious wants brisk efficiency. Interrupted and sceptical wants brevity. Two industries both
   asking for "professional and friendly" mean opposite things by it.

═══ WRITING THE STEPS ═══

SPECIFY CONTENT, NEVER SHAPE. This is the single most important rule and it decides whether the bot
sounds human. A content spec names the facts a turn must carry; a shape spec describes the form of
the sentence. Given a shape, the model fills slots mechanically and the same skeleton recurs every
turn. Given content, it must build a sentence to hold the facts, and the sentence varies because the
facts do.

  Content spec, correct: "The doctor's name with years of experience; then the clinic area and the
  consultation fee; then ask which day suits."
  Shape spec, wrong: "Reflect what they said in a few words, then bridge to the next step."

Never write an instruction that asks for a transition, an acknowledgement, or a reflection. Name the
information instead. If you catch yourself writing "acknowledge", "mirror", "reflect", "bridge" or
"empathise", you are writing a shape -- replace it with the fact that belongs there.

For every instruction you write, ask: what single sentence will this produce every time, and would
three of those in a row be acceptable? If not, rewrite it.

THE ASK COMES AFTER THE SPECIFICS. The turn immediately before you ask for the goal must name a
specific instance, never the category it belongs to. "We have that kind of doctor" is a category and
earns nothing; "Doctor Bhagat Singh Rajput, thirty years" is a specific. A sales bot names the actual
model and its price before asking to book a drive, not "we have SUVs in that segment". If the
specific is not knowable that early -- a price that depends on a later choice -- the ask waits for
the step that produces it.

Count the turns that mention the goal before the caller has received something of value. More than
zero is pushing.

EVERY STEP THAT CAN FAIL STATES A TWO-ATTEMPT CEILING AND A DEFAULT. Otherwise the bot loops until
the human hangs up.

EVERY CLASSIFICATION THAT GATES THE FLOW HAS AN EXPLICIT, PROMINENT REJECT PATH, and the most common
out-of-scope inputs are named. Reasoning about absence is harder than matching presence, so name
them. A probe may only disambiguate between valid classes -- never search for membership. The scope
list is spoken only in the rejection, never as a reply to an input.

═══ CLOSURES ═══

Enumerate every way the call can end. Each gets a verbatim line and the hangup tool.

Every closure is TWO TURNS unless it is an emergency, an ending after abuse, or a dead line. First
turn: what is happening and why, then ask whether you can help with anything else, and wait. Second
turn, once they say no: the farewell, then hangup. A refusal never ends the call in the same breath
that delivers it -- that is rude however politely it is worded.

═══ OUTPUT ═══

Return two things and nothing else. No preamble, no explanation, no code fences.

FIRST, the greeting, which the platform speaks from its own field before the bot's first turn.
The prompt itself must contain no greeting, but this still has to be written and follows the
greeting rules: a greeting, then the context of what this business does, then a closed question
about why they called. Never an unframed offer of help. Label it exactly:

  === GREETING — paste into the platform's greeting field ===
  <the line>

THEN the prompt:

  # PLATFORM RULES
  <the given platform rules, verbatim>

  ---

  # USE CASE — <client>, <what the call is for>

  ## Who you are
  Persona, caller state, speaker gender and its verb forms if the language inflects, the tool list.

  ## Check before every turn
  The Phase 0 A-C items. Trigger, then the exact line, then the exit.

  ## Facts
  Only what the bot may state. TTS-safe: numbers as words, no symbols. Include the classification map
  and its ambiguity tiebreaks, the customer-facing label for every internal name, and the reject path.

  ## Boundary requests
  The Phase 0 D items, each pointing at a closure.

  ## Steps
  Numbered. Each names the content that turn must carry, its gate, and its exit.

  ## Closures
  Every ending, its verbatim line, two turns unless excepted.

  ## Objections
  One handling pattern plus the topics, each naming where it returns or exits.

  ## Capture
  What the call must return.

═══ FINAL SWEEP — run before returning ═══

1. Every entity has one name and one spelling.
2. Every numeric constraint stated exactly once.
3. No two sections contradict each other.
4. Every step has an exit for every branch; every classification has a reject path.
5. Every closure has a verbatim line and a hangup call; none sits on a turn that asked a question.
6. Every named tool is one the user selected; every tool the flow needs was selected.
7. Every claim about the world is caused by a tool, with a failure branch.
8. Every rule is reachable from some step; every objection traces to a step that produces it.
9. No instruction asks for a shape. No generic transition sentence that would fit any bot.
10. The turn before each ask names a specific instance, not a category.
11. No internal taxonomy name is ever spoken.
12. Every verbatim spoken line sits on ONE line, contains no dash, ellipsis, bracket, colon or double
    space, and every question in it ends in a question mark.
13. Every step that can fail has a two-attempt ceiling and a default.
14. The prompt contains no greeting -- the platform plays it, and the greeting is emitted
    separately above.
15. Every qualifying step states its precondition and is skipped when an earlier answer settles
    it. A choice is offered only where it exists for what the caller already selected -- if they
    named a model, its fuel, size and trim are decided, so do not ask.
16. The facts carry constraints, not just attributes: which options exist together and which
    never do.
17. Nothing already described is described again in different words.
`;

// ── Assembly ──────────────────────────────────────────────────────────────────
export function buildSystemPrompt(platformRules) {
  return `${METHOD}

═══ PLATFORM RULES — paste these through verbatim as the first half of your output ═══

${platformRules}`;
}

export function buildUserMessage(cfg) {
  const chosen = TOOLS.filter(t => cfg.tools.includes(t.id));
  const langs = LANGUAGES.filter(l => cfg.languages.includes(l.id));
  const primary = langs[0];

  const lines = [
    `CLIENT: ${cfg.client || "(not given)"}`,
    `INDUSTRY: ${cfg.industry || "(not given)"}`,
    `CALL DIRECTION: ${cfg.direction}`,
    `WHAT THE CALL IS FOR: ${cfg.goal || "(not given)"}`,
    "",
    `PERSONA: ${cfg.personaName || "(unnamed)"}, ${cfg.personaGender}.`,
    cfg.personaGender !== "unspecified" && langs.some(l => l.native)
      ? `The languages below inflect for speaker gender — state the correct verb forms explicitly.`
      : "",
    "",
    `LANGUAGE: ${langs.map(l => l.label).join(", ") || "(not given)"}.`,
    primary ? `Primary is ${primary.label}${primary.script ? ` — ${primary.script}.` : "."}` : "",
    langs.length > 1
      ? `Switch only on an explicit request from the caller; their speaking another language is not a request.`
      : "",
    "",
    "TOOLS AVAILABLE — the bot has these and no others. Never invent one, never name one aloud:",
    ...(chosen.length
      ? chosen.map(t => `- ${t.name}: ${t.hint}\n  Implication for the prompt: ${t.implies}`)
      : ["- (none selected — the bot cannot take any action, so every outcome hands off to the team)"]),
    "",
  ];

  if (!cfg.tools.includes("hangup")) {
    lines.push(
      "NOTE: no hangup tool was selected, so the bot cannot end a call itself. Write the closures as " +
      "spoken endings and state plainly that the bot stops speaking and waits rather than calling a tool.",
      ""
    );
  }

  lines.push("REQUIREMENTS FROM THE CLIENT:", cfg.requirements?.trim() || "(none given — derive everything from the industry and goal)");

  if (cfg.kbFiles?.length) {
    lines.push(
      "",
      "KNOWLEDGE BASE: attached. Extract ONLY what the bot must speak about on a call — products, " +
      "services, prices, eligibility, locations, hours, FAQs, contact routing. Ignore anything that " +
      "needs a system to execute: CRM setup, lead routing, dashboards, internal SOPs, campaign " +
      "automation, billing configuration. If a fact is not in the knowledge base and not given above, " +
      "the bot must not state it."
    );
  }

  return lines.filter(l => l !== "").join("\n");
}

// Latin ~4 chars/token, Indic scripts fragment far harder under BPE at ~2. An estimate with real
// error bars — the budget meter says so rather than pretending to precision.
//
// The inference model is now known to be Gemma (chosen for cost + latency). This estimator was
// tuned against Claude/GPT-family BPE, not Gemma's SentencePiece tokenizer, so the error bars are
// wider than they look — Gemma's Indic fragmentation in particular may differ meaningfully. Worth
// swapping for a real Gemma tokenizer count (most Gemma checkpoints ship one) rather than trusting
// this further; treat every count on the dashboard as an estimate until that swap happens.
export function estimateTokens(text) {
  if (!text) return 0;
  const indic = (text.match(/[ऀ-෿]/g) || []).length;
  return Math.round((text.length - indic) / 4 + indic / 2);
}
