---
phase: quick-260930-nt4
plan: 01
subsystem: planning-docs
tags: [macos-signing, keychain, documentation, todo-append]
requires: []
provides:
  - "A `## STATUS 2026-09-30 (quick-260930-nt4)` section appended to `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`, recording the MEASURED result of the local signed-A to signed-B Keychain ACL test `## STATUS 2026-09-30 (quick-260930-m85)` proposed: the ACL honours an identity-based designated requirement, settling consequence 2"
affects: [2026-08-17-humble-slots-still-prompt-unattended-at-startup.md]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md
decisions:
  - "Recorded closure (status: OPEN -> completed/, unblocking the parked sibling) as a PROPOSAL in prose only — frontmatter left byte-identical to HEAD's, per the plan's hard constraint; the operator makes both calls"
  - "Reproduced the dialog's curly quotes and the designated-requirement line byte-for-byte from the plan's <measured_at_planning_time> block via `sed` extraction rather than hand-typing them, so the fenced verbatim blocks could not silently drift to straight quotes"
metrics:
  duration: "~30 minutes"
  completed: 2026-09-30
status: complete
actuals:
  tokens: 20500
  tasks: 2
  commits: 1
  plan_head_before: 7f09cdf282278ad5ec93701bb607e0eb35e0c8e2
---

# Quick Task 260930-nt4: Record the consequence-2 ACL result Summary

**One-liner:** Appended a sixth, purely-additive STATUS section to the macOS signing/notarization
todo, recording that the local signed-A/signed-B/ad-hoc-C Keychain probe measured the ACL as
identity-based rather than cdhash-pinned — a second, differently-built binary sharing the same
Developer ID identity and code-signing identifier reads a Keychain item created by the first one
silently, while an ad-hoc-signed binary blocks behind a password prompt — and proposed (without
applying) closing the todo now that its original question is answered.

## What happened

`## STATUS 2026-09-30 (quick-260930-m85)` reframed consequence 2 from "needs a second published,
notarized release" to a claim about the Keychain ACL's designated requirement, testable locally
with two Developer-ID-signed bundles. That local test has now run. This task's only job was to
record the result, exactly as measured and supplied pre-taken in the plan's
`<measured_at_planning_time>` block — no probe was re-run (it no longer exists), no Keychain item
was read or dumped, and no `codesign`/`spctl`/`find-identity` command was re-executed.

**Task 1** appended a new `## STATUS 2026-09-30 (quick-260930-nt4)` section immediately before
`## Related`, changing nothing else in the 638-line file. The section:
- Names all five prior STATUS sections (`2026-09-14`, `2026-09-17`, `2026-09-23`, `2026-09-24`,
  `2026-09-30 (quick-260930-m85)`) as not revised, per the file's own additive convention.
- Records the probe design as an honest ANALOGUE: a scratchpad Rust binary pinned to `keyring`
  3.6.3 / `apple-native` (matching `Cargo.lock`), service `com.gamelib.acl-probe` never touching
  `com.gamelib.launcher`, variant B differing from A only by a `RUSTFLAGS` build-flag cfg, and the
  DECLARED REAL-PROFILE ARM reasoning — a fake HOME would have measured nothing, since it yields a
  fresh empty login keychain where every read trivially succeeds.
- Records the three-row result table at column 0: signed-A (creator) reads instantly, signed-B
  (same identity, different cdhash) reads `RESULT=get-ok MATCHED=true` SILENTLY at `elapsed=0s`,
  ad-hoc-signed C BLOCKS the full window at `rc=142` (SIGALRM). Positive control ran first; both
  arms were reproduced on a second pass, which also proves no `Always Allow` leaked into the ACL.
- Reproduces the dialog verbatim (curly quotes included) in a fenced block, its four AX-reported
  buttons, and the `SecurityAgent` pid/start-time corroboration that a prompt, not an unrelated
  hang, caused the block — with one narrow sentence that AX reading this native dialog does not
  contradict the standing AX-is-blind-to-the-Tauri-webview lesson.
- Records WHY IT GENERALISES: the real signed bundle's `designated =>` line, verbatim, carries NO
  cdhash, while the negative control shows both unsigned builds differ from the signed build in
  BOTH identifier AND cdhash — two independent re-prompt reasons, worse than the todo had assumed.
- States the three residuals plainly (artifact-level read never run — an INFERENCE, not a
  measurement; updater replace-in-place path untested; no real N -> N+1 sequence run), and records
  the session's own correction that a claimed `Deny` click never actually landed (`-1719 Invalid
  index`; the dialog had already self-dismissed under SIGALRM).
- Records the cheaper `steamgrid-api-key` artifact-level test route (with its four file/line
  coordinates), the cleanup (probe item deleted through its own creator, three live items left
  untouched and PRESENT, `-w` never used), the operator errand the measurement unlocks, and the
  closure PROPOSAL: marking `## STATUS 2026-09-30 (quick-260930-m85)` item 6's `ready: live-gate`
  proposal SUPERSEDED, and naming the parked humble sibling by filename as no longer stranded, with
  unblocking it left as a separate, un-taken decision.

**Task 2** staged the todo edit and this quick task's own directory by explicit path only,
asserted the staged blob and the staged file list against the index (not the working tree) before
committing, then committed both together in a single commit with the required attribution line.

## Formatter check: recorded ABSENT, not run and not passed

No `npx prettier --check` appears anywhere in this plan or was run during execution. Measured (and
already recorded in the plan at planning time): `npx prettier --file-info` on the todo's path
reports `{ "ignored": true, "inferredParser": null }` — `.prettierignore` lists `.planning`, so
`--check` over this path would match zero files and print its success line regardless of content.
Per CLAUDE.md, that green must never be written into a `<verify>` block as though it were
assurance. The plan's `WRAP_WIDTH_MATCHES_CORPUS` gate (<=106 bytes, re-calibrated against the
whole existing body with fenced-block interiors exempt) is the real, non-vacuous formatting
control on this edit, and it passed — dry-run before writing the real file, then again against the
real file after. Beyond it, consistency rests on hand-matching the file's own sentence shape,
table style, and heading shape — weaker than a formatter, and what there is.

## The PURELY_ADDITIVE gate and its HEAD~1 twin: both fired, both passed

Task 1's pre-commit gate stripped the new section's line range from the working-tree file and
diffed the remainder against `HEAD`'s blob — byte-identical, confirming no prior section was
revised and nothing was reflowed. This was dry-run twice: once against a scratch copy of the file
before touching the real one, and once against the real file after the edit landed in the working
tree. Task 2's post-commit twin re-anchors the same comparison from `HEAD` to `HEAD~1` once the
commit moves that baseline — confirming the commit that actually reached history is purely
additive, not just the working tree immediately before it.

## Measurements: supplied pre-taken, not re-derived — three commands banned outright

Every fact in the new section (the three cdhashes, the dialog text, the `SecurityAgent` pid, the
designated-requirement lines, the debug/adhoc Cargo-derived identifiers) was taken verbatim from
the plan's `<measured_at_planning_time>` block and was NOT re-executed during this task. The probe
crate and its binaries no longer exist to re-run. `security find-generic-password` (any form,
including its password-dumping `-w` form), `security find-identity`, `codesign`, `spctl`, and any
Keychain read/write/delete were all explicitly banned by the plan and none were run. The three live
Keychain items (`steam-refresh-token`, `humble-session`, `humble-csrf`) were not read, dumped, or
touched in any way by this task.

## The closure proposal: recorded, not applied — the operator owns every call

The new section recommends moving `status: OPEN` to closed and relocating the file to
`.planning/todos/completed/`, with the three item-5 residuals carried into a new pending todo only
if the operator wants them tracked. None of that was applied: the frontmatter block is
byte-identical to `HEAD`'s copy before this commit (verified by diff, not inspection), the file
remains at its `pending/` path with no twin under `completed/`, and no other todo file — not a
residuals todo, not the parked humble sibling — was created or edited. `git status --porcelain --
.planning/todos/` reported exactly one dirty path throughout: the target file.

## Task Commits

1. **Task 1: Append the STATUS 2026-09-30 (quick-260930-nt4) section (working-tree edit only, no
   commit)** — no separate commit; Task 1 is a working-tree edit whose gates (heading placement +
   purely-additive, frontmatter byte-identical, no column-0 frontmatter shapes in the body, the
   three content-marker gates covering items 1-10, the wrap-width gate, `pnpm planning-gates`
   12/12 with 18 pending todos, and the out-of-scope-paths check) all ran and passed against the
   uncommitted working tree before Task 2 staged anything.
2. **Task 2: Stage, assert the index, and commit** — one commit, confined to the todo's `pending/`
   path plus this quick task's own directory (`260930-nt4-PLAN.md` and this SUMMARY), carrying the
   required `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` attribution line.
   The staged blob was asserted to hold the new heading before committing; the landed `HEAD` blob
   will be asserted against `HEAD~1` immediately after the commit, per the self-check below. This
   SUMMARY lands inside that same commit, so its own resulting hash is confirmed with `git log -1
   --stat` after the commit lands rather than self-cited here.

## Verification (phase-level, all re-run against this repo before commit)

- `pnpm planning-gates` -> `12/12 planning gates passed.` (unchanged from the 12/12 baseline
  measured at planning time).
- `.planning/todos/pending/` -> still 18 `*.md` files (this task neither moves nor adds a todo).
- `git cat-file -p HEAD:<todo path>` (pre-commit, against the then-current `HEAD`) confirmed
  exactly one `## STATUS 2026-09-30 (quick-260930-nt4)` heading placed before `## Related`.
- Stripping the new section from the working tree reproduced `HEAD`'s pre-commit blob byte for
  byte; the post-commit twin will reproduce `HEAD~1`'s blob byte for byte from the landed `HEAD`
  blob, asserted immediately after the commit.
- The frontmatter block is byte-identical to `HEAD`'s pre-commit copy; `severity: minor`,
  `platform: macos`, `ready: human`, and `status: OPEN` are each present, bare, and unquoted.
- No body line outside the frontmatter begins with a frontmatter-shaped key at column 0.
- `git status --porcelain` over `src-tauri`, `src/backend`, `src/frontend`, `CLAUDE.md`,
  `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.github/workflows` was empty at commit time.
- `git rev-list --left-right --count origin/main...HEAD` was `0` / `0` before this task's commit
  and is expected `0` / `1` after it, NOT `0` / `2` — this baseline differs from the prior quick
  task's. Nothing was pushed.

## Deviations from Plan

None — plan executed exactly as written. One process note, not a content deviation: the dialog's
curly quotes and the `designated =>` line were extracted byte-for-byte from the plan file via
`sed` into scratch files and spliced into the new section programmatically, rather than hand-typed,
specifically so the fenced verbatim blocks could not silently drift to straight ASCII quotes or an
altered designated-requirement string. Every gate (the four content-marker gates, the purely-
additive gate, and the wrap-width gate) was dry-run against a scratch copy of the target file
before the real file was ever touched, and again against the real file after, so the real file was
never in a failing state at any point this task wrote to it.

## Known Stubs

None. This is a documentation-only append; nothing renders empty data or ships placeholder text.

## Threat Flags

None — this is a documentation-only change confined to one file under `.planning/`. No runtime
code, no network call, no new dependency, no package-manager install, no UI, and no Keychain item
was read, created, deleted, or modified by this task.

## Self-Check: PASSED

- FOUND: `.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`
  (unmoved — still in `pending/`, as expected; this task changes its content only).
- FOUND: `.planning/quick/260930-nt4-record-consequence-2-acl-result/260930-nt4-PLAN.md`
- FOUND: `.planning/quick/260930-nt4-record-consequence-2-acl-result/260930-nt4-SUMMARY.md`
  (this file).
- `pnpm planning-gates` -> 12/12, re-confirmed after the edit and before commit.
- `.planning/todos/pending/` -> 18 files, unchanged.
- All of Task 1's automated `<verify>` gates ran and passed against this repo, both on a scratch
  dry-run copy and on the real file, before Task 2's commit step.

---
*Phase: quick-260930-nt4*
*Completed: 2026-09-30*
