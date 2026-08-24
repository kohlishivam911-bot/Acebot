# Acebot

Voice-bot prompt generator for low-latency, cost-optimised deployments.

Acebot generates **instruction-based** voice-bot system prompts that fit inside a
hard token ceiling (~4,000 tokens) while preserving flow control and rule
adherence — as opposed to the fixed-response approach, which scripts every line in
every language and cannot fit the budget.

## Status

Design phase. See [`docs/prompt-architecture.md`](docs/prompt-architecture.md) for
the architecture spec, budget allocation, and the open questions blocking the
generator meta-prompt.

## Planned modules

| Module | Purpose |
|---|---|
| Builder | Requirements → budgeted instruction prompt, with a live per-section token meter |
| Budget inspector | Real tokeniser counts per section against the allocation |
| Drift harness | Runs the prompt against lead personas and diffs trajectories against the state machine |
| Auditor | Static pass: routing completeness, gate coverage, instruction sufficiency |
| Editor | Targeted change with scope discipline and a semantic rule guard |
| History | Per-client versioning with budget and harness score attached |
