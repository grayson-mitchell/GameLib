---
phase: quick-260902-rpa
plan: 01
status: complete
date: 2026-09-02
commit: 90c999829
files_modified:
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
---

# Quick Task 260902-rpa — Summary

Took the follow-up quick `260902-qs4` deliberately left open. `hooks/useOpenDialog.ts` and
`Settings/components/CustomWineProton.tsx` are now in the hand-curated **blocking** i18n scope
instead of in `DECLARED_UNSCANNED_DEBT`, a comment-only register that enforces nothing.

One commit: `90c999829`. **Full repo suite green: 371/371 suites, 7490 passed, 3 skipped.**

## What changed

| | before | after |
|---|---|---|
| `meta/i18nGateScope.json` `files` | 161 | **163** |
| `DECLARED_UNSCANNED_DEBT` | 46 | **44** |
| live literal `161` pins | 4 | **163** (:653, :679, :680, :708) |
| `meta/i18nForkTouchedFiles.json` | 207 | **207 (untouched)** |
| `meta/i18nGateAllowlist.json` | 2 entries | **2 entries, no diff** |

`207 - 163 = 44`, so the A-03 ratchet still holds exactly. The scope insert is +2 lines in sorted
position; `baseCommit`, `baseVersion`, `generatedAt`, `generatedBy` and `excluded` are
byte-identical, so the A5 provenance ratchet still reads the file as hand-curated.

## The measurement was re-taken, not trusted

`260902-qs4` recorded both files at zero violations, but that measurement predates `21dd66e4c`,
which widened Pattern 3 — a gate change can in principle flip any file's verdict. So the audit was
re-run against the current gate **before** any edit:

| | scannedFiles | violations |
|---|---|---|
| baseline `scanScope()` | 161 | 0 |
| audit `scanScope({ extraFiles: [both] })` | 163 | **0** |
| `hooks/useOpenDialog.ts` | — | **0** |
| `Settings/components/CustomWineProton.tsx` | — | **0** |
| any other file (collateral) | — | **0** |

**Not vacuous.** After the edit the blocking gate reports `scannedFiles = 163`, so the two files
are genuinely being scanned rather than merely listed. `hardcodedStringGate.test.ts:1321` reads
the scope dynamically (`report.scannedFiles === realScope.files.length`), so it needed no pin
edit while still proving the count moved.

## What deliberately did NOT change

**`Settings/components/Tools/index.tsx` stays in the debt list.** Its two hits — `'Winecfg'` (:89)
and `'Winetricks'` (:96) — are live today, so promoting it would turn the blocking gate red. They
are arguably do-not-translate glossary terms, but that question has to be settled before the file
moves. That follow-up remains open; it is a different one from the one this task closes.

**The historical doc-comment lines are untouched.** `:124` ("Scope 163 -> 161, fork-touched
206 -> 204"), `:141`, and the whole `260902-qs4` block — including its now-stale sentence that
promoting these two "would shrink this list to 44 -- left as a follow-up" — are a LOG of decisions
as they were made, not live pins. Bulk-replacing every `161`/`163` would have falsified it. A new
dated entry records the decision being taken instead, and points back at the paragraph that
deferred it.

**No regen.** `pnpm gen-i18n-gate-scope` is measured to turn 1 failure into 5.

## Verification

| Gate | Result |
|---|---|
| `npx jest --selectProjects Meta` | **36/36 suites, 773 passed, 1 skipped, 0 failed** |
| full `pnpm test` | **371/371 suites, 7490 passed, 3 skipped, 0 failed** |
| `pnpm lint` | 4145 warnings, 0 errors, exit 0 — unchanged, still exactly at the ratchet |
| `tsc --noEmit` | clean |
| `prettier --check` on both changed files | clean |
| `meta/i18nGateAllowlist.json` | no diff |
| `meta/i18nForkTouchedFiles.json` | no diff |
| A-03 arithmetic | 207 - 163 = 44 = `DECLARED_UNSCANNED_DEBT.length` |

**Flake note.** The first full run showed `meta/__tests__/runTsSignals.test.ts` T7 red: its
tmpdir-cleanup poll (100ms budget) had not observed the leaked dir yet under full-suite load.
Standalone it is 8/8 green, the second full run was clean, and the test reads nothing this task
changed. That is the documented under-load flake class — item 6 in phase 39's `deferred-items.md`
records the same test failing the same way before this task existed. Recorded rather than dropped.
