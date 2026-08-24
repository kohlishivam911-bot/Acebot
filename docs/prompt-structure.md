# Acebot — the brain and structure

How Acebot builds a prompt. Hybrid: instructions carry the conversation, a small
set of verbatim fixed responses carry the moments where improvisation is
unacceptable. Single register (Hinglish or English), ~4,000 token ceiling.

Worked against a real case: `prompts/baseline/ace-healthcare-anjali.v0.md` (the
current production prompt, 2,744 tok, 29 defects) rebuilt as
`prompts/ace-healthcare-anjali.v1.md` (3,423 tok, defects closed, 577 spare).

---

## 1. The governing principle

> **Fix the rare. Instruct the routine.**

This is the exact inversion of the fixed-response approach, and the inversion is
the point.

The old approach scripted the routine — greetings, qualifiers, the ninety percent
of turns that happen on every call — and left edge cases to loose prose rules.
That is backwards twice over:

- **Routine turns are where an LLM is strongest.** It has abundant context, the
  intent is unambiguous, and many phrasings are equally good. Scripting them buys
  nothing and costs the most tokens, because routine turns are the most numerous.
- **Rare turns are where an LLM is weakest.** Little context, high stakes, no
  pattern to lean on. And a small model improvises worst exactly here.
- **Fixed text sounds robotic in proportion to how often it is heard.** A scripted
  greeting is heard on every call and grates. A scripted emergency line is heard
  once by one caller, who will never notice it was scripted.

So spend the fixed-response budget where frequency is low and cost of error is
high. Let instructions carry everything else.

## 1a. Restriction-only contracts produce cold output

The most important lesson so far, and it came from a live call going wrong.

The v1 prompt's contract was purely restrictive: *one question per turn, your turn
ends at the first question mark, maximum two sentences.* Elsewhere it said
"acknowledge briefly, then advance" and "empathy through acknowledgement".

On a real call the bot produced this, on a hospital line, to a caller in pain:

> आपको क्या परेशानी हो रही है?
> ये दर्द शरीर के किस हिस्से में हो रहा है?
> क्या आपको इसके साथ बुखार या कोई और लक्षण भी है?

Three questions, no warmth, textbook Hindi. Every restriction was obeyed
perfectly.

**Given only restrictions, a model satisfies them by doing the least.** It emits
one sentence, and that sentence is the question, because the question is the part
the flow demands. The acknowledgement had no reserved slot, so the sentence cap
ate it — on every single turn.

The fix is to make warmth **structural rather than aspirational**: prescribe the
shape of a turn, do not merely bound it.

    EVERY TURN HAS TWO PARTS, IN THIS ORDER
    1. REACT — one short human response to what they just said, never a
       stock phrase, never the same one twice in a call.
    2. THEN one question, or one piece of information. Never two.
    The reaction is required, not decoration.

Rule for the generator: **for every quality you want, there must be a slot that
carries it.** A cap without a slot deletes the quality. This applies well beyond
warmth — brevity, acknowledgement, urgency, and disclosure all behave the same
way.

## 1a-ii. A slot needs a cap, and a cap needs a slot

The turn-shape fix in §1a over-corrected on its first live call, in the exact
mirror image of the fault it fixed.

§1a added a REACT slot but never bounded it. So the model inflated it: `ओह` became
`ओह, ये तो बहुत बुरा लग रहा है` — a full sympathy sentence, on a routine turn — and
fillers stacked three deep, `अच्छा सुनिए, एक चीज़ बता दीजिए` before the actual
question. A bot that gushes is as wrong as one that interrogates, and on an AI
voice it reads worse, because effusive sympathy from a machine is uncanny rather
than kind.

| | Fault | Result |
|---|---|---|
| v1 | Caps with no slot | Quality deleted — three bare questions |
| v2 | Slot with no cap | Quality inflated — sympathy sentences, stacked fillers |
| v3 | Both, plus a third option | Calibrated |

**Rule: specify both bounds or the model finds an extreme.** Every slot gets a
hard ceiling in words, not an adjective. "One short human response" is not a
specification; "at most two words, or a two-to-four word reference to what they
said" is.

### The third option, from Bob

The deeper error was offering only two choices — say nothing, or emote. Bob's
`BALANCED TONE` block has the answer, and it is neither:

> Instead of repeating "Got it" — react to what they said. If they said budget is
> 2 crores, say "2 crores, that lines up well with what we have."

That is a **content reference**: it proves you listened without spending a
sentence on feelings. Not a filler, not sympathy, and not a verification repeat
either. Given only filler-or-emotion, a model picks emotion on an emotional call.
Given the content reference as the preferred option, it picks that.

So the acknowledgement slot offers three, ranked: a content reference when they
gave real information; one filler word when they did not; nothing at all when you
are answering a plain factual question, because padding a fact is what sounds
fake.

### Budget the empathy per call, not per turn

Bob again: *"one empathetic line is enough, then get to the point"* and *"don't
over-explain or over-empathize"*. Per-turn guidance cannot enforce that — every
individual turn looks defensible while the call as a whole drowns. So it becomes
a call-level allowance:

**At most ONE empathetic line in the whole call**, only at real distress or when
turning someone away, then straight back to the point.

Also worth banning outright, since Bob names them and Hindi has direct
equivalents: excited words. No "बहुत अच्छा!", no "शानदार!" — Bob's
"Great!/Perfect!/Awesome!" list.

### Three bugs the same call exposed

Each is a general rule, not a healthcare one.

**Garbled input must not invent a step.** Given the single word "नाम", the bot
asked for the caller's name — at the concern-gathering step, before any name was
needed. Unintelligible input has to re-ask the *current* step in fewer words,
never advance and never start collecting something else.

**Never claim to have understood.** On pure STT garbage the bot said "अच्छा, मैं समझ
गई" and carried on. A model asked to acknowledge every turn will acknowledge
nonsense too, because the instruction did not except it. State it explicitly: if
you did not catch it, say so; never claim comprehension you do not have.

**Never re-ask in identical words.** The bot repeated a question verbatim, which
is the clearest possible tell that nobody is listening. Second ask is shorter and
differently worded.

## 1b. Register is an instruction, not something scripts carried

The same call produced परेशानी, लक्षण and समस्या — newspaper Hindi, on a phone call,
to someone frightened. The prompt's only language rule was "Hindi in Devanagari",
so the model defaulted to formal register, which is what written Hindi corpora are
made of.

Fixed responses used to hide this problem: if every line is scripted, register is
whatever the author typed. Remove the scripts and register becomes a first-class
instruction — and it needs three parts:

**A testable heuristic.** *If a word belongs in a newspaper but not in a phone
call between two people, do not use it.* One line, and it generalises to any
language and any domain.

**An explicit ban list.** Heuristics alone lose to the model's prior. Name the
words: परेशानी, लक्षण, समस्या, कष्ट, पीड़ा, असुविधा, चिकित्सा, उपचार, निदान, अवगत, कृपया,
धैर्य — with the warm replacements beside them.

**The small words of real speech.** जी, हाँ जी, अच्छा, अरे, ओह, देखिए, सुनिए, चलिए,
कोई बात नहीं. Plus the fragment-versus-person contrast, because a model told to be
brief will produce form fields:

- form field — "दर्द कहाँ हो रहा है?"
- person — "अच्छा, ये दर्द कहाँ हो रहा है — कमर में, घुटने में?"

## 1c. Caller state, derived from the use case

Before tone rules can be written, answer one question: **what state is the person
in when they pick up?** It is set by the business, and it decides everything about
delivery.

| Use case | Caller arrives | Delivery that follows |
|---|---|---|
| Healthcare inbound | Worried, in pain, sometimes frightened for someone else | Warmth first, never rush, never clinical, never a checklist |
| Automotive service | Inconvenienced, cost-anxious, mildly annoyed | Brisk competence, respect their time, reassure on cost |
| Collections | Defensive, possibly ashamed | Non-judgemental, firm, never moralising |
| Outbound sales | Interrupted, sceptical | Earn the next ten seconds, brevity over warmth |

Healthcare and automotive both want "professional and friendly" and mean opposite
things by it. Warmth that reads as care on a hospital line reads as time-wasting
on a service booking. This is what "read the use case" has to mean concretely — it
is a lookup that produces the tone section, not a vibe.

## 1d. Fix the turns that have no input to adapt to

A refinement of §1. Generation earns its keep by adapting to what the caller just
said. **The opening turn has nothing to adapt to** — it is identical on every call
regardless of who is ringing. So generation there adds variance with no upside,
which is exactly how a hospital line ends up opening with "आपको क्या परेशानी हो रही है?"

So the opener joins the fixed set, despite being the most frequent line in the
system and therefore an apparent violation of "fix the rare". The underlying test
was never frequency for its own sake — it is whether there is caller input worth
adapting to. No input, no reason to generate.

## 1e. Two-tier interrupts for ambiguous safety signals

On that same call the emergency fired on "वो हार्ड है बहुत ज़्यादा" — mangled speech
that might have been "heart", might have been "hard". Firing was the safe call and
I would keep it. But a single-tier interrupt forces a binary on evidence that is
often not binary, and a false fire on a routine caller is its own damage.

So safety interrupts get two tiers:

- **Tier A — unambiguous.** Named red flags, stated plainly. Fire immediately.
- **Tier B — present but unclear.** Vague severity, no location, a garbled word
  that could be a red flag. **One** gentle scripted check, then Tier A or back to
  the flow. Asked at most once per call.

Tier B is a fixed line too, since it runs at the same stakes as Tier A.

## 1f. State the purpose of a probe, or the model invents one

The bot asked for a body part, then for fever and other symptoms. The prompt said
"probe once"; it probed twice, and the second question was clinical triage — the
model drifting toward assessment on a prompt that forbids medical advice.

"Probe once" bounds the count and says nothing about the purpose, so the model
supplies a purpose, and the obvious one for a health call is diagnosis. Name the
purpose instead: **you are routing to a department, not assessing a patient. One
question, only to find the body area or kind of problem. Never ask about fever,
duration, severity out of ten, or medicines taken.** Naming what not to ask is
what actually holds, because those are precisely the questions the model reaches
for next.


## 2. The fixed-response test

A line is FIXED if any of these hold. Otherwise it is an instruction.

1. **Irreversible harm.** Wrong words cause damage no later turn can undo.
   Medical emergencies, safety hazards, refusing to give advice.
2. **The wording is the compliance artefact.** Insurance and coverage, fee and
   price statements, warranty, outcome guarantees, AI disclosure, data refusal.
3. **One sentence decides retention.** Out-of-scope rejection, abuse
   de-escalation, "are you a bot", the close. Improvising these loses people.
4. **Rare plus high-variance.** Infrequent enough that the model has no footing,
   and the failure is expensive.

A line is an INSTRUCTION if it happens on most calls, has many equally good
phrasings, must adapt to what the caller just said, or costs nothing irreversible
when imperfect. Empathy, acknowledgement, probing, bridging, presenting options —
all instructions. Never script these.

**Fixed lines need an anti-improvement clause.** Without it the model will polish
them. Ours reads: *speak VERBATIM; do not paraphrase, shorten, soften or add;
this overrides tone, length, persona and flow.*

**Cost note.** In the healthcare rebuild the fixed block is 914 tokens — 27% of
the prompt, the single largest section. Devanagari alone costs ~624 tokens for 936
characters. Fixed responses are expensive per word, which is the arithmetic reason
to fix only the rare ones.

## 3. Phase 0 — the harm model, before writing anything

The fixed-response set is derived from the **industry's harm model**, never from
the flow. Before any drafting, produce three lists for this use case.

**A. Irreversible-harm moments.** What can go wrong on this call that no later
turn repairs?
**B. Claims that create legal exposure.** What must never be asserted?
**C. One-sentence retention moments.** Where does a clumsy sentence end the
relationship?

Every item becomes one Priority Interrupt: a trigger, a verbatim line, an exit.

### Worked: healthcare inbound

| | Interrupt |
|---|---|
| A | Medical emergency — chest pain, breathlessness, unconsciousness, stroke signs, bleeding, seizure, overdose → stop the call, direct to emergency services, never book |
| A | Advice request — what do I have, is it serious, which medicine, what dose → refuse, redirect to the doctor |
| B | Insurance / cashless / TPA / CGHS → never say a plan is accepted; defer to team |
| B | Sensitive data — Aadhaar, PAN, card, UPI, OTP, policy number → refuse to receive it |
| C | Department not available → warm scripted rejection, or a fit patient is lost badly |
| C | Asked if AI → honest scripted disclosure |
| C | Abuse → one de-escalation, then a calm scripted close |
| C | Reschedule or cancel → scripted handoff, since there is no tool for it |

### Worked: automotive service inbound

The same three questions produce a completely different set — which is what it
means for the method to generalise.

| | Interrupt |
|---|---|
| A | Active safety fault — brake failure, steering loss, smoke or burning smell, airbag or brake warning lit → do not book a service days out; stop driving, roadside assistance |
| A | Open safety recall on the stated model → scripted priority handling, never "book it with your next service" |
| B | Warranty coverage — never say a repair is or is not covered |
| B | Total cost — never quote beyond the published inspection charge; never promise a final bill |
| B | Insurance claim / cashless repair → never confirm claim admissibility |
| C | Brand or model not serviced → scripted rejection, or the caller goes to a competitor with a bad taste |
| C | Vehicle beyond service age → scripted, dignified decline |

Note what changed and what did not. The *categories* are stable — safety,
compliance, retention. The *contents* are entirely domain-specific. That is the
generator's job in Phase 0: ask the three questions about the industry in front
of it, not recycle a checklist.

## 4. The section skeleton

Order is load-bearing. Interrupts sit above the flow because they are checked
before it. Guardrails do not get a section — they are absorbed into the contract
and the interrupts, where they are actually enforced.

| # | Section | Budget | Content |
|---|---|---|---|
| 1 | IDENTITY | ~90 | Name, one company name, role, persona in two lines, speaker gender and its verb forms |
| 2 | OUTPUT CONTRACT | ~240 | One question per turn, turn ends at the question mark, sentence and word caps as ONE number each, script convention, numbers as words, no markdown, never speak tool names, acknowledge-then-advance, language switch rule |
| 3 | PRIORITY INTERRUPTS | ~900 | The fixed block from Phase 0. Trigger → verbatim line → exit. Checked before every turn. Overrides everything |
| 4 | FACTS | ~700 | Only what the bot may state, TTS-safe, numbers as words. Plus the classification map and its ambiguity tiebreaks |
| 5 | FLOW | ~650 | One line per step: goal, capture, gate, exit. Instructions, never dialogue |
| 6 | EXITS | ~500 | Every way the call can end, each with its verbatim closing line and its tool call. This is the hangup whitelist |
| 7 | OBJECTIONS | ~250 | One handling pattern plus a topic list. Each names where it returns to or exits |
| 8 | CAPTURE | ~50 | What the call must return |
| — | Headroom | ~570 | |

## 5. Rules that came out of real defects

Each of these exists because the production prompt broke on it.

**One name for everything.** The v0 prompt called the company "Ace Healthcare" in
Personality and "Prystine Care" in Step 1. The bot says whichever it read last.
Sweep for every entity — brand, product, department, tool — and assert one
spelling. v0 also had "Gastroentologist" five times and "Gastroenterology" once.

**One number per constraint.** v0 capped sentences at fifteen words in Tone and
twenty in Step 1. It set retry budgets at "exactly once", "not more than twice"
and "three attempts" in three places. Conflicting numbers mean the model picks.

**Every stated side-effect must be tool-backed.** v0 told the caller the
appointment was confirmed and that WhatsApp and SMS had been sent — with no
booking tool defined anywhere, only `hangup_tool`. The bot asserts a booking that
never happened. Rule: a claim about the world requires a tool that caused it, and
a failure branch for when the tool does not confirm.

**Every exit names the hangup tool.** v0 had four ways to end a call and named the
tool in one. The other three — non-booking closure, abuse, silence — had no way to
actually hang up. Enumerate exits, bind each to the tool, and let nothing else end
a call. Corollary: never end on a turn that asked a question. v0's Step 8 asked
"anything else?" and hung up in the same breath.

**Every rule needs a step to live in.** v0 had a strict, well-written date and time
block — and no step where a date is ever captured, because slots came from a tool.
The rule was dead. Either the flow reaches it or it should not be in the prompt.

**Every handler needs the data it handles.** v0 had a fee-objection handler, and
never presented the fee anywhere in the flow. Trace each objection back to the
step that produced it.

**Classification maps must cover the gate they feed.** v0 mapped three symptoms
and then hard-gated on department. Back pain, acidity, palpitations, fractures —
all valid patients — fall outside the map, so the bot either rejects them or
guesses. If a gate rejects on a map, the map must be exhaustive enough to carry
it, with explicit tiebreaks for genuine ambiguity.

**One script convention.** v0 said "Main → मैं (non-negotiable)" — clearly a real
TTS fix — then wrote "aapko", "unhe", "dukh hua", "shukriya" romanised. Pick one:
Hindi in Devanagari, English and technical terms in Roman. Mixed romanisation is
read with English phonetics and mangles the audio.

**A gendered persona needs gendered verb forms.** Anjali is a woman; Hindi
inflects; v0 said nothing, so the bot flips between करती and करता mid-call.

**No symbols, no digits.** v0 used ₹ six times. Write "आठ सौ rupees".

**Contradictions across sections are the default failure.** v0's global "never
confirm back what was just said" fought four separate instructions to acknowledge,
mirror, and confirm slots. State the exception where the rule is stated.

**Warmth has a slot, not just a cap.** Restrictions alone produce a bot that
answers in bare questions. Every turn carries a required REACT before the ask. §1a
**Register is named, not implied.** The newspaper test, an explicit ban list, and
the small words of real speech. §1b
**A probe states its purpose.** Otherwise the model picks one, and on a health
call it picks diagnosis. §1f

## 6. Disclosure

v0's guardrail: *if asked whether you are an AI or bot, do not confirm or deny;
stay in persona and redirect warmly.*

The rebuild discloses instead (INT-6), for three reasons worth putting on the
record. Disclosure requirements are tightening across jurisdictions and healthcare
is the most scrutinised setting for it. "Do not confirm or deny" is also
operationally unstable — it gives the model no line to hold, so it improvises
evasions, and an evasion that sounds like a denial reads worse than a plain
answer. And a caller who suspects a bot and gets a dodge usually stops
cooperating, so the retention argument runs the other way too.

A one-line honest disclosure that immediately re-offers help costs nothing and
holds the call. If legal has cleared the other position, revert it — but it should
be an explicit decision, not an ambiguous instruction the model resolves itself.

## 7. The consistency sweep

Run before any prompt ships. This is the Auditor module's specification.

1. Every entity has exactly one name and one spelling
2. Every numeric constraint is stated once
3. No two sections give contradictory instructions
4. Every step has a defined exit for every branch
5. Every exit has a verbatim closing line and a hangup call
6. No exit sits on a turn that asks a question
7. Every named tool exists; every tool the flow needs is named
8. Every claim about the world is caused by a tool, with a failure branch
9. Every rule is reachable from some step
10. Every objection traces back to a step that could produce it
11. Every gate's classification map covers what the gate rejects on
12. One script convention throughout; no romanised target-language words
13. No digits, currency symbols, or markdown in anything spoken
14. Persona gender matches verb forms in the target language
15. Every Phase 0 harm item has an interrupt, verbatim, with an exit
16. Fixed lines carry the anti-improvement clause
17. Section budgets respected; measured with the real tokeniser, not estimated
18. Every quality the brief asks for has a slot that carries it, not just a cap
19. Register named explicitly: heuristic, ban list, and real-speech words
20. Every probe states its purpose and what it must not ask
21. Safety interrupts that can fire on unclear evidence have a Tier B check
22. Any turn with no caller input to adapt to is fixed, not generated
23. Every slot has a hard word ceiling, not an adjective
24. Acknowledgement offers a content reference, not just filler-or-emotion
25. Empathy is budgeted per call, not per turn
26. Unclear input re-asks the current step; never advances, never claims comprehension
27. No re-ask uses the same words twice
