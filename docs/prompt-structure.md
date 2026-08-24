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
