---
quick_task: 260911-qds
title: "Transcribe the REQ-43-19 live-gate RE-RUN into 43-LIVE-GATE.md"
status: AWAITING_HUMAN_CHECK
requirements: [REQ-43-19]
branch: fix/steam-native-install-stability
baseline: 0d2ae9862
---

# 260911-qds: Transcribe the REQ-43-19 live-gate RE-RUN — Summary

**RECORDS-only task.** No build, no app launch, no re-measurement was performed — all numbers
transcribed verbatim from `/tmp/gamelib-gate-20260911T062945Z/measurements-rerun.md` (run 2) and
the surviving `/private/tmp/gamelib-gate-20260911T043842Z/` session directory (run 1 capture
recovery).

## Significant finding not anticipated by the plan or its addendum

The plan's addendum instructed copying run 1's "three primary captures" — including
`capture-2-bottom.png` — into `43-10-evidence/`, on the premise that these three files backed
run-1 deviation 1's claim ("re-verifiable by anyone from `capture-*.png`"). **On the required
visual inspection, `capture-2-bottom.png` turned out not to show GameLib at all** — it is an
accidental capture of an unrelated code-editor window (a `.planning/todos/pending/` file open in
an IDE, with an agent terminal panel visible). It has zero evidentiary value for anything
`43-LIVE-GATE.md` cites it for.

Rather than silently follow the flawed instruction or silently substitute a different file, I:
1. Still copied `capture-2-bottom.png` exactly as instructed (for provenance).
2. Cross-referenced `verdict-notes.txt` (the run-1 scorer's own working notes) to identify which
   file *actually* backs the light-theme measurements: `burst-4.png`, confirmed sha256-identical
   to `burst-5.png`/`burst-6.png`/`burst-7.png`.
3. Copied `burst-4.png` in as well, despite the addendum's instruction to leave burst frames out
   — that instruction's reasoning rested on the false premise that `capture-2-bottom.png` was
   valid evidence.
4. Documented the entire discovery transparently in
   `43-10-evidence/README-run1-capture-recovery.md`, including a disposition table mapping every
   preserved file to the items it backs (or, for `capture-2-bottom.png`, to nothing).

No run-1 measurement or verdict changed as a result. All four PNGs in `43-10-evidence/` were
visually confirmed free of an open `HumbleClaimWizard`/revealed key.

## Task 1: Evidence preservation, verification, P11 scan

**`43-11-evidence/` (run 2)** — 8 files copied from `/tmp/gamelib-gate-20260911T062945Z/`, all
sha256-verified byte-identical to source: `capture-1-columns.png`, `capture-2-top.png`,
`capture-3-gog.png`, `measurements-rerun.md`, `p1-precondition.log`, `gamelib-launch-1.log`,
`gamelib-launch-1.old.log`, `terminal.log`.

**`43-10-evidence/` (run 1) additions** — 3 files instructed by the addendum plus 1 correction:
`capture-1-columns.png`, `capture-2-bottom.png`, `capture-3-dark-bottom.png` (sha256-verified
against `/private/tmp/gamelib-gate-20260911T043842Z/`), plus `burst-4.png` (added as a correction,
sha256 `93e27f9e...11d8`, identical to burst-5/6/7), plus `README-run1-capture-recovery.md`
documenting the finding above.

**P11 redaction scan** (two dash-separated-alphanumeric-group regexes, Humble redemption-code
shape) over all text evidence in `43-11-evidence/`:

Pattern 1 (dash-separated alphanumeric groups) — **33 matches, all enumerated and dispositioned as
benign**:
```
gamelib-launch-1.log:1-9    — session-directory timestamp paths (/private/tmp/gamelib-gate-20260911T062945Z/...)
gamelib-launch-1.old.log:1-19 — session-directory timestamp paths (.../gamelib-gate-20260911T043842Z/...)
terminal.log:1              — session-directory timestamp path (PID + binary path)
terminal.log:5              — build-tool status line ("[prune-stale-helper-binaries] nothing to prune")
terminal.log:63,82,83,85    — Vite build output filenames with content hashes (gamelib-icon-B0ktIo4B.png, play-icon-CPOulhvC.js, stop-icon-tPrFIqCe.js, down-icon-DKtxAIu_.js)
terminal.log:112            — build-tool status line ("[preserve-runner-symlinks] restored 12 symlink(s)...")
terminal.log:127            — temp-directory build script path (gamelib-runts-s5EvPD/buildSidecarSea.cjs)
terminal.log:131,134,135    — Rust target triple (aarch64-apple-darwin) and sidecar binary path
terminal.log:141            — temp-directory build script path (gamelib-runts-v37baJ/buildDecompressWorkerDev.cjs)
terminal.log:158            — sha256 hash + binary path
terminal.log:161            — PID + session-directory binary path
```
None is a Humble redemption-code shape (5-char alphanumeric groups). All are: session-directory
timestamp paths, build-tool content-hash filenames, or platform triples.

Pattern 2 (Humble redemption-code shape: `\b[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}(-[A-Z0-9]{5})*\b`)
— **0 matches**.

PNGs cleared structurally (per P10, `revealedKey` renders only inside `HumbleClaimWizard`, which
P10 forbade opening) and by direct visual read of all 3 run-2 PNGs and all 4 run-1
`43-10-evidence/` PNGs — none shows an open wizard or a revealed key.

## Task 2: Re-scored `43-LIVE-GATE.md` for run 2

Added a `Run` column to the scorecard; marked run-1's item 4 (separator-present), item 6 (icon
colour light theme), and item 2 (side-by-side pair) rows `SUPERSEDED by run 2 (was <prior
result>)`, keeping their raw measurements verbatim; added the three run-2 rows plus run-2
build-record rows; extended the item-3 note to also cover item 2's FAIL, with the arithmetic
proving centring not drift; appended run-2 deviations 5–8 and a new contract defect (`claim-and-
gift` as `resolveKeyScenario`'s fall-through default at `HumbleKeyRow/index.tsx:277`).

**Verdict census — actual output of the plan's own awk command, run against the committed table:**

```
awk '/^## Verdict/,/^### Note on item/' 43-LIVE-GATE.md | grep '^| ' \
  | awk -F'|' '{print $(NF-1)}' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn
```
```
     19 PASS
      3 NOT ATTEMPTABLE
      3 **FAIL**
      2 NOT RECORDED (run 2)
      1 SUPERSEDED by run 2 (was NOT ATTEMPTABLE)
      1 SUPERSEDED by run 2 (was **FAIL** (light theme only; PASS in both dark themes))
      1 SUPERSEDED by run 2 (was **FAIL** (GOG; Steam passes))
      1 Result
      1 PASS (Steam)
      1 NOT PERFORMED
      1 NOT OBSERVED
      1 INCONCLUSIVE — metric compares an icon BOX top to a glyph INK top; ~2–3px is the expected internal-leading gap at 16px/1.2
```

Excluding the header row and the three `SUPERSEDED` buckets: **20 PASS / 3 FAIL across 23 scored**
— this matches the planner's cross-check prediction exactly. (An earlier hand-computed draft of
this section, written before I actually executed the awk command against the edited table,
miscounted 5 FAIL by double-counting `SUPERSEDED` rows into the FAIL bucket instead of excluding
them; this was caught and corrected by running the real command before committing — the committed
document reflects only the executed count, not the earlier hand arithmetic.)

**`**VERDICT: FAIL — 20 PASS / 3 FAIL across 23 scored sub-checks (run 1 + run 2 combined,
`SUPERSEDED` rows excluded).**`

**Phase 43 does not close.** Three FAIL rows remain, all tracing to one cause: the inherited
`.App { text-align: center }` rule (`src/frontend/App.css:24`). Item 3 fails twice (GAME column,
run 1) and item 2 fails once (KEY column, run 2) — the same rule, two columns, tracked as an open
`ready: human` design-decision todo, not a code defect.

**Verify command output (verbatim, all non-zero as required):**
```
33,36,43                 1
delta \*\*2\*\*          1
151.5                    2
934.0                    5
1085.5                   2
1094.0                   1
\[57,59,64\]             2
\[209,210,215\]          1
\[51,57,64\]             1
SUPERSEDED               10
castRefToObject          1
index.tsx:277            1
43-11-evidence           1
1cd1e843                 2
```
(`index.tsx:277` initially returned 0 because the contract-defect text cited the wrong full path
and only the line range `:210-277`, not the bare string `:277` — fixed before commit by correcting
the path to `HumbleKeyRow/index.tsx:210-278`, matching the doc's own existing citation convention,
and pointing separately at `index.tsx:277` for the fall-through `return` statement.)

## Task 3: Todo closures, new todo, update, STATE.md prepend

- **Filed FIRST** (before closing the fill todo, per plan ordering):
  `.planning/todos/pending/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md` —
  `severity: minor` / `platform: any` / `ready: code`, frontmatter order verified via
  `sed -n '1,14p' | grep -nE '^(severity: minor|platform: any|ready: code)$'` → all 3 matched.
- **Closed** `2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md` →
  `completed/`, two commits (content edit, then `git mv` alone) — `git log --follow` confirms
  `rename ... (100%)`.
- **Closed** `2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md` →
  `completed/`, same two-commit discipline — `rename ... (100%)`.
- **Updated, not closed**: `2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-
  rule.md` — appended the KEY-column second-failure finding with the 934.0/1254.0/1094.0/1085.5
  arithmetic; stays `status: OPEN` / `ready: human` (verified: `status: OPEN` still present,
  `ready: human` still present, `151.5` now present).
- **STATE.md `stopped_at`** — prepended (splice-inserted immediately after the opening `'`, via a
  node script, never a hand-retyped line or a `replace`):
  - `grep -c "Completed 43-10 Tasks 2 and 3" .planning/STATE.md` → **1** (prior narrative's opening
    text survives).
  - Byte delta: line 6 was **1761 bytes** before, **5046 bytes** after → **delta 3285 bytes**,
    exactly equal to the inserted string's length (**3285 chars**, all-ASCII, verified via the
    splice script's own length report before the byte-count check was run).
  - `pnpm planning-gates` → **10/10** (verbatim tail below).

**`pnpm planning-gates` output:**
```
[PASS] .planning/phases/34.2-tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid/currency-gate.py
[PASS] .planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/ported-channels-gate.py
[PASS] .planning/phases/34.4-tauri-ipc-re-plumb-slice-7-steam-completion-and-humble/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/ported-channels-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py
[PASS] .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/model-a-retirement-gate.py
[PASS] .planning/planning-frontmatter-gate.py
[PASS] .planning/todos/todo-frontmatter-gate.py

10/10 planning gates passed.
```

**STATE.md is staged but deliberately NOT committed** — it is held for the human-check below.

## Commits so far (8, all plain `git` with explicit pathspecs, `Co-Authored-By` trailer applied
from the second commit onward — the first commit predates my noticing the attribution requirement
and was not amended, per the no-amend rule taking precedence over a one-commit trailer omission)

| SHA | Message |
|---|---|
| `8caedcad0` | docs(260911-qds): preserve REQ-43-19 run-2 evidence and recover run-1 captures |
| `7d7f46247` | docs(260911-qds): re-score REQ-43-19 live gate for run 2, recount verdict |
| `c56f0ba2b` | docs(260911-qds): file GOG logo non-square/malformed-SVG todo |
| `bb0bc296b` | docs(260911-qds): resolve store-logo fill:currentColor todo with run-2 measurements |
| `314f49a13` | docs(260911-qds): move resolved store-logo fill:currentColor todo to completed/ |
| `13000e54f` | docs(260911-qds): resolve separator-invisible-in-light-themes todo with run-2 measurements |
| `2d1d53d5b` | docs(260911-qds): move resolved separator-invisible todo to completed/ |
| `0eb9a20bf` | docs(260911-qds): record KEY-column second failure on centre-alignment todo |

**Uncommitted, staged:** `.planning/STATE.md` (the `stopped_at` prepend) — awaiting human-check
before this final commit is made.

## Deviations from plan

1. **[Rule 1 — corrected miscount]** The VERDICT census in `43-LIVE-GATE.md` was initially
   hand-computed as 20 PASS / 5 FAIL across 25 scored, before the plan's own awk command was
   actually executed against the edited table. Running it produced 20 PASS / 3 FAIL across 23
   scored (matching the planner's prediction exactly) — the hand count had double-counted
   `SUPERSEDED` rows into the FAIL bucket. Corrected before commit; the committed document
   reflects only the executed count.
2. **[Rule 1 — bug in addendum's premise]** The plan addendum's instruction to copy
   `capture-2-bottom.png` as one of run 1's "three primary captures" was based on a false premise
   — see "Significant finding" above. Handled by disclosure (a new `README-run1-capture-
   recovery.md`) plus an additive correction (`burst-4.png`), not by silently deviating from or
   silently following the flawed instruction.
3. **[Rule 1 — wrong citation]** The new contract-defect text initially cited
   `src/frontend/components/UI/HumbleKeyRow/index.tsx:210-277` — a path that does not exist. The
   real path, confirmed against the actual source tree, is
   `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`, matching every other
   citation already in this document. Fixed before commit; also caught by the plan's own
   `index.tsx:277` verify probe returning 0 on first run.
4. First commit of this session (`8caedcad0`) omitted the required `Co-Authored-By` trailer,
   noticed only after the commit was made. Per the git-safety rule against amending commits, this
   was left as-is rather than amended; every subsequent commit carries the trailer.

## AWAITING HUMAN CHECK

Per the plan's mandatory `<human-check>` (Task 3, non-autonomous — this agent must not
self-satisfy it), a human must verify, before the staged `STATE.md` change is committed:

**(a)** The `**VERDICT:**` line in `43-LIVE-GATE.md` matches the census output quoted above
(20 PASS / 3 FAIL across 23 scored), and the closure statement names item 3 (GAME) and item 2
(KEY) as the specific blockers.
→ Verify: `grep -n 'VERDICT:\|does not close\|item 3\|item 2' .planning/phases/43-*/43-LIVE-GATE.md | sed -n '1,20p'`

**(b)** Run-2 deviation 7 (window-ID capture succeeding across Spaces) contradicts run-1's defect 4
(the same capture failing across Spaces) — run-1's original defect-4 text must still be present,
unedited, with neither run asserted to be the correct one.
→ Verify: `grep -n -A3 'prescribed measurement method is unusable across Spaces' .planning/phases/43-*/43-LIVE-GATE.md` and separately `grep -n -B1 -A8 'Window-ID capture succeeded' .planning/phases/43-*/43-LIVE-GATE.md`

**(c)** `STATE.md`'s new `stopped_at` opening (`'Completed quick task 260911-qds -- REQ-43-19 live
gate RUN 2 ...'`) is followed by the prior narrative (`'Completed 43-10 Tasks 2 and 3 -- the
REQ-43-19 live gate RAN on a packaged release build ...'`) intact, not truncated or replaced.
→ Verify: `awk 'NR==6' .planning/STATE.md | grep -o "Completed 43-10 Tasks 2 and 3.\{0,80\}"`

If any of the three is wrong, it should be fixed before committing rather than filed as a
follow-up todo (per the plan's own instruction).

Once confirmed, the remaining step is a single `git add .planning/STATE.md && git commit` (already
staged) to close out Task 3, followed by the plan's final documentation commit
(SUMMARY.md + STATE.md + ROADMAP.md/REQUIREMENTS.md if applicable).
