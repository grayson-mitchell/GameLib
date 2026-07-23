---
phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
plan: 04
subsystem: infra
tags: [tauri, notification, shell, app-lifecycle, sidecar, ipc, electron-shim, jest]

# Dependency graph
requires:
  - phase: 33-03
    provides: "Real multi-button dialog.showMessageBox forwarding + the rustInvoke/dispatch_rust_channel pattern this plan reuses for Notification/shell/app"
provides:
  - "Real OS notifications via tauri-plugin-notification (Notification.isSupported()===true, show() forwards title/body)"
  - "Real shell.showItemInFolder/openPath forwarding via tauri-plugin-opener's reveal_item_in_dir/open_path"
  - "Real app.quit/exit/relaunch forwarding to Tauri's AppHandle::exit()/restart() so the process actually exits/relaunches instead of leaving a zombie sidecar"
  - "shell.trashItem, session, and powerSaveBlocker upgraded from silent to LOGGED no-ops (accepted gaps, documented, never silent)"
affects: [33-06, dialog-cluster, sidecar-electron-shim]

# Tech tracking
tech-stack:
  added:
    - "tauri-plugin-notification = \"2\" (Cargo, first-party tauri-apps/plugins-workspace)"
    - "@tauri-apps/plugin-notification ^2.3.3 (npm, first-party)"
  patterns:
    - "Fire-and-forget void-returning electronStub members (Notification.show, shell.showItemInFolder, app.quit/exit/relaunch) chain .catch() directly onto requestRustInvoke() rather than awaiting -- matches the real Electron API's synchronous/void call shape while still logging transport failures instead of producing an unhandled rejection"

key-files:
  created:
    - src/backend/sidecar/__tests__/lifecycleStub.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - package.json
    - pnpm-lock.yaml
    - src-tauri/src/main.rs
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/__tests__/dialogStub.test.ts

key-decisions:
  - "shell.trashItem stays a LOGGED no-op (not wired to tauri-plugin-fs): direct inspection of the installed tauri-plugin-fs 2.5.1 crate source confirmed it has NO trash/recycle-bin capability at all in this version -- there was no vetted first-party plugin to forward to, so this is the plan's own documented fallback branch, not a shortcut"
  - "shell.showItemInFolder/openPath needed NO new Cargo plugin -- tauri-plugin-opener (already installed for open_external) already exposes reveal_item_in_dir()/open_path() on its Opener extension trait, confirmed by reading the installed crate source directly"
  - "app.exit()/app.quit() both forward to a single RUST_APP_EXIT channel (AppHandle::exit(0)); app.relaunch() forwards to RUST_APP_RELAUNCH (AppHandle::restart(), which never returns -- the type-level `!` correctly unifies with the match arm's Result<Value, String> return type)"
  - "session (D-09) was previously not exported by electronStub.ts AT ALL (an `import { session } from 'electron'` destructure against the stub silently resolved to undefined) -- added a logged fromPartition() stub so a future reachable call fails loudly instead of an opaque TypeError, rather than leaving it implicitly undefined"

patterns-established:
  - "Verified three Rust plugin APIs (tauri-plugin-notification's NotificationExt/builder, tauri-plugin-opener's reveal_item_in_dir/open_path, tauri::AppHandle::exit/restart) by fetching and reading the exact installed crate source from the local Cargo registry cache rather than trusting training-data recall or unverifiable web search snippets -- confirms the plan's own package-legitimacy discipline extends to API-shape verification, not just supply-chain vetting"

requirements-completed: [REQ-33-06, REQ-33-07, REQ-33-08, REQ-33-11]

# Metrics
duration: ~40min
completed: 2026-07-24
---

# Phase 33 Plan 04: Real Notification, Shell Reveal/Open, and App Lifecycle Forwards Summary

**Ported `Notification` (via the new `tauri-plugin-notification` first-party plugin), `shell.showItemInFolder`/`openPath` (via the already-installed `tauri-plugin-opener`), and `app.quit`/`exit`/`relaunch` (via Tauri's `AppHandle`) from no-ops to real cross-process forwards; `shell.trashItem`/`session`/`powerSaveBlocker` stay accepted-and-documented no-ops but now LOG instead of silently doing nothing.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-23T22:40:23Z
- **Tasks:** 3/3 completed
- **Files modified:** 8 (1 created)

## Accomplishments
- Added `tauri-plugin-notification = "2"` (Cargo) and `@tauri-apps/plugin-notification` `^2.3.3` (npm), registered the plugin in the Tauri builder, and added a `notification_show` `dispatch_rust_channel` arm calling the plugin's `app.notification().builder().title(...).body(...).show()` -- `Notification.isSupported()` now returns `true` and `show()` forwards for real
- `shell.showItemInFolder`/`openPath` now forward via two new `rustInvoke` channels (`shell_show_item_in_folder`/`shell_open_path`) backed by `tauri-plugin-opener`'s `reveal_item_in_dir`/`open_path` -- no new Cargo dependency needed, the opener plugin already covered both
- `app.quit`/`exit`/`relaunch` forward to Tauri's `AppHandle::exit()`/`restart()` via two new channels (`app_exit`/`app_relaunch`), fixing the "zombie sidecar" gap where the real Tauri process never actually exited or relaunched
- `shell.trashItem` (no vetted trash-capable Tauri v2 plugin exists as of `tauri-plugin-fs` 2.5.1, confirmed by reading its source), `session` (previously not even exported), and `powerSaveBlocker.start` all upgraded from silent-or-absent to LOGGED no-ops
- 17 new unit tests (`lifecycleStub.test.ts`) prove every forward's happy path and its never-throws-on-transport-failure fallback; fixed a pre-existing `dialogStub.test.ts` test that broke because it didn't mock `requestRustInvoke` for the now-real `showItemInFolder` call

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the notification plugin + new channel consts + real Notification (D-05)** - `2bfc9f75` (feat)
2. **Task 2: Real shell methods + app lifecycle forward + logged session/powerSaveBlocker (D-05/D-08/D-09)** - `0a5ad16c` (feat)
3. **Task 3: Unit tests for the cluster forwards + logged no-ops** - `3bdcd2f7` (test)

_No TDD tasks in this plan; each task is a single commit. Tasks 1 and 2 share `src-tauri/src/main.rs`/`src/common/types/sidecarTransport.ts`/`src/backend/sidecar/electronStub.ts` (per the plan's own wave note) -- each was staged and verified (cargo build + tsc) independently by temporarily isolating each task's portion before committing, so both commits are independently buildable._

## Files Created/Modified
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` - added `tauri-plugin-notification = "2"`
- `package.json` / `pnpm-lock.yaml` - added `@tauri-apps/plugin-notification ^2.3.3`
- `src-tauri/src/main.rs` - registered the notification plugin; added `notification_show`, `shell_show_item_in_folder`, `shell_open_path`, `app_exit`, `app_relaunch` arms to `dispatch_rust_channel`
- `src/common/types/sidecarTransport.ts` - added `RUST_NOTIFICATION_SHOW`, `RUST_SHELL_SHOW_ITEM_IN_FOLDER`, `RUST_SHELL_OPEN_PATH`, `RUST_APP_EXIT`, `RUST_APP_RELAUNCH` consts + `RUST_INVOKE_CHANNELS` entries
- `src/backend/sidecar/electronStub.ts` - `Notification` class real forward; `shell.showItemInFolder`/`openPath` real forward, `trashItem` logged no-op; `app.quit`/`exit`/`relaunch` real forward; new `session` export (logged no-op); `powerSaveBlocker.start` now logs
- `src/backend/sidecar/__tests__/lifecycleStub.test.ts` (new) - 17 tests covering every forward + logged no-op
- `src/backend/sidecar/__tests__/dialogStub.test.ts` - removed the now-stale `shell.showItemInFolder` D-04 test (superseded, coverage moved to `lifecycleStub.test.ts`); `clipboard.writeText`'s D-04 test kept unchanged

## Decisions Made
- `shell.trashItem` stays a logged no-op rather than adopting `tauri-plugin-fs`: read the installed 2.5.1 crate's source directly and confirmed it has no trash-move capability at all in this version -- there was genuinely no vetted plugin to wire, so no new Cargo dependency was added for it. Declared as an accepted gap for Plan 06's `33-PORTED-CHANNELS.md`.
- `shell.showItemInFolder`/`openPath` needed no new plugin -- `tauri-plugin-opener`'s `Opener` extension already exposes `reveal_item_in_dir`/`open_path` (confirmed via source read), reusing the plugin already installed for `open_external`.
- `app.exit()` and `app.quit()` both forward to the same `RUST_APP_EXIT` channel/`AppHandle::exit(0)` call -- real Electron's `app.quit()` is a graceful variant of `exit()` but neither of the two sidecar-reachable callers (`resetHeroic`, the uninstall/quit exit path) rely on a behavioral difference between them, so a single shared forward keeps the surface minimal.
- Added a `session` export (previously entirely absent from the stub) so a future reachable `session.fromPartition()` call fails loudly with a log line instead of an opaque "Cannot read properties of undefined" TypeError -- a stricter reading of D-09's "accept + document" than "leave it undefined."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing test that broke as a direct, foreseeable consequence of this plan's own Task 2 change**
- **Found during:** Task 3 (writing/running the new unit tests, then re-running the full sidecar suite as a regression check)
- **Issue:** `dialogStub.test.ts`'s `electronStub shell/clipboard D-04 logged no-ops` describe block asserted `shell.showItemInFolder` logs a warning and does nothing -- but that block only spies on `console.warn`, it does not mock `requestRustInvoke`. Once `showItemInFolder` graduated to a real forward (this plan's Task 2), calling it in that describe block hit `requestRustInvoke(...).catch` on an unconfigured `jest.fn()` returning `undefined`, throwing `TypeError: Cannot read properties of undefined (reading 'catch')`.
- **Fix:** Removed the stale `shell.showItemInFolder` test case (its behavior is now covered properly in the new `lifecycleStub.test.ts`, which does mock `requestRustInvoke`); kept `clipboard.writeText`'s D-04 test unchanged (untouched by this phase); renamed the describe block and removed the now-unused `shell` import; added a short header-comment cross-reference.
- **Files modified:** `src/backend/sidecar/__tests__/dialogStub.test.ts`
- **Verification:** `npx jest src/backend/sidecar/__tests__/dialogStub.test.ts` (21/21 passing) and the full `src/backend/sidecar` suite (13 suites, 179/179 passing)
- **Committed in:** `3bdcd2f7` (Task 3 commit)

**2. [Rule 1 - Bug] Reworded an electronStub.ts comment that spuriously failed the plan's own verification grep**
- **Found during:** Running the plan's `<verification>` block (`grep -rn "from 'electron'" src/backend/sidecar/electronStub.ts` must return nothing)
- **Issue:** A doc comment on the new `session` export used the literal prose `import { session } from 'electron'` to explain the historical destructure behavior -- this matched the curated-import-discipline grep even though it was inert prose, not a real import.
- **Fix:** Reworded the comment to describe the same fact without the literal matching substring.
- **Files modified:** `src/backend/sidecar/electronStub.ts`
- **Verification:** `grep -rn "from 'electron'" src/backend/sidecar/electronStub.ts` now returns nothing (exit 1)
- **Committed in:** `3bdcd2f7` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own changes)
**Impact on plan:** Both fixes were necessary to keep the existing test suite green and the plan's own verification block passing. No scope creep — no unrelated files touched.

## Issues Encountered
- `@tauri-apps/plugin-notification`'s exact Rust builder API (`NotificationExt`/`.notification().builder().title().body().show()`) was verified by fetching the installed crate source (`~/.cargo/registry/src/.../tauri-plugin-notification-2.3.3/src/{lib,desktop}.rs`) directly rather than relying on documentation lookup tools (Context7/ctx7 were unavailable in this environment) -- same approach used to confirm `tauri-plugin-opener`'s `reveal_item_in_dir`/`open_path` methods and `tauri::AppHandle::exit`/`restart` signatures, and to confirm `tauri-plugin-fs` 2.5.1 has no trash capability. All four verifications were HIGH confidence (exact installed version, not a training-data guess).

## User Setup Required

None - no external service configuration required. Both new dependencies (`tauri-plugin-notification` Cargo crate, `@tauri-apps/plugin-notification` npm package) are already-audited first-party `tauri-apps` packages per 33-RESEARCH's Package Legitimacy Audit; installed via `pnpm add`/`cargo build` during this plan's execution, lockfiles updated.

## Next Phase Readiness
- `Notification`/`shell.showItemInFolder`/`shell.openPath`/`app.quit`/`app.exit`/`app.relaunch` are now real, unit-proven forwards; `shell.trashItem`/`session`/`powerSaveBlocker` are documented accepted gaps that LOG rather than silently no-op -- ready for Plan 06 to fold `shell.trashItem`'s gap into `33-PORTED-CHANNELS.md`.
- Verification suite green: `cargo build` compiles, `npx tsc --noEmit` passes, `npx jest src/backend/sidecar/__tests__/lifecycleStub.test.ts` (17/17), `npx jest electronUntouched` (11/11), and the full `src/backend/sidecar` suite (13 suites, 179/179) all pass; `grep -rn "from 'electron'" src/backend/sidecar/electronStub.ts` returns nothing (no real electron import leaked in); all 5 new channels are present in `RUST_INVOKE_CHANNELS`.
- No blockers or concerns carried forward. Re-deferred cluster members (tray/protocol/multi-window/`nativeImage`/updater) remain untouched, non-fatal per Invariant B, as planned.

---
*Phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray*
*Completed: 2026-07-24*

## Self-Check: PASSED

All 7 modified/created files and all 3 task commit hashes verified present on disk / in git log.
