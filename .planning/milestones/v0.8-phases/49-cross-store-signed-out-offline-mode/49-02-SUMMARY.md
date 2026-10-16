---
phase: 49-cross-store-signed-out-offline-mode
plan: 02
subsystem: i18n
tags: [i18next, l10n, gamelib-catalogue, locale-fill, sign-in-notice]

requires: []
provides:
  - "Eight net-new gamelib catalogue keys (library.signIn.dismiss/expired/notConnected/reconnect/signIn, login.amazonReconnect/epicReconnect/gogReconnect) filled non-empty in all 49 public/locales/*/gamelib.json"
  - "All 48 non-en gamelib.mt.json manifests stamp the eight keys; model/filledAt/locale byte-identical"
  - "en holds the copy contract verbatim; pnpm i18n is a proven no-op over en"
affects: [49-03, 49-09, 49-10]

actuals:
  tokens: 11000
  tasks: 3
  commits: 2
plan_head_before: fef818859146290312de577907830bbc83f39323
plan_head_after: 98550cd14fee7350923959c153306630976e23b9

tech-stack:
  added: []
  patterns:
    - "Catalogue and manifest sweeps are done by a scratchpad script that round-trips JSON (JSON.stringify 4-space / 2-space + LF) only after proving every file already round-trips byte-identically; the diff is then pure additions (10 and 8 lines per locale)."
    - "gamelib.mt.json keys[] are code-unit sorted in every locale; new keys are spliced at the sorted position."

key-files:
  created: []
  modified:
    - public/locales/en/gamelib.json
    - public/locales/{48 other locales}/gamelib.json
    - public/locales/{48 non-en locales}/gamelib.mt.json

key-decisions:
  - "login.*Reconnect in each non-en locale reuses that locale's existing login.steamReconnect string verbatim, so the three new tiles read exactly like the Steam tile they join (D-12)."
  - "Where a locale's grammar would inflect the store name (cs, hu, lt, pl), the string is phrased to keep {{store}} in a case-neutral slot (for example cs 'Platnost prihlaseni ({{store}}) vypresla', pl 'Brak polaczenia z {{store}}') rather than guessing a case suffix that would be wrong for GOG vs Epic Games."
  - "Did not regenerate meta/i18nCatalogPresenceBaseline.json: the 720 recorded pairs are pre-existing known gaps, and none of the eight new keys appears in it."

requirements-completed: []

coverage:
  - id: D1
    description: "All 49 catalogues carry the eight keys as non-empty strings; {{store}} exactly once in the three interpolated keys, no other variable"
    requirement: "R9"
    verification:
      - kind: unit
        ref: "Task 2 node assertion: OK 49 catalogues x 8 keys, interpolation exact, 48 manifests stamped"
        status: pass
      - kind: other
        ref: "validateTranslation over 240 candidate values: 0 problems; sabotage control (dropped {{store}}, stray {{count}}) fails as intended"
        status: pass
    human_judgment: false
  - id: D2
    description: "en equals the copy contract byte-for-byte (U+2014 in the three tile strings)"
    requirement: "R9"
    verification:
      - kind: unit
        ref: "Task 1 node assertion: OK 3 locales x 8 keys, en exact, 2 manifests stamped"
        status: pass
      - kind: other
        ref: "pnpm i18n && git diff --quiet -- public/locales/en/gamelib.json (I18N NO-OP CONFIRMED)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Presence lint reports zero hard failures and the presence-baseline drift tests are green"
    requirement: "R9"
    verification:
      - kind: unit
        ref: "npx jest --selectProjects Meta --testPathPattern machineFillGamelib|lintTranslations (185 passed)"
        status: pass
      - kind: other
        ref: "lint-translations[gamelib]: 720 findings, 0 hard failures (720 are the pre-existing baseline; see Deviations)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Translation quality and tone of the 46 in-session locale fills (informational notConnected, same voice as the Steam surface)"
    requirement: "R9"
    verification: []
    human_judgment: true
    rationale: "No test can judge idiom or tone in 46 languages; authored in-session without native review, same as 48-01. Weblate or a native speaker is the corrective path."
  - id: D5
    description: "Manifests provenance and churn guard"
    verification:
      - kind: other
        ref: "model/filledAt/locale digest before vs after: 0 mismatches of 48; pnpm i18n-churn-guard exit 0; pnpm planning-gates 12/12"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-10-09
status: complete
---

# Phase 49 Plan 02: Sign-in Notice Catalogue Keys Summary

**Eight net-new `gamelib:` keys (`library.signIn.*` plus `login.{amazon,epic,gog}Reconnect`) filled across all 49 catalogues and stamped in all 48 provenance manifests, with `en` pinned to the copy contract and `pnpm i18n` proven a no-op.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-10-09
- **Tasks:** 3/3 (Task 3 is verification only and produced no file change)
- **Files modified:** 97 (49 `gamelib.json` + 48 `gamelib.mt.json`; 5 in the first commit, 92 in the second)

## Accomplishments

- `en/gamelib.json` carries the locked strings: `Dismiss the {{store}} sign-in notice`, `Your {{store}} sign-in expired`, `{{store}} is not connected`, `Reconnect`, `Sign in`, and `Sign-in expired — Reconnect` (U+2014) for each of the three tile keys. `signIn` sits between `noStorePage` and `steamSync`; the three tile keys sit in locale-aware order inside `login`.
- 48 other catalogues authored in session (de and ja as the Task 1 tracer, 46 more in Task 2). Every interpolated value contains `{{store}}` exactly once and no other variable; `notConnected` is neutral status in every locale (spot-checked de "ist nicht verbunden", fr "n'est pas connecté", es "no está conectado", ja "接続されていません", ru "не подключён" -- none uses an error or failure word).
- 48 manifests gained eight sorted `keys[]` entries each; `model`, `filledAt` and `locale` digests are identical before and after across all 48.
- Every candidate value ran through the real `validateTranslation` from `meta/machineFillGamelib.ts` in a scratch jest test (deleted before commit).

  Real values: `VALIDATE REAL: 240 candidate values, 0 problems []`

  Sabotage control: `VALIDATE SABOTAGE: dropped=["translation drops placeholder {{store}} present in the source"] extra=["translation introduces placeholder {{count}} not present in the source"]`
- `pnpm i18n` left `en/gamelib.json` byte-identical and touched nothing else; `pnpm i18n-churn-guard` exits 0 (clean); `pnpm planning-gates` 12/12.

## Task Commits

1. **Task 1: en + de + ja and their manifests** - `f052debe3` (feat)
2. **Task 2: remaining 46 locales and manifests** - `98550cd14` (feat)
3. **Task 3: i18n no-op / churn guard / planning-gates proof** - no commit (verification only, no file changed)

## Files Created/Modified

- `public/locales/en/gamelib.json` - the eight keys, copy contract verbatim
- `public/locales/*/gamelib.json` (48 non-en) - translated values; diff is 10 pure added lines per file
- `public/locales/*/gamelib.mt.json` (48 non-en) - eight sorted `keys[]` entries each; 8 pure added lines per file

## Decisions Made

See `key-decisions` above. The `login.*Reconnect` tiles reuse each locale's `steamReconnect` verbatim; case-inflecting locales get a case-neutral `{{store}}` slot; the presence baseline was left untouched.

## Deviations from Plan

### Plan measurement errors (no code impact)

**1. [Rule 1 - Plan inaccuracy] Presence baseline is not at `totalPairs: 0`**
- **Found during:** Task 2 verification
- **Issue:** The plan states `pnpm lint-translations:gamelib` must report `0 findings, 0 hard failures` and that `meta/i18nCatalogPresenceBaseline.json` records `totalPairs: 0`. The committed baseline (`a1ce5c6d5`, generated 2026-10-05) records `totalPairs: 720` pre-existing known-missing pairs, so the lint prints `720 findings, 0 hard failures`.
- **Fix:** None needed in code. The intent of the criterion (no hard failures, no drift) holds: `0 hard failures`, the drift suites `lintTranslations`/`machineFillGamelib` pass (185 tests), and none of the eight new keys appears among the 720 recorded pairs. The baseline file is unmodified (`git status --porcelain` empty) and was deliberately not regenerated.
- **Files modified:** none

**2. [Rule 3 - Blocker, environment] `pnpm lint-translations:gamelib` fails on Windows**
- **Found during:** Task 2 verification
- **Issue:** the script is `export LINT_TRANSLATIONS_NAMESPACES=gamelib && node ...`; pnpm runs it through `cmd.exe`, which has no `export` ("'export' is not recognized"). Pre-existing, unrelated to this plan (CI is ubuntu-only).
- **Fix:** ran the identical command with the variable set in Git Bash: `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts` -> `720 findings, 0 hard failures`.
- **Files modified:** none

**3. [Sequencing] Task 1's second `<automated>` check cannot pass at the Task 1 commit**
- **Found during:** Task 1
- **Issue:** `lintTranslations.test.ts` has live-tree presence tests; with `en` carrying the keys and 46 locales not yet filled, 2 tests fail (368 = 46 x 8 unrecorded pairs). This is the plan's own task split, not a defect.
- **Fix:** committed Task 1 with the first check green; the same suites pass 185/185 after Task 2 (recorded in the Task 1 commit body).

**Total deviations:** 3 documented (1 plan inaccuracy, 1 Windows environment issue, 1 sequencing note). **Impact:** none on the delivered keys.

### Minor accounting note

The plan lists `files_modified` as 49 + 48 = 97 locale files; Task 2's commit touched 92 files (46 catalogues + 46 manifests) and Task 1's 5, summing to 97.

## Issues Encountered

- A first scratch script was truncated by the Bash heredoc (the multi-byte data file was cut mid-line); rewritten with the Write tool. No repo file was affected.

## Known Stubs

None. No stub patterns in the files written (JSON catalogues only).

## Threat Flags

None. No network, auth or transport surface touched. T-49-03 (empty/raw-key text) mitigated by the 49 x 8 non-empty and interpolation assertion plus a green presence lint; T-49-04 (manifest provenance) mitigated by stamping all eight keys in 48 manifests with `model`/`filledAt` untouched. Known inaccuracy: each manifest carries one global `filledAt`, so it now also dates these eight keys (stated in the commit bodies).

## Next Phase Readiness

Ready for 49-03 and the source plans: the literal `tGamelib('gamelib:library.signIn.*' / 'gamelib:login.*Reconnect', <default>, ...)` call sites in 49-09 and 49-10 can use the copy-contract strings as defaults without making `pnpm i18n` non-idempotent. R9 is shared with 49-09, so it is not marked complete here.

## Self-Check: PASSED

- All 49 `gamelib.json` and 48 `gamelib.mt.json` carry the eight keys (node assertion: `OK 49 catalogues x 8 keys, interpolation exact, 48 manifests stamped`).
- Commits `f052debe3` and `98550cd14` exist on the branch.
