---
phase: quick-260803-mcu
plan: 01
subsystem: frontend/login
tags: [epic-auth, clipboard, ux, tdd]
dependency-graph:
  requires: []
  provides: [parseEpicAuthCode]
  affects: [SIDLogin]
tech-stack:
  added: []
  patterns: ["pure helper + colocated jest it.each test (steamKeyValidation pattern)"]
key-files:
  created:
    - src/frontend/helpers/epicAuthCode.ts
    - src/frontend/helpers/__tests__/epicAuthCode.test.ts
  modified:
    - src/frontend/screens/Login/components/SIDLogin/index.tsx
decisions:
  - "Reused the it.each table-test convention from steamKeyValidation.test.ts for consistency"
  - "Paste button reuses the same clobber-avoidance guard as auto pre-fill (only fills when field is empty or holds the prior auto-filled value) rather than force-overwriting on manual click"
metrics:
  duration: "~20 min"
  completed: "2026-08-03"
---

# Phase quick-260803-mcu Plan 01: Epic SIDLogin smart clipboard paste + auto pre-fill Summary

Pure `parseEpicAuthCode` parser (bare code or Epic JSON blob -> code | null) plus a reworked SIDLogin component that auto-reads the clipboard on mount/focus to pre-fill the input, confirm-to-login only, replacing the hidden middle-click paste affordance.

## What Was Built

**Task 1 — `parseEpicAuthCode` parser (TDD RED/GREEN):**
- `src/frontend/helpers/epicAuthCode.ts`: pure function, no React/window deps. Trims input; if it starts with `{`, `JSON.parse`s inside try/catch (malformed JSON returns `null`, never throws) and extracts a non-empty `authorizationCode` string; otherwise treats input as a bare code and requires length >= 20 matching `/^[A-Za-z0-9_-]+$/`. File header documents this is a UX/paste-extraction helper, not a security validator — Epic's login endpoint remains authoritative.
- `src/frontend/helpers/__tests__/epicAuthCode.test.ts`: `it.each` table covering bare code, whitespace-wrapped bare code, full JSON blob, whitespace-wrapped JSON blob, missing/empty/null `authorizationCode`, malformed JSON, empty/whitespace-only string, and a too-short implausible string. 12 tests, all passing.

**Task 2 — SIDLogin wiring:**
- `src/frontend/screens/Login/components/SIDLogin/index.tsx`:
  - Login button `onClick` now runs `parseEpicAuthCode(input)`; a valid code calls `handleLogin(code)`, otherwise sets the existing error state (2.5s auto-clear) instead of forwarding junk to `epic.login`.
  - Disabled guard changed from `input.length < 30` to `loading || error || parseEpicAuthCode(input) === null`, so a pasted JSON blob (long raw length, but a meaningful extracted code) correctly enables the button.
  - New `tryPrefillFromClipboard` callback reads `window.api.clipboardReadText()`, parses it, and — only if a code is found — sets the input via a functional `setInput` update guarded by `lastAutoFilledRef`: it only overwrites when the field is empty or still equals the last value this helper auto-filled, so user typing is never clobbered.
  - Wired to a `useEffect` that runs on mount and adds/removes a `window` `focus` listener, so returning from the system browser re-checks the clipboard.
  - Removed the `onAuxClick` handler and its trailing comment entirely; replaced with a visible "Paste" button (new `button.paste` i18n key, falls back to `'Paste'`) that calls the same `tryPrefillFromClipboard` callback.
  - No `navigator.clipboard` usage anywhere — clipboard reads go exclusively through `window.api.clipboardReadText()` per the Tauri gotcha (WKWebView silently no-ops `navigator.clipboard`).
  - `handleLogin`, loading/error state shape, `getButtonLabel`, `getUserInfo`/`backdropClick` flow all left intact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `it.each` tuple type error under `tsc --noEmit`**
- **Found during:** Task 2 typecheck verification (ran project-wide `tsc --noEmit` as part of verifying no regressions).
- **Issue:** The test table's rows had a mix of `string` and `null` in the "expected" column; TypeScript inferred a discriminated union of literal tuple types (`[string, string, string] | [string, null, string]`) that the `it.each` callback signature `(input: string, expected: string | null) => void` didn't structurally satisfy.
- **Fix:** Added an explicit `it.each<[string, string | null, string]>([...])` type argument so TS infers a single homogeneous tuple type across all rows.
- **Files modified:** `src/frontend/helpers/__tests__/epicAuthCode.test.ts`
- **Commit:** `b56566738`

None of the plan's other behavior was changed — this was a type-annotation-only fix with zero effect on test semantics (all 12 cases still pass).

### Auth Gates

None encountered.

## Known Stubs

None. The parser and clipboard wiring are fully functional; no hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None. No new network endpoints, auth paths beyond the existing `epic.login` boundary, or schema changes were introduced. The clipboard-read surface (T-mcu-03 in the plan's threat model, disposition `accept`) was implemented exactly as specified: local, in-process, discarded silently if not a plausible code, no logging of clipboard content.

## Verification Results

```
$ pnpm jest src/frontend/helpers/__tests__/epicAuthCode.test.ts
PASS Frontend src/frontend/helpers/__tests__/epicAuthCode.test.ts
  parseEpicAuthCode
    ✓ 11 table cases + 1 "does not throw" case
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total

$ pnpm tsc --noEmit -p tsconfig.json
(no output — zero errors project-wide)

$ grep -n onAuxClick src/frontend/screens/Login/components/SIDLogin/index.tsx
(no matches)

$ grep -n "navigator.clipboard" src/frontend/screens/Login/components/SIDLogin/index.tsx
(no matches)

$ git status --short src/frontend/screens/Login/index.tsx src/frontend/screens/Login/components/Runner/index.tsx
 M src/frontend/screens/Login/components/Runner/index.tsx
 M src/frontend/screens/Login/index.tsx
```
Both `Login/index.tsx` and `Runner/index.tsx` show only their pre-existing modifications from the just-completed debug session (Epic→SIDLogin routing pivot) — untouched by this plan, as required by scope boundaries.

## Commits

- `59fd7b4c6` test(quick-260803-mcu): add failing test for epic auth-code parser
- `c04b759c3` feat(quick-260803-mcu): implement epic auth-code parser
- `b56566738` fix(quick-260803-mcu): annotate it.each tuple type in epicAuthCode test
- `fd44c58d0` feat(quick-260803-mcu): smart clipboard pre-fill + parser-backed submit in SIDLogin

## Self-Check: PASSED

All 3 created/modified files confirmed present on disk. All 4 commit hashes confirmed present in `git log --oneline --all`.
