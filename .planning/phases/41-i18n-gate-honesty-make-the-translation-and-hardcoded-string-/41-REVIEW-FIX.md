---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
review: 41-REVIEW.md
status: partial
findings_total: 8
findings_fixed: 4
outstanding: [WR-02, WR-03, IN-01, IN-02]
---

# Fix pass for 41-REVIEW.md — phase 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-

## Why this file exists

`41-REVIEW.md` carries `status: issues_found` and `findings.critical: 3`. Per `reviewStatus()`'s
own logic in `~/.vscode/extensions/gsd-phase-status/parse.js`, a review file's status is never
rewritten when fixes land — it is a point-in-time record of what the review found on
2026-09-06. `41-REVIEW.md` itself is **not edited by this task and must not be** (its
`status: issues_found` is stale by design, matching 32 of 37 review files in this tree). The
sanctioned way to state where a review now stands is this fix-pass sibling: when a
`*-REVIEW-FIX.md` exists beside a `*-REVIEW.md`, `reviewStatus(fm, fix)` reads the fix pass's
`status:` (`artifactStatus(fix) || 'inprogress'`) instead of falling back to the review's own
unaddressed-critical rule (`findings.critical > 0` -> `blocked`).

This file changes no behaviour and touches no source code (`src/`, `meta/`, `public/` are all
unmodified by this task). It is a record, sourced from directly reading the current
`meta/lintTranslations.ts`, `meta/hardcodedStringGate.ts`, and their test files — not from
re-stating a plan's or summary's claim of what was fixed — of where each of `41-REVIEW.md`'s
eight findings currently stands.

## Dispositions

| Finding | Severity | Disposition | Evidence |
|---|---|---|---|
| CR-01 | Critical | FIXED | `meta/lintTranslations.ts:599-611` — `lintTranslations()`'s per-namespace English read is now wrapped in try/catch; a `CorruptCatalogError` is routed into `result.hardFailures` and the namespace is recorded in `corruptEnglishNamespaces`, never thrown uncaught. `meta/lintTranslations.ts:330-336` — `missingPairs()`'s English read carries the same guard. Commit `46b8693df` ("a corrupt English catalog is a named hard failure, never a crash"). |
| CR-02 | Critical | FIXED | `meta/lintTranslations.ts:656-677` — the presence-baseline drift loop now pushes a named `findings` entry for each of the three previously-silent skip conditions: corrupt-English (`:656-661`), non-canonical `localesPath` (`:664-669`), and absent baseline file (`:671-676`). The single remaining silent `continue` (`:646-648`, `!isForkOwned(namespace)`) is a documented D-15 scope decision, not an availability statement, matching the fix's own design note at `:641-645`. Commit `ce95fb576` ("every drift-check skip emits a named finding, never silence"). |
| CR-03 | Critical | FIXED | `meta/lintTranslations.ts:768` — the guard is now `if (require.main === module && !process.env.JEST_WORKER_ID)`, replacing the `JEST_WORKER_ID`-only check. The preceding comment (`:736-767`) states only measured claims: that `require.main === module` is `false` under ts-jest (resolves to the test file, not this module) and that `runTs.cjs`'s esbuild `--bundle` collapses `require.main === module` to always-true inside the bundle, so `JEST_WORKER_ID` is still needed and neither condition is redundant. Commit `2ac88fcf6`. |
| WR-01 | Warning | FIXED | `meta/__tests__/lintTranslations.test.ts:287-312` — R5 ("importing the module performs no side effects (no main() run on import)") now installs a `console.log` spy and asserts zero calls whose first argument contains `'lint-translations['` (`:308-312`), rather than only asserting `process.exit` was never called. `41-07-SUMMARY.md` records this rewritten assertion measured genuinely RED under the exact sabotage (`main()` called unconditionally) the old, `process.exit`-only R5 could not detect. Commit `2ac88fcf6`. |
| WR-02 | Warning | **OPEN** | `meta/hardcodedStringGate.ts:1219-1284` — `isKeyDefaultTupleElement` and `isKeyDefaultObjectProperty` are unchanged: both still exempt purely on property/element shape (a dotted `key` string plus a sibling `defaultText`/second-tuple-element string), with no check that the pair ever actually reaches a `t()`/`tGamelib()` call. No dataflow-tracing logic exists anywhere in the file. The review itself scored this as "no change required to ship this phase" (a documented, accepted trade-off, not a blocker) — no fix was made, and none was owed by the review's own disposition. |
| WR-03 | Warning | **OPEN** | `meta/lintTranslations.ts:140-152` — `readCatalog()`'s file read is still a bare `try { ... } catch { return null }` (`:146-152`), classifying ENOENT identically to EACCES, EISDIR, or any other `readFileSync` failure. The doc comment above it (`:134-139`) still explicitly documents this as deliberate ("Returns `null` if the file is absent (ENOENT or any other read failure)"). The review's own suggested fix (narrow the catch to `ENOENT` and re-throw anything else) was not applied. This finding is entangled with CR-01's fix only in that CR-01 now *catches* `CorruptCatalogError` at the call sites — it does not touch `readCatalog()`'s separate, broader read-failure catch, which remains exactly as the review found it. |
| IN-01 | Info | **OPEN** (unenforced, by design) | `meta/lintTranslations.ts:493` — the comment "assertion over `missing`, never over `totalPairs` -- do not 'fix' [it]" and `meta/i18nCatalogPresenceBaseline.json`'s live `totalPairs` field (currently `0`) confirm `comparePresenceBaseline()` still never reads `totalPairs`. The review explicitly said no fix was required here ("good practice", not a defect) — nothing changed, and nothing was owed to change. |
| IN-02 | Info | **OPEN, and its risk has since materialized** | `meta/lintTranslations.ts:52-53` — the header comment still reads "measured at HEAD (2026-09-06) this was hiding 794 missing (locale, key) pairs across 17 keys" verbatim, unedited since the review. Separately, commit `68348932e` ("re-record the presence baseline after the fill"), also dated 2026-09-06, regenerated `meta/i18nCatalogPresenceBaseline.json` to `totalPairs: 0, missing: {}` — every one of the 794 pairs is now present. The header comment's number is therefore now stale *on the very day it was written*, exactly the risk the review flagged ("as the baseline evolves ... this specific number will read as stale"). The review scored this INFO/no-action-needed because the comment carries a date; that date alone did not prevent the number going stale same-day. No fix was made. |

## Tally

**4 of 8 fixed** (CR-01, CR-02, CR-03, WR-01). **4 open** (WR-02, WR-03, IN-01, IN-02) — all four
are non-critical (2 warning, 2 info), all three that carry a review-authored fix recommendation
(WR-02, WR-03) or an enforcement question (IN-01) were explicitly scored by the review as
non-blocking to ship, and none was owed a code change. IN-02 is the one item where the review's
own stated risk has since been observed to occur.

## Outstanding

- **WR-02** — `meta/hardcodedStringGate.ts:1219-1284`. Filed 2026-09-07 as
  `.planning/todos/pending/2026-09-07-t-exemption-fires-on-shape-alone-never-a-real-call-site.md`. Reconsider only if the
  object-pair/tuple exemption's real-world footprint grows beyond today's single legitimate user
  (`chipLabels.ts`).
- **WR-03** — `meta/lintTranslations.ts:140-152`. Filed 2026-09-07 as
  `.planning/todos/pending/2026-09-07-readcatalog-swallows-every-read-failure-as-absent.md`. The review's suggested fix
  (narrow the catch to `ENOENT`, re-throw other errors) has not been applied.
- **IN-01** — `meta/lintTranslations.ts:493`. Filed 2026-09-07 as
  `.planning/todos/pending/2026-09-07-presence-baseline-totalpairs-is-unenforced-prose.md`; the review scored this as
  intentional design, not a defect.
- **IN-02** — `meta/lintTranslations.ts:52-53`. Filed 2026-09-07 as
  `.planning/todos/pending/2026-09-07-linttranslations-header-comment-cites-794-pairs-now-zero.md`. The header comment's "794"
  figure is stale as of commit `68348932e` and should be updated or reworded to state it is a
  historical measurement the next time this file is touched.

## Scope — what this file does not cover

This artifact dispositions the eight findings of `41-REVIEW.md` only (CR-01, CR-02, CR-03, WR-01,
WR-02, WR-03, IN-01, IN-02). It does not restate or supersede `41-VERIFICATION.md`'s own GAP-1/
GAP-2 findings (closed separately by plans 41-06/41-07, corroborated above) or any other phase-41
artifact.

## Verification

Before (measured by the orchestrator, replaying the real `gsd-phase-status` parser against the
real phase-41 folder, prior to this file existing):

```
blocked      REVIEW.md        41-REVIEW.md
complete     VERIFICATION.md  41-VERIFICATION.md
--- folder rollup inputs: ["blocked","complete"]
```

After (measured independently in this task, same harness, run as a separate tool call after the
write — see this quick task's `SUMMARY.md` for the verbatim after-output).

This task changes no behaviour and touches no code — `git diff --stat` against `src/`, `meta/`,
`public/` for this task's commit is empty by construction (only this file and the sibling
`SUMMARY.md` were written).
