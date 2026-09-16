---
created: 2026-09-15T00:00:00.000Z
title: '816 unlocalised `humbleKeys.*` keys ship English in EVERY non-English locale — Phase 43 added the strings without filling locales or regenerating the baseline'
area: i18n
severity: major
platform: any
ready: code
status: OPEN
found_by: 'quick-260914-vbw, 2026-09-15 — PR #5 was the FIRST pull_request ever opened against fix/steam-native-install-stability, which is the only event that runs the ci/lint workflows. The red had been invisible for the whole of Phase 43.'
files:
  - meta/__tests__/lintTranslations.test.ts
  - public/locales
---

## Problem

`meta/__tests__/lintTranslations.test.ts` fails two tests against the committed tree:

- `lintTranslations (REQ-41-02) › live tree › zero hard failures for the gamelib namespace` —
  **816** findings
- `comparePresenceBaseline (REQ-41-01) › R13: zero drift between the live tree and the committed
  baseline` — **816** findings

Every finding is a `humbleKeys.*` key, across every locale. The message states the remedy:

```
ar.gamelib.humbleKeys.claimOnHumble: a new key is not localised and was not recorded
  — fill it or regenerate the baseline
```

Sampled keys: `claimOnHumble`, `claimOnStore`, `clearFilters`, `columnGame`, `columnKey`,
`columnType`, `emptyBody`, `emptyHeading`, `filteredEmptyBody`, `filteredEmptyHeading`, …

These are **Phase 43's unified Humble Keys list** strings (`feat(43-07)`, `feat(43-08)`). They were
added to the English namespace without the locale fill or baseline regeneration this project's
standing localisation requirement demands.

## Why it matters

1. **It is a shipped user-facing gap, not a test-only red.** Every non-English user sees English
   across the entire Humble Keys screen — column headers, empty states, filter controls, and the
   claim actions. This is the whole screen, not an edge case.
2. **It went undetected for the whole of Phase 43 because nothing could see it.** The `ci` and
   `lint` workflows fire on `pull_request` only. `fix/steam-native-install-stability` has **no
   `ci`/`lint` runs at all** — `gh run list --branch fix/steam-native-install-stability` returns
   only stale `CLA Assistant` failures from 2026-09-02. No PR was ever opened for that branch, so
   the gate that exists for exactly this defect never ran. It surfaced only because an unrelated
   macOS-entitlements PR happened to be the first one opened.
3. **816 is a count of findings, not of keys.** Two tests each report 816, and the same key recurs
   per locale — establish the real key count before sizing the work.

## Direction

1. Count the distinct keys and locales: the 816 is `keys × locales`, so the actual English-side
   key set is far smaller. Size the fill from that, not from 816.
2. Fill the locale entries, or regenerate the presence baseline — the failure message offers both
   and they are **not** equivalent. Regenerating the baseline records the keys as known-missing and
   turns the gate green **while the user-facing gap remains**. Filling is the fix; regenerating is
   only appropriate for keys genuinely not intended for translation.
3. Beware the recorded traps around this gate: new strings belong in `gamelib.json` rather than
   `translation.json`; a baseline of 0 still requires filling every locale; and removing a key has
   its own asymmetric breakage. Check those before bulk-editing.

## Verification

- `npx jest --testPathPattern lintTranslations` — no project filter needed; the suite is in the
  `Meta` project, so a `--selectProjects Backend` run **silently matches nothing and exits 0**.
- Both tests must reach 0 findings, not just the first.
- Confirm on a real render that a non-English locale shows translated Humble Keys copy — the gate
  measures presence, not correctness, so a green gate does not prove the strings are right.

## Related

- Pre-existing; not introduced by quick-260914-vbw. That task's diff contains **zero** locale files
  (8 files: 6 markdown, 1 plist, 1 `src-tauri` config key).
- `2026-09-15-darwin-asserting-suites-fail-on-the-linux-ci-runner.md` — the other CI red found in
  the same run, different in kind.
- The `lint` job is also red on `ts-prune` dead-code findings across frontend exports; that is a
  separate, already-known lint-ratchet condition.
