---
phase: 21-steam-native-install
plan: 14
subsystem: steam-native-install
tags: [security, vdf, sanitization, gap-closure, steam]

# Dependency graph
requires:
  - phase: 21-02
    provides: buildAppManifestText / .acf VDF writer
  - phase: 21-09
    provides: resolveSteamInstallTarget / sanitizeInstalldir
provides:
  - VDF-escaped name/installdir interpolation in buildAppManifestText (WR-01 closed)
  - Whitelist-hardened sanitizeInstalldir rejecting quotes/control-chars/drive-relative names (WR-04 closed)
affects: [21-VERIFICATION, 21-REVIEW, future manifest.ts or installLocation.ts changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vdfEscape(s): escape \\ before \", neutralize \\r/\\n/\\t with a space, applied at the interpolation site not the data model"
    - "Positive whitelist over growing denylist for untrusted filesystem-segment strings (sanitizeInstalldir)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot/manifest.ts
    - src/backend/storeManagers/steam/__tests__/manifest.test.ts
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts

key-decisions:
  - "vdfEscape escapes backslash before quote (order matters, else a quote's escaping backslash gets double-escaped) and neutralizes \\r/\\n/\\t to a space rather than escaping them, since a raw line break would break VDF's line-oriented structure regardless of escaping"
  - "sanitizeInstalldir rewritten as a positive whitelist ([A-Za-z0-9 ._-]+, no leading/trailing dot) instead of an expanding denylist — quotes, colons, and control chars are excluded by construction, not enumerated"

patterns-established:
  - "Escape at the interpolation site (buildAppManifestText), not by mutating the AppManifestParams data model — keeps PICS-sourced params.name/installdir as the raw upstream value for any other consumer"

requirements-completed: [SNI-02, SNI-05]

# Metrics
duration: 20min
completed: 2026-07-16
---

# Phase 21 Plan 14: VDF-Escape + Installdir Whitelist Hardening (WR-01/WR-04 Gap Closure) Summary

**Closed the two manifest-injection/weak-sanitization verifier warnings (WR-01, WR-04) by VDF-escaping the untrusted PICS `name`/`installdir` strings before they reach `.acf` text, and replacing `sanitizeInstalldir`'s separator-only denylist with a positive character whitelist.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `buildAppManifestText` now VDF-escapes `name`/`installdir` via a new `vdfEscape()` helper (backslash → `\\`, quote → `\"`, control chars → space) before interpolation — a crafted name containing a `StateFlags` injection payload can no longer produce a second parseable `StateFlags` key in the written `.acf`.
- `sanitizeInstalldir` now rejects quotes, colons (Windows drive-relative names like `C:foo`), and ASCII control characters via a positive whitelist (`[A-Za-z0-9 ._-]+`, no leading/trailing dot), replacing the prior separator/`..`-only denylist.
- Well-formed titles (`Half-Life 2`) are provably unaffected on both surfaces — round-trip and passthrough regression tests added.

## Task Commits

Each task was committed atomically:

1. **Task 1: VDF-escape name and installdir in buildAppManifestText (WR-01)** - `08b06e5a` (fix)
2. **Task 2: Harden sanitizeInstalldir against quotes/control-chars/drive-relative names (WR-04)** - `60e2032d` (fix)

_Note: both tasks were TDD-flavored (tests extended alongside the implementation change in the same commit, following manifest.test.ts's existing black-box convention) rather than separate RED/GREEN commits — consistent with how prior plans in this phase (21-02, 21-13) structured their commits._

## Files Created/Modified
- `src/backend/storeManagers/steam/depot/manifest.ts` - Added `vdfEscape()` helper; applied to the `name`/`installdir` VDF interpolations; updated module header comment
- `src/backend/storeManagers/steam/__tests__/manifest.test.ts` - Added injection, neutralization, round-trip, and structural (`vdfEscape(` call-site count) regression tests
- `src/backend/storeManagers/steam/installLocation.ts` - Replaced `sanitizeInstalldir`'s denylist with a positive whitelist (`SAFE_INSTALLDIR` + leading/trailing-dot guard)
- `src/backend/storeManagers/steam/__tests__/installLocation.test.ts` - Added quote/control-char/colon-rejection and well-formed-passthrough regression tests

## Decisions Made
- Escaping applied at the interpolation site inside `buildAppManifestText`, not by mutating `AppManifestParams` upstream — keeps the raw PICS value available to any other future consumer of the params object.
- Backslash escaped before quote (ordering matters) to avoid double-escaping a quote's own escape character.
- `\r`/`\n`/`\t` are neutralized to a single space rather than backslash-escaped — VDF is line-oriented, so a literal line break inside a quoted value would still break structure even if "escaped" textually; replacing it is the only safe option.
- `sanitizeInstalldir` moved to a positive whitelist rather than adding quote/colon/control-char checks to the existing denylist, per the plan's explicit preference — closes the class of issue (any non-whitelisted character) rather than the three specific instances called out.

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` and `<acceptance_criteria>` blocks without requiring architectural changes or additional fixes.

## Verification

- `npx tsc --noEmit` — exits 0 (clean)
- `npx jest src/backend/storeManagers/steam/__tests__/manifest.test.ts` — 13/13 pass (9 pre-existing + 4 new WR-01 cases)
- `npx jest src/backend/storeManagers/steam/__tests__/installLocation.test.ts` — 13/13 pass (9 pre-existing + 4 new WR-04 cases)
- `npx jest src/backend/storeManagers/steam` (full suite) — 445/445 pass, 11/11 suites

## Threat Model Disposition

All three threats in this plan's `<threat_model>` are mitigated as designed:
- T-21-14-01 (Tampering, buildAppManifestText interpolation) — `vdfEscape()` applied to both string fields
- T-21-14-02 (Spoofing, injected StateFlags key) — regression test proves exactly one `StateFlags` key (value `1026`) survives an injection attempt
- T-21-14-03 (Tampering, sanitizeInstalldir) — whitelist rejects quotes/colons/control chars before the value becomes an install-root path segment

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/depot/manifest.ts (vdfEscape present)
- FOUND: src/backend/storeManagers/steam/installLocation.ts (SAFE_INSTALLDIR whitelist present)
- FOUND commit 08b06e5a
- FOUND commit 60e2032d
