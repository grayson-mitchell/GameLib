---
phase: 260908-gye
plan: 01
subsystem: planning-tooling
tags: [todos, triage, planning-gates, vscode-extension, ci]
requires: []
provides:
  - closed triage vocabulary (severity/platform/ready) on every pending todo
  - CI enforcement of that vocabulary via pnpm planning-gates
  - severity+readiness badges in the VS Code Explorer (extension v0.10.0)
affects:
  - .planning/todos/pending/
  - meta/runPlanningGates.py
  - CLAUDE.md
tech-stack:
  added: []
  patterns:
    - "planning gate discovered by `-gate.py` suffix, self-test first then live walk"
    - "anti-vacuity floor raised in lockstep with each new gate"
key-files:
  created:
    - .planning/todos/todo-frontmatter-gate.py
  modified:
    - .planning/todos/pending/*.md (35 files)
    - meta/runPlanningGates.py
    - CLAUDE.md
    - ~/.vscode/extensions/gsd-phase-status/parse.js (OUT OF REPO, uncommitted)
    - ~/.vscode/extensions/gsd-phase-status/extension.js (OUT OF REPO, uncommitted)
    - ~/.vscode/extensions/gsd-phase-status/test-parse.js (OUT OF REPO, uncommitted)
    - ~/.vscode/extensions/gsd-phase-status/package.json (OUT OF REPO, uncommitted)
decisions:
  - "`platform:` means the OS required to DO or VERIFY the work, not the OS the defect manifests on"
  - "platform-gated todos take `ready: blocked`, so `grep -l 'ready: code'` returns only work finishable today"
  - "free-text severity collapsed to its EVIDENCED value (medium), not its unmeasured upper bound"
metrics:
  duration: ~50 min
  completed: 2026-09-08
---

# Quick 260908-gye: Todo Triage Decorations Summary

Normalized `severity:` to a closed vocabulary and backfilled `platform:`/`ready:` across all 35
pending todos, guarded the vocabulary with a ninth planning gate (floor 8 → 9), and taught the
`gsd-phase-status` extension to render a 2-char severity+readiness badge instead of a uniform grey
circle.

## Corpus size measured

**35 pending / 101 completed**, measured at task 1 start.

**It did not drift during this run.** Re-measured three times — at task 1 start, immediately before
the first commit, and at final verification — and it read 35 every time. The concurrent session
(`260908-gx3`) committed `dbc541727` during the window but touched no todo file. This is worth
recording precisely because planning saw it move twice (38 → 37 → 35); the volatility was real but
did not recur here.

The task-1 script asserted set equality between the 35 filenames it planned for and the 35 on disk,
and would have halted with `HALT: corpus drifted; re-adjudicate before writing` had a file been
filed or closed mid-task. It did not fire.

## The six severity adjudications

Every other file already carried one of the four target values and was left byte-unchanged. The
diff bears this out: 91 insertions / **6 deletions**, and the only deletions are these six lines.

| # | File | Old | New | Why |
|---|------|-----|-----|-----|
| 1 | `2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` | `low` | `minor` | Mechanical fold — `low` is not in the vocabulary, `minor` is its exact synonym. No judgement. |
| 2 | `2026-09-03-all-10032-non-english-fork-strings-are-unreviewed-machine-translation.md` | `low` | `minor` | Mechanical fold. No judgement. |
| 3 | `2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri.md` | `low` | `minor` | Mechanical fold. The file's own `## Impact` section independently says "Low". |
| 4 | `2026-09-06-jest-run-orphans-gamelib-sidecar-spinning-at-100-cpu.md` | `unknown` | **`major`** | Five orphans pinned at ~100% CPU for 14 hours — five of ten cores saturated by processes nobody knew were running. It **silently contaminated test measurements**: the debug session that found them had already attributed its own load average to "an unrelated concurrent process". Deterministic, not drift — five independent processes hashed to the same stack signature `77a7b78f9436b659`. Not `critical`: dev-environment only, no user impact, no data loss. |
| 5 | `2026-09-06-bootstrapwirings-protocol-url-log-assertion-drops-under-load.md` | `unknown` | **`medium`** | A ~1-in-8 CI flake with a named, plausible mechanism (fixed delay vs. real I/O) and a documented remedy. Not `major`: the diagnosis is still a hypothesis and the blast radius is test flakiness, not shipped behaviour. Not `minor`: this project's own record shows this exact shape dismissed as "pre-existing flake" **eight times** before proving a real harness defect. |
| 6 | `2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md` | free text: `unknown-pending-one-gesture (upper bound: … lower bound: …)` | **`medium`** | See below. |

### #6 in detail — the free-text collapse

`medium` is **the highest value the evidence supports today**, deliberately not the upper bound.

- The **lower bound is confirmed**: the 2026-09-02 index-walking binarycookies census found 14 live
  GOG/Amazon records surviving an explicit logout. That is a measured privacy defect, so `minor` is
  too low.
- The **upper bound (silent re-auth) is a hypothesis nobody has run.** Scoring it `major` would be
  grading a defect by its worst imaginable reading rather than its measured one.

**The nuance was moved into the BODY, not deleted.** A new `**Severity rationale (recorded
2026-09-08, quick 260908-gye)**` paragraph sits under the file's existing `## The one gesture that
sets severity` heading. It restates both bounds, says the frontmatter now reads `medium` and that
the paragraph rather than the key is where the judgement lives, and names the escalation trigger:
run the gesture, and silent completion ⇒ raise to `major` in the same edit that records the
outcome.

## Judgement rules applied for `platform:` and `ready:`

These were not in the plan; every pending file needed a call and consistency mattered more than any
individual assignment. Both rules are stated so the human can disagree with the rule rather than
with 35 separate decisions:

1. **`platform:` = the OS required to DO or VERIFY the work**, not the OS the defect manifests on.
   This matches the two pre-existing `platform: windows` files, both of which carry
   `verifiable_on: "operator has a Windows machine (not primary OS)"`. Consequence worth flagging:
   `2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md` is titled "on Linux" but
   got `platform: any`, because its discharge condition is a source edit plus a jest guard anchor —
   fully satisfiable at this desk. Marking it red would have discouraged a fix that is actually
   available today.
2. **Platform-gated files take `ready: blocked`.** The strict reading of `code` ("no live gate *and
   no other OS*") excludes them, and it keeps `grep -l 'ready: code'` honest — it returns only work
   that can be *finished* today, which is the question the key exists to answer.

Resulting distribution: `ready: code` 11, `live-gate` 10, `human` 8, `blocked` 6. `platform: any`
30, `windows` 3, `macos` 2, `linux` 0.

## Gate non-vacuity: 74 RED findings against the pre-normalization corpus

Extracted the pre-normalization tree with `git archive HEAD~1 .planning/todos/pending | tar -x`
into a scratch dir (never `git stash`, never `git checkout --`), copied the gate beside it, and ran
it. **Exit 1, 74 findings across 35 files:**

| Finding | Count |
|---|---|
| `platform :: <MISSING>` | 33 |
| `ready :: <MISSING>` | 35 |
| `severity :: low` | 3 |
| `severity :: unknown` | 2 |
| `severity :: unknown-pending-one-gesture` | 1 |
| **total** | **74** |

The arithmetic is a second, independent confirmation of the work: 33 = 35 − the 2 files that
already had `platform:`; 35 = every file, since `ready:` existed on zero; and the 6
out-of-vocabulary severities are **exactly** the six adjudications above, found by the gate rather
than by me.

The gate also carries a 15-case `self_test()` — 9 reject-side, 5 accept-side, plus an empty-corpus
check driven through the real `scan_pending` against a real empty directory. Mutation-checked
implicitly: the self-test fails loudly if any check proves incapable of rejecting its bad input.

**T-GYE-03 is covered by two accept-side cases**, not one: body prose reading `Severity: low, and
NOT a security regression`, and — the harder shape — a body line `ready: nonsense` at column 0
*after* the closing fence, which must neither convict nor register as a duplicate of the real key
above it. Frontmatter-only parsing is what makes both pass.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] CLAUDE.md broke the prettier gate**

- **Found during:** Task 2, after writing the Conventions entry.
- **Issue:** `npx prettier --check CLAUDE.md` failed on my new markdown table.
- **Baseline named, not assumed:** restored `git show HEAD:CLAUDE.md` (at `e594500e9`) into a copy
  at the repo root — same directory, so prettier resolves the *same* config — and it reported
  `All matched files use Prettier code style!`. The drift was mine, not pre-existing.
- **Fix:** `npx prettier --write CLAUDE.md`. Confirmed scoped: `git diff -U0` shows a single hunk
  at `@@ -107 +107,40 @@`, +40/−1, entirely inside the Conventions section.
- **Commit:** `c33f98771`

**2. [Rule 1 - Bug] The gate printed `GATE FAILED` during a PASSING self-test run**

- **Found during:** Task 2, first self-test run.
- **Issue:** the deliberate empty-corpus case calls the real `scan_pending`, whose failure goes to
  stderr — so a green run emitted a literal `GATE FAILED:` line. A future reader greps the CI log,
  sees it, and believes the gate is red when it is green. That is a misleading-output defect in a
  file whose entire purpose is trustworthy signal.
- **Fix:** captured that one case's stderr with `contextlib.redirect_stderr`, and asserted the
  captured text contains `ZERO todo files` so suppressing it cannot hollow out the check.
- **Commit:** `c33f98771`

### Planner-discretion points I resolved

**Ladder rung 1 was implemented as `status === 'complete'`, not `folder === 'completed'`.** The
design lists rung 1 as "folder is `completed/`" and calls it "today's behaviour, unchanged" — but
those two are not the same thing. `todoFileStatus` checks parked *before* completed, so a parked
todo sitting in `completed/` renders purple today. A literal `folder === 'completed'` first check
would have repainted it green. The plan's own instruction to "reuse the existing `todoFileStatus`
for rungs 1-3" resolves the conflict in favour of preserving today's behaviour, which is what I
did. Rungs 1-3 are mutually exclusive under `todoFileStatus`, so their relative order is moot.

## Out-of-repo changes (task 3) — CAPTURED BY NO GAMELIB COMMIT

These four files live at `~/.vscode/extensions/gsd-phase-status/`, are **outside this repository**,
and are **under no version control whatsoever**. No GameLib commit contains them, `git status` in
this repo is clean of them, and nothing here can restore them if they are lost. Precedent for this
arrangement is quick `260823-d7j`, which bumped the same extension 0.7.x → 0.8.0 and recorded
exactly this caveat.

| File | Change |
|---|---|
| `parse.js` | Added `todoTriage(fm, folder)` + `TRIAGE_SEVERITY_DIGIT` + `normalizeTriageValue`; exported `todoTriage`. Implements the 10-rung ladder. Carries both required rationale comments (deliberate badge/colour redundancy; accepted `charts.green` cross-namespace wart). |
| `extension.js` | `decorateTodoFile` now calls `todoTriage(fm, folder)` instead of the flat `STYLE[status]` lookup; `todoTriage` added to the `require('./parse')` destructure. The `stale` disagreement clause is preserved verbatim and folded into the tooltip. `todoDecoration` routing, `countBadge`, `tallyTodos`, `TODO_OPEN_COLOR`/`TODO_DONE_COLOR` untouched. |
| `test-parse.js` | +27 `triage:` assertions. All 17 pre-existing `todo:` assertions unmodified and still green (the plan said 13; the file actually carries 17). |
| `package.json` | `"version":"0.9.0"` → `"0.10.0"`. Verified by JSON diff that this is the **only** field that changed. |

### Task 3 evidence

- `node test-parse.js` → `All parser tests passed.` (27 new + 17 pre-existing green)
- Independent cap sweep (the plan's own command) → `CAP OK across 120 combinations`
- In-suite cap sweep → **512** severity × readiness × platform combinations, zero violations,
  including `undefined`/`null`/`''`/garbage inputs
- **Mutation-checked for non-vacuity** — four mutants introduced into a scratch copy of `parse.js`,
  each caught: platform precedence disabled → 1 FAIL; 3-char badge → 17 FAIL; value-lowercasing
  removed → 1 FAIL; `completed/` short-circuit disabled → 7 FAIL. The assertions can fail.
- Rendered against the **real 35-file corpus** through the real `parseFrontmatter`: **14 distinct
  badges across 5 colours**, every badge exactly 2 characters, and **zero** `??` untriaged files.
  Colours: green 11, blue 10, orange 8, purple 3, red 3 — and `descriptionForeground` (the old
  uniform grey) now claims **0** files.

## Human-verify checkpoint: NOT RUN

**The `<task type="checkpoint:human-verify" gate="blocking">` at the end of the plan was NOT run,
NOT answered, and NOT inferred.** No visual claim in this document is a claim about pixels — the
distribution above is computed from the parser, not observed in the Explorer. An executor
answering its own human-verify gate is a recorded failure mode in this project, and `autonomous:
false` is set on this plan.

**What the human needs to do:**

1. Reload the VS Code window (`Cmd+Shift+P` → "Developer: Reload Window") — v0.10.0 will not load
   until you do.
2. Expand `.planning/todos/pending`. Expect a spread of 2-char badges in varied colours, **not** a
   column of identical grey `○`. Per the computed forecast you should see 14 distinct badges
   (`1G`, `2G`, `2H`, `2W`, `2.`, `3B`, `3G`, `3H`, `3W`, `3.`, `4B`, `4G`, `4H`, `4.`) and no grey.
3. Confirm `.planning/todos/completed` is visually unchanged (green `✓`).
4. Confirm both folder count badges still show their numbers.
5. **Spot-check the `ready:` and `severity:` judgements — this is the part no gate can verify.** 35
   files were judged by reading them; the two rules driving those calls are stated under
   "Judgement rules applied" above, so disagreement is probably cheaper to express against a rule
   than against individual files. The green (`ready: code`) items are the strongest claim: they
   assert you could genuinely start and finish them at the desk right now.

Two judgements most worth a second opinion: the `medium` on the GOG/Amazon logout free-text
collapse (#6 above — `major` is defensible if you weight the unmeasured upper bound), and
`platform: any` on the "on Linux" EOS overlay todo (rule 1 above).

## Threat Flags

None. No new network endpoints, auth paths, file access patterns or schema changes at a trust
boundary. The gate is a read-only predicate over `.planning/`; the extension change is pure
rendering of data already read.

## Commits

| Commit | Scope |
|---|---|
| `e594500e9` | `docs(260908-gye)`: 35 pending todos, frontmatter normalization (35 M, zero R/A/D) |
| `c33f98771` | `feat(260908-gye)`: gate + `MINIMUM_EXPECTED_GATES` 8 → 9 + CLAUDE.md Conventions |

Both staged by explicit path with `git diff --cached --name-status` read immediately before
committing. No `git add -A`, no `git stash`, no `git checkout --`, no `git mv`, no `gsd-sdk
commit`. The concurrent session's untracked files (`.claude/skills/archify/`, `skills-lock.json`)
were present throughout and were **not** swept into either commit.

## Verification

| Check | Result |
|---|---|
| `python3 .planning/todos/todo-frontmatter-gate.py --self-test` | PASS (15 cases) |
| `python3 meta/runPlanningGates.py` | `9/9 planning gates passed.` |
| Frontmatter-only sweep over `pending/` | `SWEEP DONE`, no `BAD` lines |
| `npx jest --selectProjects Meta -t 'planning-gate'` | 7 passed (floor bump did not break the wiring test's `>= 6` assertion) |
| `node test-parse.js` | `All parser tests passed.` |
| Independent 2-char cap sweep | `CAP OK across 120 combinations` |
| `npx prettier --check CLAUDE.md` | clean |
| `git log --oneline -2` | two commits, both explicit-path, neither touching `src/` |
| Human-verify checkpoint | **NOT RUN — blocking, awaiting the human** |

## Self-Check: PASSED

- `.planning/todos/todo-frontmatter-gate.py` — FOUND
- `meta/runPlanningGates.py` (`MINIMUM_EXPECTED_GATES = 9` at line 60) — FOUND
- `CLAUDE.md` Conventions entry — FOUND
- 35 files in `.planning/todos/pending/`, all three keys in vocabulary — FOUND
- commit `e594500e9` — FOUND
- commit `c33f98771` — FOUND
- `~/.vscode/extensions/gsd-phase-status/package.json` at `0.10.0` — FOUND (out of repo, uncommitted)
