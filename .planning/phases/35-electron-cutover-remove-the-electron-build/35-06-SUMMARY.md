---
phase: 35-electron-cutover-remove-the-electron-build
plan: 06
subsystem: shell
tags: [d-05, d-06, tray, tauri, about-window, recent-games, req-35-04, t-35-20, t-35-21, t-35-22, t-35-24]
status: INCOMPLETE — task 3 (blocking human gate) has not run

# Dependency graph
requires: [35-01]
provides:
  - "An extended Rust tray at src-tauri/src/main.rs — recent-games section, About item, and all four tray settings honoured"
  - "The first caller of `tauriShowAboutWindow` under Tauri, via a 7-step chain that needs no IPC channel and therefore cannot become a dead send"
  - "A recent-game click that dispatches in-process to the sidecar and never constructs a URL (T-35-21)"
  - "`trayResolveRunner` — a Rust->sidecar invoke channel resolving a bare appName to its Runner, the piece that lets an internal tray click reach `launch` without a deep link"
  - "Nine #[cfg(test)] tests over the `recent:<appName>` id round-trip, including a malformed-id rejection set (T-35-20)"
  - "UseDarkTrayIcon platform-gated to Windows/Linux — the third option the plan's keep-or-delete framing did not offer"
affects: [35-15, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reach a renderer-side function from Rust by evaluating a FIXED, uninterpolated literal against the existing `window.api` surface, rather than inventing a frontend-message channel no renderer listens on — an emitted channel with no registered listener is a live silent no-op"
    - "Give a menu-id parser ONE allow-list predicate and use it on BOTH the construction and the parse side, so an entry that cannot survive the round-trip is never rendered rather than rendering as a dead click"
    - "Get a live rebuild signal by OBSERVING an existing push frame already passing through the reader thread, instead of adding a channel — zero new registration surface, zero new dead-send risk"
    - "Read a setting synchronously from its on-disk file when the decision must be made before the subsystem it governs exists; a round-trip that lands late is indistinguishable from not honouring the setting"
    - "Check a platform-conditional control against BOTH what the code does and where the user is standing — a Rust prose comment is not a defence for a settings panel"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx
    - .planning/todos/completed/2026-08-22-about-window-is-unreachable-under-tauri.md

key-decisions:
  - "ALL FOUR tray settings came back HONOURED, so D-05's deletion rule fired ZERO times against TraySettings.tsx. Per the plan's own third branch the panel stays intact and task 2 was a deliberate no-op for it — TraySettings.tsx, its barrel export at components/index.ts:54, and its <TraySettings /> render are untouched, with no cosmetic edit."
  - "UseDarkTrayIcon was PLATFORM-GATED, not kept and not deleted — a third option the plan's binary framing did not offer. See the dedicated deviation section below."
  - "Settings are read synchronously in .setup() from GlobalConfig's on-disk config.json, NOT over a sidecar invoke. `noTrayIcon` and `startInTray` must be decided before the tray exists and before the window is displayed; a round-trip would block startup on sidecar boot or land late enough to flash a tray/window the user asked not to see. Fail-open: an unreadable config yields today's behaviour, pinned by two tests."
  - "The recent-games rebuild observes the EXISTING `recentGamesChanged` frontend-message frame in the reader thread rather than adding a channel. `recent_games.ts`'s setRecentGames already pushes it and every frame already transits that thread. Non-consuming — the frame still reaches the webview unchanged."
  - "Cold-start population reads `<appFolder>/store/config.json`'s `games.recent` directly. Without it the section would be empty on every cold start until the first launch of a session — a worse reduction than the file read avoids. The shell only ever READS that file; the sidecar remains its sole writer."
  - "The About item uses a fixed `window.eval` literal, NOT a frontend-message channel. Nothing in the renderer listens for an inbound `showAboutWindow` push — it has only ever been outbound (`makeListenerCaller`), and appShellFlowRegistration.ts's docstring records it as explicitly not registered sidecar-side. Emitting one would have been a dead send."
  - "`trayResolveRunner` is registered with `ipcMain.handle`, never `ipcMain.on` — it has a return value the shell blocks on, and a send-kind registration fails 100% silently (Phase 31 Pitfall 2). It is Rust->sidecar (handlerRegistry, same direction as handleProtocolUrl), so RUST_INVOKE_CHANNELS is correctly unchanged."
  - "`languageChanged` menu rebuild REDUCED, with the reason stated in code: the menu labels are Rust string literals, not i18next keys, so a rebuild would re-render identical English text. Making them translatable needs a string channel to the shell, which is its own plan."
  - "Rule 1 fix mid-task: `exitToTray` and `startInTray` are both gated on `!noTrayIcon`, mirroring src/backend/main.ts:288 and :523. Honouring them independently strands a running app with no window and no tray to restore it from."

requirements-completed: []
requirements-partial: [REQ-35-04]

# Metrics
duration: ~2h
completed: null
commits: [d2ec066ae, 3546dfdd8, 8978be102, 7af33f2fe, a600c333e, 6872afcb2]
---

# Plan 35-06 — a real Tauri tray, and the one affordance that had to be gated rather than kept or deleted

> **THIS PLAN IS NOT COMPLETE.** Tasks 1 and 2 are done and committed. **Task 3 is a blocking
> human-verify gate that has not run.** Nothing below has been observed running — every claim is
> static, unit-level, or read from source. Do not treat this summary as verification.

## The deliverable: HONOURED / NOT HONOURED

D-05's rule is applied by MEASUREMENT, and the measurement came back clean on all four.

| Setting | Verdict | Evidence |
|---|---|---|
| **`noTrayIcon`** | **HONOURED** | Read synchronously in `.setup()` from `<appFolder>/config.json` *before* the `TrayIconBuilder` call; when set, the builder branch is skipped entirely and the shell logs `[shell] tray suppressed by the noTrayIcon setting -- not building a tray`. Mirrors `tray_icon.ts:20`'s `if (noTrayIcon) return null`. |
| **`exitToTray`** | **HONOURED** | A `tauri::WindowEvent::CloseRequested` handler on the `main` window calls `api.prevent_close()` then `window.hide()`. Mirrors `src/backend/main.ts:288`, including its `&& !noTrayIcon` gate. |
| **`startInTray`** | **HONOURED** | `window.hide()` inside `.setup()`, before the event loop runs, so the window is never displayed rather than shown-then-yanked. Mirrors `src/backend/main.ts:523`, including its `&& !noTrayIcon` gate. **See the first-paint risk below — this is the one Task 3 should watch hardest.** |
| **`UseDarkTrayIcon`** (`darkTrayIcon`) | **HONOURED on Windows/Linux; deliberate no-op on macOS — now platform-gated** | `tray_image()` was read before deciding, not assumed. The chain is live end to end: `UseDarkTrayIcon.tsx` → `window.api.changeTrayColor()` → `appShellFlowRegistration.ts:387` → 500ms settle → `syncTrayIcon()` → `requestRustInvoke(RUST_TRAY_SET_ICON, [{dark}])` → `main.rs`'s `tray_set_icon` arm → `tray_image(dark)`. That function **does** consult `dark` — but only on Windows/Linux (`TRAY_ICON_DARK` vs `TRAY_ICON_LIGHT`). On macOS it returns the AppKit template silhouette regardless, as `main.rs:83-93` already states at length. |

**Consequence for the plan's own Task 2 branching:** all four HONOURED means the plan's third
branch applies — *"the panel stays intact and this task is a no-op for those files — say so
explicitly rather than making a cosmetic change."* `TraySettings.tsx`, its barrel export at
`components/index.ts:54`, and its `<TraySettings />` render in `GeneralSettings/index.tsx` are
**untouched**. D-05's deletion procedure fired zero times.

## Deviation: `UseDarkTrayIcon` needed a THIRD option the plan did not offer

The plan framed this as binary — *"either wire it in Task 1's scope or delete the toggle by the
same three-site procedure."* Both options were wrong here, so this is recorded as a deviation
rather than filed under either branch.

- **Deleting it** removes functionality that genuinely works on Windows and Linux, to fix a
  macOS-only problem. That trades a real capability for a cosmetic fix.
- **Keeping it as-is** ships exactly the affordance D-05 exists to eliminate: on macOS — this
  project's primary development and test platform — a user sees a toggle, flips it, and nothing
  ever happens. "It's documented in a Rust comment at `main.rs:83-93`" is not a defence. The
  person being misled is looking at a settings panel, not at `main.rs`.

**Resolution: platform-gate it.** `UseDarkTrayIcon` now returns `<></>` on `darwin` and is
unchanged on Windows/Linux. Honest everywhere; nothing working is lost.

**Gated inside the component, not at the render site** — deliberately the opposite of the default
suggestion, because the local precedent inverts it:

- **23** components in `src/frontend/screens/Settings/components/` self-gate via
  `useContext(ContextProvider)` + `platform === '…'` + `return <></>`.
- `GeneralSettings/index.tsx` — the file that actually renders `<UseDarkTrayIcon />` — has **zero**
  platform references and renders all 22 children unconditionally. Gating there would have
  introduced the first platform branch into that file.
- The nearest analogue is `AdvertiseAvxForRosetta.tsx`: a macOS-conditional toggle in the same
  directory. Its shape was copied.

(Render-site gating does exist elsewhere — `GamesSettings/index.tsx` uses `{isLinux && (…)}` — so
both idioms are real. The one nearest this component won.)

The `darkTrayIcon` config key is left in place. A persisted key with no UI on one platform is
harmless; a UI with no effect is not.

## What Task 1 built

Menu order mirrors `tray_icon.ts`'s own template: recent games → separator → Show GameLib →
About GameLib → Quit.

**Recent-games limit: READ, not chosen.** `src/backend/recent_games/recent_games.ts:9` is
`return maxRecentGames || 5`. Matched exactly, plus a hard cap of 20 — the value is user-editable
JSON on disk and a pathological entry would otherwise ask the shell to build an unbounded native
menu at startup.

**The click path, entirely in-process:** `on_menu_event` → `tray_recent_app_name(id)` →
`dispatch_tray_launch` → worker thread → `state.invoke("trayResolveRunner", [appName])` →
`state.invoke("launch", [{appName, runner}])`. The second hop is the *existing, already-hardened*
`launch` handler the UI itself uses — launch logic was not duplicated. **No URL is constructed
anywhere on this path**; `grep -c 'gamelib://' src-tauri/src/main.rs` is unchanged at 17 (T-35-21).

**Live rebuild without a new channel.** `recent_games.ts`'s `setRecentGames` already emits
`sendFrontendMessage('recentGamesChanged', …)`, and every such frame already transits the Rust
reader thread on its way to the webview. The tray observes it there (non-consuming — the frame
still reaches the webview unchanged), refreshes its cache, and rebuilds via `tray.set_menu` hopped
onto the main thread. Cold start is seeded from `<appFolder>/store/config.json`'s `games.recent`.

## The `protocol.ts` RUNNERS finding — the new tray is MORE capable than the one it replaces

`src/backend/protocol.ts:15` is `const RUNNERS = z.enum(['legendary', 'gog', 'nile', 'sideload'])`.
**There is no `steam` in it.** `findGame` iterates exactly that enum, and `handleProtocol` is how
the Electron tray launched a recent game.

Stated plainly: **the Electron tray could never launch a Steam recent game at all.** A click on one
fell through `findGame`, hit `Could not receive game data for …`, and did nothing. On this machine
the live `games.recent` list is *overwhelmingly* Steam appIDs (`2706020`, `620`, `1124300`,
`226840`, …) — so the failure mode was not an edge case, it was the common case, in the launcher
whose entire premise is first-class Steam support.

`trayResolveRunner` mirrors that enum's order exactly (`legendary, gog, nile, sideload`) so a
cross-store appName collision resolves the way the Electron tray resolved it, then **appends
`steam` and `zoom`**. Appending rather than prepending keeps the existing order authoritative. The
new tray is therefore strictly more capable than the one it replaces, not merely a port of it.

## The About window — closed on a static path, NOT on an observation

Seven steps, every link with a line number, re-confirmed at close:

| # | Step | Location |
|---|------|----------|
| 1 | tray menu event, id `"about"` | `src-tauri/src/main.rs:6730` |
| 2 | `open_about_window_from_tray()` | `src-tauri/src/main.rs:602` |
| 3 | `window.eval("window.api?.showAboutWindow?.()")` | `src-tauri/src/main.rs:609` |
| 4 | `window.api = api` (Tauri has no preload/contextBridge) | `src/preload/tauriAttach.ts:67` |
| 5 | default export spreads `...Helpers` | `src/preload/api/index.ts:15` |
| 6 | `showAboutWindow = () => isTauri() ? tauriShowAboutWindow() : …` | `src/preload/api/helpers.ts:17` |
| 7 | `tauriShowAboutWindow` | `src/preload/api/tauriChildWindows.ts:139` |

The todo moved to `.planning/todos/completed/` with `status: completed`, `completed: 2026-08-28`,
`completed_by`, and `resolves_phase: "35"` (absent `resolves_phase` makes todo auto-close miss).

**It closes on a traced source path plus a PENDING live check, stated as such.** Task 3 step 3 is
what actually opens the window and reads the version number. This todo exists precisely because a
fully-implemented function was assumed reachable for six weeks without anyone tracing it — closing
it on a second untested assumption would repeat the original error in the opposite direction.

**Deliberately not done, flagged instead:** the todo also asks that UAT item 8b be moved out of
`human_verification_resolved` in `34.1-VERIFICATION.md`. That edit would write a forward-dated
claim into a closed phase's record *before* the gate that substantiates it has run. It should
follow Task 3's result, not precede it.

## Risks Task 3 must attack

1. **`startInTray` first paint — watch this hardest.** The `window.hide()` runs inside `.setup()`,
   which executes before the event loop starts, so *in principle* the window is never composited.
   That is a reasoned expectation, **not a measurement**. If macOS composites a frame before
   `.setup()` returns, the user sees a flash — and a flash is the exact "affordance that does not
   do what it says" this phase exists to remove. Memory's own standing lesson applies: live UI
   claims need pixel measurement, and eyeballing has been wrong twice here. Watch for a frame, do
   not merely confirm the window ends up hidden.
2. **The About eval in a real WKWebView.** `window.api?.showAboutWindow?.()` is optional-chained,
   so if `window.api` is not yet attached the click does *nothing* — silently. A no-op and a
   success look identical from the outside. Confirm the window actually opens and shows a version.
3. **A recent-game click actually launching**, and no `gamelib://` in either log sink during it.
4. **The forced tray failure** (step 6) producing `[shell] WARN` and a running app, not a crash.

Both legs are DEV builds. The packaged tray is re-verified in 35-19's gate.

## Verification — actual results

| Gate | Result |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml` | **167 passed, 0 failed, 1 ignored** — includes 9 new tray tests |
| `cargo build` | clean, no warnings |
| `pnpm codecheck` (`tsc --noEmit`) | **exit 0** |
| `pnpm test --selectProjects Frontend` | **130 suites, 2101 tests, all passed** — confirmed from output that tests actually ran, not a vacuous selection |
| `npx jest …/appShellFlows.test.ts` | 33 passed |
| `pnpm lint-translations` | exit 0 |
| `pnpm lint-translations:gamelib` | exit 0 |
| `npx eslint` on both changed TS/TSX files | 0 errors; **zero new warnings** (5 pre-existing in appShellFlowRegistration.ts) |
| `src-tauri/Cargo.toml` | **zero diff** |
| `src/backend/tray_icon/tray_icon.ts` | **zero diff** |
| `grep -c 'gamelib://' src-tauri/src/main.rs` | **17 → 17** |
| non-comment `unwrap()` count in main.rs | **41 → 41** |

### Two gate caveats worth naming

- **`--selectProjects` was checked before trusting it.** `jest.config.js` defines its five projects
  by PATH with no `displayName`; the names live in the per-project configs. `src/frontend/jest.config.js:16`
  is `displayName: 'Frontend'` — exact case — so the selector is valid here. It exits 0 while
  selecting nothing when it is not, which is why the suite/test counts are reported rather than
  just an exit code.
- **Both i18n lints exit 0 while printing what look like failures** (empty `zh_Hant` translations;
  an `ENOENT` on `public/locales/zh_Hant/gamelib.json`, a file that was never tracked). That output
  is pre-existing and unrelated — this plan touched **zero** locale files, added zero keys and
  removed zero keys. `setting.darktray` is unchanged and still referenced.

## Deviations from Plan

1. **[Rule 1 — Bug] `exitToTray`/`startInTray` were not gated on `!noTrayIcon`.** Found while
   cross-checking against Electron. `src/backend/main.ts:288` is literally
   `if (exitToTray && !noTrayIcon)` and `:523` is `(settings.startInTray && !settings.noTrayIcon)`.
   Honouring them independently produces an unrecoverable state: the app starts, or closes, with no
   window *and* no tray icon to restore it from. Both are plain user-toggleable booleans with no
   cross-validation in the settings UI, so this is reachable. Commit `3546dfdd8`.
2. **[Scope — sanctioned] `src/backend/sidecar/appShellFlowRegistration.ts` was modified.** Task 1's
   Rust side invokes `trayResolveRunner`, which would otherwise have had **no registered listener** —
   a live silent no-op. Registering it is the explicitly permitted exception. `sidecarTransport.ts`
   is untouched and `appShellFlows.test.ts`'s "zero new Rust arms" assertion still passes.
3. **[Deviation from the plan's framing] `UseDarkTrayIcon` platform-gated rather than kept or
   deleted.** Full reasoning in its own section above.
4. **[Documented reduction] `languageChanged` menu rebuild not implemented.** The menu labels are
   Rust string literals, not i18next keys, so a rebuild would re-render identical English text.
   Recorded in a `STILL NOT DONE` block in `main.rs` alongside the macOS dock menu and the
   Reload/Debug items — a stated reduction, not a silent one.

## Known Stubs

None. No hardcoded empty value, placeholder string, or unwired component was introduced.

## Threat Flags

None. `trayResolveRunner` is a new sidecar-facing surface but it is inside this plan's declared
`<threat_model>` boundary ("Rust shell → Node sidecar"), rejects non-string/empty input by throwing
without echoing the value, and returns `null` rather than guessing. T-35-20 is mitigated by a
single allow-list predicate applied to both id construction and id parsing, with a dedicated
malformed-id test set.

## Self-Check

**Files claimed, verified present:**

- `src-tauri/src/main.rs` — FOUND (modified)
- `src/backend/sidecar/appShellFlowRegistration.ts` — FOUND (modified)
- `src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx` — FOUND (modified)
- `.planning/todos/completed/2026-08-22-about-window-is-unreachable-under-tauri.md` — FOUND (moved)

**Commits claimed, verified present:** `d2ec066ae`, `3546dfdd8`, `8978be102`

**Task status:**

| Task | Status |
|---|---|
| Task 1 — extend the Rust tray | **DONE** (`d2ec066ae`, `3546dfdd8`) |
| Task 2 — apply D-05 to TraySettings; close the About todo | **DONE** (`8978be102`) — a deliberate no-op for `TraySettings.tsx` |
| Task 3 — live human-verify gate | **NOT DONE — OUTSTANDING, BLOCKING** |

## Self-Check: PASSED WITH AN OUTSTANDING GATE

All file and commit claims verify. **The plan is NOT complete.** Task 3 is a blocking
`checkpoint:human-verify` gate driven by the human operator and has not run; `REQ-35-04` is
therefore recorded as PARTIAL, not completed, and `completed:` is left null. No live behaviour
described in this summary has been observed.


---

# Addendum — operator-initiated scope, added mid-gate (2026-08-28)

Added **after** tasks 1 and 2 were accepted, while task 3 was in progress. Recorded here rather
than folded into the sections above, so the record shows what was known when.

## The defect: the type was lossy, and the probe was papering over it

Task 1 shipped `trayResolveRunner` — a sidecar channel that resolves a bare appName to its
`Runner` by probing up to six store managers. The reasoning given for it was that a tray
recent-games entry is a `RecentGame`, which carries only `{ appName, title }`, while the `launch`
channel requires a runner and correctly refuses to guess one.

That reasoning was correct about the type and **wrong about the problem**. The operator spotted
it: `addRecentGame(game: GameInfo)` had `game.runner` sitting in its argument — a **required**
field on `GameInfo` — and threw it away:

```ts
updatedList.unshift({ appName: game.app_name, title: game.title })   // runner discarded
```

So the probe was not recovering unknowable information. It reconstructed, at the cost of up to six
store-manager lookups, a value that was known and discarded one line earlier. The lookup was a
correct solution to the problem *as the type presented it*; the type was the actual defect.

## What changed

| Layer | Change |
|---|---|
| `src/common/types.ts` | `RecentGame` gains `runner?: Runner`, reusing the existing exported union |
| `src/backend/recent_games/recent_games.ts` | `addRecentGame` writes the runner through |
| `src-tauri/src/main.rs` | cache carries the runner (validated against a mirror of the TS union); a click with a runner goes straight to `launch` and **skips the resolve invoke entirely** |

**The probe is deliberately kept as a LEGACY FALLBACK, not deleted.** The field is optional because
it is genuinely absent for real users, not out of caution: every entry written before this change
carries no runner, and the operator's own live `games.recent` held 18 of them. A migration that
stranded those would trade a slow-but-correct path for a dead menu item.
`trayResolveRunner`'s sidecar registration is unchanged.

## The alias fan-out was verified, not assumed

`HiddenGame = RecentGame` and `FavouriteGame = HiddenGame` — all three are one type, so both
aliases inherit the optional field. Census result: **safe, and the aliases were kept intact rather
than split into three types.**

- **Writers cannot populate it.** `GlobalState.tsx`'s `hideGame` and `addGameToFavourites` build
  their literals from two scalar `string` arguments (`appNameToHide`/`appTitle`) with **no
  `GameInfo` in scope**. There is no value they could put there even by accident.
- **Readers only touch `.appName`/`.title`** (`Library/index.tsx:525,543`,
  `GameCard/index.tsx:307,313`, `filterEngine.isHiddenGame` via a plain string array).
- **`frontend/types.ts:186`'s `interface HiddenGame` is a SEPARATE, file-local type**, not the
  aliased one. Untouched, and deliberately not "unified" as a drive-by.
- **`recent_games.ts:37` is the only `RecentGame` constructor** — confirmed by grepping every
  `{appName, title}` literal in the tree; the other two hits are the hidden/favourite writers.

One consequence needed handling: `engineWiring.ts:97`'s comment used *"`FavouriteGame` … carries no
`runner`"* as the stated premise for an input it still requires. That premise changes shape, so the
comment was updated. Its conclusion still holds — a `FavouriteGame`'s runner is `undefined` in
every case, since neither writer sets it — and leaving the old wording would have invited a future
change to drop that input on false grounds.

`zoom` remains a dropped platform with no new handling. It appears in the Rust allow-list only so
that list *mirrors* the TypeScript union rather than silently diverging from it, and a test
iterates the union to pin exactly that.

## Two gate regressions from Task 1 that Task 1's own gates never ran

Found while running the Backend jest project for this work — **a project tasks 1 and 2 never ran.**
I ran `cargo`, `codecheck` and the Frontend project and reported them green, and both of these
lived outside all three. They were caught by follow-up work, not by my own verification.

1. **`tauriShellSource.test.ts`** — 34.1's D-11 negative bound asserted `main.rs` contains none of
   `recents/dock/Reload/Debug/openDevTools`. Plan 35-06 *discharges two of those five by design*.
   Those assertions are retired **with their requirement**, with the reason recorded inline; the
   other three still hold and are still pinned. `Reload`/`Debug` are now pinned as **menu ids**
   rather than bare substrings, because a bare `not.toContain('Debug')` false-positives on
   `#[derive(Clone, Debug, …)]`.
2. **`flowRegistrationCensus.test.ts`** — Task 1 added `trayResolveRunner` without updating the
   `EXPECTED` table or the `register*Flows()` docstring (invoke 7→8, total 19→20). This gate is an
   intentional tripwire and it worked exactly as its header describes. Fixed by ledgering the
   channel and naming it in the module's invoke inventory alongside every sibling.

Both are recorded because they are the same failure shape this project keeps hitting: **a green
check that proves nothing, because the gate that would have caught it was never in the set I ran.**

## Verification — addendum

| Gate | Result |
|---|---|
| `cargo test` | **171 passed, 0 failed, 1 ignored** (was 167 — 4 new tests) |
| `cargo build` | clean, no warnings |
| `pnpm codecheck` | **exit 0** |
| `pnpm test --selectProjects Backend` | **181/182 suites, 4266 passed, 3 failed** — down from 3 failed suites / 6 failed tests |
| `pnpm test --selectProjects Frontend` | **130 suites, 2101 tests, all passed** |
| `pnpm test --selectProjects Common Preload` | **9 suites, 181 tests, all passed** |

**The 3 remaining Backend failures are pre-existing and environmental, flagged not hidden.** All
three are `decompressPool.test.ts`'s LZMA native-decode kill-switch tests, which expect `native`
and get `pure-js`. They fail in isolation as well as in the project run; neither `decompressPool.ts`
nor `lzmaLoader` appears anywhere in this plan's change set; and native LZMA decode is a
known-off state in this project. Nothing in this plan can reach them.

## New tests — both arms

- `a_persisted_runner_is_parsed_and_validated`
- `every_member_of_the_typescript_runner_union_survives_the_parse` — pins the Rust allow-list
  against `common/types.ts:23` so it cannot silently diverge
- `a_legacy_entry_and_a_bogus_runner_both_degrade_to_none` — **the arm every existing install runs
  on.** A missing `runner` key, an unknown runner, a wrong-typed runner and a null runner all
  degrade to `None` and, critically, **no entry is dropped** — falling back to the probe is
  strictly better than discarding a launchable entry
- `the_launch_branch_uses_a_persisted_runner_and_falls_back_without_one` — covers the branch
  directly via `recent_runner_in`, split out as a pure function so the branch is testable without
  mutating the process-wide cache

## Status unchanged

This addendum does **not** move the plan forward. **Task 3 remains NOT DONE and blocking**, the
plan is still `INCOMPLETE`, `REQ-35-04` is still PARTIAL, and no live behaviour has been observed.
Task 3's step 4 (launch a recent game from the tray) now additionally exercises the persisted-runner
arm on any game launched after this change, and the legacy-fallback arm on the 18 entries already
in the operator's store — worth exercising both rather than only whichever is on top.
