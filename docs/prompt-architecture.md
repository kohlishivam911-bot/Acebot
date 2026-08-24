# Acebot Prompt Architecture — v0 draft

Design spec for the Acefone voice-bot prompt generator. Drafted from a study of
`bob_the_builder` (the previous generator, fixed-response methodology).

**The constraint:** Bob produced prompts of ~50,000 characters by scripting every
line, in every language, at every step. Acebot must hit the same behavioural
discipline inside **4,000 tokens** (~15,000 characters of English). Roughly a
3.5–5× reduction on output, with no loss of flow control or rule adherence.

Measured from the archive: `BUILD_SYS` 44,725 ch (~11.2k tok) · `HOUSE_STYLE_GUIDE`
7,848 ch · `CHECK_SYS` 7,509 ch · `CHANGE_SYS` 5,479 ch · `OPTIMIZE_SYS` 8,387 ch ·
`PROTECTED_RULES_GUARD` 2,401 ch. The old *generator's* instruction manual is
nearly 3× the budget of the bot prompt we now need to produce.

---

## 0. Platform constraints (confirmed)

| Constraint | Value | Consequence |
|---|---|---|
| Token ceiling | 4,000, **system prompt only** | Turn history and tool definitions sit outside. The §4 allocation applies in full. |
| Knowledge retrieval | RAG exists, **~70% accurate** | Not a binary. Drives a two-tier KB (§4a) and makes an explicit low-confidence deferral rule mandatory. |
| End-call tool | Exists, **silent** — bot speaks the goodbye | No double-closure risk; that whole apparatus drops. Closing lines now *end on a farewell* — inverting Bob's rule. Whitelist stays (§6). |
| Greeting | **Pre-recorded**, plays before the LLM | Step 1 opens directly on the first qualifier; greetings banned outright. Sharpens the first-turn language trap (§6a). |

Still open: model identity, language set, variable syntax, transfer tool,
post-call metrics. See §9.

---

## 1. Disposition of Bob's assets

| | Asset | Reasoning |
|---|---|---|
| **Carry** | The server | Key-side Anthropic proxy, SSE reassembly into a non-streaming shape, 20s-grace keep-alive against proxy 504s, retry on both status and thrown socket errors. Hard-won, provider-agnostic. Port as-is. |
| **Carry** | The failure catalogue | First-turn language mirroring, cascade collapse, self-answering, double closures, premature `end_call`, callback-without-confirmation, "later confirmed ≠ earlier confirmed". Facts about voice calls, not about prompt length. |
| **Carry** | Scope-disciplined editing | `CHANGE_SYS` rule 1 — change only what was asked. More valuable now: in a tight budget every edit pass is tempted to tidy a rule away. |
| **Rebuild** | Protected-rules guard | Concept essential, implementation inverts. Bob's guard protects *verbatim text*; Acebot's must protect *rule semantics* while permitting compression, or guard and budget fight on every pass. |
| **Rebuild** | Checker / audit loop | Right shape. New categories: token budget, instruction sufficiency, routing completeness without scripts. "Are STOP markers present" stops being a question. |
| **Rebuild** | House-style guide | Same 16-section logic, re-costed, with a hard per-section token budget attached to each. |
| **Drop** | Per-line language gating | `EN (default) / HI (only if ACTIVE_LANGUAGE = HINDI)` on every line in every branch. Costs one full dialogue set per language. Unnecessary once no line is scripted. |
| **Drop** | Repeated STOP markers | Dozens of copies of a 60-char marker for one rule. Replaced by a single turn contract at the top. |
| **Drop** | Multilingual verbatim dialogue | The structural reason Bob's prompts are 50k. |

## 2. Fixed responses were never holding the flow

Bob prevented deviation with three mechanisms of wildly different cost:

- **Structural scaffolding** — self-contained step units, STOP marker per step,
  explicit routing per branch, hard-gate markers. Cheap. This stopped cascade.
- **Declarative rules** — core rules, anti-cascade WRONG/RIGHT pairs, guardrails.
  Moderately cheap, heavily duplicated.
- **Verbatim scripts** — every line, every language. Ruinously expensive, and *not*
  the anti-deviation mechanism. They fixed *wording*, not *sequence*.

Proof from the archive: if scripts controlled behaviour you would not need an
anti-cascade rule — yet `BUILD_SYS` mandates one on every build, with examples
from the bot's own steps, precisely because a fully scripted bot still collapsed
three steps into one turn. The scaffolding enforced the sequence, not the scripts.

Corollary worth stating: a 4k instruction prompt should adhere **better** than a
50k scripted one, because every rule sits inside effective attention instead of
being restated four times hoping one copy survives. `OPTIMIZE_SYS` already knew
this — its stated purpose is to "stop the model from losing track of its rules",
and it notes that all-caps walls measurably hurt instruction-following.

## 3. Budget arithmetic

English ≈ 4 ch/token, so 4,000 tokens ≈ 15,000–16,000 characters. Indic scripts
(Devanagari, Kannada, Telugu) are 3 bytes/char in UTF-8 and fragment badly under
BPE — typically **1–2 ch/token**. Working multiplier: 3–4× English. Measure
against the production tokeniser before committing.

| Prompt shape | Chars | Est. tokens | Verdict at 4k |
|---|---|---|---|
| Bob output, English + 2 Indic, scripted | ~50,000 | ~19,000 | 4.8× over |
| Same flow, scripted, English only | ~26,000 | ~6,500 | 1.6× over |
| Instruction mode, English only | ~15,000 | ~3,900 | Fits |
| Instruction mode, 3 languages | ~15,500 | ~4,000 | Fits — language axis gone |

**The load-bearing consequence:** scripted multilingual dialogue is not "tight" at
4k, it is out by ~5×, and English-only scripting is still over. Instruction mode
barely moves when you add a language, because a language costs one line of the
language directive instead of a full dialogue set. Multilingual is *only*
reachable this way — a stronger argument for the migration than latency.

## 4. Allocating the 4,000

Per-section ceilings, because "make it short" is not a spec a generator can hit
repeatably. Order is load-bearing: turn contract and language control sit first
because early tokens hold attention best and both govern every turn.

| # | Section | Budget | Notes |
|---|---|---|---|
| 1 | Turn contract | ~120 | One question per turn; output ends at the first question mark; never write the lead's reply; max 3 sentences; plain speech. Stated **once**. |
| 2 | Core rules | ~200 | Never re-ask; acknowledge then advance; stop on interruption; after two failed asks accept and move on; never request phone/email/ID. One compact anti-cascade WRONG/RIGHT pair. |
| 3 | Identity + mission | ~140 | Name, company, role, tone, AI disclosure, single CTA, what the call is not. Persona gender where regional verb forms inflect. |
| 4 | Language control | ~260 | One `ACTIVE_LANGUAGE`, starts at primary every call. Switch on explicit request only — never on the language the lead speaks. Yes/no/go-ahead words per language as *answers*. Carry Bob's closed-world phrasing verbatim — the highest-value tokens in the prompt, and now the *sole* defence against the first-turn trap (§6a). |
| 5 | Flow state machine | ~1250 | A table, not prose. Elastic — scales with step count. |
| 6 | Knowledge facts (Tier 1) | ~700 | Only facts that earn a slot per §4a. Bare facts, no prose framing. Long tail goes to RAG. |
| 7 | RAG boundary | ~90 | Low-confidence deferral rule. Cheap, and doing more work than the KB itself at 70% retrieval. |
| 8 | Objection patterns | ~380 | Not scripts: one pattern (acknowledge → one reframe → return to the exact step) plus topics mapped to answering facts. |
| 9 | Recovery / edge cases | ~300 | Busy, not interested, DND, hostile, silence, voicemail, wrong person, off-KB. One line each, each naming its exit. |
| 10 | Exit protocol + closings | ~200 | Closing lines **verbatim** with real farewells — they are the hangup whitelist. No double-closure apparatus needed. |
| 11 | Variables + capture | ~110 | What the call must return, with allowed values. |
| — | Headroom | ~250 | Larger than first drafted, because RAG absorbs the long-tail KB. |

Total: 4,000 exactly. Two sections are elastic and trade against each other —
FLOW scales with step count, Tier-1 KB with how much the bot may state unaided.

## 4a. KB triage at 70% retrieval

RAG existing does not mean facts leave the prompt. A ~30% miss rate means a
wrong or absent answer on roughly 3 calls in 10, so placement is a
**damage × frequency** decision, not a space decision.

**State it in the prompt if any of these hold:**

- **It gates a flow branch.** Non-negotiable. If step 3 routes on a threshold and
  the threshold comes from a 70% retriever, the state machine's routing is 70%
  reliable. Routing-critical facts are always in-prompt.
- **It is asked on more than roughly a third of calls.** Price, eligibility,
  timing, location. High frequency turns a 30% miss into a daily incident.
- **A wrong answer is a compliance or commercial failure.** Pricing, legal terms,
  eligibility claims. The cost of being wrong is not symmetric with the cost of
  the tokens.

**Leave it to RAG if** it is long-tail, low-damage, and safe to defer.

**The rule that makes the other 30% harmless** — mandatory, ~90 tokens: if
retrieval returns nothing, or returns something that does not clearly answer what
was asked, the bot defers to the human team and continues the flow. It never
improvises a fact and never treats a partial match as an answer. This converts a
retrieval failure from a *hallucination* into a *graceful deferral*, which is why
it is worth more per token than the facts it guards.

## 5. The flow becomes a state machine

One step, both ways.

**Bob — scripted (612 ch):**

```
**STEP 3 — BUDGET CHECK**
EN (default): "Got it. And what budget range were you working with for this?"
HI (only if ACTIVE_LANGUAGE = HINDI): "अच्छा। और इसके लिए आपका budget कितना सोचा है?"
KN (only if ACTIVE_LANGUAGE = KANNADA): "ಸರಿ. ಇದಕ್ಕೆ ನಿಮ್ಮ budget ಎಷ್ಟು ಅಂತ ಯೋಚಿಸಿದ್ದೀರಾ?"

--- STOP. WAIT FOR THE LEAD TO RESPOND. DO NOT GENERATE ANYTHING ELSE. ---

This is a hard gate. Do not proceed unless budget is confirmed.
If >= 2 Cr -> Step 4. If below -> Step 7 (soft close).
If unclear -> clarify once -> 4. If busy -> Step 9 (callback).
```

**Acebot — instruction (96 ch):**

```
ID GOAL     CAPTURE  GATE  ROUTING
3  budget   range    YES   >=2Cr->4  <2Cr->7  unclear->ask once->4  busy->9
```

A 6.4× cut on one step — and the language axis *disappears* rather than shrinking,
because the row is language-independent. Across a twelve-step flow this is the
difference between fitting and not.

Everything that made the scripted version deterministic survives: the gate is a
column, every branch is a routing target. A table also makes a missing branch
**visible**, which prose never did — Bob's single biggest deviation cause was a
missing `-> Step X` buried in paragraph form.

What is deliberately gone is the wording. The runtime model composes the ask from
the goal, in `ACTIVE_LANGUAGE`, under the turn contract. The trade: we stop
controlling *how it is phrased* to keep controlling *what must be established
before moving on* — the part that decides whether the call qualifies.

STOP markers go the same way. Thirty copies existed because in a 50k-character
prompt the model had lost the rule by step nine. In 4,000 tokens the contract at
the top is still in view at the bottom. If simulation shows otherwise, the honest
fix is one restatement mid-table, not thirty.

## 6. What stays verbatim

**Rule: fix the text where a wrong word is a compliance, safety or integration
failure. Instruct everything else.** Four things qualify:

1. **Regulatory lines** — AI disclosure, recording notice, DND acknowledgement.
   The wording *is* the compliance artefact.
2. **Facts** — prices, dates, eligibility, names. Never generated.
3. **Closing lines** — because the end-call gate binds to them. Bob's `ENDCALL_SYS`
   is the most important structural lesson in the archive: bind hangup to a
   **whitelist of scripted closing lines**, never to a semantic judgement like
   "the task is complete", which is loosely true on every turn and produces a bot
   that hangs up after every reply. A whitelist needs the lines to exist verbatim.
   **Inverted for our platform:** Bob's tool spoke its own farewell, so his rule
   was that closing lines must end on *substantive content*. Ours is silent, so
   our closing lines carry real farewells. Do not carry Bob's no-double-closure
   apparatus across — it solves a bug we do not have. The whitelist still stands,
   because premature hangup is about *when* the tool fires, not whether it speaks.
4. **Per-language yes / no / go-ahead words** — cheap, and they defuse the
   first-turn trap where "हाँ, बताओ" reads as a language election, not an answer.

## 6a. The first-turn language trap is our sharpest known risk

Worth stating plainly because it is the one place where dropping fixed scripts
removes a *proven* defence rather than a redundant one.

The greeting is pre-recorded and plays in the primary language. The lead's first
turn is therefore very often a yes-plus-go-ahead in their own language — "हाँ,
बताओ", "haan ji, boliye", "avunu, cheppandi". Bob's comment on this is explicit
and was verified in production: a prompt with a *perfect* top-level ruleset still
spoke its Hindi line on turn one because the line was labelled only `HINDI:`. His
fix was the per-line conditional gate, repeated on every line in every branch —
and he credited that repetition, not the top-level rules, with actually fixing it.

We are dropping exactly that mechanism, on budget grounds. Honest position: this
is a real regression risk, not a solved problem. Three mitigations, in order of
cost:

1. Language control sits inside the first ~700 tokens, where attention is
   strongest, and the go-ahead word registration stays **verbatim** — it is cheap
   and it is the specific thing that misfires.
2. Turn-1 language becomes **persona 1 in the drift harness**, checked on every
   build, non-negotiable. This is the failure we measure first.
3. If the harness shows it failing, the cheapest targeted fix is one worked
   first-turn example inside language control (~60 tokens) — not thirty per-line
   gates. Escalate only if measurement says the example is insufficient.

## 7. The new failure mode: under-specification

Bob's risk was bloat. Acebot's risk is an instruction loose enough that the
runtime model improvises — invents a discount, softens a gate, answers an off-KB
question. Bob never had this failure mode, so nothing in the archive tests for
it, and a cheaper model makes it *more* likely.

It is also the one failure mode that is measurable. A scripted prompt can be
audited by reading it; an instruction prompt can only be audited by running it.

**So Acebot needs a module Bob never had: a drift harness.** Run the generated
prompt against scripted lead personas — compliant, wrong-language, callback
request, gate-skipper, hostile — several times each, and diff the trajectories
against the state machine that generated them. It reports what an audit cannot:

- steps skipped
- gates passed without capture
- facts stated that are not in the fact list
- hangups fired outside the closing whitelist
- turns where two runs of the same prompt diverged behaviourally

Because we target a cheap model, the simulation runs on that same cheap model —
the measurement is affordable precisely because the target is. This converts the
shortening work from a gamble into an engineering loop: cut a section, re-run the
harness, see whether adherence moved.

## 8. Dashboard modules (provisional)

| Module | Does | Origin |
|---|---|---|
| **Builder** | Requirements, languages, variables, KB in → budgeted instruction prompt out, with a live per-section token meter and a hard ceiling it refuses to exceed. | Rebuilt |
| **Budget inspector** | Real tokeniser counts per section against the allocation. Names which section is over and what to trade. | New |
| **Drift harness** | Personas × runs → trajectory diff against the state machine. | New |
| **Auditor** | Static pass: routing completeness, gate coverage, instruction sufficiency, contradictions, fact-list integrity. | Rebuilt |
| **Editor** | Targeted change with scope discipline and a *semantic* rule guard. Reports token delta per edit. | Rebuilt |
| **History** | Versioning per client with budget and last harness score attached, so a regression is traceable to the edit that caused it. | Carried |

Not carried forward: Language Switch Fixer, Double Closure Fixer, Script
Deviation Fixer, Optimize Size. Each fixes a bug this architecture does not
create — size is a build constraint, and the language and closure rules are
generated correctly once because there is only one copy of each to get right.
Cross-sell, nudge and humanize are real capabilities, deferred until the budget is
proven with a plain bot.

## 9. Open questions (ordered by design impact)

Resolved — see §0: budget scope (system prompt only), knowledge retrieval (RAG at
~70%), end-call tool (silent), greeting (pre-recorded).

Still open:

1. **Which model?** Fixes the real tokeniser so the budget inspector measures
   instead of estimating, and sets how much instruction-following headroom we
   have. Also determines how cheaply the drift harness can run.
2. **Which languages?** Sets the Indic multiplier, the yes/no/go-ahead
   registrations, and whether language control needs its full 260 tokens or
   collapses to almost nothing for an English-only bot.
3. **Which other tools exist?** Transfer to human, booking or calendar, DTMF,
   explicit language switch. Each either becomes a routing target in the state
   machine or does not exist for the flow to reach.
4. **Variable injection.** Is it `{{double_brace}}`, and what runtime variables
   are available — specifically a `context_summary` equivalent for repeat calls.
   Bob spent heavily here (the logic was written 3–4 times over); if we have it,
   it needs a budget line and a single canonical skip-table.
5. **Post-call.** Do you already have metrics and dispositions, or does Acebot
   generate those too? Bob's `PCM_SYS` / QC engine is the largest untriaged part
   of the archive and I have deliberately left it out of §8 pending this.

Defensible regardless of the answers, because they follow from arithmetic rather
than platform detail: the flow has to become a table, the language axis has to
collapse to one directive, and the shortening work needs a measurement loop or it
is guesswork.
