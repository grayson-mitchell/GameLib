# D-11 Channel Re-census — Plan 40-03, Task 1

Both channels named in D-11 (`humbleLoginNavigated`) and planning_findings item 4
(`humbleGetLoginUserAgent`) are re-swept here across four surfaces, per the plan's discipline:
a channel can be dead while the behaviour it drove is live under a different name, so the sweep
covers TypeScript callers, Rust dispatch arms in every casing, direct callers of the underlying
method/function (not just the channel name), and test-file channel-list pins.

Both channels' only renderer caller was `HumbleLoginSurface.tsx`, deleted by plan 40-01 when the
`<webview>` element it drove was retired (confirmed by that file's own retirement comment at
`src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:20-31`, which explicitly defers
this re-census to plan 40-03).

---

## Channel 1: `humbleLoginNavigated`

**VERDICT: REMOVE**

D-17: relayed the `/loginweb/humble` webview's `did-navigate`/`did-navigate-in-page` events to
`HumbleUser.notifyLoginNavigated()`, forcing an immediate cookie re-validation and bypassing the
poll-path throttle. The relaying `<webview>` element no longer exists.

### (a) TypeScript `src/` — `window.api` references and preload-binder imports

```
grep -rn "window\.api\.humbleLoginNavigated\|from.*preload/api/humble.*humbleLoginNavigated\|import.*humbleLoginNavigated" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```
Hits: **0** (production). The only pre-edit reference was `HumbleLoginSurface.tsx:145`, deleted by
plan 40-01; a negative-scope test pin (`humbleLoginChromeCss.test.ts:61-62`) already asserts its
absence.

### (b) Rust `src-tauri/` — camelCase, snake_case, SCREAMING_SNAKE_CASE

```
grep -rn -i "humbleLoginNavigated\|humble_login_navigated\|HUMBLE_LOGIN_NAVIGATED" src-tauri/
```
Hits: **0**. No dispatch arm exists for this channel in any casing.

### (c) Behaviour-level — direct callers of `HumbleUser.notifyLoginNavigated()`

```
grep -rn "notifyLoginNavigated" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```
Hits: 5 lines, all either the method's own definition (`src/backend/humble/user.ts:231`), prose
comments naming the method (`user.ts:70,120,276,419`; `loginWindowSeam.ts:6`), or this plan's own
removal-note comment (`humbleLoginFlowRegistration.ts:17`). **Zero production call sites** invoke
the method. It is called directly by `src/backend/humble/__tests__/user.test.ts` (~40 call sites)
as part of unit-testing the method itself, independent of the IPC channel — that test coverage is
unaffected by this removal since the method definition is untouched.

### (d) Test-file channel-list pins

```
grep -n "humbleLoginNavigated" src/backend/sidecar/__tests__/humbleLoginFlows.test.ts src/backend/sidecar/__tests__/humbleFlows.test.ts
```
Hits (pre-edit): `humbleLoginFlows.test.ts:168` (`SEND_CHANNELS` array),
`humbleFlows.test.ts:453` (`SEND_CHANNELS_34_4_1` array). Both updated in this task — see "Files
changed" below.

**Conclusion:** zero live callers across all four surfaces, including the behaviour-level search
D-11 specifically requires. REMOVE is safe.

---

## Channel 2: `humbleGetLoginUserAgent`

**VERDICT: REMOVE**

REQ-34.4.1-04: resolved `standardBrowserUserAgent()` for the `<webview>`'s `useragent` attribute so
Google SSO offered its normal password / "Try another way" flows instead of embedded-browser
restrictions. The consuming `<webview>` element no longer exists.

### (a) TypeScript `src/` — `window.api` references and preload-binder imports

```
grep -rln "window\.api\.humbleGetLoginUserAgent\|import.*humbleGetLoginUserAgent" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```
Hit: `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` — but the single match there
is a **prose comment** (`:28`, "The `window.api.humbleGetLoginUserAgent` fetch and its state are
deleted with it") documenting that plan 40-01 already deleted the live fetch call, not a live call
site. Production hits: **0**.

### (b) Rust `src-tauri/` — camelCase, snake_case, SCREAMING_SNAKE_CASE

```
grep -rln -i "humbleGetLoginUserAgent\|humble_get_login_user_agent\|HUMBLE_GET_LOGIN_USER_AGENT" src-tauri/
```
Hits: **0**. No dispatch arm exists for this channel in any casing.

### (c) Behaviour-level — direct callers of `standardBrowserUserAgent()` other than the removed channel

```
grep -rn "standardBrowserUserAgent()" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__\|\.test\."
```
Hits: 9 production call sites, none of them the removed IPC handler —
`src/backend/humble/adapter.ts:311`, `user.ts:604,823,948,1107`,
`src/backend/sidecar/humbleLoginFlowRegistration.ts:457` (the D-08
`GAMELIB_LOGIN_SEAM_SMOKE` diagnostic hook), plus two unrelated Legendary-runner call sites
(`storeManagers/legendary/user.ts:250,294`). All of these call the function directly, not via the
`humbleGetLoginUserAgent` channel — the function itself is untouched by this removal and these
callers are unaffected.

### (d) Test-file channel-list pins

```
grep -n "humbleGetLoginUserAgent" src/backend/sidecar/__tests__/humbleLoginFlows.test.ts src/backend/sidecar/__tests__/humbleFlows.test.ts
```
Hits (pre-edit): `humbleLoginFlows.test.ts:165` (`HANDLE_CHANNELS` array),
`humbleFlows.test.ts:450` (`HANDLE_CHANNELS_34_4_1` array). Both updated in this task — see
"Files changed" below.

**Conclusion:** zero live callers of the channel across all four surfaces. The underlying
`standardBrowserUserAgent()` function has real, unrelated production callers and is NOT removed —
only the IPC channel wiring is. REMOVE is safe.

---

## Files changed (both REMOVE verdicts)

- `src/common/types/ipc.ts` — removed both type declarations (`SyncIPCFunctions.humbleLoginNavigated`,
  `AsyncIPCFunctions.humbleGetLoginUserAgent`) with their doc comments.
- `src/preload/api/humble.ts` — removed both preload export lines
  (`humbleGetLoginUserAgent`/`humbleLoginNavigated`).
- `src/backend/sidecar/humbleLoginFlowRegistration.ts` — removed the `ipcMain.handle`/`ipcMain.on`
  registration lines for both channels; updated the module docstring's channel count (6 → 4),
  channel lists, and total-channel arithmetic (21 → 19) to match.
- `src/backend/humble/ipc_handler.ts` — removed both `addHandler`/`addListener` registration
  lines; trimmed the now-unused `standardBrowserUserAgent` import.
- `src/backend/sidecar/__tests__/humbleLoginFlows.test.ts` — removed both channels from
  `HANDLE_CHANNELS`/`SEND_CHANNELS`, updated the describe-block title and header docstring's
  channel count (6 → 4).
- `src/backend/sidecar/__tests__/humbleFlows.test.ts` — removed both channels from
  `HANDLE_CHANNELS_34_4_1`/`SEND_CHANNELS_34_4_1`, updated the describe/it titles and surrounding
  comment block's channel count (6 → 4).
- `.planning/IPC-PORT-INVENTORY.md` — updated the Phase 34.4.1 section header/list, the `##
  Totals` table, and added a dated narrative note (2026-09-04) per the inventory's own convention.
- `src/backend/sidecar/humbleFlowRegistration.ts` (Rule 1 — not in `files_modified`, but its
  docstring directly named both removed channels as things it deliberately did NOT register; that
  claim became false the moment the channels stopped existing at all) — updated the channel count
  (6 → 4, 21 → 20) and channel list.
- `src/backend/humble/user.ts` (Rule 1 — not in `files_modified`) — the comment re-exporting
  `standardBrowserUserAgent` named `ipc_handler.ts`'s `humbleGetLoginUserAgent` handler as an
  existing caller; that handler no longer exists, so the comment was corrected to name the
  callers that remain (`user.test.ts`, the D-08 smoke hook).

## Verification run

```
pnpm codecheck
```
Exit 0.

```
pnpm exec jest src/backend/sidecar/__tests__/humbleLoginFlows.test.ts src/backend/sidecar/__tests__/humbleFlows.test.ts
```
`Test Suites: 2 passed, 2 total` / `Tests: 65 passed, 65 total`.

`.planning/IPC-PORT-INVENTORY.md` before/after Totals (verbatim):

Before:
```
| Unique channels | 218 |
| Ported to sidecar | 63 |
| **Unported** | **159** |
```

After:
```
| Unique channels | 216 |
| Ported to sidecar | 61 |
| **Unported** | **159** |
```
