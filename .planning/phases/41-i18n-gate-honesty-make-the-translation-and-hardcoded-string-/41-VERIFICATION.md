---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
verified: 2026-09-06T00:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "A corrupt catalog is a hard, named failure regardless of namespace ownership, with no stack trace in gate output (T-41-03-04) — REQ-41-02"
    - "The baseline drift check fails in BOTH directions and the baseline cannot rot silently — REQ-41-01"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 41: i18n Gate Honesty Verification Report (Re-verification after gap closure)

**Phase Goal:** Both i18n gates currently return green over things they cannot see. Make each one
report the condition it was built to catch, and retire the false-positive debt that made the
hardcoded-string gate's scope artifact untrustworthy. Scope is `meta/` plus
`public/locales/en/gamelib.json` — no runtime code path is touched.

**Verified:** 2026-09-06
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 41-06, 41-07)

## Methodology note

This re-verification did not defer to `41-06-SUMMARY.md` or `41-07-SUMMARY.md`. Both previously
FAILED truths (GAP-1, GAP-2) were re-derived from first principles: the exact lines cited by the
SUMMARYs were read directly in `meta/lintTranslations.ts` and `meta/__tests__/lintTranslations.test.ts`,
and both fixes were independently reproduced by bundling `meta/lintTranslations.ts` with `esbuild`
(mirroring `meta/runTs.cjs`'s own build step) into an isolated scratch directory and calling
`lintTranslations()`/`missingPairs()` directly against hand-built scratch fixtures — never touching
any file inside the repository. `git status --porcelain` / `git diff --stat` on `meta/` and
`public/locales/` were confirmed empty both before and after this session's probes. The CLI's
continued execution was independently re-run (`pnpm lint-translations:gamelib`), not inferred from
the SUMMARY's own quoted output. The 41-06 process deviation (stalled original executor, RED proofs
re-performed by a continuation agent) was assessed by reading the resulting committed diff and
independently reproducing its two claimed defect closures — not by trusting the disclosure at face
value.

## Central Question Verdicts

### 1. Is GAP-1 actually closed at BOTH sites?

**Verdict: CONFIRMED CLOSED.** Independently reproduced via an isolated `esbuild`-bundled probe
(scratch fixture: `en/gamelib.json` = `{` invalid JSON, `xx/gamelib.json` valid):

- `lintTranslations({ localesPath, namespaces: ['gamelib'] })` returned **normally** (no thrown
  exception) with:
  `hardFailures: ["en/gamelib.json is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)"]`
  and a companion `findings` entry: `"presence baseline drift check skipped gamelib: its English catalog could not be parsed (see hard failure above)"`.
- `missingPairs(localesPath, 'gamelib')` called directly on the same corrupt fixture returned `[]`,
  never throwing.

Read directly: `meta/lintTranslations.ts:598-609` wraps the per-namespace `en` read in
`lintTranslations()` in try/catch, routing `CorruptCatalogError` into `result.hardFailures` and a
`corruptEnglishNamespaces` set; `meta/lintTranslations.ts:327-333` wraps `missingPairs()`'s own `en`
read the same way. The old unguarded `readCatalogs()` helper (previously at `:149-159`) no longer
exists anywhere in the file (`grep -n "function readCatalogs"` — zero matches). No `CorruptCatalogError`
escapes either site. **GAP-1 is genuinely closed at both sites.**

### 2. Is GAP-2 actually closed, and is the diagnostic reachable in each distinct skip case?

**Verdict: CONFIRMED CLOSED.** Independently reproduced with the same probe harness, three cases:

- **Non-canonical `localesPath`** (a scratch fixture tree, genuine drift present): result contained
  exactly one skip finding —
  `"presence baseline drift check skipped for gamelib: localesPath \"<scratch path>\" does not resolve to the canonical \"public/locales\""`,
  `hardFailures: []`.
- **Absent baseline** (`baselinePath` injected to a nonexistent scratch path, real `public/locales`
  as `localesPath`): result contained exactly one skip finding —
  `"presence baseline drift check skipped for gamelib: <path> does not exist"`.
- **Normal case** (real `public/locales`, no override): **zero** skip findings emitted — confirming
  the diagnostic does not fire as noise when the check genuinely runs, and that the check does
  execute end-to-end for the canonical case.

Read directly at `meta/lintTranslations.ts:636-676`: the corrupt-English skip, the non-canonical-path
skip, and the absent-baseline skip are each a separate, named `if` branch that pushes a distinct
`findings` string before `continue`; only the pre-existing `!isForkOwned(namespace)` branch (D-15,
explicitly a scope decision, not an availability statement) remains silent, and it is documented as
such in an adjacent comment. A run that skips the check no longer reports the same "0 hard failures"
shape as a run that executed it silently — the skip is now named and visible in `findings`. **GAP-2
is genuinely closed for both distinct skip cases.**

### 3. Did closing GAP-2 introduce a fourth fail-open, or weaken an existing assertion?

**Verdict: NO new fail-open. R1 and R3 were genuinely STRENGTHENED, not weakened.** Read directly
at `meta/__tests__/lintTranslations.test.ts:61-98` (R1) and `:126-155` (R3): both tests now
partition `result.findings` into `skips` (findings containing `'presence baseline drift check skipped'`)
and the remainder, assert `skips` has length exactly 1 (the new diagnostic fires, not silently
suppressed), and then re-assert each test's *original* claim (zero findings for R1; the
out-of-scope-namespace-never-mentioned claim for R3) over the non-skip remainder only. Neither test
was made to pass by deleting an assertion, loosening a length check to "any," or filtering the new
diagnostic out of scope before asserting. This is the correct shape: the new diagnostic is proven
present, and the original guarantee is proven to still hold independently of it. No new silent
branch was found anywhere in the drift-check loop; the only remaining silent `continue` is the
documented, deliberate D-15 ownership-scope decision, which was never part of REQ-41-01/REQ-41-02's
"cannot rot silently" claim (it is a scope decision, not an availability gap).

### 4. Can the new tests actually fail?

**Verdict: YES — all assessed as falsifiable, not vacuous.**

- **R16** (`meta/lintTranslations.ts:598-609` guarded read) and **R18** (its accompanying skip
  finding): both assert against the exact corrupt-`en` fixture I independently reproduced above;
  the assertions (`hardFailures` length 1 containing `'en'`/`'gamelib'`/`'is not valid JSON'`, no
  `'Error:'` or stack-trace substring; `findings` length 1 containing `'presence baseline drift check skipped'`)
  target the precise branch that previously threw uncaught — removing the try/catch (as the SUMMARY's
  RED-proof records show, and as I confirmed by reading the guarded code the assertions depend on)
  would reintroduce an uncaught exception that fails the test before any `expect` runs, which is a
  genuine, non-vacuous failure mode.
- **R17** asserts `missingPairs()` returns `[]` rather than throwing on the same fixture — a bare
  `readCatalog()` call (no try/catch) would throw `CorruptCatalogError` synchronously, failing the
  test the same way.
- **R19a/R20a** assert `skips.toHaveLength(1)` with specific substring content (namespace, path);
  their paired negatives **R19b/R20b** assert `skips.toHaveLength(0)` under the omitted-override /
  upstream-namespace condition respectively. This is a genuine positive/negative pair — a
  regression to a bare `continue` (removing the `.push()` call, as 41-06-SUMMARY's RED-proof
  reproduces) makes the array empty where the test expects length 1, which fails cleanly, not
  vacuously.
- **R5 (rewritten, CR-03/WR-01 closure)**: I read the assertion directly at
  `meta/__tests__/lintTranslations.test.ts:287-315`. It now spies on `console.log`, explicitly
  unsets `LINT_TRANSLATIONS_WRITE_BASELINE` for the duration (so import cannot land on the
  summary-line-free write branch), and asserts zero `console.log` calls contain `'lint-translations['`
  — the string `main()` unconditionally emits on its normal exit path regardless of hard-failure
  count. This directly fixes the vacuity the prior verification identified (the old assertion
  ("`process.exit` not called") could never fail against the committed tree, since hard failures are
  currently zero). The new assertion depends on a side effect (`console.log`) that fires unconditionally
  on every `main()` invocation, not one gated behind a data-dependent branch — so it cannot be
  vacuous the same way. `41-07-SUMMARY.md`'s own recorded measurement (old R5 measured PASSING while
  `main()`'s summary line was visibly printed to test output; new R5 measured FAILING with
  `Received length: 1` on the identical sabotage) is structurally consistent with what the code now
  reads as, and is corroborated by my own independent read of the guard and the assertion's target
  side effect.

No test in this set targets an assertion that a structural read shows to be already-satisfied
regardless of the code path taken.

### 5. Does the CLI still run?

**Verdict: CONFIRMED.** Independently re-ran (not copied from a SUMMARY):

```
$ pnpm lint-translations:gamelib
...
Missing translation for zh_Hant.gamelib.webview.unavailable.platform.heading (en is non-empty)
lint-translations[gamelib]: 794 findings, 0 hard failures
```

The summary line is emitted verbatim, matching the orchestrator's independently measured evidence
exactly. The guard change (`require.main === module && !process.env.JEST_WORKER_ID`,
`meta/lintTranslations.ts:768`) does not silently stop `main()` from executing on the CLI's real,
`esbuild`-bundled invocation path — confirmed both by this direct run and by reasoning through
`meta/runTs.cjs`'s `--bundle` step, which collapses the module into the outfile's own scope, making
`require.main === module` true for that entry point as the guard's own (now-corrected) comment
states.

## Process Deviation Assessment (41-06's stalled original executor)

**Assessed: disclosure is accurate; source work is genuinely complete and correct.** I did not take
the continuation agent's re-performed RED proofs as sufficient on their own — I independently
re-derived both underlying defect closures (GAP-1, GAP-2) from a bundled build of the actual
committed `meta/lintTranslations.ts`, using my own scratch fixtures, not the ones described in the
SUMMARY. The two task commits (`46b8693df`, `ce95fb576`) are present in `git log`, and the resulting
code state I read line-by-line matches exactly what both SUMMARYs describe (guarded reads at both
`en` call sites; three named, non-overlapping skip branches plus one documented silent D-15 branch;
`readCatalogs()` deleted; `LintOptions.baselinePath` present and defaulted). The stall affected only
the *audit trail* (verbatim RED output was captured after the fact rather than during original
execution) — it did not leave any half-finished code, and my independent reproduction found the
described behavior present and correct in the committed tree, not merely claimed.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQ-41-03: `en/gamelib.json` has 0 empty values; six `redeemKey.*` strings byte-identical to `copy.ts` defaults | ✓ VERIFIED | Carried forward, unchanged since prior verification — fully verified with no caveats |
| 2 | REQ-41-03: a future empty English key fails Meta jest by name, non-vacuously | ✓ VERIFIED | Carried forward, unchanged |
| 3 | REQ-41-04: gate reports zero violations for `facetLabels.ts`/`chipLabels.ts`/`gamepad.ts` (was 46), still catches a genuine literal, paired negative fixtures exist | ✓ VERIFIED | Carried forward, unchanged |
| 4 | REQ-41-04: the three files are promoted into the blocking `meta/i18nGateScope.json`, hand-curated | ✓ VERIFIED | Carried forward, unchanged |
| 5 | REQ-41-02: absent-catalog fail-open shapes closed — ownership classification, zero ENOENT stack traces, exit code from a counted failure set | ✓ VERIFIED | Carried forward, unchanged |
| 6 | REQ-41-02 (phase-goal breadth): a corrupt catalog is a hard, named failure regardless of ownership, no stack trace in output, at BOTH English-read sites | ✓ VERIFIED (was FAILED — GAP-1) | Independently reproduced via bundled probe: `lintTranslations()` and `missingPairs()` both handle a corrupt `en/gamelib.json` cleanly, no thrown exception |
| 7 | REQ-41-01: inverted presence check reports every missing (locale,key) pair by name; 794-pair baseline committed | ✓ VERIFIED | Carried forward, unchanged |
| 8 | REQ-41-01: the baseline-drift check fails in BOTH directions and the baseline cannot rot silently — every skip is diagnosable | ✓ VERIFIED (was FAILED — GAP-2) | Independently reproduced: non-canonical-path skip and absent-baseline skip each emit a distinct named `findings` entry; normal run emits zero skip noise |
| 9 | Phase scope constraint honored: only `meta/` + `public/locales/en/gamelib.json` touched, no runtime code path | ✓ VERIFIED | Orchestrator-measured: `git diff --name-only aff7ddf75..HEAD -- src/` = 0 files, held across all seven plans (41-01 through 41-07) |
| 10 | No regressions: all Meta jest suites pass; full test suite and `codecheck` remain green | ✓ VERIFIED | Orchestrator-measured: 37 suites, 1018 passed/1 skipped/1019 total (was 1011/1/1012 pre-gap-closure, +7 new tests, 0 regressions); `pnpm codecheck` exit 0 |

**Score:** 10/10 truths verified (0 failed, 0 uncertain)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/locales/en/gamelib.json` | 224 keys, 0 empty, 6 `redeemKey.*` authored | ✓ VERIFIED | Carried forward from prior verification |
| `meta/__tests__/gamelibCatalogParity.test.ts` | Blocking empty-value assertion + non-vacuity proof | ✓ VERIFIED | Carried forward |
| `meta/hardcodedStringGate.ts` | Widened D-14 exemptions | ✓ VERIFIED | Carried forward |
| `meta/__tests__/hardcodedStringGate.test.ts` | Positive+negative fixtures per widening | ✓ VERIFIED | Carried forward |
| `meta/lintTranslations.ts` | Importable, path-injectable, scope-aware reads, ownership classification, exit code from counted failures, corrupt-`en` handled at both sites, every skip diagnosable | ✓ VERIFIED | Both previously-confirmed defects (CR-01, CR-02) independently re-verified closed at HEAD; `readCatalogs()` deleted; `require.main` guard corrected |
| `meta/__tests__/lintTranslations.test.ts` | R1-R20b fixture RED proofs, R5 falsifiable | ✓ VERIFIED | R1/R3 strengthened (read directly); R16-R20b present and structurally falsifiable (assessed by reading assertion targets against the exact fixed branches); rewritten R5 targets an unconditional side effect, closing the prior vacuity |
| `meta/i18nGateScope.json` | 171→174 files, hand-edited | ✓ VERIFIED | Carried forward |
| `meta/__tests__/genI18nGateScope.test.ts` | `DECLARED_UNSCANNED_DEBT` 44→41 | ✓ VERIFIED | Carried forward |
| `meta/i18nCatalogPresenceBaseline.json` | 794 pairs / 17 keys, committed SET | ✓ VERIFIED | Carried forward; untouched by 41-06/41-07 (`git status --porcelain meta/i18nCatalogPresenceBaseline.json` empty) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `public/locales/en/gamelib.json` | `RedeemSteamKeyDialog/copy.ts` | catalog value equals `t()` default argument | ✓ WIRED | Carried forward |
| `meta/hardcodedStringGate.ts` | `facetLabels.ts`/`gamepad.ts` | exemption gating | ✓ WIRED | Carried forward |
| `meta/i18nGateScope.json` | `meta/hardcodedStringGate.ts` | `scanScope()` reads `scope.files` | ✓ WIRED | Carried forward |
| `meta/lintTranslations.ts` | `meta/i18nCatalogPresenceBaseline.json` | set-equality comparison via `comparePresenceBaseline()` | ✓ WIRED (was PARTIALLY WIRED) | Now wired AND diagnosable for every skip case — independently reproduced; no more silent-unwired case remains except the documented D-15 scope decision |
| `meta/lintTranslations.ts`'s `main()` guard | `require.main === module && !JEST_WORKER_ID` | CLI entry-point gating | ✓ WIRED | Independently re-ran `pnpm lint-translations:gamelib`; summary line present, confirming `main()` still executes on the real bundled CLI path |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Corrupt `en/gamelib.json` is a named hard failure at `lintTranslations()`, not a crash | isolated `esbuild`-bundled probe, scratch fixture | `hardFailures: ["en/gamelib.json is not valid JSON..."]`, no thrown exception | ✓ PASS (was FAIL) |
| Corrupt `en/gamelib.json` is handled cleanly at `missingPairs()`, not a crash | same probe, `missingPairs(dir, 'gamelib')` | `[]` returned, no thrown exception | ✓ PASS (new coverage vs. prior verification, which only tested one site) |
| Non-canonical `localesPath` produces a named skip diagnostic | same probe harness, scratch fixture with genuine drift | 1 named `findings` entry identifying the path and namespace | ✓ PASS (was FAIL) |
| Absent (injected) baseline path produces a named skip diagnostic | same probe harness, real `public/locales`, nonexistent `baselinePath` | 1 named `findings` entry identifying the path | ✓ PASS (was FAIL) |
| Normal (canonical path, real baseline) run emits zero skip noise | same probe harness, real `public/locales`, no override | 0 skip findings | ✓ PASS |
| CLI still emits its summary line after the guard change | `pnpm lint-translations:gamelib` | `lint-translations[gamelib]: 794 findings, 0 hard failures` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-41-01 | 41-05, 41-06 | Invert the presence check direction; report every missing (locale,key) pair by name; baseline cannot rot silently | ✓ SATISFIED (was PARTIALLY SATISFIED) | Core inversion verified previously; GAP-2 (silent drift-check skip) independently reproduced as closed in this re-verification |
| REQ-41-02 | 41-03, 41-06 | Close the fail-open shapes at the catalog-read seam, including the corrupt-`en` crash | ✓ SATISFIED (was PARTIALLY SATISFIED) | All named fail-open shapes closed and verified live; GAP-1 (uncaught `CorruptCatalogError` on corrupt `en`) independently reproduced as closed at both read sites in this re-verification |
| REQ-41-03 | 41-01 | Author six empty English `redeemKey.*` strings; gate a seventh | ✓ SATISFIED | Re-stated from prior verification, no re-derivation performed per orchestrator instruction |
| REQ-41-04 | 41-02, 41-04 | Widen D-14 exemptions to zero violations; promote 3 files into blocking scope | ✓ SATISFIED | Re-stated from prior verification, no re-derivation performed per orchestrator instruction |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| ~~`meta/lintTranslations.ts:569`~~ | — | ~~Unguarded `readCatalogs()` call~~ | RESOLVED | GAP-1 closed; `readCatalogs()` deleted, both `en` read sites now guarded |
| ~~`meta/lintTranslations.ts:590-597`~~ | — | ~~Silent `continue` with zero diagnostic~~ | RESOLVED | GAP-2 closed; every skip now emits a named `findings` entry except the documented D-15 scope decision |
| ~~`meta/lintTranslations.ts:655-662`~~ | — | ~~Guard comment asserting an empirically false claim~~ | RESOLVED | 41-07 replaced the comment with measured claims and added `require.main === module` to the guard |
| ~~`meta/__tests__/lintTranslations.test.ts` R5~~ | — | ~~Assertion narrower than its docstring's claim, incapable of failing~~ | RESOLVED | 41-07 rewrote R5 to observe an unconditional `console.log` side effect; independently assessed falsifiable |
| `meta/hardcodedStringGate.ts:1250-1284` | `isKeyDefaultObjectProperty` | Structural-shape-only exemption, no dataflow trace | ℹ️ INFO (accepted, tested trade-off) | Carried forward from prior verification, unchanged, not a blocker |
| `meta/lintTranslations.ts:155` (pre-existing) | eslint `no-unsafe-return` warning | Unrelated to this phase's diff | ℹ️ INFO | Logged in `deferred-items.md` by 41-07; out of scope, not a phase gap |
| — | — | No `TBD`/`FIXME`/`XXX` markers | — | Scanned all files touched between `aff7ddf75..HEAD` under `meta/`/`public/locales/`: zero matches |

### Human Verification Required

None. This phase's scope (`meta/` + one JSON locale catalog) is entirely mechanically verifiable —
no UI, no visual rendering, no real-time behavior, no external service. Every must-have, including
both re-verified gap closures, was independently confirmed by direct code reading and isolated
reproduction against scratch fixtures, never by trusting SUMMARY.md narration.

### Gaps Summary

Both previously-confirmed BLOCKERs are closed and independently re-verified against the actual
committed code, not merely re-stated from the gap-closure SUMMARYs:

- **GAP-1** (corrupt `en/<namespace>.json` crashing the gate uncaught) is closed at both the
  originally-cited site (`lintTranslations()`) and the site the original verification missed
  (`missingPairs()`), confirmed by an independent bundled-probe reproduction against hand-built
  corrupt fixtures.
- **GAP-2** (silent, undiagnosable skips of the baseline-drift check) is closed for both distinct
  skip conditions (non-canonical `localesPath`, absent baseline file), each with its own named
  `findings` entry, confirmed the same way — and confirmed NOT to fire as noise on the normal,
  canonical-path/real-baseline run.

Closing these gaps did not introduce a new fail-open or weaken any existing test: the two
pre-existing fixture tests affected by the new diagnostic (R1, R3) were read directly and confirmed
to have been strengthened (partition + reassert), not loosened. The new tests (R16-R20b, rewritten
R5) target unconditional side effects or the exact previously-uncaught/previously-silent branches,
and are assessed as falsifiable rather than vacuous. The CLI's real invocation path
(`pnpm lint-translations:gamelib`) was independently re-run and confirmed to still emit its summary
line after the entry-point guard change. The one process deviation (41-06's stalled original
executor) was assessed against the actual committed diff and independent reproduction, not the
disclosure's own wording — the disclosure is accurate, and no half-finished work was found. REQ-41-01
and REQ-41-02 are now fully satisfied; REQ-41-03 and REQ-41-04 remain satisfied as previously
verified. Phase 41's goal — both i18n gates reporting the condition they were built to catch,
without silent fail-open behavior — is achieved.

---

_Verified: 2026-09-06_
_Verifier: Claude (gsd-verifier)_
