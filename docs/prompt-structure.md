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

## 1a-iii. Fluency: a two-part turn invites two-part output

Tone landed with §1a-ii; fluency did not, and the cause is the same structure.

Prescribing "acknowledge, then ask" tells the model to emit two things, so it
emits two *chunks*: `अच्छा। दर्द कहाँ हो रहा है?` — grammatical, tonally correct, and
audibly a machine reading a form. The slot fixed the coldness and created
staccato.

**A structural instruction must say how the parts join, not only that they exist.**

- stitched, wrong: `अच्छा। दर्द कहाँ हो रहा है?`
- joined, right: `अच्छा, तो ये दर्द कहाँ हो रहा है?`

Comma and a connector, never a full stop and a fresh start. One utterance per
turn.

### A filler cap can strip the grammar

"One filler word per turn" reads, to a model, as a budget on all the small words
— including तो, फिर, और, बस, ना. Those are **connectors**, not fillers: they hold a
Hindi sentence together, and without them output reads as translated English.

So the cap needs an explicit exemption: *connectors are not fillers; the
one-filler rule does not apply to them; use them.* Generalises to any language
with discourse particles — and it is the second time in this project that a cap
has silently deleted something it was never aimed at (§1a).

### Code-mixing has to be specified

A Hinglish bot has three ways to say one thing and only one is fluent:

| | |
|---|---|
| `appointment करा देती हूँ` | fluent — English noun, Hindi grammar |
| `नियुक्ति करा देती हूँ` | wrong — translating a word nobody translates |
| `appointment make कर देती हूँ` | wrong — English function word inside Hindi |

Rule: the English noun where a speaker would naturally use one, Hindi grammar
around it, and no English function words inside a Hindi sentence. Plus the
compound verbs speech actually uses — करा देती हूँ, बता दीजिए — over the formal
simple future करवाऊँगी.

### Orthography is a fluency setting, not a spelling preference

Bob: *"A single wrong character will mangle the TTS pronunciation. If unsure, use
the simpler/more common spelling that TTS engines handle well."*

Two concrete rules that came out of auditing our own fixed lines:

- **Nukta discipline.** Use the plain letter where the plain spelling is the
  common one — जरूरत not ज़रूरत, फोन not फ़ोन, सिर्फ not सिर्फ़ — but keep the nukta
  where the word genuinely needs it, since ड़ is a distinct sound: धड़कन, पड़ेगा.
  Verify against the actual engine; commonness is a good prior, not a guarantee.
- **Never hyphenate spoken digits.** `एक-एक-दो` risks being read as a dash or an
  odd pause. Write `एक एक दो`. This was sitting in the emergency line — the single
  most safety-critical utterance in the prompt.

Both belong in the generator's output rules for any Indic-script bot, not in a
per-prompt review.

## 1a-iv. When quality rules and facts stop fitting

Worth recording as a project fact rather than a per-prompt problem. Across three
calibration rounds the healthcare prompt's delivery rules grew from nothing to
roughly a quarter of the budget, and the facts did not shrink. At that point
something has to leave the prompt, and the choice is not free-form:

**Delivery rules have no retrieval path; facts do.** So facts move and rules stay
— filtered by §4a, which keeps anything routing-critical in the prompt because a
70% retriever cannot carry a gate.

One move paid for itself twice over: **speak the clinic area, not the street
address, and send the address by SMS.** It is cheaper in tokens and it is better
call design, because nobody memorises a street address over the phone. Look for
that shape — a cut that improves the call — before cutting a rule.

A related trim rule: **do not spend tokens on facts the base model already
knows.** The city alias list mostly restated that Gurugram is Gurgaon and Dwarka
is in Delhi. What the model cannot know is that Noida, Ghaziabad and Faridabad
have no clinic — so only that survived.

## 1a-v. Punctuation is prosody, and the prompt's own formatting leaks into it

Register decides the words; punctuation decides how they are *said*. TTS derives
every pause and every intonation contour from the marks in the text, so
punctuation is a spoken instruction and belongs in the output rules.

The rules that matter, all engine-agnostic:

- **Comma** = short breath. Two per sentence is the ceiling; three is choppy.
- **Question mark** = rising tone. A question without one is read flat, as a
  statement. In Hindi it must be `?`, never a danda.
- **Danda / period** = long pause, falling tone. One per sentence, and never both
  scripts' marks in one sentence.
- **Ban outright from spoken text:** em dash, en dash, ellipsis, semicolon, colon,
  brackets, quote marks, asterisk, slash, hyphen. Engines read some aloud and
  pause unpredictably on the rest. The replacement rule is what makes this
  usable: *want a pause? comma. want a break? danda.*
- **Digit strings said singly** are separated by spaces, never hyphens.

### Examples teach harder than rules

Auditing our own prompt found an em dash inside a spoken line and — worse — an em
dash inside an *example of good output*. An example that violates a rule stated
elsewhere wins, because it is concrete and the rule is abstract. So: **every
example in a prompt is training data for the output.** Sweep the examples against
every rule, not just the prose.

### The prompt's line-wrapping leaks into speech

The sharpest finding of this pass. Thirteen of the prompt's verbatim spoken lines
were wrapped across source lines at 80 columns, purely because that is how the
file was written. A newline inside a spoken line is a real hazard: the model may
reproduce the break, and some engines treat it as a sentence boundary and insert a
pause mid-clause. Wrapping had also produced a double space inside one line.

**Rule: a verbatim spoken line occupies exactly one source line, however long.**
Readability of the prompt file loses to fidelity of the audio. This is now a
mechanical check — it is trivial to detect and impossible to notice by eye.

### Orthography, restated as prosody

The nukta and hyphen rules from §1a-iii belong in this same block rather than with
spelling: `एक-एक-दो` is not a spelling problem, it is a pause problem, and it was
sitting in the emergency line.

## 1a-vi. Prompt length is prefill, not decode

Worth stating because it changes what the token ceiling is *for*, and three
rounds of calibration have now been paid for out of it.

Per-turn voice latency is dominated by time-to-first-token and by how many tokens
the model **generates**. The system prompt is prefill — processed once per turn,
in parallel, and on most platforms cached across turns. Going from 4,000 to 4,250
prompt tokens is a small prefill cost and, with caching, close to nothing.
Generating three sentences instead of one is what the caller actually waits for.

The instruction-based architecture already won the large prize: outputs are short
because nothing is scripted, and there is no multilingual dialogue to carry. That
is where the latency saving lives.

So treat the ceiling as a real budget but not a sacred one, and **never trade a
safety rule for the last few percent of it**. When the two collide the order is:
measure with the real tokeniser first, then move facts to retrieval (§4a), then
ask whether the ceiling itself is the right number. Cutting an interrupt is not on
the list.

## 1a-vii. A closed list becomes a template

Bob says this outright, and I did the opposite:

> **Do NOT hardcode specific regional filler phrases or softeners in the prompt.**
> Instead, instruct the bot to "respond naturally and conversationally in
> [language]" and let the LLM generate natural speech patterns for that language
> at runtime. — `BUILD_SYS`, line 705

The prompt listed five approved fillers — जी, अच्छा, ठीक है, सुनिए, कोई बात नहीं. The
model cycled through them mechanically and produced the same skeleton five turns
running:

    अच्छा, तो ये दर्द कहाँ हो रहा है?
    ठीक है, तो ये दर्द पूरे शरीर में हो रहा है?
    अच्छा, तो क्या मैं appointment करा दूँ?

Every rule obeyed. One filler, one connector, joined with a comma, under twenty
words, no sympathy. And a caller hears a template.

**Closed lists for what to avoid; open instructions for what to produce.** A ban
list should be exhaustive — you want every formal word named, because you want
them all avoided. A generative choice must never be enumerated, because whatever
you enumerate becomes the entire space the model draws from. Specify the
*function* and the *length*, never the vocabulary.

### Variety has to be specified structurally

"Never use the same acknowledgement twice in a row" was already in the prompt. It
held — the words rotated. The *shape* did not, because nothing asked it to.
Lexical variety with fixed syntax still reads as a machine.

So the instruction names shapes and requires rotation: straight into the question
with no preamble; an echo of their words then the question; one short word then the
question. Plus the specific tic ban — never open two turns the same way, never use
the same connector twice in a row.

Note what this costs: it partly reverses §1a-iii, which made the connector
mandatory to fix staccato. Mandatory became compulsive. The stable form of any
such rule is **"use it, vary it, not every turn"** — not "always" and not "never".
Both extremes are visible to the caller within four turns.

### Put the actual failure in the prompt

The negative example above is quoted verbatim into the prompt, wrong output and
all. A concrete failure the model can pattern-match against outperforms an
abstract instruction not to be repetitive — the same reason Bob wrote WRONG/RIGHT
pairs from each bot's own steps rather than generic ones.

## 1a-viii. Structured facts are a tool call, not a retrieval problem

A budget lever that §4a missed by framing everything as prompt-versus-RAG.

The healthcare prompt spends roughly 200 tokens on a six-row doctor table — name,
years, fee, per city per department. By §4a that has to stay in the prompt: it is
quoted on nearly every call and a wrong fee is a commercial error, so a 70%
retriever cannot carry it.

But it is not a retrieval problem at all. It is a **deterministic lookup keyed on
two values the flow has already captured** — city and department. A
`get_doctor(city, department)` tool returns it at 100% accuracy, not 70%, removes
the table from the prompt, and makes a hallucinated fee structurally impossible
rather than merely forbidden.

So the triage in §4a needs a prior step: before asking whether a fact belongs in
the prompt or in retrieval, ask whether it is **structured and keyed**. If the flow
already holds the key, it is a tool call. Only genuinely unstructured knowledge —
prose answers, FAQ text, policy explanations — is a retrieval question.

This generalises: price lists, branch addresses, service catalogues, eligibility
tables, opening hours. Anything the flow can key into should leave the prompt as a
tool, not as an embedding.

## 1a-ix. Keep the reference's structure; fix inside it

A process failure worth recording, because it cost a whole revision.

Given a working prompt to improve, I rebuilt it in a taxonomy of my own —
DELIVERY, PRIORITY INTERRUPTS, EXITS, steps as S1–S8 with routing tables. Every
individual change was defensible and the result was a different prompt, not an
improved one. The author had to send me back.

Bob states the rule and I ignored it:

> Treat the reference prompt as your TEMPLATE. Go through it SECTION BY SECTION.
> Keep the same structure, flow, and format. **DO NOT change anything unless
> there is a reason to change it.** — `BUILD_SYS`

So: **new rules go into the section that already owns that topic.** Turn shape and
warmth belong in the client's `## Tone`. Register, script and punctuation belong in
their `## Pronunciation Guide`. Inventing a section is a last resort, justified only
when the topic genuinely has no home — for this prompt, exactly once, for the
safety interrupts, which had no equivalent at all.

Two practical notes. Prose costs more per rule than a table, so honouring a
prose house style is a real budget decision, not a free stylistic choice — the same
ruleset came out ~400 tokens heavier in the client's register than in my own. And a
reference prompt's own redundancies are inherited along with its structure: the
original had overlapping guardrail lists, so deduplicating them is part of the fix,
not a departure from the template.

## 1a-x. Account for growth by cause, not by section

When a rebuilt prompt overshoots its budget, the useful report is not "it is 60%
bigger" but which category of fix bought which tokens. For the healthcare prompt,
against the original's 2,612:

| Cause | Tokens |
|---|---|
| Language and delivery quality (Tone + Pronunciation) | +929 |
| Safety interrupts that did not exist | +492 |
| Routing correctness (real symptom map, ambiguity rules) | +363 |
| Persona precision (caller state, gendered verb forms) | +140 |
| Conversation flow — 12 leakages fixed | **-20** |

The flow was the most defective section and cost nothing to repair: dead date
rules removed, gates added, a turn split, tool-gating added, all inside its
original budget. Every token of growth went to language quality the author asked
for over three rounds, and to a safety layer that was simply absent.

That framing turns "cut 400 tokens" from a vague squeeze into a priced menu — this
block costs 241, that one 210 — and the choice of what to drop belongs to whoever
owns the risk, not to whoever is writing the prompt.

## 1a-xi. Specify content, not shape

The most important lesson in this document. It explains every conversational
failure the project has had, and it came from one call where half the turns were
good and half were terrible.

The good half and the bad half had differently-written instructions.

**Step 6 — a content spec.** *"The doctor's name with years of experience; then the
clinic area and the consultation fee; then ask which day suits."* Output:

> Doctor Nikhilesh Singh के पास twenty-one years का experience है। Paschim Vihar
> clinic में उनकी consultation fee six hundred fifty rupees है, तो बताइए किस दिन
> appointment कर दूँ?

Natural, informative, varied. **Step 2 — a shape spec.** *"Reflect what they said
in a few words, then say seeing the right doctor is the next step."* Output:

> पूरे शरीर में, समझ गई। ये दर्द कहाँ हो रहा है, घुटने में, कमर में, या पेट में?
> बाइसेप्स में दर्द, समझ गई। सही doctor से मिलना ही सबसे अच्छा रहेगा।

The shape was followed exactly, three turns running, as a template.

**A shape spec describes the form of the sentence. A content spec describes the
facts the sentence must carry.** Given a shape, the model fills the slots
mechanically and the same skeleton recurs. Given content, it has to build a
sentence to hold the facts, and the sentence varies because the facts do.

Look at what each one leaves the model to decide. Content spec: the wording — which
is what language models are good at. Shape spec: the *substance* — which is what
they will fill with a stock phrase, because the instruction did not say what the
substance was.

Bob's steps are all content specs. Every one names what to say — the fee, the
qualifier, the branch — never how to shape the saying of it. That is why they read
naturally despite being scripted.

### The corollaries

**"Acknowledge" is a shape spec and cannot be fixed by tuning it.** Three rounds
went into it: a slot, then a word cap, then a preferred variant, then a ban on
repeating the word. Each fix produced a new template. The instruction was
unfixable, because acknowledgement is a *form*. Deleting it and stating what the
turn must contain fixed it in one pass: if the sentence uses what they told you,
they know you were listening, and nothing needs to announce it.

**Ban the formula, quoting the real output.** Where a shape has already fossilised
in production, name it and paste the actual bad turn into the prompt. Abstract
instructions not to be repetitive do nothing; the specific string does.

**A generic bridge is the tell.** "सही doctor से मिलना अच्छा रहेगा" — a sentence that
would fit any bot, any caller, any complaint — means the instruction asked for a
transition rather than for information. Replace it with the fact that belongs
there: which specialist, and why theirs.

**Audit for this by reading the outputs, not the prompt.** A shape spec looks
perfectly reasonable in the prompt. It is only visible in the transcript, as the
same skeleton three turns apart. So the review question is not "is this
instruction clear" but "what is the one sentence this instruction will produce
every time — and would three of those in a row be acceptable?"

### Two more from the same call

**Every step needs a two-attempt ceiling and a default.** Step 4 asked "who is the
appointment for" four times in four wordings, because the step said what to ask and
never what to do on failure. Any step that can fail needs a stated default — here,
assume the caller — or the model loops until the human hangs up.

**A caller's question outranks the step.** The caller asked where the doctor was
and was asked for a name instead. The flow said what to collect and never that an
inbound question is answered first. Any prompt that drives a collection sequence
needs this rule, or it interrogates.

## 1a-xii. Pushiness is a structural property, not a tone

The prompt drove at the booking, and softening the wording would not have fixed
it. Pushiness is decided by **what each turn is for**, not by how politely it is
phrased.

> A pushy bot advances its own goal every turn. A natural bot serves the caller's
> immediate need, and the goal advances as a consequence.

For an inbound clinic line, what the caller needs in the first thirty seconds is
to know they have reached the right place. The appointment is how that gets
delivered — it is not what the call is about. Three mechanics follow, and all
three are structural:

**Name the outcome indirectly in the opener.** "I'll book you with the right
doctor" announces a transaction; "मैं देखती हूँ कि कौन से doctor आपको देख सकते हैं" tells
them what the number is for and promises nothing. The caller learns the frame
without being sold.

**Earn the ask before making it.** By the time the appointment is raised, the
caller must already have received something — which specialist handles their
problem, and that this clinic has one. Then the ask follows from what was just
said instead of arriving because it is the bot's turn. Practically: the goal is
never named in the same turn as the qualifying information.

**Offer, do not request.** "आप दिखाना चाहें तो मैं time देख लेती हूँ" leaves the decision
with the caller; "क्या मैं appointment करा दूँ?" asks them to commit. Same step, same
outcome, entirely different pressure.

Two supporting rules: one ask only, with a hesitation handled rather than
re-wrapped as a second ask; and an inbound question answered fully before
returning to the sequence, since deflecting to keep control is the clearest
structural signature of selling.

### How I introduced it

Worth recording, because the mistake was subtle. Asked to "set the outcome of the
call indirectly", I put the outcome in the opener *directly*, then had the
qualifying step pitch the appointment as well, then let the ask step collapse into
it. Each edit was locally reasonable; together they raised the booking three times
before the caller had been given anything.

That is the same intersection blindness as §1a-x: individually sound edits whose
composition is the defect. For any goal-directed flow, count how many turns
mention the goal before the caller has received value. More than zero is pushing.

## 1a-xiii. Rules stop being the right instrument

Six rounds of transcript feedback doubled this prompt, from 2,612 tokens to about
5,000, and every round followed the same shape: a call is reviewed, a real defect
is found, a rule is added, and the next call exposes a different defect the added
rule did nothing about.

That loop is not converging, and its cause is the sample size. Each round debugs
**one transcript**. A single call exercises one path through the flow, so it can
only ever reveal the defects on that path — and each fix is unvalidated against
the paths nobody walked.

This is the argument for the drift harness, restated from the other end. Five
personas run three times each is fifteen calls per build, which would have
surfaced the template monotony, the Step 4 loop, the ignored inbound question and
the pushiness **in one pass** rather than across four rounds. It also catches the
regressions this process cannot see: the mandatory connector added in one round
and made compulsive in the next would have shown up immediately as the same word
in every turn.

The general rule for a prompt-generator project: **once feedback rounds start
producing rules that fix one call and break another, stop adding rules and build
the measurement.** Prompt length is a symptom here, not the disease — the prompt
is long because it accumulated fifteen point-fixes that were never consolidated
against each other, and consolidation needs a test suite to be safe.

## 1a-xiv. The opening turn: greeting, context, closed question

An opener has three jobs and most bots do only the first. The pattern, from an
automotive brief that solved it well:

> greeting · "you had shown interest in MG Motors" · "are you looking to buy a car?"

**Greeting** establishes who is speaking. **Context** gives the caller a reason
this conversation makes sense — for outbound, their prior action; for inbound,
what this place actually does. **A closed question** qualifies why they are on the
call, without asking for any commitment.

The failure mode it replaces is the unframed offer of help — "how may I help you",
"मैं आपकी क्या मदद कर सकती हूँ" — which puts the work of framing the call onto
someone who may not know what the number does.

Inbound needs the context element rebuilt, since there is no prior action to
reference. What this business treats or sells is the natural substitute, and it
does a second job: **naming the scope lets an out-of-scope caller say so on turn
one** rather than after five qualifying questions. For the clinic that is "हमारे
यहाँ दिल, हड्डी और पेट की दिक्कतों के doctor बैठते हैं" — the three departments, in
patient words.

Note the closed question is not pushing (§1a-xii). "आपको किसी doctor को दिखाना है?"
qualifies intent; "क्या मैं appointment करा दूँ?" requests a commitment. Qualifying
intent in the opener is correct; asking for the commitment there is not.

### Two register rules from the same call

**Say the speciality the way a customer says it, never the internal name.** The bot
said "gastroenterology doctor" to a patient. Domain taxonomies — departments, SKUs,
product codes, tiers — exist for routing; a customer hears them as jargon. Any
prompt carrying an internal classification needs the customer-facing label beside
it and a rule that only the label is ever spoken.

**A conditional offer is a statement and takes no question mark.** "आप कहें तो मैं
time देख लेती हूँ?" is malformed, and the prosody consequence is worse than the
grammar: TTS reads the rising tone as uncertainty, so a confident offer arrives
sounding unsure. The pause after a statement is the handoff.

## 1a-xv. Split the prompt: platform rules, then use case

The structural answer to "many things change per use case, but the platform rules
stay the same". Every prompt is two blocks.

**PLATFORM RULES — identical for every bot, never edited per client.** Turn
construction, how to ask, pace and pressure, language register, punctuation and
TTS, and the flow/tool/ending discipline. Lives in `docs/platform-rules.md` and is
pasted in verbatim.

**USE CASE — everything that varies.** Persona, the safety interrupts' actual
content, the facts, the steps, the closures' actual lines, objections, capture.
This is the only part a generator writes.

The measured split for the healthcare bot: **1,527 tokens of platform rules, 2,689
of use case.** Three consequences worth the restructure:

- **The generator's job shrinks by a third.** It stops re-deriving turn
  construction and punctuation for every client, which is where six rounds of
  regressions came from — each rebuild re-litigated settled rules.
- **The platform block is optimised once and every bot inherits it.** A rule proven
  on the clinic line is live on the next bot without being rediscovered.
- **A drift-harness finding lands in the right place.** Template monotony is a
  platform bug; a wrong department is a use-case bug. Filing them separately is
  what stops a client-specific fix from silently rewriting a global rule.

The discipline that makes it work: **a use-case section may never restate or soften
a platform rule.** If a client genuinely needs different behaviour, the platform
rule changes for everyone or the requirement is refused — never quietly forked.

Splitting also paid for itself in tokens: extracting the constant half exposed how
much of it was duplicated across sections, and the same ruleset came out ~760
tokens lighter.

## 1a-xvi. The greeting belongs to the platform

The platform plays the greeting from its own field, so **the prompt must never
contain a greeting or an introduction**, and the first turn responds to something
the caller has already said.

Worth stating as a platform rule rather than a per-prompt note, because the
temptation recurs: every round of "the opening is weak" invites writing a better
opening line into the prompt, and a prompt-authored greeting either duplicates the
platform's or contradicts it. What the prompt owns is turn one *after* the
greeting, and that is a different problem — it reacts to the caller rather than
framing the call.

## 1a-xvii. Asking for their data is a request; asking about their problem is a question

A politeness rule with a sharp boundary, which is what keeps it from turning into
the over-warm register of §1a-ii.

- Their **data** — name, who it is for, location, a number — is asked as
  permission: "क्या मैं आपका नाम जान सकती हूँ?", never "आपका नाम क्या है?". You are asking
  them to hand something over, so the frame is a request.
- Their **problem** — what hurts, what they need, what happened — is asked
  directly: "दर्द कहाँ हो रहा है?" needs no softening. Softening it is obsequious, and
  it wastes the turn on courtesy the caller did not ask for.

The generalisation for any language: a question that takes something from the
customer is framed as a request for permission; a question that serves them is
asked plainly. Getting this backwards is what produces both of the failure modes
this project hit — brusque where it should be deferential, and cloying where it
should be direct.

## 1a-xviii. Every classifier needs an explicit reject path

A headache reached an orthopaedic doctor. The cause was a deleted rule, and the
deletion is as instructive as the bug.

v3 said *"fits none of the three, closure E3. Never guess a department, never
stretch a symptom to fit one."* The consolidation pass that produced v8 compressed
that paragraph and kept only the multi-site case. Nothing flagged it, because a
missing rule is invisible in a prompt — it reads perfectly well without the line
that is not there.

So a headache matched no routing list, and the model had no exit. What it did next
is worth studying, because it is what any model does when a classifier has no
reject path:

1. **Recited the whole scope list as if it were an answer** — "सिर में दर्द के लिए हमारे
   यहाँ पेट, दिल और हड्डी के doctor बैठते हैं", answering a complaint with a menu.
2. **Probed twice, hunting for a way in** — "is the pain anywhere else as well?" —
   which is not a diagnostic question, it is a search for a mappable symptom.
3. **Force-fitted to the nearest department.** Headache to Orthopaedics.

None of that is a language failure. It is a model doing the only thing available
when every path out of a step requires a match and no match exists.

**Rules for any prompt that routes on a classification:**

- **State the reject path as prominently as the matches**, not inside an ambiguity
  paragraph. "Not in the lists" is a first-class outcome with its own exit.
- **Name the common rejects explicitly.** Reasoning about absence is harder than
  matching presence, and the highest-frequency out-of-scope input — here, headache
  on a healthcare line — deserves naming. This is the closed-list principle from
  §1a-vii: exhaustive lists are for what to avoid.
- **A probe may only disambiguate between valid classes, never search for
  membership.** "Which of the three is it" is legitimate; "is it also somewhere
  that would qualify" is the model negotiating with the gate.
- **The scope list is spoken only in the rejection**, never as a reply to an input.

### Register leaks are a symptom of a flow gap

Both banned phrases — "माफ़ कीजिए" and "क्या आप बता सकते हैं कि" — leaked in this same
call, having held in the previous one. They are the model's default assistant
register, so they surface exactly when it is off-script and improvising.

That reframes register bans: they are a backstop, not the fix. **The fix is to
close the gap that put the model off-script**, because a model executing a defined
path does not reach for its defaults. When a banned phrase reappears, look first
for the missing exit, not for a stronger ban.

### And a note on the greeting

The platform greeting is in the conversation history, so the model mirrors its
register. The greeting used in this call — "kya aap bata sakte aapko kis cheez ki
medical requirement hai?" — is the same form-letter construction the prompt bans,
which primes the bot toward it. **The greeting has to follow the same language
rules as the prompt**, or it undoes them from turn zero.

## 1a-xix. Trust is specific; the ask must come after the specifics, not after the category

v9.1 asked to book two turns after learning the department, and three turns before
naming the doctor. Every individual rule was satisfied — the department was
settled, the ask offered rather than requested, one ask only — and the sequence
was still wrong, because "earn the ask" (§1a-xii) had been satisfied at the wrong
resolution.

**"We have that kind of doctor" is a category. "Doctor Bhagat Singh Rajput, thirty
years" is a specific.** A caller does not commit to a category; nothing to trust
yet exists at that resolution. They commit to a specific, once they know who,
where, and what it costs. So earning the ask means presenting the specifics before
raising the goal, not merely establishing that a category match exists.

**Rule: the last content turn before an ask names the specific instance, never the
class it belongs to.** For any prompt: find the ask, walk backward to the nearest
turn that presents information, and check it names an instance rather than a
category. If the specific instance is not knowable that early in the flow — a
price that depends on a later choice, an appointment slot that depends on the
day — the ask must wait for the step that produces it, even if an earlier step
looks like a natural place to offer.

This generalises past healthcare directly. A sales bot must name the actual model
and its price before asking to book a test drive, not "we have SUVs in that
segment." A support bot must state the actual fix before asking to close the
ticket, not "that's a known issue."

## 1a-xx. A closure's shape depends on the news, not on whether the call succeeded

Every rejection closure ended on the same breath as the bad news — "there is no
doctor for that here, thank you for calling" — while the booked closure alone got
a second turn to ask if anything else was needed. Good news got a conversation;
bad news got a door shut. Politely worded, and still rude, because **rudeness here
is a structural property of the turn count, not of the words in it.**

**Rule: every closure that is not an emergency, an ending after abuse, or a dead
line is two turns, regardless of outcome.** First turn: what is happening and why.
Ask if there is anything else, and wait — genuinely wait, not rhetorically, because
sometimes the answer reopens the flow. Second turn, once they say no: the farewell,
then hangup.

The three exceptions are not carve-outs invented for this rule; they are cases
that already have their own reason to end fast — an emergency where every extra
second matters, an abusive caller who has forfeited the courtesy, a line that may
already be dead. Everything else, success or refusal, gets the same shape. A
prompt author's instinct is to write the happy path generously and the refusal
tersely, because the refusal feels like it should be over quickly; that instinct
is backwards, and it is exactly what produced this bug.

This is a platform rule, not a use-case one — no bot on any use case should hang
up on a refusal in the same breath that delivers it.

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

## 3a. Boundary requests — the fourth harm-model question

Phase 0 asked three questions: what causes irreversible harm, what must never be
asserted, where does one sentence lose the customer. A fourth belongs beside them,
and it is the one that produced the headache-to-orthopaedics bug:

> **What will callers ask for that sits just outside what we offer?**

Every bot has a scope, and callers land next to it constantly. The failure is
always the same shape — the model either **force-fits** (headache to Orthopaedics;
"you wanted a Safari? the Hector is basically the same") or **improvises a
refusal** and loses someone who was ready to buy. Both are one-sentence retention
moments on rare-but-aggregate-frequent inputs, which is precisely the
fixed-response test in §2. Boundary requests are a canonical fixed-response class.

### Deriving them mechanically

Do not brainstorm edge cases. **Enumerate the axes the bot qualifies on; each
axis's complement is a boundary case.** The axes are visible in the flow — every
step that narrows the caller down is an axis.

**Healthcare, inbound appointments:**

| Axis | In scope | Boundary request |
|---|---|---|
| Speciality | cardio, ortho, gastro | headache, skin, eye, ear, teeth, gynae, paediatric, mental health |
| City | Gurgaon, Delhi | Noida, Ghaziabad, another state |
| Named doctor | the six listed | "I want Dr Mehta" |
| Doctor attribute | two are women | a woman doctor in the wrong city |
| Service | consultation booking | reports, admission, surgery, ambulance, home visit, second opinion, a bill |
| Payment | consultation fee | insurance, cashless, a discount |
| Timing | free slots | "I need to be seen today" |

**MG Motors, sales enquiry** — same method, nothing shared:

| Axis | In scope | Boundary request |
|---|---|---|
| Brand and model | the MG range | **a Safari, a Creta, any non-MG model** |
| Body type | what MG makes | a pickup, a convertible |
| Fuel and transmission | MG's variants | diesel where MG offers none |
| Budget | MG's price bands | "something under five lakh" |
| Location | cities with a showroom | a town with no dealer |
| Service | sales enquiry, test drive | servicing, spare parts, an insurance claim, resale valuation |
| Timeline | the real waiting period | "I need delivery this week" |

### Hard boundary or soft boundary

The response shape depends on whether a legitimate substitute exists, and getting
this wrong is what makes a bot either useless or pushy.

**Hard boundary — no substitute is possible or it would be wrong to offer one.**
A speciality the clinic does not have. Medical advice. Substituting is the bug, so
the fixed statement is: name the limit plainly, say what happens instead, close.
Never suggest the nearest department; a headache is not an orthopaedic problem at
any strength of framing.

**Soft boundary — a legitimate near-match exists.** A Safari is a seven-seat SUV
and MG sells seven-seat SUVs. A woman doctor exists, in the other city. Nothing is
free today, something is free tomorrow. The fixed statement acknowledges what they
asked for, names the nearest real thing **once**, and accepts a no.

The soft case is where pushiness lives, so it gets its own rule: **one sentence
naming the alternative, then their decision.** Never explain why the alternative
is better, never compare, and above all **never disparage what they asked for** —
they named a competitor's product, not a mistake. "Safari is a good car, हमारे यहाँ
seven-seater में Hector Plus है" is right; a paragraph on why MG beats Tata is not.

### Cost is near zero if the closures already exist

Most boundary cases do not need a new fixed line. They need a **trigger pointing at
a closure that already exists** — the clinic's "not our department" and "the team
will call you" lines absorb almost the whole table, so nothing new had to be
scripted.

Measured, not estimated: the healthcare boundary block came to **269 tokens** for
seven cases, about 38 each. I had guessed 120, which was wrong by more than
double — the triggers are free but the "handle it once, then the exit" wording
around each one is not. Budget roughly 40 tokens per boundary case and count the
axes before promising the space.

### What the generator does

1. Read the flow and list every step that narrows the caller — those are the axes.
2. For each axis, write the complement.
3. Classify each as hard or soft.
4. Hard gets a plain limit plus an exit. Soft gets an acknowledgement plus one
   named alternative plus acceptance of a no.
5. Point each at an existing closure wherever one fits.

## 3b. Industry playbooks — the goal and the flow shape come from the industry

The MG Motors prompt qualified nothing and looped. Trace of the real call:

> **Bot:** Gloster एक large seven-seat SUV है। क्या मैं इसके बारे में और जानकारी दूँ?
> **Caller:** Yes Ma'am, tell me
> **Bot:** Gloster एक बड़ी seven-seat SUV है। क्या आप जानना चाहेंगे कि ये किस शहर में उपलब्ध है?

Asked to say more about the car, it restated the category in different words, then
changed the subject. Three failures compound here, and all three are method gaps.

### The recommendation turn must carry specifics, not the category again

"Gloster is a large seven-seat SUV" is the class, not the car. §1a-xix already says
the turn before an ask names a specific instance — that rule extends to **every**
information turn, not just the one before the ask. A recommendation names what a
buyer actually weighs: the engine or range, the seats, the one feature that
distinguishes it. "Gloster में two-litre twin-turbo diesel है, seven seats, और 4x4
option भी मिलता है" is a car. The other sentence is a brochure heading.

### A prompt with no facts can only ask permission to speak

The root cause. The Facts section said `FILL FROM THE KNOWLEDGE BASE` — so the bot
had nothing to say, and the only move left was to ask whether it may say it. Hence
"क्या मैं इसके बारे में और जानकारी दूँ?" twice.

**When no knowledge base is supplied, the generator supplies the product knowledge
it already has.** A named client in a known industry is not an empty brief: the
model lineup, the specs, the segments are all knowable. Mark only the volatile
things — price, current offers, stock, delivery dates — as team-confirmed. Shipping
a placeholder where facts belong produces a bot that cannot hold a conversation.

Corollary, now a platform rule: **never ask permission to give information.** If
the step says to say something, say it. "May I tell you more about it?" is a
comprehension check wearing a different hat.

### The goal and the flow skeleton are properties of the industry

This is what the industry selector is for, and the generator was ignoring it. Each
industry has a small set of real goals and a canonical shape. The goal is always a
**named, checkable outcome**, never "qualify leads" left abstract.

| Industry | Real goals | Flow skeleton |
|---|---|---|
| Automotive sales | Test drive booked · showroom callback | need → recommend a specific model with specs → qualify on budget, timeline, exchange → offer the test drive → capture → confirm |
| Healthcare | Appointment booked · callback | concern → department → city → the named doctor with fee → offer → capture → slot → confirm |
| Real estate | Site visit scheduled · senior callback | requirement of configuration, budget, locality → recommend a named project with specifics → qualify → offer the visit → capture → confirm |
| Education | Counselling session · application started | interest → programme → eligibility → offer counselling → capture |
| Banking, insurance | Specialist callback · documents collected | need → product → eligibility → offer the callback → capture |

Two rules follow. **Qualification comes before the offer** — that is what makes a
lead a lead, and a flow that jumps from a product name to "shall I have someone
call you" has qualified nobody. And **the goal must be reachable with the tools
selected**: with only a hangup tool the bot cannot book, so the outcome is a
captured, qualified request the team confirms — and the prompt must say plainly
that nothing is booked yet.

## 3c. Qualifiers have preconditions, and the greeting is a deliverable

Two failures from an MG Motors test call, both structural.

### A qualifier fired that an earlier answer had already settled

> **Caller:** I was understanding Hector.
> **Bot:** *(correct Hector specifics)* क्या आप इसे petrol में लेना चाहेंगे या electric option देख रहे हैं?
> **Caller:** Electric ki taraf zyada inclined hoon.
> **Bot:** *(switches to Windsor EV and ZS EV)*

The Hector has no electric variant. The step said "ask petrol or electric" with no
precondition, so it fired on a caller who had already named a model — which decides
the fuel. Offering the choice invented an option; when the caller took it, the bot
had to abandon the car they rang about.

**Every qualifying step states its precondition and is skipped when an earlier
answer determines it.** This is the cross-step form of "never ask a question your
own sentence just answered" (§1a-xi) — same failure, one turn further apart, and
invisible unless the generator is told to look for it.

Sharper still: **a choice offered must exist for what the caller has selected.**
Generic qualifiers — fuel, size, tier, plan — are only askable inside the set the
caller's own choice still leaves open. So the facts must carry the constraint, not
just the attributes: which models are electric only, which are not, and that none
is offered both ways. Attributes alone let the model infer a choice that the
catalogue does not offer.

### The greeting is spoken by the platform but written by the generator

The platform plays the greeting from its own field, so the prompt correctly
contains none (§1a-xvi). But that left the opener to whatever happened to be in
that field — and what played was the unframed "मैं आपकी किस तरह मदद कर सकती हूँ?"
that §1a-xiv exists to prevent.

Both things are true at once: the prompt must not contain a greeting, and the
greeting still has to follow the greeting rules. So the generator emits it as a
**separate, clearly labelled deliverable** to paste into the platform's field —
greeting, context, closed intent question — rather than leaving turn zero to
chance. Anything the platform speaks but the prompt does not own still belongs in
the generator's output.

## 3d. Catalogue familiarity decides who leads the discovery

The bot listed three cars and asked "आपको इनमें से कौन सी पसंद आएगी?" — handing the
caller a menu. For cars that is nearly right but backwards; for a property or an
insurance product it would be nonsense. The variable is **how much of the
catalogue the customer already knows before they call**, and it is a property of
the industry.

**High familiarity** — cars, phones, airlines, well-known consumer brands. The
caller usually has a name in mind and has probably already read about it. So ask
whether they have one in mind, and only run through the range if they do not.
Leading with a list wastes the turn and sounds like a brochure.

**Low familiarity** — real estate projects, insurance and investment products,
medical departments, course catalogues, B2B services. The caller knows their
*need*, not your inventory, and cannot pick from a list of names they have never
heard. So take the need — budget, locality, configuration, symptom, goal — and
**recommend one specific thing**, with the reason it fits. Asking them to choose
is asking them to do your job.

| Industry | Familiarity | Discovery step |
|---|---|---|
| Automotive, consumer electronics | High | "Do you have a model in mind, or shall I run through what we have?" |
| Real estate, insurance, investments | Low | Take budget, locality, configuration → recommend one project or product, and say why |
| Healthcare | Low | Take the symptom → name the department and the doctor |
| Education | Mixed | They may know the course but not the eligibility route |

The generator picks the discovery shape from this, not from a template. And note
the interaction with §3b: on a high-familiarity call the recommendation still has
to carry specifics — knowing the name is not knowing the car.

## 3e. Speech-to-text tolerance is not optional, and its absence looks like rudeness

Same call, a caller asking about the Astor:

> **Caller:** Ma'am, main co-actor ke liye soch raha tha.
> **Bot:** मुझे माफ़ कीजिए, पर मैं समझ नहीं पायी।
> **Caller:** I was thinking about the actor.
> **Bot:** माफ़ कीजिए, मैं सिर्फ MG की cars के बारे में बता सकती हूँ।

The engine mangled "Astor" into "co-actor" and "actor", and the prompt had no rule
for it — so a real buyer, naming a real product, was told he was off-topic and the
call died. Bob carried an STT section for exactly this and it was dropped when the
platform rules were written; restoring it is a regression fix, not an addition.

**Names are what break.** Products, models, people, places — every one of them
arrives corrupted, and the fix is to match to the nearest name in the facts and
carry on **silently**. Never read the garbled word back, never announce that you
did not understand a name, and never let a near-miss fall through to the
out-of-scope path. Only when nothing in the facts is close do you ask, once.

Where a catalogue has names a speech engine will predictably mangle, the generated
prompt should carry the near-misses explicitly — actor and aster for Astor,
gloucester for Gloster — because naming them is cheaper than the model reasoning
about phonetics mid-call.

**Note also which rule leaked while this happened:** "माफ़ कीजिए" is banned outright,
and it appeared twice. It surfaced precisely where the model had no defined path,
which is §1a-xviii again — a register leak is a symptom of a flow gap, and closing
the gap is what fixes it.

## 3f. Why the Bob prompts could not be used as a style source

Four prompts Bob actually generated were supplied as a quality target — Aranyakaa Farms,
Propsoch, Axon Developers, Kashi Nirmal Heights. I spent three rounds distilling style
rules from them into this file and applying them. **Every round made the prompt worse,
and the version from before that work was better.** It has been restored.

The rules I extracted were all really in those prompts — a reason attached to questions,
content-specific acknowledgements, rebuttals ending on a question, one nudge then accept.
They failed anyway, and the reason is structural rather than a mistake in any one rule:

**Those prompts are a different genre.** Each runs fifteen thousand tokens or more on a
model with no ceiling, and every line the bot will ever speak is written out. In that
form a rule is invisible — it was applied once, by the author, at authoring time, and
what ships is the finished line. Acebot has four thousand tokens and writes
*instructions*, so a rule has to ship as a rule the model reads every turn. Compressed
that way it stops being taste and becomes scaffolding the caller can hear: "a reason on
every question" became six consecutive "ताकि…" clauses; "acknowledge specifically"
became flattery and echoing the caller's own words back.

**A scripted prompt's style cannot be lifted into an instruction-based one.** The
technique that produces a good line by hand becomes a tic when a model must apply it
every turn. This is the same failure as §1a-xi — specify content, not shape — arriving
from the other direction.

Two findings from those rounds were real defects rather than style, and are recorded here
**unapplied**, pending a decision:

1. **Non-answers were never classified.** In one test call the exchange question was
   asked four times and then asked again after the flow had moved on, because fillers,
   garbled speech and silence were not treated as failures to answer. A two-tries-then-
   drop rule would fix it; it is a bug, not a matter of taste.
2. **An invented callback timeframe is a fabricated commitment.** "आपको कल तक call आ
   जाएगा" was one client's SLA. Copying it into another client's prompt promises
   something the business never agreed to, and this file already forbids delivery dates.

The standing rule from all of this: **the pre-existing prompt is the baseline, and a
change has to beat it on a real call.** Three rounds of style theory did not.

## 3g. The section list is derived, not a template

I built the Godrej prompt by editing the MG file. That is the wrong method and it
produces a car prompt with property words in it. The two canonical prompts prove the
point — set side by side, **they do not have the same sections, the same step order, or
the same shape of facts**, and every difference is forced by the use case:

| | Ace Healthcare | MG Motors |
|---|---|---|
| Step 1 | **Listen and map silently** | **Ask which model** |
| Facts shape | Table of six doctors, routing lists, exhaustive exclusion list | Grouped by fuel, with the one-fuel-per-model constraint |
| STT section | none | **Hearing model names** |
| `## Never` | present | absent |
| Pronoun rule | present (आपको / उन्हें) | absent |
| Name asked at | **step 2** | **step 7** |
| Tools | three — it **books** | one — it **requests** |
| Out of scope | exhaustive list, immediate C2 | boundary rules that offer the nearest thing |

Neither is a variant of the other. Each was derived. So the generator does not carry a
section list — it carries these questions, and the answers decide which sections exist.

**1. Who called whom?** This comes before everything else and I got it wrong on the
Godrej bot, generating an inbound flow for an outbound one.

**Inbound**: they want something, so they have already paid for the right to be asked
questions. Qualify, then deliver.

**Outbound**: they wanted nothing. **Every question asked before you have given them
something is an imposition**, and the qualifiers stack up as an interrogation. So an
outbound flow **pitches first** — what the project is, what they get — and qualifies only
where the answer changes what happens next. On an outbound call the greeting also never
claims what the customer has done: "आपने interest दिखाया था" invites "मेरा number कहाँ से
मिला" and puts them on the back foot. Say what you are calling about instead.

Two consequences that caught me out. **The name is already in the CRM on an outbound
call**, so a name step is dead weight — the name arrives as a variable. And an outbound
bot **cannot run on a permission-boundary facts section**: with nothing concrete to
pitch it has nothing to say, which is the same failure as the early MG bot that could
only ask permission to speak. An outbound prompt needs real substance in its facts or it
does not ship.

**2. What does the caller know when they ring?** Nothing about the catalogue → step 1
takes their *need* and you recommend. They already know the product → step 1 asks which
one. This single answer sets the whole opening.

**3. What is the irreversible harm, and whose?** Healthcare screens the *caller's* state
— an emergency ends the call before anything else happens. Real estate screens *the
bot's own claims* — a quoted price or a promised return is the harm. Same section name,
opposite direction, so never copy one into the other.

**4. What breaks when the model gets a fact wrong?** That decides the shape of Facts,
and there are at least three: a **table** when attributes must be looked up per row; a
**grouping by the constraint that breaks** when one dimension must never be crossed; a
**permission boundary** — what you may say versus what only the team may say — when the
project is real but you do not hold its details.

**5. Can the bot complete the goal?** Tools that book need a read-back-and-confirm step
and a closure that states it is done. A bot that can only request needs neither, and
must never phrase a request as a confirmation.

**6. Is the caller the beneficiary?** A third party on the line — a family member, a
co-decider — forces a pronoun rule and a "who is this for" step. Where the caller is the
buyer, both are dead weight.

**7. What does speech-to-text break in this domain?** Short product names get clipped.
Numbers collide — one BHK against ek bhk, crore against karod. Symptoms are described,
not named, so they barely break at all. Write the section for what actually breaks here.

**8. When is the name actually needed?** Never, on an outbound call. Early if a tool call needs it. Late if it is
only a label on a handoff.

**9. Is out-of-scope substitutable?** Offer the nearest thing when substituting is
harmless. Reject exhaustively when a near-miss does damage — which is why healthcare
lists what it cannot treat and automotive does not.

Answer the nine, then write only the sections the answers call for. **A section that no
answer asked for is padding, and a section the answers demand cannot be inherited from
another client's file.**

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
28. Structural instructions say how the parts JOIN, not only that they exist
29. Filler caps explicitly exempt connectors and discourse particles
30. Code-mixing specified: target-language grammar, no English function words inside it
31. Orthography TTS-checked: common spellings, nukta only where needed, no hyphenated digits
32. No tokens spent on facts the base model already knows
33. Punctuation rules stated: comma, question mark, danda, and the banned marks
34. Every verbatim spoken line occupies exactly one source line
35. Every example obeys every rule — examples teach harder than prose
36. No spoken line contains a dash, ellipsis, bracket, colon or double space
37. No closed vocabulary list for anything meant to sound spontaneous
38. Variety specified as shapes to rotate, not just words not to repeat
39. No rule is stated as always or never where "use it, vary it" is the real intent
40. The actual observed failure is quoted into the prompt as a negative example
41. Structured, keyed facts are a tool call before they are a retrieval question
42. New rules go into the section that already owns the topic; new sections are a last resort
43. Budget overshoot is reported by cause, as a priced menu, not as a percentage
44. The intersection of the rules is audited, not just each rule on its own
45. Every step instruction is a CONTENT spec, never a shape spec
46. For each instruction: what single sentence will it produce every time, and are three in a row acceptable?
47. No generic transition sentence that would fit any bot — name the fact instead
48. Every step that can fail states a two-attempt ceiling and a default
49. An inbound question is answered before the step continues
50. The goal is not named before the caller has received something of value
51. The ask offers rather than requests, and is made once
52. Count the turns mentioning the goal before value is delivered — more than zero is pushing
53. The opener does greeting, context, and a closed intent question — never an unframed offer of help
54. Scope is named in the opener so an out-of-scope caller self-selects on turn one
55. Internal taxonomy names are never spoken; every one has a customer-facing label
56. A conditional offer ends in a full stop, never a question mark
57. The prompt is split into platform rules and use case; the generator writes only the second
58. No use-case section restates or softens a platform rule
59. The prompt contains no greeting — the platform plays it
60. Questions that take something from the customer are framed as requests; questions that serve them are direct
61. Every classification that gates the flow has an explicit, prominent reject path
62. The highest-frequency out-of-scope inputs are named, not left to reasoning about absence
63. A probe may disambiguate between valid classes, never search for membership
64. The scope list is spoken only in the rejection, never as a reply to an input
65. A recurring register leak is investigated as a missing exit before a stronger ban
66. The platform greeting follows the same language rules as the prompt
67. Every axis the flow qualifies on has its complement enumerated as a boundary request
68. Each boundary is classified hard or soft; soft names one alternative and accepts a no
69. A competitor's product named by the caller is never disparaged and never claimed
70. Boundary triggers point at existing closures rather than adding new lines
71a. Every information turn names specifics, not the category restated
71b. With no knowledge base, the generator supplies the product knowledge it has
71c. Never ask permission to give information
71d. The goal is a named checkable outcome drawn from the industry, never left abstract
71e. Qualification steps come before the offer
71f. The goal is reachable with the selected tools, or the prompt says what is not booked
71g. Every qualifying step states its precondition and is skipped when an earlier answer settles it
71h. A choice is offered only where it exists for what the caller already selected
71i. The facts carry constraints, not just attributes
71j. Nothing already described is described again
71k. The greeting is emitted as a separate deliverable, following the greeting rules
71l. The script rule survives a mismatched greeting and a mismatched caller
71m. Discovery shape is chosen by catalogue familiarity: ask when they know it, recommend when they do not
71n. STT tolerance for names is present, with the predictable near-misses listed
71o. No rule in the generated prompt fires on every turn; each states when it applies
71p. The section list was derived from the eight questions in 3g, not inherited from another client
71q. No section exists that none of the nine answers called for
71. The turn just before an ask names a specific instance, never a category
72. If the specific is not knowable yet, the ask waits for the step that produces it
73. Every non-emergency, non-abuse, non-dead-line closure is two turns regardless of outcome
74. A refusal never ends the call in the same breath that delivers it
