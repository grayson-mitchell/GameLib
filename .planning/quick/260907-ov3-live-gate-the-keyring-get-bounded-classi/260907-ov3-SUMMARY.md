---
phase: quick-260907-ov3
plan: 01
subsystem: docs/todos
tags: [keyring, steam, live-gate, archival-discharge, sidecar-rpc]
requirements: [REQ-34.4.1-GAP-11, T-34.4.1-114, T-34.4.1-115, D-34.5-ROUTING-3]
dependency-graph:
  requires: []
  provides:
    - "Closed todo .planning/todos/completed/2026-08-23-keyring-get-bounded-timeout-unverified-live.md"
    - "Preserved-in-repo evidence for keyring_get's bounded, classified 45s timeout"
  affects:
    - ".planning/todos/pending/ (one fewer open item)"
tech-stack:
  added: []
  patterns:
    - "Archival discharge: grep the existing log archive before staging a fresh forced reproduction"
key-files:
  created:
    - .planning/quick/260907-ov3-live-gate-the-keyring-get-bounded-classi/260907-ov3-LIVE-GATE.md
    - .planning/quick/260907-ov3-live-gate-the-keyring-get-bounded-classi/260907-ov3-evidence-35-02-ab-tauri-part1.log
    - .planning/quick/260907-ov3-live-gate-the-keyring-get-bounded-classi/260907-ov3-evidence-34.6-21-gap2.log
    - .planning/quick/260907-ov3-live-gate-the-keyring-get-bounded-classi/260907-ov3-evidence-pre-346-12.log
  modified:
    - .planning/todos/completed/2026-08-23-keyring-get-bounded-timeout-unverified-live.md (git mv from pending/, appended 2026-09-07 disposition)
decisions:
  - "Discharged the todo from three pre-existing log archives rather than staging a fresh forced Keychain-block reproduction, because the archive already contains a stronger specimen (naturally occurring, two independent slots in one session, negative control in the same session) than anything that could be staged, at zero teardown risk to a live credential slot."
metrics:
  duration: "~35 minutes"
  completed: "2026-09-07"
---

# Phase quick-260907-ov3 Plan 01: Live-gate the keyring_get bounded, classified timeout Summary

Closed a two-week-old todo by preserving and scoring log evidence that was already sitting on disk — the discharge condition was met on 2026-08-24, one day after the todo opened, but nobody re-read the log archive until now.

## Close verdict

**All discharge clauses MET; the todo closed.** Every clause was scored individually against a quoted line from the primary specimen, backed by a runnable grep against the in-repo copy:

| Clause | Verdict |
|---|---|
| C1 — `keyring_get` actually times out | MET — two independent slots, one session |
| C2 — producing a classified error | MET, three independently (Rust-side `keyring:timeout`, TS-side `class=timeout`, downstream consumer branch) |
| C3 — inside the bound, RPC budget not consumed | MET, non-vacuously — 0 hits for the 60s transport timeout on `keyring_get` archive-wide, and the 60s timer was confirmed armed (`keyring_get` absent from `UNBOUNDED_RUST_CHANNELS`) |
| C4 — elapsed measured, not inferred | MET, twice over — self-reported `elapsed=` token plus independent wall-clock corroboration to the second on both slots |
| X1/X2 — not either previously-rejected observation | MET — distinct session, distinct failure-mode string |
| D — evidence applies to today's tree | MET — five specific regions across `main.rs`/`keyringTokenStore.ts` proven byte-identical against a named, resolved baseline sha (`d629d9f30`), independently re-extracted and re-hashed by this execution, not merely re-quoted from the plan |
| NC — non-vacuity of the negative control | MET, for free — the deliberately-unwrapped `keyring_delete` sibling in the *same session*, minutes later, produced the opaque 60.0s transport timeout the wrapped arm avoids |

No bar was widened, narrowed, or accommodated to fit the evidence — every observed value matched the plan's stated expectation exactly (one bar, C2(c), observed 4 hits against an expectation of `>=1`; verified as four log lines from two distinct timeout events, each duplicated in the source log, not a discrepancy).

## Exact figures

- `elapsed=45006ms` (`humble-session`, three separate sessions: 2026-08-24, 2026-08-26, 2026-08-28) and `elapsed=45004ms` (`steam-refresh-token`, 2026-08-28) — both under the 60000ms `RUST_INVOKE_TIMEOUT_MS` bound.
- Wall-clock corroboration: `humble-session` issued 15:48:56 → failed 15:49:41 (45s); `steam-refresh-token` issued 15:49:04 → failed 15:49:49 (45s).
- `rustInvoke timed out after 60000ms: keyring_get` — **0** occurrences across the entire log archive.

## Baseline sha for the drift proof

`d629d9f30` (`docs(35-02): item 1 verdict BOTH — corrects an incomplete Electron record`, 2026-08-28), resolved and read, not assumed. This execution independently re-derived and re-extracted the five discharge-relevant regions (`KEYRING_READ_TIMEOUT` const, `bounded_keyring_read`, `keyring_get_result`, `keyring_account`, the `keyring_get` dispatch arm, and `keyringTokenStore.ts`'s `fetchToken()`), confirming byte-identity independently rather than trusting the plan's quoted md5s verbatim. Also confirmed: the three files touched by the drift claim are **unmodified** between the plan's stated HEAD (`1a6b6985f`) and the actual scoring commit (`4650dbdc4`), so the proof applies to the tree at the moment this task executed, not just the tree at planning time.

## Negative control

The deliberately-unwrapped `keyring_delete` sibling arm, same slot (`steam-refresh-token`), same session, ~2 minutes after the classified `keyring_get` timeouts: `rustInvoke timed out after 60000ms: keyring_delete` — an opaque transport-layer error with no named classification, at 60.0s instead of the wrapped arm's classified error at 45.0s. This proves the greps distinguish a bounded, classified failure from a silent RPC-budget consumption, using two arms in the same blocked-Keychain session rather than a staged comparison.

## Task 3 status

**NOT RUN — awaiting an operator decision.** Task 3 (the optional forced reproduction on today's binary) is a `checkpoint:human-verify` gate that cannot be self-answered by an executing agent; this project has a recorded prior incident of auto-mode fabricating a human-verify outcome, and this execution deliberately did not repeat it. Every R1–R6 bar in `260907-ov3-LIVE-GATE.md`'s optional section stays at `(not run)`. The gate file records that this section awaits an operator and explains what the optional run would add (capturing the Rust-side `eprintln!` stderr line, F5 — the one thing the archive cannot supply, which the discharge condition does not require). **The close in Task 2 does not depend on Task 3 and is not affected by whether or how an operator eventually runs it.**

## Premise correction

The todo's own framing said the bounded, classified timeout "has never been watched fire" and its 2026-08-25 disposition hedged with *"the specific timeout event never fired (or was not reported if it did)"*. **It fired, repeatedly, and it was reported** — an `elapsed=`-bearing `keyring:timeout` line was on disk by 2026-08-24, before the 2026-08-25 disposition was even written. The 2026-08-25 disposition was not careless: it correctly re-read the 34.6 gate *document* and found neither of that document's two recorded observations was a discharge. What it did not do was re-read the raw log *archive*, which held a different, dischargeable observation the gate document never named. The transferable lesson, recorded in the todo's own closing disposition: before staging a fresh run to force an event, grep the log archive for it first — it may already be there.

## Deviations from Plan

None — plan executed exactly as written. The scoring commit (`4650dbdc4`) differs from the plan's stated HEAD (`1a6b6985f`) only because of unrelated concurrent-session commits between planning and execution; this was verified not to affect the drift proof (the three files the proof depends on are byte-for-byte unchanged across that range) and is documented in the gate file rather than treated as a plan deviation.

## Self-Check: PASSED

All five created/modified artifacts confirmed present on disk; both task commits (`0b507147b`, `7c2130f84`) confirmed in `git log`; zero non-`.planning/` files changed across this session's commits.
