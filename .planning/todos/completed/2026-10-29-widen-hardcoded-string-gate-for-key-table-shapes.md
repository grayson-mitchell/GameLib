---
created: 2026-10-29T00:00:00.000Z
title: Widen the hardcoded-string gate for key-table shapes, then promote six files into i18nGateScope.json
area: i18n
severity: minor
platform: any
ready: code
found_by: "Plan 56-30 A-17 closure (audit of 25 newly fork-touched files)"
files:
  - meta/hardcodedStringGate.ts
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/__tests__/hardcodedStringGate.test.ts
---

## Problem

The A-17 closure for plan 56-30 audited 25 newly fork-touched frontend files with
`scanScope({ extraFiles })`. 19 had zero violations and were promoted into
`meta/i18nGateScope.json`. Six have 48 violations between them, and every one is a
false positive (no untranslated user-facing text). They are declared as TEMPORARY
debt in `DECLARED_UNSCANNED_DEBT` in `meta/__tests__/genI18nGateScope.test.ts`.

## The five shapes

1. Bare dotted i18n key literals as map values / `statusKey:` properties (no default text).
   - `src/frontend/components/UI/WelcomeModal/welcomeState.ts:52,59,66` (`statusKey: 'welcome.appManagement.status.granted'`)
   - `src/frontend/screens/Game/GamePage/components/bridgeRouteDisplay.ts:42-58` (`REASON_KEYS`, `KNOWN_BAD_KEYS`, 14 hits)
   - `src/frontend/screens/Library/components/InstallModal/steamBridgeRouteLine.ts:41-65` (same tables, 13 hits)
2. Key plus English default pairs in a shape the D-14 tuple / `{key, defaultText}` exemptions do not recognise.
   - `src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts:62+` (`gamelib:installFlows.crossoverRating.*`, 12 hits)
3. Space-separated CSS class strings returned from a function.
   - `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/buttonClassName.ts:10,12,14`
4. A diagnostic log message passed to an injected logger callback (not `console.*` / `window.api.log*`).
   - `src/frontend/helpers/resolveBootLanguage.ts:38,40,41`
5. (Shared by 1 and 2) the exemption for these must stay shape-based and narrow, like `DOTTED_KEY_RE`.

## Requirements

- Widen `meta/hardcodedStringGate.ts` as plans 41-02 and 41-04 did: each new exemption
  gets a paired NEGATIVE fixture in `meta/__tests__/hardcodedStringGate.test.ts` proving the
  shape alone does not exempt a real English string.
- Do not add to ignore lists or the allowlist to get green.
- Then promote the six files into `meta/i18nGateScope.json` (sorted position, hand-edited)
  and remove their temporary entries from `DECLARED_UNSCANNED_DEBT`; update the scope
  counts pinned in `genI18nGateScope.test.ts` (A0/A2).

## Resolution

Fix commit: see `git log --grep=quick-261029-oog` (gate widening, then refactors/scope promotion).

Root cause and fix per shape:

1. Bare key paths (welcomeState, bridgeRouteDisplay, steamBridgeRouteLine): camelCase segments defeat the
   all-lowercase `DOMAIN_RE` discard. Fix: new counted exemption `isBareI18nKeyPathLiteral` (3+ lowerCamel
   segments, optional `ns:`, no whitespace; `key:` slot excluded so the pairing-completeness fixture holds).
2. crossoverInstallRisk.ts: correction, NOT a tuple shape. These are direct `tGamelib(key, default)` calls missed
   because the parameter was typed with the local alias `TGamelibLike`, which `T_FUNC_TYPE_RE` does not match.
   Fix: renamed the local type to `TFunc` (source-only; no gate widening).
3. buttonClassName.ts: new discard `isClassNameFunctionReturn` (returned class list, `*ClassName` function,
   hyphen/underscore token required).
4. resolveBootLanguage.ts: `logFallback` retyped `typeof window.api.logError`; new resolution-based discard
   `isInjectedDiagnosticLoggerArgument` (declared type must be an exempt diagnostic channel; never name-based).

Each exemption has paired negative fixtures. Allowlist untouched. Six files promoted into
`meta/i18nGateScope.json` (241 files), removed from `DECLARED_UNSCANNED_DEBT`, A0/A2 re-pinned.

Status: code fix, no live gate needed.
