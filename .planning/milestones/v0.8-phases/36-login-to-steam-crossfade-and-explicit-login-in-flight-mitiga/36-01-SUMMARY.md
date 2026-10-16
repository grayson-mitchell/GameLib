---
phase: 36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga
plan: 01
subsystem: frontend/Login
tags: [login, steam, overlay, inert, react-18, crossfade, mui-dialog]
dependency-graph:
  requires: [REQ-36-01, REQ-36-02, REQ-36-03, REQ-36-04]
  provides:
    - Steam sign-in co-mounted as an overlay on /login (no sibling route)
    - explicit loginInFlight guard on all six Login tiles
    - CSS crossfade between .loginContentWrapper and the Steam Dialog
  affects:
    - src/frontend/screens/Login/index.tsx
    - src/frontend/screens/Login/index.scss
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/frontend/App.tsx
tech-stack:
  added:
    - src/frontend/typedefs/react-inert.d.ts (ambient TS augmentation, deviation)
  patterns:
    - deferred-unmount overlay lifecycle (steamOverlayMounted / steamFlowOpen / steamMountKey)
    - React-18 string-form inert (`inert={cond ? '' : undefined}`)
    - source-text jest gates via stripSourceComments (testEnvironment: node)
    - checksum-verified mutation/revert falsifiability proof
key-files:
  created:
    - src/frontend/typedefs/react-inert.d.ts
    - src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
    - .planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/deferred-items.md
  modified:
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/frontend/screens/Login/index.tsx
    - src/frontend/screens/Login/index.scss
    - src/frontend/App.tsx
    - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
    - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts
decisions:
  - "tabIndex lock stays retired -- disabled prop is the primary JS layer since Runner tiles are bare untabbable divs (new focusability-premise gate proves it)"
  - "no aria-hidden -- .loginContentWrapper wraps two genuinely focusable controls (LanguageSelector, goToLibrary); aria-hidden over focusable descendants is an ARIA violation"
  - "React-18 string-form inert only -- boolean inert={true} is React-19-only and this project pins react@^18.3.1"
  - "STEAM_DIALOG_EXIT_MS=500 mirrors Dialog.tsx's own transitionDuration -- unmount deferred, not immediate, so the Dialog's own exit animation can finish"
metrics:
  duration: ~2h (across two execution sessions, includes one context-compaction resume)
  completed: 2026-08-20
---

# Phase 36 Plan 01: Login-to-Steam crossfade and explicit login-in-flight mitigation Summary

Converts Steam sign-in from a sibling route (`loginweb/steam`) into a co-mounted `/login` overlay, replaces the incidental route-unmount reachability mitigation with an explicit `loginInFlight` guard on all six tiles, and adds a CSS crossfade between the login panel and the Steam Dialog -- landed as one atomic 5-task plan per its own stated rationale (splitting the route removal from the guard install would reopen a security gap).

## What Was Built

**Task 1** (`a9e055eb0`) -- `SteamLogin/index.tsx` converted from a route-mounted component (`useNavigate`) to a `dismiss`-callback overlay. All 4 post-login-event dismissal call sites (Class B) repointed from `navigate('/login')` to `closeWindow()`; the 3 Class C consumer sites (the "Return to Login" click, Dialog's own `onClose`, `DialogHeader`'s `onClose`) left untouched -- the `DialogHeader` one stays intentionally inert/dead code, since `DialogHeader.tsx:9` destructures only `children`. 4 prose comments (plan estimated 3; actual count was 4) rewritten from "navigate"/"navigation" language to "dismiss the overlay" language.

**Task 2** (`a120cbe82`) -- `Login/index.tsx` + `App.tsx`, landed together as required (never split route-removal from guard-install). Adds `steamOverlayMounted`/`steamFlowOpen`/`steamMountKey` state and a deferred-unmount timer; `openSteamOverlay()`/`dismissSteamOverlay()` lifecycle functions; `loginInFlight = steamFlowOpen` bound above `let oldMac = false`; all six tiles now carry `disabled={oldMac || loginInFlight}`; Steam tile wired `primaryLoginAction={openSteamOverlay}`; `.loginContentWrapper` carries `inert={loginInFlight ? '' : undefined}` (React-18 string form only); `<SteamLogin>` renders as a sibling of `.loginContentWrapper`, not nested (MUI's Dialog portals to `document.body`, so nesting inside an `inert` ancestor would not actually inert the portaled dialog). `App.tsx`'s `loginweb/steam` route deleted; `loginweb/:runner` untouched. Expected/planned consequence, confirmed by real test run: `loginInFlightUiReachability.test.tsx` went RED here (1 failed, 4 passed) -- see "Planned RED state" below.

**Task 3** (`d1be788a4`) -- `Login/index.scss`: `.loginContentWrapper` gets a `transition: transform 500ms cubic-bezier(0,0,0.2,1), opacity 500ms cubic-bezier(0,0,0.2,1)` (plain, non-`!important`, so the app-wide `body:has(.disableAnimations)` override always wins); new `.loginPage.steamFlowOpen .loginContentWrapper` rule sets `translateY(-100%)`, `opacity: 0`, `pointer-events: none`. `.loginBackground` untouched (F-10 regression risk, confirmed via `git diff` -- pure addition, no other lines changed).

**Task 4** (`74733945a`) -- Part A: `steamLoginWindowChrome.test.ts` updated -- the stale `navigate('/login')` closeWindow assertion replaced with `dismiss()`; added `dismiss`-prop-destructure PRESENCE, `navigate`/`useNavigate` ABSENCE, and a census-shaped assertion (1 definition + 3 Class-C consumers = the verified 8-site dismissal census). Part B: `loginInFlightUiReachability.test.tsx` fully rewritten -- inverted the `disabled={oldMac}`-only pin to PRESENCE-check the uniform `disabled={oldMac || loginInFlight}`; kept the oldMac-derivation-independence and single-runnerGroup pins (rewritten rationale); replaced the route assertion to add `loginweb/steam` absence; replaced the handleLogin-sequence assertion to pin the `disabled` guard's precedence over `primaryLoginAction`; added a new Runner focusability-premise assertion (zero `tabIndex`/`<button`/`<a `, load-bearing justification for `inert` alone being sufficient); added the paired PRESENCE/ABSENCE assertion for `inert` + scss `pointer-events: none` vs. absence of `tabIndex`/`aria-hidden`.

**Task 5** (`2eb76e6b8`) -- new `loginCrossfade.test.ts`, 6 assertions: FILLED-SPECIMEN GUARD; named-property PRESENCE (`transform`/`opacity`/`pointer-events` by name, not landmark selector); transition-property PRESENCE (non-`!important`, defers to `disableAnimations`); three-way duration agreement via extracted-value comparison across `Dialog.tsx`/`Login/index.tsx`/`index.scss`; ABSENCE of `startViewTransition`/`prefers-reduced-motion`; F-10 regression guard on `.loginBackground`.

## Planned RED state (by design, not a defect)

After Task 2 landed and before Task 4 rewrote the file, `loginInFlightUiReachability.test.tsx` was run directly:

```
Tests:       1 failed, 4 passed, 5 total
```

The single failure was exactly the expected one:
```
Expected: "disabled={oldMac}"
Received: "disabled={oldMac || loginInFlight}"
  at loginInFlightUiReachability.test.tsx:125:36
```
This is the plan's own stated mid-plan RED state -- the test still pinned the pre-36-01 mechanism until Task 4 rewrote it. It was not "fixed early," reordered around, or treated as a failure; Task 4 replaced the assertion with the inverted PRESENCE check.

## Falsifiability Record

Every assertion touched or added across Tasks 4 and 5 was mutated, run, observed RED, reverted, and restoration checksum-verified (SHA-256 of the pristine file, compared before mutation and after revert) -- per the executing task's explicit instruction to use a checksum rather than `git diff --quiet` (documented false-negative trap in this repo). All reverts confirmed matching; `git status --short` also confirmed clean after each mutation cycle.

### Task 4 Part A (`steamLoginWindowChrome.test.ts`), file: `SteamLogin/index.tsx`

1. **closeWindow definition assertion** -- mutated `const closeWindow = () => dismiss()` to a no-op stub. RED: `expect(source).toContain('const closeWindow = () => dismiss()')` failed. Reverted, checksum match.
2. **dismiss-prop-destructure assertion** -- renamed the destructured `dismiss` to `dismiss: onDismiss`. RED: signature regex failed to match. Reverted, checksum match.
3. **navigate/useNavigate absence assertion** -- reintroduced `navigate('/login')` inside `closeWindow`. RED: `navigate(` count moved from 0 to 1. Reverted, checksum match.
4. **census assertion** -- removed `DialogHeader`'s `onClose={closeWindow}` (one Class C consumer). RED: `consumerSites` moved from 3 to 2. Reverted, checksum match.

### Task 4 Part B (`loginInFlightUiReachability.test.tsx`)

1. **handleLogin sequence** (`Runner/index.tsx`) -- removed the `return` after `props.primaryLoginAction()`. RED: sequence regex failed to match. Reverted, checksum match.
2. **uniform disabled guard** (`Login/index.tsx`) -- reverted the Steam tile's `disabled=` back to `disabled={oldMac}` alone. RED: uniqueness check (`Set.size`) moved from 1 to 2. Reverted, checksum match.
3. **oldMac-derivation independence** (`Login/index.tsx`) -- folded `loginInFlight` into `oldMac`'s own derivation. RED: ABSENCE regex matched `loginInFlight`. Reverted, checksum match.
4. **single-runnerGroup** (`Login/index.tsx`) -- duplicated the `runnerGroup` div wrapper. RED: count moved from 1 to 2. Reverted, checksum match.
5. **loginweb/steam absence + sibling ordering** (`App.tsx`) -- reintroduced the `loginweb/steam` route object. RED: absence count moved from 0 to 1. Reverted, checksum match.
6. **Runner focusability premise** (`Runner/index.tsx`) -- added `tabIndex={0}` to the primary tile's login div. RED: `tabIndex` count moved from 0 to 1. Reverted, checksum match (also confirmed via `git status --short` showing no diff).
7. **inert/pointer-events/tabIndex/aria-hidden paired assertion**, three separate mutations against the same assertion:
   - 7a: `Login/index.tsx` -- changed `inert={loginInFlight ? '' : undefined}` to boolean form `inert={loginInFlight}`. RED: substring match failed. Reverted, checksum match.
   - 7b: `Login/index.scss` -- removed `pointer-events: none;` from the `.loginPage.steamFlowOpen .loginContentWrapper` rule. RED: structural regex failed. Reverted, checksum match.
   - 7c: `Login/index.tsx` -- added `aria-hidden={loginInFlight}` next to the `inert` attribute. RED: `aria-hidden` count moved from 0 to 1. Reverted, checksum match.

### Task 5 (`loginCrossfade.test.ts`)

1. **Named CSS properties** -- removed `pointer-events: none;` from the `steamFlowOpen` rule. RED: structural regex failed. Reverted, checksum match.
2. **Transition non-`!important`** -- added `!important` to both `transition:` declarations. RED: negative-match regex failed. Reverted, checksum match.
3. **Three-way duration agreement, SCSS drift** -- changed the scss's `500ms` to `400ms`. RED: extracted-value comparison (`"400" !== "500"`) failed. Reverted, checksum match.
4. **Three-way duration agreement, TSX drift** -- changed `STEAM_DIALOG_EXIT_MS` to `600`. RED: extracted-value comparison (`"600" !== "500"`) failed. Reverted, checksum match. (Both 3 and 4 together prove the comparison catches drift from either side, not just one.)
5. **startViewTransition absence** -- added a `document.startViewTransition` reference to `Login/index.tsx`. RED: count moved from 0 to 1. Reverted, checksum match.
6. **F-10 regression guard** -- changed `.loginBackground`'s `position: absolute; inset: 0;` to `position: relative; height: 100%;`. RED: `position: absolute` regex failed to match. Reverted, checksum match.

Assertion 1 in each new/rewritten file (the FILLED-SPECIMEN GUARD sentinel) was not separately mutation-proven, consistent with this repo's existing convention in `dialogWindowChrome.test.ts` (also not separately mutated there).

## Full-Plan Verification (real output)

- `npm run codecheck` (`tsc --noEmit`): **clean**, zero output.
- `npm run lint`: **0 errors**, 3915 warnings -- same warning count as before this plan's changes; confirmed unrelated to files touched here (out of scope per the deviation rules' scope boundary).
- `npx sass --no-source-map src/frontend/screens/Login/index.scss /dev/null`: compiles clean.
- `npx jest src/frontend/screens/Login`: **5 suites, 60/60 tests passed** (`loginCrossfade.test.ts`, `loginInFlightUiReachability.test.tsx`, `index.test.tsx`, `Runner/__tests__/index.test.tsx`, `SteamLogin/__tests__/steamLoginWindowChrome.test.ts`).
- `git diff --exit-code pnpm-lock.yaml`: exits 0 -- no dependency changes (T-36-SC satisfied).
- `git diff src/frontend/screens/Login/index.scss`: confirmed `.loginBackground` rule byte-unchanged; the diff is a pure addition after `.loginContentWrapper`'s existing closing brace.
- `npm run test:ci` (full project suite): **299/301 suites passed, 6220/6225 tests passed**. 2 failing suites, both confirmed pre-existing and unrelated to this plan (see below and `deferred-items.md`).
- Manual `pnpm tauri:dev` sanity check: **out of scope for this executor** -- reserved for 36-03's human visual gate.

### `npm run test:ci` failures (pre-existing, logged to `deferred-items.md`, not fixed here)

1. `meta/__tests__/genI18nGateScope.test.ts` -- A-17 anti-rot check fails because `meta/i18nForkTouchedFiles.json` is missing `Dialog.tsx`, which was last modified by a prior quick task (`1b7fa0eaa`), not any commit in this plan. Confirmed via `git log --oneline a9e055eb0^..HEAD -- .../Dialog.tsx` returning empty.
2. `meta/__tests__/hardcodedStringGate.test.ts` -- the D-18 allowlist (`meta/i18nGateAllowlist.json`) expects `SteamLogin/index.tsx` to measure exactly 27 hardcoded-string violations; the scanner now measures 26. Isolated by running the same AST scanner directly against the file's content as of the commit immediately before this plan's Task 1 (`git show a9e055eb0^:...`) -- it also measures 26. The drift predates this plan; Task 1's edits touch no JSX text/attribute node the scanner classifies as a violation.

Both are documented in `.planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/deferred-items.md` with full isolation evidence, per the deviation rules' scope boundary (only auto-fix issues directly caused by the current task's changes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Added `src/frontend/typedefs/react-inert.d.ts`**
- **Found during:** Task 2
- **Issue:** `npm run codecheck` failed with `TS2322: Property 'inert' does not exist on type 'DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>'`. This project's pinned `@types/react@^18.3.20` does not yet declare the `inert` DOM attribute in `HTMLAttributes<T>` (confirmed absent via `grep -n "inert" node_modules/@types/react/index.d.ts` returning no output), even though react-dom already forwards `inert` to the DOM correctly at runtime -- only the TYPE was missing.
- **Fix:** Added a scoped ambient module augmentation (`declare module 'react' { interface HTMLAttributes<T> { inert?: string } }`), following the existing repo convention of ambient `.d.ts` files under `src/**/typedefs/`. Confirmed `tsconfig.json`'s `"include": ["src"]` already covers the new file with no config change needed.
- **Not a version bump:** upgrading `@types/react` was excluded from consideration -- Rule 3 explicitly excludes package-manager installs/version changes from auto-fix.
- **Self-caught regression during the fix:** initially renamed the augmentation's generic type parameter from `T` to `_T` to silence an eslint `no-unused-vars` warning without an eslint-disable comment. This broke TypeScript declaration merging project-wide -- `npm run codecheck` produced 100+ new errors across dozens of unrelated files (`ClearCache.tsx`, `Settings/index.tsx`, `StoreSearch/*`, etc.), all shaped like `Property 'children' does not exist on type '...'`. Diagnosed by toggling `T`/`_T` and re-running the full `tsc --noEmit` both ways; fixed by reverting to `T` with an `// eslint-disable-next-line @typescript-eslint/no-unused-vars` comment instead. Confirmed via a clean full-project `npm run codecheck` re-run.
- **Files modified:** `src/frontend/typedefs/react-inert.d.ts` (new)
- **Commit:** `a120cbe82` (landed with Task 2, since the typedef is a necessary companion for Task 2's own `inert` requirement to compile, not a separate task)

### Task count discrepancies (not deviations, informational)

- Task 1's plan text estimated 3 prose comments needing rewording in `SteamLogin/index.tsx`; the actual count found and fixed was 4.

### Out-of-scope discoveries (logged, not fixed)

See `deferred-items.md` in this phase directory: the `genI18nGateScope.test.ts` and `hardcodedStringGate.test.ts` pre-existing `test:ci` failures.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this plan.

## Threat Flags

None. All new surface (the overlay lifecycle, the `loginInFlight` guard, the crossfade) is covered by the plan's own `<threat_model>` STRIDE register (T-36-01, T-36-02, T-36-04, T-36-05, T-36-SC, F-36-01, F-36-02) -- no new network endpoints, auth paths, file access patterns, or schema changes were introduced outside that register.

## Self-Check

- `src/frontend/screens/Login/components/SteamLogin/index.tsx` -- FOUND
- `src/frontend/screens/Login/index.tsx` -- FOUND
- `src/frontend/screens/Login/index.scss` -- FOUND
- `src/frontend/App.tsx` -- FOUND
- `src/frontend/typedefs/react-inert.d.ts` -- FOUND
- `src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx` -- FOUND
- `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts` -- FOUND
- `src/frontend/screens/Login/__tests__/loginCrossfade.test.ts` -- FOUND
- `.planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/deferred-items.md` -- FOUND
- Commit `a9e055eb0` -- FOUND in `git log`
- Commit `a120cbe82` -- FOUND in `git log`
- Commit `d1be788a4` -- FOUND in `git log`
- Commit `74733945a` -- FOUND in `git log`
- Commit `2eb76e6b8` -- FOUND in `git log`

## Self-Check: PASSED
