---
quick_id: 260822-hrf
mode: quick-full
type: execute
title: Close phase 34.9 deferred-ledger items 21, 22, 23, 24 and 11
phase_ref: 34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co
autonomous: true
segments: 3
files_modified:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-SWEEP-CHECK.cjs
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-WRAPPER-PROOF.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-PIPE-PROOF.md
  - meta/runTs.cjs
  - meta/__tests__/runTsSignals.test.ts
  - meta/__tests__/runTs.test.ts
  - meta/cleanDist.ts
  - meta/__tests__/cleanDist.test.ts
  - package.json
  - "meta/*.ts (comment-only sweep, census re-derived at execution time)"

must_haves:
  truths:
    - "The sweep tool's FIXED-row self-citation ban rejects `Summary` in any capitalisation, matching the case-insensitivity its own polarity deny-list already uses."
    - "A signal delivered between process start and `mkdtempSync` in meta/runTs.cjs no longer leaves a `$TMPDIR/gamelib-runts-*` directory behind."
    - "`SIGHUP` sent to the wrapper is forwarded, the wrapper exits 129, and the tmpdir is removed — pinned by a test that is proven to fail against a wrapper copy with SIGHUP removed."
    - "No `meta/*.ts` source comment claims an execution path that `package.json` does not actually use, and that claim is asserted against `package.json`'s real script values rather than restated."
    - "`dist:win`, `dist:linux`, `release:win` and `release:linux` each clear their own top-level `dist/` artifacts before electron-builder runs, exactly as `dist:mac` already does."
    - "`34.9-WRAPPER-PROOF.md` and `34.9-PIPE-PROOF.md` describe the tree as it actually stands after every edit in this task, with a dated re-run addendum, not the pre-edit tree."
    - "`34.9-REVIEW-SWEEP-CHECK.cjs` reports `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0` and exits 0 after all ledger edits."
  artifacts:
    - path: ".planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-SWEEP-CHECK.cjs"
      provides: "Case-insensitive citation check + header doc matching it"
      contains: "SUMMARY/i"
    - path: "meta/runTs.cjs"
      provides: "Signal handlers registered before the tmpdir they protect exists"
    - path: "meta/__tests__/runTsSignals.test.ts"
      provides: "SIGHUP coverage (T6) + SIGHUP non-vacuity control (T7) + startup-window control (T8)"
    - path: "meta/__tests__/runTs.test.ts"
      provides: "package.json-derived doc-comment execution-path accuracy pin (E-02) with vacuity guard"
    - path: "meta/cleanDist.ts"
      provides: "Platform-parameterized dist cleaner (mac behaviour byte-equivalent to the retired cleanDistMac.ts)"
    - path: "meta/__tests__/cleanDist.test.ts"
      provides: "Re-baselined suite: existing mac tests + IN-01/IN-02 doc pins + win/linux fixture tests + extended artifactName pin"
    - path: ".planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md"
      provides: "C4-05, C5-01, C5-02, IN-03 flipped to FIXED; E-02 closure recorded; items 21/22/23/24/11 carry closure notes"
  key_links:
    - from: "package.json `dist:win` / `dist:linux` / `release:win` / `release:linux`"
      to: "meta/cleanDist.ts"
      via: "`pnpm clean:dist-<platform> &&` prefix positioned before electron-builder"
      pattern: "clean:dist-(win|linux).*electron-builder"
    - from: "meta/__tests__/runTs.test.ts E-02 pin"
      to: "package.json scripts"
      via: "loadScripts() + hasSharedCacheOutfile() — expectation derived, never hardcoded"
      pattern: "loadScripts\\(\\)"
    - from: "deferred-items.md FIXED rows"
      to: "meta/ artifacts + 34.9-NN plan numbers"
      via: "Evidence cell satisfying scoreFixedRow()"
      pattern: "34\\.9-\\d+"
---

<objective>
Close five phase-34.9 deferred-ledger items — 21 (C4-05), 22 (C5-01), 23 (C5-02),
24 (E-02) and 11 (IN-03) — each with its named precondition honoured, not waived.

Purpose: these are the last five open rows in `deferred-items.md` that this machine
(real macOS arm64, Darwin 25.5.0) is actually able to discharge. Four of them carry
preconditions that were the whole reason they were deferred; discharging them without
the precondition would convert a recorded, honest deferral into a silent false close.

Output: a tightened sweep tool, a fixed + re-proven `meta/runTs.cjs`, SIGHUP regression
coverage, a `package.json`-derived doc-comment accuracy pin, a platform-parameterized
dist cleaner wired to win/linux, refreshed proof documents, and a ledger whose FIXED
rows cite real evidence and still score 24/24.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

Ledger sections (read THESE, not the whole 1038-line file):
- `.planning/phases/34.9-.../deferred-items.md` lines 325–350 (item 11 / IN-03)
- `.planning/phases/34.9-.../deferred-items.md` lines 780–960 (items 21–24, and the
  C4-05 / C5-01 / C5-02 disposition rows at lines 786, 1034, 1035)

Source under change:
@meta/runTs.cjs
@meta/__tests__/runTsSignals.test.ts
@meta/__tests__/runTs.test.ts
@meta/cleanDistMac.ts
@meta/__tests__/cleanDistMac.test.ts
@.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-SWEEP-CHECK.cjs

Proof documents (grep, do NOT read whole — 81KB / large):
- `34.9-WRAPPER-PROOF.md` — Direction A matrix begins line 262 (15 rows × 2 shapes
  = 30 runs, every PASS bar includes "tmpdir absent"); Direction B row 11 at line 358.
- `34.9-PIPE-PROOF.md` — cites `meta/cleanDistMac.ts:1` and `meta/verifyRunnerBundle.ts:1`.
</context>

<facts_established_at_planning_time>
Do not re-derive these; do re-check the ones marked LIVE before acting on them.

- **Sweep baseline (LIVE-verified 2026-08-22):** `node 34.9-REVIEW-SWEEP-CHECK.cjs`
  prints `LIST-A: 24 IDs`, `COMPUTED-UNMAPPED: 0`, `REVIEW-SWEEP-OK 24/24 mapped,
  unmapped 0`, exit 0.
- **No current disposition row contains a case-variant `summary`** — verified by
  grepping every `^| <ID> |` row. So the item-21 tightening breaks nothing that exists
  today. It constrains what you may write in Task 7.
- **Each of C4-05, C5-01, C5-02, IN-03 has exactly ONE row** (lines 786, 1034, 1035,
  330). No duplicate-row category conflict to manage.
- **`E-02` is not a recognised `ID_SHAPE`** (`C\d+-\d{2}|CR-\d{2}|WR-\d{2}|IN-\d{2}`),
  so item 24 has no list-A row and cannot be scored by the sweep tool. Record its
  closure in prose only.
- **`scoreFixedRow()` requires the Evidence cell to match `/34\.9-\d+/`.** A quick-task
  id (`260822-hrf`) does NOT match. Any row you flip to FIXED must also cite a
  `34.9-<n>` plan number or the sweep goes red.
- **Census re-derived LIVE 2026-08-22: `grep -rln "node_modules/\.cache" meta/*.ts`
  returns 13 files**, not the 12 the ledger records. `meta/buildDecompressWorkerDev.ts`
  appeared after the ledger was written. Re-derive again at execution time; hardcode
  neither number.
- **Residue: `ls node_modules/.cache/*.cjs` returns 10 files** right now.
- **`.cjs` mentions across `meta/*.ts`:** 12 distinct `node_modules/.cache/*.cjs`
  paths (all stale), `meta/runTs.cjs` ×4 (correct), plus two legitimate non-execution
  mentions — `lzmaNativeResolvedPaths.generated.cjs` and `resolved-paths.generated.cjs`.
  Any pin must not flag those two.
- **`meta/runTs.cjs` landmarks:** `mkdtempSync` line 119; `let cleaned` 132;
  `function cleanup` 133; `process.on('exit', cleanup)` 142; `cleanupAndExit` 150;
  `let currentChild/escalationTimer/terminatingSignal` 155–157; handler loop 159.
- **`128 + os.constants.signals.SIGHUP === 129`** on this machine.
- **electron-builder.yml artifactName tokens:** mac `-macOS-`, win `-Setup-`,
  portable `-Portable-`, linux `-linux-`.
- **Proof line-number citations that comment edits will shift:**
  `buildSidecarSea.ts:552`, `buildSidecarSea.ts:809`, `downloadHelperBinaries.ts:533`,
  `buildRunnersOnedir.ts:796`, `buildRunnersOnedir.ts:821`, `cleanDistMac.ts:1`,
  `verifyRunnerBundle.ts:1`, `lintTranslations.ts:1`, `verifyUpdaterSigningKey.ts:22`.
- **Working tree at planning time:** clean except two untracked `.planning/quick/`
  directories. Assume a CONCURRENT session may exist.
</facts_established_at_planning_time>

<standing_constraints>
Violating any of these is a task failure, not a style note.

1. **Never `git stash`, never `git checkout -- <file>`, never `git restore`.** A prior
   executor's `git stash` stranded a concurrent session's work twice. `git checkout --`
   additionally triggers `.husky/post-checkout`, which runs a download that fails
   deterministically. Restore edited files from an in-memory or scratchpad byte copy.
2. **Do NOT touch `.planning/STATE.md`.** The orchestrator owns it.
3. **No `gsd-sdk state.*`, `roadmap.*`, or `query commit` verbs.** They corrupt STATE.md
   and stage the whole tree. Commit by explicit path with plain `git`.
4. **`ts-jest` is transpile-only here** — jest passing says nothing about types. Run
   `pnpm codecheck` (`tsc --noEmit`) separately.
5. **`pnpm lint` is RED repo-wide** (~3544 problems, 53 errors) for pre-existing
   unrelated reasons. Do not treat that as yours, do not fix it, do not sweep
   formatting into a behavioural commit.
6. **`meta/__tests__/genI18nGateScope.test.ts` has 1 known pre-existing failure.** Do
   not fix it; do not let your changes add a second.
7. **Every new gate/pin must be proven in BOTH directions** — green against known-good
   input AND red against known-bad. A gate that can never fail and a gate that can
   never pass are both defects.
8. **Re-baseline count pins and derived lists in the SAME commit as the change that
   invalidates them.**
9. **Never write "summary" (any capitalisation) into a `deferred-items.md` Evidence or
   Independent-confirmation cell** after Task 1 lands. Also avoid the polarity
   deny-list phrases: `not fixed`, `not actually fixed`, `still has the bug`,
   `still broken`, `still fails`, `never landed`, `never added`, `does not exist`.
</standing_constraints>

<segmentation>
Seven tasks is well past a single executor's quality window. Execute in three sittings
with a `/clear` between each. Each segment ends at a committed, green, self-consistent
tree.

- **Segment A — Tasks 1–3** (sweep tool, SIGHUP coverage, wrapper startup-window fix)
- **Segment B — Tasks 4–5** (dist cleaner generalization, doc-comment sweep + pin)
- **Segment C — Tasks 6–7** (proof re-run, ledger closure + sweep re-score)

Ordering is load-bearing:
- Task 1 must precede Task 7 — it tightens the tool that scores Task 7's rows.
- Task 2 must precede Task 3 — the SIGHUP pin becomes part of Task 3's safety net.
- Task 4 must precede Task 5 — Task 4 creates/renames a file the Task 5 census covers.
- Task 6 must be LAST of the code tasks — Tasks 3, 4 and 5 all shift line numbers the
  proofs cite.
</segmentation>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (item 21 / C4-05): make the sweep tool's self-citation ban case-insensitive</name>
  <files>.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-SWEEP-CHECK.cjs</files>
  <behavior>
    - Bidirectional proof, run BEFORE and AFTER the edit against a synthetic directory
      in the scratchpad (never the real phase directory):
      - Known-bad fixture: a `X-REVIEW-SYNTH.md` containing `### C9-01`, plus a
        `deferred-items.md` containing one FIXED row whose Evidence cell cites plan
        `34.9-99`, names a `meta/` path, and contains the word `Summary` in mixed case.
      - RED half: the PRE-fix tool (copy it to the scratchpad before editing) scores
        that fixture `REVIEW-SWEEP-OK 1/1 mapped, unmapped 0`, exit 0 — the gap exists.
      - GREEN half: the POST-fix tool scores the SAME fixture
        `C9-01 FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING`, exit 1 — the gap is closed.
    - Control: a second synthetic row identical but with the word `Summary` removed
      must still score `unmapped 0` under the post-fix tool — proving the tightening
      rejects the self-citation, not everything.
    - Regression: the post-fix tool against the REAL phase directory still prints
      `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0`, exit 0.
  </behavior>
  <action>
    Copy `34.9-REVIEW-SWEEP-CHECK.cjs` to the scratchpad first — that copy IS the
    pre-fix binary for the RED half; you cannot recover it with git (constraint 1).

    In `scoreFixedRow()` (line ~157) replace `const citesSummary =
    combined.includes('SUMMARY')` with a case-insensitive test, `/SUMMARY/i.test(combined)`,
    matching the convention `POLARITY_DENY_PATTERNS` (lines 66–75) already uses. This
    TIGHTENS the gate — the one direction this project's "fix the ROW, never the CHECK"
    rule permits. Do not touch any other predicate; `citesArtifact` and
    `citesReproducibleResult` keep their current case sensitivity.

    Update the header documentation block, lines ~29–31, which currently states the
    citation text "must NOT contain the literal string `SUMMARY`". That sentence
    becomes factually wrong the moment you make the change — leaving it is the exact
    defect class item 24 exists to close, committed inside the fix for item 21. State
    the new rule as case-insensitive and say it matches the polarity check's convention.

    Write the synthetic fixtures under the scratchpad directory. Do not create any
    file matching `/-REVIEW.*\.md$/` inside the real phase directory: `discoverReviewFiles`
    globs it live, so a stray synthetic review file there would inject a bogus ID into
    list A. Note that the glob also already matches `34.9-REVIEW-FIX.md` — that is
    existing, expected behaviour, not something to change.
  </action>
  <verify>
    <automated>cd .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co && node 34.9-REVIEW-SWEEP-CHECK.cjs | tail -2 && node 34.9-REVIEW-SWEEP-CHECK.cjs >/dev/null; test $? -eq 0</automated>
    <automated>grep -c 'SUMMARY/i' .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-SWEEP-CHECK.cjs</automated>
    <automated>node &lt;scratchpad&gt;/pre-fix-sweep.cjs &lt;scratchpad&gt;/synth-bad; echo "pre=$?"; node .planning/phases/34.9-.../34.9-REVIEW-SWEEP-CHECK.cjs &lt;scratchpad&gt;/synth-bad; echo "post=$?"   # expect pre=0 post=1</automated>
  </verify>
  <done>
    The tool rejects a mixed-case `Summary` self-citation, the pre-fix copy accepted the
    identical fixture, the real directory still scores 24/24 unmapped 0 exit 0, and the
    header doc block describes the rule the code now implements.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (item 23 / C5-02): add SIGHUP forwarding coverage with its non-vacuity control</name>
  <files>meta/__tests__/runTsSignals.test.ts</files>
  <behavior>
    - **T6 (green, real wrapper):** `SIGHUP` to the wrapper PID alone kills the child,
      removes the tmpdir, wrapper exits `129`. Mirrors T1/T2 exactly — same `launch()`
      helper, same `ready`/`closed` contract, real process, real signal, no grepping
      the wrapper source for the string `SIGHUP`.
    - **T7 (non-vacuity control):** against a generated probe copy of the wrapper with
      `'SIGHUP'` removed from the `FORWARDED_SIGNALS` array literal, the same procedure
      produces the pre-fix outcome — the wrapper is signal-terminated (`closed` yields
      `{code: null, signal: 'SIGHUP'}`, not `{code: 129}`) and the tmpdir SURVIVES.
      This is the RED proof the file's existing five tests were each held to, made
      permanent rather than run once by hand.
  </behavior>
  <action>
    Reuse T5's probe idiom verbatim (lines 225–248): read `WRAPPER`, assert the marker
    occurs exactly once so a rename goes red rather than silently passing, string-replace,
    `writeFileSync(PROBE_PATH, ...)`, gate with `execFileSync(process.execPath, ['--check',
    PROBE_PATH])` so it must parse before you spawn it, then `launch(FIXTURE, PROBE_PATH)`.
    The existing `afterEach` already unlinks `PROBE_PATH` in a `finally`.

    For T7 the marker is the `FORWARDED_SIGNALS` array literal; assert it occurs exactly
    once and that the replacement removes only `'SIGHUP'`, leaving SIGTERM and SIGINT.

    **Trap you must design around:** the `afterEach` (lines ~136–152) polls `$TMPDIR`
    for up to 5s and asserts zero `gamelib-runts-*` directories leaked by this file's
    own tests. T7 leaks one BY DESIGN — that leak is the observation. So T7 must, after
    asserting the leak, clean up after itself inside the test body: `rmSync(dir, {
    recursive: true, force: true })` on the observed tmpdir, and kill the orphaned child
    (`ready` resolves the CHILD's pid — the fixture's own `process.pid` — see
    `meta/__tests__/fixtures/runTsSignalFixture.ts`). If you instead relax the `afterEach`
    assertion, you have bent the gate to appease the test; do not.

    Note `ready` gives the child pid and the tmpdir; the WRAPPER pid is
    `wrapperChild.pid`. T1 signals the wrapper, T4 signals the child — read both before
    writing T6/T7 so you signal the right process.

    Do not renumber or edit T1–T5. Do not touch `meta/runTs.cjs` in this task; the
    ledger records SIGHUP as already working (exit 129, tmpdir removed) — this task
    only pins it.
  </action>
  <verify>
    <automated>pnpm jest meta/__tests__/runTsSignals.test.ts 2>&1 | tail -20</automated>
    <automated>pnpm codecheck 2>&1 | tail -5</automated>
  </verify>
  <done>
    `runTsSignals.test.ts` reports 7/7 passing. T6 observes exit 129 + tmpdir absent
    against the real wrapper. T7 observes signal-termination + tmpdir present against a
    SIGHUP-stripped probe, then cleans up so the suite's leak assertion stays green
    unmodified. `tsc --noEmit` clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 (item 22 / C5-01): register signal handlers before the tmpdir they protect</name>
  <files>meta/runTs.cjs, meta/__tests__/runTsSignals.test.ts</files>
  <behavior>
    - **T8 (startup-window regression pin):** against a probe copy of the FIXED wrapper
      with an 800ms busy-wait spliced in immediately after `mkdtempSync` — the
      reviewer's own reproduction technique — a `SIGTERM` delivered inside that widened
      window produces a clean exit and NO surviving `gamelib-runts-*` directory,
      because the handlers are already installed.
    - **T8 RED half:** the same 800ms probe built from a PRE-fix copy of the wrapper
      (handlers still after `mkdtempSync`) leaks the tmpdir. Prove this once during
      execution against a scratchpad pre-fix copy and record the observation in the
      SUMMARY; you may also encode it as a permanent control if you can do so without
      committing a second copy of the wrapper into the tree.
    - Existing T1–T7 all still pass unchanged.
  </behavior>
  <action>
    Take a scratchpad byte copy of `meta/runTs.cjs` before editing — it is the pre-fix
    artifact for the RED half, and constraint 1 forbids recovering it with git.

    Restructure the head of `async function main()` so that the `FORWARDED_SIGNALS`
    registration loop runs before `fs.mkdtempSync`.

    **This is not a simple statement move — a naive move introduces a temporal-dead-zone
    crash.** The handler closure reads `terminatingSignal`, `currentChild`,
    `escalationTimer` (declared at lines 155–157) and calls `cleanupAndExit` → `cleanup()`,
    which reads `cleaned` (line 132) and `tmpDir` (line 119). If a signal arrives before
    those `let`/`const` bindings are initialised, `if (cleaned) return` throws a
    ReferenceError from inside the signal handler with nothing to catch it. Required shape:

    1. Hoist `let tmpDir = null`, `let cleaned = false`, `let currentChild = null`,
       `let escalationTimer = null`, `let terminatingSignal = null` to the top of `main()`.
       `tmpDir` becomes a `let` initialised to `null`, no longer a `const`.
    2. Define `cleanup()` and `cleanupAndExit()` next, with `cleanup()` returning early
       when `tmpDir === null` — there is genuinely nothing to remove yet, and that is a
       correct outcome, not a swallowed failure. Keep the existing `try/catch` and the
       `cleaned` idempotence guard exactly as they are.
    3. Register `process.on('exit', cleanup)` and the `FORWARDED_SIGNALS` loop.
    4. THEN assign `tmpDir = fs.mkdtempSync(...)`.

    Update the header comment at lines 121–131. It currently calls the `'exit'`
    registration "a second, independent guarantee"; that claim assumed `'exit'` fires for
    every termination, which is precisely what C5-01 disproved. Say what is now true: the
    forwarded-signal handlers are installed before any resource exists, and `'exit'`
    remains a backstop for `process.exit()` paths and `uncaughtException` — not for
    default-disposition signal termination, which emits no `'exit'` at all.

    Also update the comment at line ~119 explaining why `tmpDir` is now a mutable binding
    initialised late — a reader who sees `let tmpDir = null` and no explanation will
    "tidy" it back to a `const` and silently reopen C5-01.

    Do NOT change `KILL_ESCALATION_MS`, the escalation timer, `signalExitCode`, exit-code
    conventions, or the compile-failure short-circuit. This task changes ordering only.
  </action>
  <verify>
    <automated>pnpm jest meta/__tests__/runTsSignals.test.ts meta/__tests__/runTs.test.ts 2>&1 | tail -20</automated>
    <automated>node --check meta/runTs.cjs && echo PARSE-OK</automated>
    <automated>node -e "const s=require('fs').readFileSync('meta/runTs.cjs','utf8');const h=s.indexOf('for (const sig of FORWARDED_SIGNALS)');const m=s.indexOf('mkdtempSync(path.join');if(h===-1||m===-1)throw new Error('landmark missing');if(!(h&lt;m))throw new Error('handlers still registered AFTER mkdtempSync');console.log('ORDER-OK')"</automated>
    <automated>pnpm clean:dist-mac 2>&1 | tail -3 && ls -d $TMPDIR/gamelib-runts-* 2>/dev/null | wc -l</automated>
  </verify>
  <done>
    Handler registration precedes `mkdtempSync` in source order (asserted by an executable
    check, not by eye). No TDZ path exists — every binding the handlers read is
    initialised before registration. T1–T8 pass. A real wrapped script (`clean:dist-mac`)
    still runs to completion leaving zero `gamelib-runts-*` survivors. The RED half was
    observed against the scratchpad pre-fix copy and is recorded in the SUMMARY.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4 (item 11 / IN-03): generalize the dist cleaner and wire win + linux</name>
  <files>meta/cleanDist.ts, meta/__tests__/cleanDist.test.ts, package.json, electron-builder.yml (read-only)</files>
  <behavior>
    - Existing macOS behaviour is byte-equivalent: `-macOS-` token, `latest-mac.yml`
      standalone entry, `/^mac(-.+)?$/` directory pattern, the lstat-based symlink
      semantics, the containment throw, and the "distDir does not exist → `{removed:[],
      kept:[]}`" case all survive unchanged. Every existing test in `cleanDistMac.test.ts`
      passes against the generalized module.
    - New: `cleanDist(distDir, 'win')` removes only win-identifiable entries and keeps
      mac and linux ones; `cleanDist(distDir, 'linux')` removes only linux-identifiable
      entries and keeps mac and win ones. Proven on a synthetic `dist/` fixture holding
      all three platforms' artifacts simultaneously — cross-platform non-deletion is the
      assertion that matters, not just deletion.
    - The platform token table is pinned against `electron-builder.yml`'s real
      `artifactName` values, extending the existing `artifactName pin (T-34.9G-12)`
      describe block to win, portable and linux, so a config rename goes red.
  </behavior>
  <action>
    **Commit hygiene:** do the file move as a PURE rename in its own commit first —
    `git mv meta/cleanDistMac.ts meta/cleanDist.ts` and `git mv
    meta/__tests__/cleanDistMac.test.ts meta/__tests__/cleanDist.test.ts`, nothing else —
    then generalize in a second commit. A rename plus a large edit in one commit drops
    similarity below git's 50% default and `git log --follow` loses the history the
    rename exists to preserve. Check with `git log -1 -M --summary` after the rename commit.

    Replace the three module-level constants with a platform table keyed by
    `'mac' | 'win' | 'linux'`, each entry holding `{ tokens: string[], standalone:
    string[], dirPattern: RegExp }`:
    - mac — tokens `['-macOS-']`, standalone `['latest-mac.yml']`, dir `/^mac(-.+)?$/`
    - win — tokens `['-Setup-', '-Portable-']` (BOTH: `release:win` builds `portable`
      while `dist:win` uses electron-builder.yml's default win targets, so a single
      token misses half the artifacts), standalone `['latest.yml']`, dir `/^win(-.+)?$/`
    - linux — tokens `['-linux-']`, standalone `['latest-linux.yml']`, dir
      `/^linux(-.+)?$/`

    Keep `MAC_ARTIFACT_TOKEN`, `MAC_STANDALONE_ENTRIES` and `MAC_DIR_PATTERN` exported
    as aliases into the mac entry if any existing test or caller imports them; grep first
    (`grep -rn "MAC_ARTIFACT_TOKEN\|MAC_DIR_PATTERN\|MAC_STANDALONE_ENTRIES" meta/ src/`)
    and re-baseline every importer in the SAME commit.

    Export `cleanDist(distDir, platform)` and `distArtifactEntries(distDir, platform)`.
    Keep `cleanDistMac`/`macArtifactEntries` as thin wrappers only if a caller needs them;
    otherwise delete them and update callers — do not leave a name that lies about scope.

    CLI: accept `--platform=mac|win|linux`, required, with a clear error naming the valid
    values when absent or unrecognised. Do not default it — a silent default is how a
    win build would end up running the mac cleaner.

    `package.json`: rename `clean:dist-mac` to keep working (either keep the script name
    and pass `--platform=mac`, or add `clean:dist-mac`/`clean:dist-win`/`clean:dist-linux`
    all pointing at the one entry). The `package.json wiring pin` describe block
    (`cleanDist.test.ts` lines ~223–251) asserts `dist:mac`/`release:mac` contain
    `clean:dist-mac` positioned before `electron-builder` — re-baseline it in the same
    commit and extend it to assert the same for `dist:win`/`release:win` (with
    `clean:dist-win`) and `dist:linux`/`release:linux` (with `clean:dist-linux`).
    Preserve the existing ordering within `dist:mac`/`release:mac` exactly; you are
    adding prefixes to four other scripts, not reordering the two that work.

    The IN-01/IN-02 doc-comment pins (lines ~253–292) assert normalised comment substrings
    from the file you are restructuring. Keep those exact claims present and true in the
    generalized module — they document real, still-current behaviour (the unreachable
    symlink shape; the untested defense-in-depth throw). If a sentence must be re-worded,
    re-baseline the pin in the SAME commit and say why in the SUMMARY.

    **Honesty language — mandatory, verbatim in intent.** Nowhere in `meta/cleanDist.ts`,
    `package.json`, the test file, the commit message or the SUMMARY may any sentence
    assert that `dist:win` or `dist:linux` is currently broken, or that a stale-artifact
    false pass has been observed on those platforms. The header comment must state
    plainly: the electron-builder mechanism (clears only the target subdirectory, never
    top-level `dist/`) is platform-general and confirmed on macOS as F-34.9-02; the
    win/linux consequence is an UNCONFIRMED generalization, not an observed defect; and
    win/linux behaviour here is proven only against synthetic `dist/` fixtures because
    this work was done on macOS arm64 with no win/linux build available. Do not imply
    live win/linux coverage.
  </action>
  <verify>
    <automated>pnpm jest meta/__tests__/cleanDist.test.ts 2>&1 | tail -20</automated>
    <automated>pnpm codecheck 2>&1 | tail -5</automated>
    <automated>node -e "const s=require('fs').readFileSync('package.json','utf8');const p=JSON.parse(s).scripts;for(const k of ['dist:mac','release:mac','dist:win','release:win','dist:linux','release:linux']){const v=p[k];const c=v.indexOf('clean:dist');const e=v.indexOf('electron-builder');if(c===-1)throw new Error(k+' has no clean:dist prefix');if(!(c&lt;e))throw new Error(k+' cleans after electron-builder');}console.log('WIRING-OK')"</automated>
    <automated>git log -1 -M --summary -- meta/cleanDist.ts | grep -i rename || echo 'CHECK: rename not detected — was the move split into its own commit?'</automated>
  </verify>
  <done>
    `meta/cleanDist.ts` exists as a pure rename in its own commit followed by a
    generalization commit. All six dist/release scripts clear their own platform's
    top-level `dist/` entries before electron-builder. A three-platform synthetic fixture
    proves each platform's cleaner removes only its own entries. macOS behaviour and the
    IN-01/IN-02 pins are intact or re-baselined in-commit. No artifact of this task
    claims win/linux is broken or claims live win/linux coverage.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5 (item 24 / E-02): correct the stale execution-path comments and pin them against package.json</name>
  <files>meta/__tests__/runTs.test.ts, meta/*.ts (census re-derived at execution time), node_modules/.cache/ (residue decision)</files>
  <behavior>
    - **Pin 1 (derived negative, E-02):** the set of `meta/*.ts` files whose source
      mentions a `node_modules/.cache` path must be EMPTY *because* the set of
      `package.json` scripts writing there is empty. The expectation is computed from
      `loadScripts()`, not written down: if a future script reintroduces the shared-cache
      outfile, the pin's expectation flips with it. This asserts the FACT (the path
      literal) — the existing IN-01/IN-02 pins assert the RATIONALE, which is exactly why
      they stayed green through three recurrences of this defect.
    - **Pin 2 (derived positive):** for every `package.json` script matching the wrapper
      shape `node meta/runTs.cjs … meta/<X>.ts`, any runner `.cjs` path named in
      `meta/<X>.ts`'s source must equal the runner path that script actually invokes
      (`meta/runTs.cjs`). Must NOT flag the two legitimate non-execution mentions
      (`lzmaNativeResolvedPaths.generated.cjs`, `resolved-paths.generated.cjs`) — scope
      the predicate to `.cjs` paths under `node_modules/`, or to `.cjs` paths appearing
      after the literal `node `.
    - **Pin 3 (vacuity guard):** the predicate behind pin 1 fires against a synthetic
      in-test source string containing the retired claim — proving pin 1 can go red.
      Mirror the existing `vacuity guard` test at `runTs.test.ts:99`.
  </behavior>
  <action>
    Re-derive the census live and record the exact output in the SUMMARY:
    `grep -rln "node_modules/\.cache" meta/*.ts`. At planning time this returned **13**
    files (the ledger records 12; `meta/buildDecompressWorkerDev.ts` appeared since).
    Task 4 may have changed the set again. Hardcode neither number and do not copy the
    ledger's list.

    Rewrite each stale comment to describe what actually happens: the script is compiled
    by `node meta/runTs.cjs --bundle --platform=node --target=node21 meta/<name>.ts`,
    which bundles into a private `fs.mkdtempSync(path.join(os.tmpdir(),
    'gamelib-runts-'))` directory removed when the wrapper exits. Preserve each comment's
    actual point — most of them exist to explain why `__dirname` is unsafe as a path base,
    and that reasoning is STILL correct under the new mechanism (`__dirname` now resolves
    into the tmpdir instead of `node_modules/.cache`). Correct the path, keep the warning.
    Do not delete the `JEST_WORKER_ID` guard-idiom explanations.

    Add the three pins to `meta/__tests__/runTs.test.ts` as a new describe block, reusing
    that file's existing `loadScripts()` and `hasSharedCacheOutfile()` helpers rather than
    re-implementing them — the file already establishes the "read the REAL package.json,
    never hand-copy a script string" convention.

    **Residue decision — record it explicitly, either way.** `ls node_modules/.cache/*.cjs`
    currently shows 10 stale files. Their presence is what makes the wrong comments look
    right to a reader who checks whether the documented path exists. Recommended: delete
    them (`rm -f node_modules/.cache/*.cjs`), since nothing writes there any more and
    `node_modules/` is not tracked. Note the two non-`.cjs` entries observed alongside
    them — `gamelib-pipe-proof/` and `gamelib-wrapper-proof/` — and leave those alone
    unless you confirm they are also dead. Whichever you choose, write the decision and
    its reason into the SUMMARY; do not delete silently and do not skip the question. A
    deletion is NOT a pin — the pin is what stops the comments drifting again.

    Do not touch `meta/__tests__/genI18nGateScope.test.ts`'s known pre-existing failure.
    If your comment edits to `meta/genI18nGateScope.ts` change its failure count, that is
    yours; the existing single failure is not.
  </action>
  <verify>
    <automated>test "$(grep -rln 'node_modules/\.cache' meta/*.ts | wc -l | tr -d ' ')" = "0" && echo CENSUS-CLEAN</automated>
    <automated>pnpm jest meta/__tests__/runTs.test.ts 2>&1 | tail -15</automated>
    <automated>pnpm jest meta/__tests__ 2>&1 | tail -25   # expect exactly the 1 known genI18nGateScope failure, no more</automated>
    <automated>pnpm codecheck 2>&1 | tail -5</automated>
  </verify>
  <done>
    Zero `meta/*.ts` files mention `node_modules/.cache`. Three pins in `runTs.test.ts`
    derive their expectations from `package.json` and are proven to fail against
    known-bad synthetic input. The live census output is recorded in the SUMMARY. The
    residue decision is recorded with its reason. `meta/__tests__` failure count is
    unchanged at the one known pre-existing `genI18nGateScope` failure.
  </done>
</task>

<task type="auto">
  <name>Task 6: restore proof–tree correspondence for 34.9-WRAPPER-PROOF.md and 34.9-PIPE-PROOF.md</name>
  <files>.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-WRAPPER-PROOF.md, .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-PIPE-PROOF.md</files>
  <action>
    Tasks 3, 4 and 5 all changed files these proofs describe, and both documents carry a
    recorded `verdict: PASS` that currently describes the PRE-edit tree. Item 22's named
    precondition is explicit: re-run the affected directions so the proof and the shipped
    file describe the same artifact again. This machine is real macOS arm64
    (Darwin 25.5.0), so it is feasible. Do not substitute a paper note for a run.

    **Re-run Direction A in full** — 15 scripts × 2 injection shapes = 30 runs (matrix
    begins at line 262). Write a harness script in the scratchpad that, per row:
    1. Reads the entry file's bytes into memory.
    2. Applies injection shape A1 (truncation producing `Unexpected end of file`) or A2
       (an unresolvable import producing `Could not resolve
       "__wrapper_proof_unresolvable__"`).
    3. Runs the row's `pnpm <script>` with the row's recorded argv/prefix — rows 11, 12
       and 14 need their documented extra args (`--arch=arm64`, `build --arch=arm64`) so
       the row is not confounded with a missing-arg early exit.
    4. Restores the file from the in-memory bytes in a `finally`. **Never `git checkout --`
       and never `git stash`** (constraint 1) — the husky post-checkout hook fails
       deterministically, and a stash would strand a concurrent session's work.
    5. Scores the row's five criteria, of which the load-bearing one here is
       `$TMPDIR/gamelib-runts-*` absent after the run.

    Between rows, assert `git status --porcelain -- meta/ package.json` is empty. If it is
    ever non-empty, STOP — do not continue injecting into a tree you have not proven you
    restored.

    **Re-run Direction B row 11** (line 358): `pnpm build-runners-onedir --arch=arm64`,
    wait for the `Building legendary (…) as --onedir for arm64...` marker on stdout, then
    `SIGTERM` the wrapper PID directly (locate it with `pgrep -f
    'runTs\.cjs.*buildRunnersOnedir\.ts'`). Expect pnpm exit `143`, wrapper and pnpm PIDs
    terminated, `$TMPDIR/gamelib-runts-*` absent, and `git status --porcelain --
    public/bin/ build/bin/` byte-identical before and after.

    Append a dated re-run addendum to `34.9-WRAPPER-PROOF.md` — do not overwrite the
    original 2026-08-14 results. The addendum must state: which task changed which file;
    the re-run date and machine (macOS arm64, Darwin 25.5.0); the per-row re-run results;
    and a corrected line-number table for the citations the edits shifted
    (`buildSidecarSea.ts:552`, `buildSidecarSea.ts:809`, `downloadHelperBinaries.ts:533`,
    `buildRunnersOnedir.ts:796`, `buildRunnersOnedir.ts:821`, `lintTranslations.ts:1`,
    `verifyUpdaterSigningKey.ts:22`). Re-derive each shifted number live; do not estimate.

    For `34.9-PIPE-PROOF.md`, append a shorter correspondence note: it cites
    `meta/cleanDistMac.ts:1` and `meta/verifyRunnerBundle.ts:1`. Task 4 renamed the first
    of those files. Record the new path, state whether the cited claim still holds, and
    re-run only the pipe-proof directions that name those two files. If a direction cannot
    be re-run, say so and say why — an unrunnable direction recorded as unrun is honest;
    an unrunnable direction left implicitly PASSing is not.

    Row 14 (`verify:updater-key`) is Direction-A-in-scope but Direction-B-excluded for
    credential reasons. Keep that exclusion and its stated reason; do not quietly promote
    it.
  </action>
  <verify>
    <automated>git status --porcelain -- meta/ package.json | wc -l   # must be 0 after the harness finishes</automated>
    <automated>ls -d $TMPDIR/gamelib-runts-* 2>/dev/null | wc -l   # must be 0</automated>
    <automated>grep -c '2026-08-22' .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-WRAPPER-PROOF.md</automated>
    <automated>for f in buildSidecarSea downloadHelperBinaries buildRunnersOnedir; do echo "$f: $(wc -l < meta/$f.ts) lines"; done   # cross-check against the addendum's corrected citations</automated>
  </verify>
  <done>
    Direction A re-run 30/30 against the edited tree with zero `gamelib-runts-*`
    survivors; Direction B row 11 re-run with exit 143, tmpdir absent, and
    `public/bin/`+`build/bin/` byte-unchanged. Both proof documents carry a dated
    addendum naming what changed, what was re-run, what was not re-run and why, and a
    live-derived corrected line-number table. `meta/` and `package.json` are byte-clean
    after the harness.
  </done>
</task>

<task type="auto">
  <name>Task 7: close the five ledger rows and re-score the sweep</name>
  <files>.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md</files>
  <action>
    Flip four disposition rows from DEFERRED to FIXED — C4-05 (line ~786), C5-01
    (line ~1034), C5-02 (line ~1035), IN-03 (line ~330). Each has exactly one row, so
    there is no duplicate-category conflict to manage. E-02 has no row (its ID shape is
    not one the tool recognises); record its closure in prose in the item 24 section only.

    **Each new Evidence cell must survive `scoreFixedRow()`. Concretely it must:**
    - match `/34\.9-\d+/` — cite the originating plan number (e.g. 34.9-32 for the wrapper
      proof, 34.9-29 for the runTs mechanism, 34.9-19 for the cleaner, 34.9-25 for the
      comment-accuracy lineage). A quick-task id alone does NOT satisfy this check;
    - contain a `meta/`, `src/` or `package.json` path, OR both the words `verdict` and
      `PASS`;
    - contain NO occurrence of `summary` in ANY capitalisation — Task 1 made that check
      case-insensitive, and this is the first ledger edit written under the tightened rule;
    - contain none of: `not fixed`, `not actually fixed`, `still has the bug`,
      `still broken`, `still fails`, `never landed`, `never added`, `does not exist`.
      This bites: the natural phrasing for C5-02 ("no SIGHUP test existed") is fine, but
      "never added" and "does not exist" are banned outright. Rephrase, do not weaken the
      tool.

    Cite what was actually produced, not what was intended: for C5-01, `meta/runTs.cjs`
    handler-before-`mkdtempSync` ordering plus the re-run Direction A / Direction B row 11
    verdict PASS; for C5-02, `meta/__tests__/runTsSignals.test.ts` T6 + T7; for C4-05,
    `34.9-REVIEW-SWEEP-CHECK.cjs` and its synthetic-fixture bidirectional proof; for
    IN-03, `meta/cleanDist.ts` and the six `package.json` script wirings.

    Append a dated closure note to each of the five `### N.` item sections (21, 22, 23,
    24, 11) recording what was done, what evidence proves it, and — for item 11 — the
    standing honesty caveat that the win/linux failure remains UNCONFIRMED and was proven
    only against synthetic fixtures on macOS. Leave the original Blocker / Named
    precondition / OWNER text in place; append, do not rewrite history. Note that the
    DEFERRED structural checks (`OWNER:`, `Named precondition`, `Blocker`) no longer apply
    to a FIXED row, so preserving them costs nothing and keeps the record readable.

    For item 24's closure note, state the live-derived census number you actually observed
    in Task 5 and flag the discrepancy with the ledger's recorded 12 — a future reader
    needs to know the number moved and why.

    Then re-run the sweep tool. It must print `LIST-A: 24 IDs`, `COMPUTED-UNMAPPED: 0`,
    `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0` and exit 0. If any row scores
    `FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING` or `FIXED-CONFIRMATION-DENIES-FIX`, **fix the
    ROW, never the CHECK** — Task 1 was the only sanctioned change to that tool, and it
    tightened it.

    Commit `deferred-items.md` by explicit path with plain `git`. Do NOT use `gsd-sdk
    query commit` (it stages the entire tree) and do NOT touch `.planning/STATE.md`.
  </action>
  <verify>
    <automated>cd .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co && node 34.9-REVIEW-SWEEP-CHECK.cjs; echo "exit=$?"</automated>
    <automated>cd .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co && for id in C4-05 C5-01 C5-02 IN-03; do grep -m1 "^| $id " deferred-items.md; done</automated>
    <automated>cd .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co && grep -inE '^\|\s*(C[0-9]+-[0-9]{2}|CR-[0-9]{2}|WR-[0-9]{2}|IN-[0-9]{2})\s*\|[^|]*\|\s*FIXED' deferred-items.md | grep -i summary && echo 'FAIL: a FIXED row cites a summary' || echo 'OK: no summary self-citation'</automated>
    <automated>git status --short .planning/STATE.md | wc -l   # must be 0</automated>
  </verify>
  <done>
    C4-05, C5-01, C5-02 and IN-03 read FIXED with evidence that cites a `34.9-N` plan and
    a real `meta/` artifact, contains no case-variant `summary` and trips no polarity
    pattern. E-02's closure is recorded in prose. All five item sections carry dated
    closure notes with item 11's UNCONFIRMED caveat intact. The sweep prints
    `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0` and exits 0. `.planning/STATE.md` is
    untouched.
  </done>
</task>

</tasks>

<verification>
Run at the end of each segment, and all of it at the end of Segment C:

1. `pnpm jest meta/__tests__` — exactly one failure, the known pre-existing
   `genI18nGateScope` one. Any second failure is yours.
2. `pnpm codecheck` (`tsc --noEmit`) — clean. ts-jest is transpile-only here; a green
   jest run says nothing about types.
3. `node .planning/phases/34.9-.../34.9-REVIEW-SWEEP-CHECK.cjs` — `24/24 mapped,
   unmapped 0`, exit 0.
4. `grep -rln "node_modules/\.cache" meta/*.ts` — zero files.
5. `git status --porcelain -- meta/ package.json` — clean after Task 6's harness.
6. `ls -d $TMPDIR/gamelib-runts-* 2>/dev/null | wc -l` — zero.
7. `git status --short .planning/STATE.md` — empty.
8. Do NOT run `pnpm lint` as a gate. It is RED repo-wide for unrelated pre-existing
   reasons (~3544 problems, 53 errors) and is a separate CI workflow from `codecheck`.
   If you want signal, diff `eslint -f json` filtered on `severity === 2` for the files
   you touched against the same list at your base commit.
</verification>

<success_criteria>
- All five ledger items closed with their named preconditions honoured, or — for any
  precondition genuinely not applicable — with an explicit recorded reason. No silent
  waivers.
- Every new gate proven in both directions: item 21's synthetic RED/GREEN fixture pair,
  item 23's T7 non-vacuity control, item 22's pre-fix widened-window RED observation,
  item 24's pin-3 vacuity guard.
- No artifact of this work claims `dist:win`/`dist:linux` is broken, and none implies
  live win/linux coverage.
- `34.9-WRAPPER-PROOF.md` and `34.9-PIPE-PROOF.md` describe the tree as it actually
  stands, with a dated addendum, not the pre-edit tree.
- `.planning/STATE.md` untouched; no `gsd-sdk state.*` / `roadmap.*` / `query commit`
  verb used anywhere.
</success_criteria>

<output>
Create `.planning/quick/260822-hrf-sweep-phase-34-9-deferred-items-21-24-an/260822-hrf-SUMMARY.md`
when done. It must record, at minimum: the live census number from Task 5 and its
discrepancy with the ledger's 12; the residue decision and its reason; the Task 6 re-run
results row-by-row; and the pre-fix RED observations for items 21, 22 and 23.
</output>
