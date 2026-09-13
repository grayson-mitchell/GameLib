---
phase: quick-260912-n9i
plan: 01
subsystem: planning-tooling
tags: [audit-open, gsd-sdk, debug-sessions, planning-docs]
requirements: ['QT-260912-n9i']
dependency-graph:
  requires: []
  provides:
    - "audit-open emits legible one-line hypotheses for 4 previously key-emitting debug sessions"
  affects:
    - .planning/debug/deep-link-open-url-abort.md
    - .planning/debug/download-queue-require-crash.md
    - .planning/debug/humankind-depot-full-stall.md
    - .planning/debug/nile-spawn-app-side-latency.md
    - .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
tech-stack:
  added: []
  patterns:
    - "Insert-only prose line under `## Current Focus`, above the untouched YAML key, to make audit-open's first-non-empty-line slice legible without restructuring YAML"
key-files:
  created: []
  modified:
    - .planning/debug/deep-link-open-url-abort.md
    - .planning/debug/download-queue-require-crash.md
    - .planning/debug/humankind-depot-full-stall.md
    - .planning/debug/nile-spawn-app-side-latency.md
    - .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
decisions:
  - "Replaced 2 of the 4 planner-supplied prose strings after confirming they no longer matched the session's own recorded current state (see below); kept the other 2 verbatim after confirming them true."
  - "Built the two negative-control fixtures (NEG-hypothesis.json, NEG-counts.json) from the AFTER capture rather than the raw BASELINE, so each fixture differs from a valid state in exactly one dimension and the comparator's failure is attributable to the intended check, not a confound from stale pre-Task-1 hypothesis text."
metrics:
  duration: "~50m"
  completed: "2026-09-12"
---

# Quick 260912-n9i: Fix `audit-open` Current Focus emitting a YAML key Summary

One-liner: Inserted one true, sub-100-char ASCII prose line under `## Current Focus` in four
debug files so `gsd-sdk query audit-open` emits a sentence instead of a YAML key, verified by a
programmatic comparator (not a rendered `cat`) with a proven-capable-of-failing negative control.

## What was done

**Task 1** — Inserted a prose line (plus a blank line) directly under `## Current Focus` in each
of the four in-scope debug files, above the existing YAML key line, changing nothing else. Verified
via `git diff --numstat` (exactly four `2  0` lines) and an `awk` prose-shape assertion (first
non-empty line after the heading is ASCII, under 100 chars, not a `key:` shape).

**Task 2** — Appended an `## ITEM B CLOSED 2026-09-12` section to the governing todo
(`.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md`),
immediately after its H1 and before the existing `RE-MEASURED` section, recording: item B done,
the 1-vs-4 census delta and why the census's block-scalar-only instrument couldn't see the 3
plain-key fields, the consequence for the `reaches-as-bare-indicator` reachability table, and the
two empty-`hypothesis` sessions as a distinct, deliberately-unfixed defect. Frontmatter triple
(`severity: major` / `platform: any` / `ready: human`) left byte-unchanged; file stays in
`pending/`; zero deleted lines.

**Task 3** — Re-captured `gsd-sdk query audit-open` (inline JSON, no `@file:` indirection this
run), wrote a Node comparator (`compare-audit-open.mjs`) keyed on `items.debug_sessions[].slug`
(discovered by inspecting one baseline element rather than assumed), asserting: (a) identical slug
set, (b) byte-identical `hypothesis` for all 13 out-of-scope sessions, (c) exact match to the
inserted prose for all 4 in-scope sessions (under 100 chars, ends on the sentence's real final
character), (d) byte-identical `counts` over the union of both objects' keys. Ran it against the
real AFTER capture (PASS) and two perturbed fixtures (both FAIL, see below). Ran
`pnpm planning-gates` (10/10, unchanged from baseline).

## Critical judgement call: two of the four supplied prose lines were stale

The plan supplied four prose strings verbatim but required confirming each against that session's
own current recorded state before inserting. Two were true as supplied; two were not, because the
files themselves had moved on past the point the strings described.

- **`deep-link-open-url-abort.md`** — kept the supplied line unchanged. Confirmed true: the file's
  `## Current Focus` `hypothesis: |` block still reads "UNRESOLVED for the abort... the fault has
  not recurred", and the panic hook (installed and described later in the same file) is armed
  rather than actively driven. No later section in this file contradicts it.

- **`download-queue-require-crash.md`** — kept the supplied line unchanged. Confirmed true against
  the file's own `## Resolution` section: root cause confirmed and fixed, verification is
  build/test-level only, and `next_action` explicitly says "Awaiting human confirmation that a real
  download cancel + a real download completion no longer crash/wedge in the packaged app."

- **`humankind-depot-full-stall.md`** — **replaced.** Supplied line: "Decode is the ceiling: the SEA
  sidecar spawns no workers, so every chunk decodes inline." This described the state during the
  session's original 5 live runs, but the file's own `## Resolution` section (timestamped
  2026-08-17T21:45, later than the `## Current Focus` checkpoint's 21:40) states the SEA
  companion-file gap "has SINCE landed (260817-pkx, confirmed engaging live by the
  Planetfall/718850 run)" and that a follow-up P/E-core test was run against a pool that was
  genuinely spawning real workers (`pool[size=4 busy=4 idle=0]`, fully saturated — not
  `inline=true`). "Spawns no workers" is therefore false of the session's current state; the true,
  still-current finding is that decode remains the throughput ceiling *even with the worker pool
  now fixed and its default size confirmed correct*. Inserted instead: "Decode remains the ceiling
  now that the SEA worker pool engages; default pool size is confirmed." (96 chars, ASCII).

- **`nile-spawn-app-side-latency.md`** — **replaced**, per the plan's own explicit flag. The
  `## Current Focus` section is marked SUPERSEDED and its YAML asserts candidate (a) as a
  CONFIRMED root cause; a later `## 2026-08-06 falsification checkpoint (CURRENT)` section refutes
  candidate (a) and designs a "decisive test" to isolate a new self-warm-up candidate, leaving it
  explicitly BLOCKED pending live GUI access — which matches the plan's supplied line. However,
  reading past that checkpoint surfaced two further sections, both also dated 2026-08-06 and
  positioned later in the file: `## 2026-08-06 ADDENDUM — --onedir MEASURED` and
  `## 2026-08-06 FINAL — mechanism CONFIRMED, both fixes REVERTED by user decision`. The FINAL
  section reports a bare-shell-only measurement (no app, no window, no UI) that directly answers
  the "decisive test"'s question without needing the elaborate GUI click sequence: 6 back-to-back
  spawns of the same binary average 6.75s, one spawned after a 360s idle costs 21.27s (3.27x) —
  confirming time-since-last-spawn of the same PyInstaller-onefile binary, not anything in
  GameLib's app/sidecar/Rust host/OAuth window, is the dominant mechanism. Both candidate fixes
  were reverted on user instruction once this was established, and the real fix identified is
  upstream `--onedir` packaging (measured ~95x cold-spawn improvement). So "blocked on the live
  self-warm-up isolation test" is no longer true — that question was answered by a different,
  simpler test than the one the checkpoint had designed. Inserted instead: "Warm-up decay confirmed
  as root cause; both fixes reverted; the real fix is upstream onedir." (92 chars, ASCII). The
  file's own trailing `## Resolution` section (positioned last, after FINAL) still reads as if the
  decisive test were pending — that appears to be stale prose the file's own later sections
  overtook without a corresponding update; it was left untouched per hard constraint 1 (no
  restructuring of anything beyond the one inserted line).

## Output, parsed from JSON (not retyped or eyeballed)

**The four emitted `hypothesis` strings, read from `audit-open-AFTER.json`:**

| slug | hypothesis (parsed) | len |
| --- | --- | --- |
| `deep-link-open-url-abort` | `"Abort unresolved and not reproducing; the panic hook is armed to self-diagnose the next one."` | 92 |
| `download-queue-require-crash` | `"Cause confirmed and fixed; awaiting a live packaged-app cancel and completion confirmation."` | 91 |
| `humankind-depot-full-stall` | `"Decode remains the ceiling now that the SEA worker pool engages; default pool size is confirmed."` | 96 |
| `nile-spawn-app-side-latency` | `"Warm-up decay confirmed as root cause; both fixes reverted; the real fix is upstream onedir."` | 92 |

**Negative-control exit codes** (both derived from the valid AFTER capture with exactly one field
perturbed, so each is attributable to its own check — a NEG fixture built from the raw BASELINE
instead would trip the in-scope-hypothesis check (c) as a confound before ever reaching (b) or (d),
since baseline's in-scope hypotheses are pre-Task-1 stale key text):
- `NEG-hypothesis.json` (one non-in-scope session's hypothesis flipped by one char): **exit 1**,
  reason `(b) out-of-scope session "tray-icon-swap-noop" hypothesis changed.`
- `NEG-counts.json` (one `counts` value bumped, `todos` 5 -> 6): **exit 1**, reason
  `(d) counts differ: todos: baseline=5 after=6`.
- Real AFTER capture against BASELINE: **exit 0**, `COMPARATOR PASS: all post-conditions hold.`

**`counts.total`:** before 313, after 313 (byte-identical `counts` object confirmed by the
comparator's check (d), which diffs the union of both objects' keys).

**`pnpm planning-gates`:** 10/10 (same gate set and count as the plan's recorded pre-execution
baseline).

## Deviations from Plan

### Auto-fixed / judgement-call adjustments

**1. [Critical judgement call, per plan instruction] Replaced 2 of 4 supplied prose strings**
- Found during: Task 1
- Issue: the supplied strings for `humankind-depot-full-stall.md` and
  `nile-spawn-app-side-latency.md` described states each file's own later sections show as
  superseded (see "Critical judgement call" above for full reasoning).
- Fix: substituted a truer, still-ASCII, still-sub-100-char line for each, derived directly from
  each file's own latest recorded section.
- Files modified: `.planning/debug/humankind-depot-full-stall.md`,
  `.planning/debug/nile-spawn-app-side-latency.md`
- Commit: not committed (hard constraint 4 — orchestrator owns the commit)

**2. [Rule 4-adjacent, disclosed rather than silently applied] Negative-control fixtures built from
AFTER, not BASELINE**
- Found during: Task 3, first negative-control run
- Issue: constructing `NEG-counts.json` as a literal perturbed copy of the raw baseline JSON (as
  the plan's prose describes) caused it to fail at check (c) — because baseline's in-scope
  sessions still carry pre-Task-1 YAML-key hypotheses, not the inserted prose — rather than at the
  intended check (d), making the counts-specific negative control indistinguishable from a stale
  fixture and not a genuine test of the counts-diff logic in isolation.
- Fix: rebuilt both `NEG-hypothesis.json` and `NEG-counts.json` from the valid `audit-open-AFTER.json`
  capture instead, each with exactly one field perturbed, so each fixture differs from a
  genuinely-passing state in only the one dimension it is meant to test. Re-ran; `NEG-hypothesis`
  now fails at (b) and `NEG-counts` now fails at (d), matching the plan's stated expectation ("each
  naming its own reason (b and d respectively)").
- Files modified: none in the repo (scratchpad only)
- Commit: n/a (scratchpad artifacts, not committed)

No other deviations. No stubs introduced. No new threat surface (no network endpoints, auth paths,
or schema changes) beyond what the plan's threat model already scoped.

## Self-Check

- `.planning/debug/deep-link-open-url-abort.md` — FOUND, modified, `git diff --numstat` = `2 0`
- `.planning/debug/download-queue-require-crash.md` — FOUND, modified, `git diff --numstat` = `2 0`
- `.planning/debug/humankind-depot-full-stall.md` — FOUND, modified, `git diff --numstat` = `2 0`
- `.planning/debug/nile-spawn-app-side-latency.md` — FOUND, modified, `git diff --numstat` = `2 0`
- `.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md` — FOUND,
  in `pending/`, absent from `completed/`, 0 deleted lines, frontmatter triple unchanged,
  `todo-frontmatter-gate.py` passes
- `$SCRATCH/compare-audit-open.mjs` — FOUND, exit 0 on real AFTER, exit 1 (reason b) on
  NEG-hypothesis, exit 1 (reason d) on NEG-counts
- `pnpm planning-gates` — 10/10, exit 0
- No commits made (hard constraint 4 honored) — `git status --short` shows only the five expected
  modified files plus the pre-existing baseline-dirty untracked/modified items from session start

## Self-Check: PASSED

No missing items.
