---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
verified: 2026-09-06T00:00:00Z
status: gaps_found
score: 8/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A corrupt catalog is a hard, named failure regardless of namespace ownership, with no stack trace in gate output (T-41-03-04) — REQ-41-02"
    status: failed
    reason: >-
      lintTranslations() reads the ENGLISH source catalog via
      readCatalogs(opts.localesPath, 'en', opts.namespaces) at :569 with no
      try/catch. readCatalog() throws CorruptCatalogError, unfiltered, when
      en/<namespace>.json exists but fails to parse. This propagates
      uncaught out of lintTranslations() and out of main(), crashing the
      whole run with Node's raw uncaught-exception stack trace — the exact
      shape T-41-03-04 and the module's own header/CorruptCatalogError doc
      comment promise to eliminate. checkLanguage() DOES wrap a LOCALE
      catalog's CorruptCatalogError into a clean, named hardFailures entry
      (:511-523) — the asymmetry is real: only the `en` read path is
      unguarded. Independently reproduced (not just read): a scratch jest
      probe with a genuinely corrupt en/gamelib.json throws
      CorruptCatalogError out of lintTranslations() with RESULT never
      computed. No test in meta/__tests__/lintTranslations.test.ts corrupts
      `en` — every CorruptCatalogError test (R4, the direct readCatalog()
      unit test) corrupts a locale file (`xx`/`yy`), never `en`.
    artifacts:
      - path: "meta/lintTranslations.ts"
        issue: "Line 569 (`readCatalogs(opts.localesPath, 'en', opts.namespaces)` inside lintTranslations()) has no try/catch around a call that can throw CorruptCatalogError; readCatalogs() (:149-159) has no try/catch either."
    missing:
      - "Wrap the English catalog read per-namespace, catching CorruptCatalogError and pushing it into result.hardFailures (mirroring checkLanguage()'s existing locale-catalog handling), instead of calling the unguarded readCatalogs() helper for `en`."
      - "A fixture test mirroring R4 but corrupting en/gamelib.json (not a locale file), asserting a named hard failure and no thrown exception."
  - truth: "The baseline drift check fails in BOTH directions and the baseline cannot rot silently — REQ-41-01"
    status: failed
    reason: >-
      lintTranslations()'s baseline-drift block (:587-612) gates
      comparePresenceBaseline() behind `isForkOwned(namespace) &&
      isCanonicalLocalesPath && existsSync(PRESENCE_BASELINE_PATH)`; when
      any condition is false it `continue`s with zero findings, zero
      hardFailures, and zero console output — a run that never executed the
      drift check reports exactly `0 hard failures`, identical to a run
      that executed it and found nothing. Independently reproduced: deleting
      /renaming meta/i18nCatalogPresenceBaseline.json, or invoking
      lintTranslations() with any localesPath that does not textually
      path.resolve() to the literal 'public/locales' (e.g. an absolute path
      to the same real directory), silently and permanently disables drift
      detection with no diagnosable signal anywhere in the gate's output.
      This directly falsifies plan 41-05's own stated must-have ("Filling
      locales without regenerating the baseline ALSO fails, so the baseline
      cannot rot silently") for the specific, real scenario of the baseline
      file going missing — and it reintroduces, inside the very module
      REQ-41-02 rewrote to eliminate silent fail-open behavior, a new
      instance of the identical defect class ("gate reports green over a
      condition it never actually checked").
    artifacts:
      - path: "meta/lintTranslations.ts"
        issue: "Lines 587-597: the isCanonicalLocalesPath / existsSync(PRESENCE_BASELINE_PATH) gate silently `continue`s with no findings/hardFailures/log entry when either condition is false."
    missing:
      - "Emit a visible, named `findings` entry (not a hardFailure, to avoid the fixture-test breakage the plan notes already discovered) when the baseline-drift check is skipped for a fork-owned namespace, distinguishing 'baseline file absent' from 'localesPath not canonical'."
      - "A test asserting this finding appears when PRESENCE_BASELINE_PATH is temporarily absent, and one for a non-canonical (but real) localesPath."
human_verification: []
---

# Phase 41: i18n Gate Honesty Verification Report

**Phase Goal:** Both i18n gates currently return green over things they cannot see. Make each one
report the condition it was built to catch, and retire the false-positive debt that made the
hardcoded-string gate's scope artifact untrustworthy. Scope is `meta/` plus
`public/locales/en/gamelib.json` — no runtime code path is touched.

**Verified:** 2026-09-06
**Status:** gaps_found
**Re-verification:** No — initial verification

## Methodology note

This verification did not simply defer to `41-REVIEW.md`. Every one of the review's three
Critical findings and its WR-01 finding was independently re-derived by reading the exact cited
line ranges in `meta/lintTranslations.ts` and `meta/__tests__/lintTranslations.test.ts`, and two
of the four (CR-01, and the `require.main`/CR-03 claim) were additionally reproduced empirically
in isolated jest probes run from the scratchpad directory (never writing into the repo — `git
status` confirmed clean of any repo-tracked change before and after). REQ-41-03's byte-identity
claim was independently re-derived with a standalone Node script comparing the committed JSON
against the literal strings in `copy.ts`, not taken from the SUMMARY's claim of having done this
programmatically. All four in-scope Meta jest suites were re-run directly
(`hardcodedStringGate.test.ts`, `genI18nGateScope.test.ts`, `gamelibCatalogParity.test.ts`,
`lintTranslations.test.ts`): 392 passed, 1 skipped, 393 total — matching both the review's and the
orchestrator's counts exactly.

## Central Question Verdicts

### CR-02 — did plan 41-05 recreate the fail-open defect class REQ-41-02 was chartered to eliminate?

**Verdict: CONFIRMED. Yes — a third fail-open shape, newly introduced by 41-05, in the same file.**

Read directly at `meta/lintTranslations.ts:587-597`:

```ts
const isCanonicalLocalesPath =
  resolve(opts.localesPath) === resolve(CANONICAL_LOCALES_PATH)

for (const namespace of opts.namespaces) {
  if (
    !isForkOwned(namespace) ||
    !isCanonicalLocalesPath ||
    !existsSync(PRESENCE_BASELINE_PATH)
  ) {
    continue
  }
  ...
}
```

I reproduced the consequence directly (isolated jest probe, scratch fixture, not the real tree):
calling `lintTranslations()` with a non-canonical `localesPath` against a fixture with genuine,
manufacturable drift still returned `hardFailures: 0` — the per-key forward/inverted findings
still fire (they are gated separately), but the baseline-drift hard-failure path — the ONE check
REQ-41-01 exists specifically to make load-bearing — never executes, and nothing in the output
says so.

REQ-41-02's own literal text names two specific shapes (`checkLanguage`'s `if (!content) continue`,
and the ENOENT-stack-trace-with-exit-0 behavior). Both of those ARE closed — confirmed by a live
`pnpm lint-translations:gamelib` run (794 findings, 0 hard failures, zero exceptions) and by a
full-namespace run (`8310 findings, 0 hard failures`, exit code 0, zero lines matching `at ` in the
output — the sl/translation.json and uz/login.json absences that previously threw ENOENT are now
clean one-line findings). **So REQ-41-02's literal two named shapes are genuinely fixed.**

But the phase goal is broader than REQ-41-02's literal wording, and plan 41-05 (REQ-41-01)
introduced a new instance of the identical defect class in the same module: a condition under
which the gate silently reports "clean" without the check that makes it meaningful ever having
run. This is not a hypothetical — it directly falsifies plan 41-05's own must-have truth ("the
baseline cannot rot silently"): deleting `meta/i18nCatalogPresenceBaseline.json` disables drift
detection forever, with zero signal, and no test in the suite guards this boundary (confirmed:
`comparePresenceBaseline()` itself throws loudly on a bad path when called directly — the silence
lives entirely in `lintTranslations()`'s wrapping gate, which no test exercises for either skip
condition).

**This is scored as a FAILED must-have (see gaps, above) — a BLOCKER.**

### CR-01 — does a gate still fail to report a condition it was built to catch?

**Verdict: CONFIRMED. Yes — a corrupt English catalog crashes the run uncaught.**

Independently reproduced (isolated jest probe, not trusting the review's transcript): a scratch
`en/gamelib.json` containing `{` (invalid JSON) plus a valid `xx/gamelib.json`, passed to
`lintTranslations({ localesPath, namespaces: ['gamelib'] })`, throws `CorruptCatalogError`
uncaught — `RESULT` is never computed, the function never returns normally. This is because
`lintTranslations()` (`:569`) calls `readCatalogs(opts.localesPath, 'en', opts.namespaces)` with no
try/catch, and `readCatalogs`/`readCatalog` throw `CorruptCatalogError` unfiltered for any corrupt
file. `checkLanguage()` (`:511-523`) DOES catch this same error type for a LOCALE catalog and
routes it cleanly into `result.hardFailures` — the asymmetry between the `en` read path and the
locale read path is real and confirmed, not a misreading.

The module's own header comment and the `CorruptCatalogError` doc-comment both assert this is "a
hard failure regardless of namespace ownership" with "no stack trace in gate output"
(T-41-03-04) — that promise holds for locale catalogs and is broken for the English source
catalog specifically. No test in `lintTranslations.test.ts` corrupts `en` (only R4's `xx` and the
direct `readCatalog()` unit test's `yy`), so this gap is untested as well as unfixed.

**This is scored as a FAILED must-have — a BLOCKER.** The phase goal text "make each one report the
condition it was built to catch" is directly contradicted here: the gate does not report this
condition, it crashes on it.

### CR-03 / WR-01 — is the R5 test a false assurance, and does the guard leave a real write path exposed?

**Verdict: CONFIRMED on both counts, via independent reproduction — classified WARNING, not a
blocker (does not falsify a literal stated must-have).**

I reproduced the `require.main` claim myself rather than trusting the review's transcript, using an
isolated jest probe under this repo's real `ts-jest` config: a module required from inside a test
file logs `require.main === module: false`, with `require.main.filename` resolving to the TEST
FILE's own path, never the required module's path. This directly refutes the guard's own comment
at `meta/lintTranslations.ts:655-660` ("the usual `require.main === module` idiom would run this at
import time under test too") — that claim is empirically false; the standard idiom would have been
safe under jest here, and would have additionally refused to run under any non-jest,
non-entry-point import (`tsx`, `ts-node`, ad-hoc probes) that the chosen `JEST_WORKER_ID`-only guard
does not protect against.

This matters concretely because `main()` has a real, unconditional-once-triggered disk-write
branch: `LINT_TRANSLATIONS_WRITE_BASELINE === '1'` calls `writePresenceBaseline()`, which
`writeFileSync`s the checked-in `meta/i18nCatalogPresenceBaseline.json`. Any non-jest import context
with that env var set (`JEST_WORKER_ID` unset) passes straight through the current guard. This is
the same bug class this project has already been bitten by once for `genI18nGateScope.ts`
(recorded in MEMORY.md), reintroduced here one level over.

I also independently confirmed WR-01 by code reading (not reproduction, since it is a logical
argument about test coverage rather than an empirical fact): R5 (`lintTranslations.test.ts:180-192`)
spies ONLY on `process.exit`. `main()` calls `process.exit(1)` only when
`result.hardFailures.length > 0`. Against the real committed tree, hard failures are zero (confirmed
by the live run above: `0 hard failures`). So if the top-level guard were weakened to unconditional
`main()`, `main()` would run to completion, print console output, and call `process.exit` zero
times — R5's assertion (`exitSpy not called`) would still pass. R5 is provably incapable of
detecting that specific regression; only R15 (which observes real file bytes/mtime) would catch an
actual unauthorized write, and R15 only exercises the `LINT_TRANSLATIONS_WRITE_BASELINE=1` path, not
a guard-removal scenario on the general read path.

**Not scored as a gap** — the literal must-have ("the module can be imported by jest without running
its CLI entry point") IS true today; the guard correctly blocks the currently-only-observed import
context (jest). But this is a real, demonstrated robustness gap matching this project's own recorded
bug class, worth a follow-up todo before it bites the same way `genI18nGateScope.ts` once did.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQ-41-03: `en/gamelib.json` has 0 empty values; six `redeemKey.*` strings byte-identical to `copy.ts` defaults | ✓ VERIFIED | Independent Node script: 224 keys, 0 empty; byte-for-byte match (incl. em dashes, `{{packageName}}`) confirmed for all 6 keys |
| 2 | REQ-41-03: a future empty English key fails Meta jest by name, non-vacuously | ✓ VERIFIED | `gamelibCatalogParity.test.ts`'s `findEmptyEnglishKeys` + sabotage proof; re-ran, passing |
| 3 | REQ-41-04: gate reports zero violations for `facetLabels.ts`/`chipLabels.ts`/`gamepad.ts` (was 46), still catches a genuine literal, paired negative fixtures exist | ✓ VERIFIED | Read `isKeyDefaultTupleElement`/`isKeyDefaultObjectProperty`/`closest` gating + their paired negative-fixture tests; re-ran `hardcodedStringGate.test.ts`, passing |
| 4 | REQ-41-04: the three files are promoted into the blocking `meta/i18nGateScope.json` (171→174) and removed from `DECLARED_UNSCANNED_DEBT` (44→41), hand-curated (not regenerated) | ✓ VERIFIED | `i18nGateScope.json` contains all 3 paths, 174 files total; `DECLARED_UNSCANNED_DEBT` array counted at exactly 41, none of the 3 present |
| 5 | REQ-41-02: absent-catalog fail-open shapes closed — ownership classification, zero ENOENT stack traces, exit code from a counted failure set | ✓ VERIFIED | Live `pnpm lint-translations:gamelib` run: 794 findings/0 hard failures, no exceptions; full-namespace run: 8310 findings/0 hard failures, exit 0, zero `at `-prefixed stack lines, `sl/translation.json`+`uz/login.json` reported as one clean line each |
| 6 | REQ-41-02 (phase-goal breadth): a corrupt catalog is a hard, named failure regardless of ownership, no stack trace in output | ✗ FAILED | CR-01 — see verdict above; independently reproduced uncaught `CorruptCatalogError` from a corrupt `en/gamelib.json` |
| 7 | REQ-41-01: inverted presence check reports every missing (locale,key) pair by name; 794-pair baseline committed; keyed off `en` non-empty, no exemption register | ✓ VERIFIED | `checkEnglishKeysPresent` read directly; baseline file has 794 pairs/17 keys (independently structure-checked); live run's 794 findings match |
| 8 | REQ-41-01: the baseline-drift check fails in BOTH directions and the baseline cannot rot silently | ✗ FAILED | CR-02 — see verdict above; independently reproduced a silent skip via a non-canonical `localesPath` with genuine fixture drift |
| 9 | Phase scope constraint honored: only `meta/` + `public/locales/en/gamelib.json` touched, no runtime code path | ✓ VERIFIED | `git diff --name-only aff7ddf75..HEAD -- src/` = 0 files; `git diff --name-only aff7ddf75..HEAD -- meta/ public/locales/en/gamelib.json` lists exactly the 9 expected files |
| 10 | No regressions: all four in-scope Meta jest suites pass; full test suite and `codecheck` remain green | ✓ VERIFIED | Re-ran the 4 suites directly: 392 passed/1 skipped/393 total, matching orchestrator's full-suite numbers (~8086 tests, 0 failures) and `pnpm codecheck` exit 0 |

**Score:** 8/10 truths verified (2 FAILED, both BLOCKERS)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/locales/en/gamelib.json` | 224 keys, 0 empty, 6 `redeemKey.*` authored | ✓ VERIFIED | Confirmed by independent script; byte-identical to `copy.ts` |
| `meta/__tests__/gamelibCatalogParity.test.ts` | Blocking empty-value assertion + non-vacuity proof | ✓ VERIFIED | Read + re-ran; passes |
| `meta/hardcodedStringGate.ts` | Widened D-14 exemptions (`isKeyDefaultObjectProperty`, `DOTTED_KEY_RE` ns-prefix, `closest` in `TECHNICAL_DOM_API_METHOD_NAMES`) | ✓ VERIFIED, narrowness assessed | Structural-shape-only (WR-02 confirmed: no dataflow trace to an actual `t()` call site), but paired negative fixtures prove the shape alone is insufficient (`Windows only`/`Not available on macOS` style fixtures still flag 2 violations). One deliberately-accepted, tested trade-off remains: `closest()` on any object (not just DOM `Element`) is exempted by method name alone — the test suite itself documents and accepts this as "the accepted cost of a method-name gate, same as the pre-existing `querySelector` entry." Real-world footprint today is confirmed narrow (only `chipLabels.ts`/`gamepad.ts`'s genuine call sites). |
| `meta/__tests__/hardcodedStringGate.test.ts` | Positive+negative fixtures per widening, WR-18 rebased to 0/0/0 | ✓ VERIFIED | Confirmed by direct read of the W1-W3 block and re-run |
| `meta/lintTranslations.ts` | Importable, path-injectable, scope-aware reads, ownership classification, exit code from counted failures | ⚠️ VERIFIED WITH BLOCKERS | Importability/scope/ownership/exit-code all confirmed working; corrupt-`en` handling (CR-01) and baseline-drift skip silence (CR-02) are both confirmed defects in the same file |
| `meta/__tests__/lintTranslations.test.ts` | R1-R15 fixture RED proofs | ⚠️ PARTIAL COVERAGE | R1-R15 exist and pass, but no fixture corrupts `en` (CR-01's gap), and no fixture exercises either baseline-skip condition (CR-02's gap); R5 is a false assurance for the top-level guard specifically (WR-01, confirmed) |
| `meta/i18nGateScope.json` | 171→174 files, hand-edited | ✓ VERIFIED | 174 files counted; `generatedBy` provenance string names the phase and confirms it was hand-edited, not regenerated |
| `meta/__tests__/genI18nGateScope.test.ts` | `DECLARED_UNSCANNED_DEBT` 44→41 | ✓ VERIFIED | Counted exactly 41 entries; none of the three promoted files present |
| `meta/i18nCatalogPresenceBaseline.json` | 794 pairs / 17 keys, committed SET | ✓ VERIFIED | Structure matches; live-tree comparison (R13) passes; matches orchestrator's independent count |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `public/locales/en/gamelib.json` | `RedeemSteamKeyDialog/copy.ts` | catalog value equals `t()` default argument | ✓ WIRED | Byte-identical, independently verified |
| `meta/hardcodedStringGate.ts` | `facetLabels.ts` | `isKeyDefaultTupleElement` over ns-prefixed dotted key | ✓ WIRED | `DOTTED_KEY_RE` confirmed to require the mandatory dotted tail; negative fixture (namespace-prefix-only, no dot) still flags |
| `meta/hardcodedStringGate.ts` | `helpers/gamepad.ts` | `isTechnicalDomApiArgument` gated on `closest` | ✓ WIRED | Confirmed method-name gate; call-gated not content-shaped (fixture proves the same literal outside a call still flags) |
| `meta/i18nGateScope.json` | `meta/hardcodedStringGate.ts` | `scanScope()` reads `scope.files` | ✓ WIRED | 174-file scope confirmed to include all three promoted files |
| `meta/lintTranslations.ts` | `public/locales/*/gamelib.json` | scope-filtered catalog read | ✓ WIRED | Live run confirms out-of-scope namespaces never opened |
| `meta/lintTranslations.ts` | `meta/i18nCatalogPresenceBaseline.json` | set-equality comparison | ⚠️ PARTIALLY WIRED | Wired and correct for the canonical-path/baseline-present case (R13 passes); silently UNWIRED (no diagnostic) for any other case — see CR-02 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `pnpm lint-translations:gamelib` emits zero stack traces, reports missing translations by name | `pnpm lint-translations:gamelib` | `794 findings, 0 hard failures`, zero exceptions, all 794 lines named `Missing translation for <locale>.gamelib.<key>` | ✓ PASS |
| Full-namespace run: absent upstream catalogs are clean one-liners, exit 0 | `node meta/runTs.cjs ... meta/lintTranslations.ts` (no `LINT_TRANSLATIONS_NAMESPACES` set) | `8310 findings, 0 hard failures`, exit 0, `sl/translation.json is absent -- upstream ...`, `uz/login.json is absent -- upstream ...`, zero lines matching `at ` | ✓ PASS |
| Corrupt `en/gamelib.json` is handled as a named hard failure, not a crash | isolated jest probe, scratch fixture, `lintTranslations({ localesPath, namespaces: ['gamelib'] })` | `THREW: CorruptCatalogError`, `RESULT: null` (never computed) | ✗ FAIL — confirms CR-01 |
| Baseline-drift check is diagnosable when skipped (missing baseline / non-canonical path) | isolated jest probe, scratch fixture with genuine drift, non-canonical `localesPath` | `findings: 2, hardFailures: 0` — the per-key soft findings fire but no drift diagnostic of any kind is emitted | ✗ FAIL — confirms CR-02 |
| `require.main === module` inside a module required by a `ts-jest` test | isolated jest probe, `reqmain_probe_module.ts` required from a test | `require.main === module: false`, `require.main.filename` = the TEST file's path | Refutes the guard comment's premise — confirms CR-03 |
| All four in-scope Meta suites pass | `npx jest --selectProjects Meta --testPathPattern "hardcodedStringGate.test.ts\|genI18nGateScope.test.ts\|lintTranslations.test.ts\|gamelibCatalogParity.test.ts"` | `4 passed, 4 total`; `392 passed, 1 skipped, 393 total` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-41-01 | 41-05 | Invert the presence check direction; report every missing (locale,key) pair by name | ⚠️ PARTIALLY SATISFIED | Core inversion works and is verified; the committed baseline's drift-detection hard-failure path can be silently disabled (CR-02) — the requirement's own "cannot rot silently" guarantee is not held in all cases |
| REQ-41-02 | 41-03 | Close the two fail-open shapes at the catalog-read seam | ⚠️ PARTIALLY SATISFIED | The two NAMED shapes (silent `if (!content) continue`, ENOENT stack traces with exit 0) are genuinely fixed and verified live. A THIRD fail-open shape of the identical class was introduced in the same file by the companion plan (41-05) — CR-02. A corrupt English catalog also still crashes uncaught (CR-01), contradicting the module's own stated "hard failure regardless of ownership" invariant. |
| REQ-41-03 | 41-01 | Author six empty English `redeemKey.*` strings; gate a seventh | ✓ SATISFIED | Fully verified independently — 224/0, byte-identical, blocking test with non-vacuity proof |
| REQ-41-04 | 41-02, 41-04 | Widen D-14 exemptions to zero violations; promote 3 files into blocking scope | ✓ SATISFIED | Fully verified — 46→0 violations, 174-file scope, 41-entry debt list, paired negative fixtures prove narrowness is real, not assumed |

No orphaned requirements — all four `REQ-41-*` IDs declared across the phase's ROADMAP entry are claimed by exactly one plan each (41-01→REQ-41-03, 41-02→REQ-41-04, 41-03→REQ-41-02, 41-04→REQ-41-04, 41-05→REQ-41-01), and REQUIREMENTS.md does not separately track Phase 41 (this phase's requirements live in ROADMAP.md's own Phase 41 section, not `.planning/REQUIREMENTS.md`, which is scoped to the v0.2/v0.3 milestones).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `meta/lintTranslations.ts` | 569 | Unguarded `readCatalogs()` call that can throw uncaught | 🛑 BLOCKER | CR-01 — crashes gate on corrupt `en` catalog |
| `meta/lintTranslations.ts` | 590-597 | Silent `continue` with zero diagnostic output | 🛑 BLOCKER | CR-02 — baseline-drift detection can rot to a permanent no-op with no signal |
| `meta/lintTranslations.ts` | 655-662 | Guard comment asserts an empirically false claim about `require.main` under `ts-jest`; real write path only partially guarded | ⚠️ WARNING | CR-03 — theoretical but class-matching exposure of `writePresenceBaseline()`'s disk write to a non-jest import context |
| `meta/__tests__/lintTranslations.test.ts` | 180-192 (R5) | Test asserts a narrower claim (`process.exit` not called) than its docstring claims to prove (`main()` never ran) | ⚠️ WARNING | WR-01 — R5 would still pass if the top-level guard were weakened, because `hardFailures` is 0 against the real tree today |
| `meta/hardcodedStringGate.ts` | 1250-1284 | `isKeyDefaultObjectProperty` exempts by structural shape alone, no dataflow verification to an actual `t()` call | ℹ️ INFO (accepted, tested trade-off) | WR-02 — narrow, documented, and matches an existing precedent (`isKeyDefaultTupleElement`); real footprint confirmed narrow |
| — | — | No `TBD`/`FIXME`/`XXX` markers | — | — | Scanned all 9 phase-touched files; zero matches |

No debt markers found in any of the 9 files this phase touched (`meta/hardcodedStringGate.ts`, `meta/lintTranslations.ts`, `meta/i18nGateScope.json`, `meta/i18nCatalogPresenceBaseline.json`, `public/locales/en/gamelib.json`, and the four `meta/__tests__/*.test.ts` files) — the debt-marker gate does not fire.

### Human Verification Required

None. This phase's scope (`meta/` + one JSON locale catalog) is entirely mechanically verifiable —
no UI, no visual rendering, no real-time behavior, no external service. Every must-have was
verifiable by direct code reading, live CLI execution, or isolated jest reproduction.

### Gaps Summary

Phase 41 delivered real, substantial, well-tested work: REQ-41-03 and REQ-41-04 are both fully and
independently verified with no caveats — 224/0 English keys with byte-exact provenance, and a
46→0 violation reduction across three files with paired negative fixtures proving the widened
exemptions are genuinely narrow rather than merely untested. The phase honored its stated scope
boundary (zero `src/` files touched) and introduced zero regressions across all ~8086 tests in the
full suite.

However, the phase's two most architecturally significant deliverables — REQ-41-02's fail-open
closure and REQ-41-01's inverted, bidirectional presence check — each carry one confirmed,
reproduced defect that directly contradicts the phase's own charter ("make each one report the
condition it was built to catch," "retire the false-positive debt... untrustworthy"):

1. **CR-01**: a corrupt `en/gamelib.json` crashes the gate with an uncaught exception instead of
   producing the "hard, counted, named failure" the module's own documentation promises for this
   exact scenario. This is the SAME failure mode (a stack trace escaping to gate output) that
   REQ-41-02 exists to eliminate — just on the one catalog read path the rewrite didn't cover.
2. **CR-02**: the presence-baseline drift check — REQ-41-01's core deliverable, and the mechanism
   that turns 794 previously-invisible missing translations into a load-bearing CI gate — can be
   silently and permanently disabled by deleting one file or by any future caller spelling the
   locales path differently than the one literal string the gate happens to match today. Nothing
   in the test suite exercises this boundary, and nothing in the gate's output would ever reveal
   that it happened.

Both are BLOCKERS: they are confirmed by direct reproduction (not merely by trusting the code
review), both fall squarely within this phase's own stated goal, and both were introduced or left
unaddressed by this phase's own commits (not pre-existing debt). A third finding (CR-03/WR-01 — the
CLI guard's justifying comment is empirically false, and the R5 test cannot detect the guard's
removal) is confirmed but does not violate a literal stated must-have and is scored as a WARNING,
not a gap — it is a real, class-matching robustness concern worth a follow-up before it recurs the
way the sibling `genI18nGateScope.ts` bug once did, but it does not block this phase's goal
achievement on its own.

Recommended remedy for both blockers is already spelled out precisely in `41-REVIEW.md`'s Fix
sections and independently confirmed correct by this verification:
- CR-01: wrap the `en` catalog read the same way `checkLanguage()` wraps a locale read, routing
  `CorruptCatalogError` into `result.hardFailures`; add a fixture test corrupting `en/gamelib.json`.
- CR-02: emit a visible `findings` entry (not a `hardFailures`, to avoid the fixture-test breakage
  already discovered mid-execution) when the baseline-drift check is skipped for a fork-owned
  namespace; add tests for both skip conditions (missing baseline file, non-canonical path).

---

_Verified: 2026-09-06_
_Verifier: Claude (gsd-verifier)_
