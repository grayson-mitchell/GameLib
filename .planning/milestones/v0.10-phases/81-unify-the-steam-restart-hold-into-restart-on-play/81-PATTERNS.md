# Phase 81: Unify the Steam restart hold into restart-on-Play - Pattern Map

**Mapped:** 2026-11-17
**Files analyzed:** 14 new/modified (plus the deletion list in RESEARCH "Deletion surface")
**Analogs found:** 13 / 14

All analog paths were checked as git-tracked source (no gitignored mirrors).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `native/steam-bridge/helper/gamelib_appstate.h` (NEW) | helper subcommand | request-response (one JSON line) | `native/steam-bridge/helper/gamelib_installapp.h` | exact |
| `native/steam-bridge/helper/bridge_helper.c` (MOD, dispatch) | helper entry | request-response | same file, lines 200-204 and 3214-3222 | exact |
| `src-tauri/crates/gamelib-steampoll/src/adoption.rs` (NEW) | service (poll task + helper reader) | event-driven polling | `src/running.rs` (task lifecycle) + `src/update.rs` `request_steam_install_app` (helper read) | role-match |
| `src-tauri/crates/gamelib-steampoll/src/registry.rs` (MOD) | registry | event-driven | itself: add `PollKind::Adoption` | exact |
| `src-tauri/crates/gamelib-steampoll/src/events.rs` (MOD) | model (event schema) | pub-sub | itself: add `AdoptionState`, drop `RearmSettled` | exact |
| `src-tauri/crates/gamelib-steampoll/tests/adoption.rs` (NEW) | test | event-driven | `tests/update.rs` (ScriptedRunner) and `tests/running.rs` (paused time) | role-match |
| rustInvoke ops: `steampoll_adoption_watch/unwatch`, `steampoll_hold_drain/discard`, read-app-state | route/op | request-response | `steampoll_install_cancel_delegated` (touchpoint list in RESEARCH) | exact |
| `src/backend/sidecar/steamPollEventRegistration.ts` (MOD) | handler | event-driven | itself: `applyEvent` switch (add `adoptionState`, remove `rearmSettled`) | exact |
| `src/backend/storeManagers/steam/macSteamAdoption.ts` (MOD) | service | request-response | itself (generalise pids/platform, add `open-steam` outcome) | exact |
| `src/backend/storeManagers/steam/playAdoption.ts` (NEW) | service (Play gate) | request-response | `gameLaunch.ts` lines 205-275 (extract, ceiling Pitfall 6) | exact |
| `src/backend/storeManagers/steam/adoptionStatus.ts` (NEW) | service (query + push) | request-response + push | `steamDirectLaunchVerdict` channel wiring | role-match |
| `src/backend/storeManagers/steam/gameInstallDepot.ts` (MOD) | service | batch | itself, install-end branch (~585-615) | exact |
| `src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx` (NEW) | component | request-response | `SteamUpdateInfo.tsx` | role-match |
| `GameStatus.tsx`, `MainButton.tsx`, refusal notice with action | component | request-response | `GameStatus.tsx` ~207; `SteamRequestNotice.ts` / `SteamEngineLaunchNotice` | role-match |

## Pattern Assignments

### `native/steam-bridge/helper/gamelib_appstate.h` (helper subcommand, request-response)

**Analog:** `native/steam-bridge/helper/gamelib_installapp.h` (599 lines). Reuse, do not copy: include it and call its `gl_ia_attach`, `gl_ia_vt`, `gl_ia_find_method_slot`, `gl_ia_unavailable`, `gl_ia_emit`, `gl_ia_parse_app_id`. Add `#define GL_IA_FN_GETAPPINSTALLSTATE 0xeaf2u` beside lines 76-80. `BLoggedOn` (0x6585) is on IClientUser: resolve it the way `gamelib_ownedapps.h` does (engine slot 8, RTTI check). Spike reference: `.planning/spikes/083-adoption-signal-without-restart/probe.c` tick mode.

**Function-ID constants** (installapp.h lines 76-80):
```c
#define GL_IA_FN_INSTALLAPP 0xdd9au
#define GL_IA_FN_UNINSTALLAPP 0x4505u
#define GL_IA_FN_NUMINSTALLED 0xde40u
```

**Output + exit codes** (lines 123-132):
```c
static int gl_ia_unavailable(const char *reason) {
  gl_ia_emit("{\"result\":\"unavailable\",\"reason\":\"%s\"}", reason);
  return GL_IA_EXIT_UNAVAILABLE;
}
static int gl_ia_usage(const char *why) { ... GL_IA_EXIT_USAGE }
```

**Attach trap** (lines 175-205, attach returns reason tokens): `pipe <= 0` -> `"steam-not-running"`; `user <= 0` -> `"not-signed-in"`. Do NOT use the latter as the sign-in test (D-08, Pitfall 4). Report `loggedOn` from `BLoggedOn` only.

**Main shape** (lines 534-577): `gl_ia_parse_app_id`, then `#if defined(__aarch64__)` run else `gl_ia_unavailable("unsupported-arch")`. Copy `gamelib_installapp_main` minus `--library`/`--dry-run`.

Output line: `{"result":"ok","loggedOn":0|1,"state":N,"installed":K}`. Never print the SteamID.

**Dispatch in `bridge_helper.c`:** add the include after line 204 and a branch after line 3221, same isolation (before secrets, steam_appid.txt, socket server):
```c
#include "gamelib_ownedapps.h"           // line 204
...
if (argc > 1 && strcmp(argv[1], "--steam-owned-apps") == 0) {
  return gamelib_ownedapps_main(argc, argv);   // lines 3219-3221
}
```

---

### `src-tauri/crates/gamelib-steampoll/src/adoption.rs` (poll task + helper reader)

**Analog A (task lifecycle):** `src/running.rs` lines 195-232 (`start`). Register under the state lock, spawn on the registry, `interval_at` + `MissedTickBehavior::Delay`, `tokio::select!` on the cancel token, reset `started` on exit:
```rust
let (token, guard) = self.inner.registry.register(PollKind::Running, POLL_KEY);
...
let period = Duration::from_millis(RUNNING_POLL_INTERVAL_MS);
let mut ticks = interval_at(Instant::now() + period, period);
ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
loop {
    tokio::select! {
        _ = token.cancelled() => break,
        _ = ticks.tick() => poll.poll_once().await,
    }
}
```
Add `PollKind::Adoption` to `registry.rs` lines 15-19 (`Install, Uninstall, Running`). Singleton key `"adoption"` like `POLL_KEY: &str = "running"`. Task ends when the watch map is empty (D-07).

**Analog B (helper read):** `src/update.rs` lines 60-122 `request_steam_install_app`. Copy: `is_valid_app_id` check, helper path only from `host.bridge_helper_path().filter(|p| Path::new(p).exists())`, argv array (no shell), `runner.run(..., Duration)`, `out.code.is_none() || stdout too large` -> failure, parse last non-empty line as JSON, every failure maps to a typed unavailable (D-10 fail-safe -> `signed_in: None`, no adoption). Use a much shorter timeout than `HELPER_TIMEOUT_MS` (30 s, update.rs:31).
```rust
let last = out.stdout.lines().rfind(|l| !l.trim().is_empty());
let parsed: Option<Value> = last.and_then(|l| serde_json::from_str(l).ok());
let Some(Value::Object(obj)) = parsed else { return unavailable("helper-failed"); };
match obj.get("result").and_then(Value::as_str) { Some("ok") => ..., _ => unavailable("helper-failed") }
```

**Reuse from `hold.rs` (keep when deleting the hold):** `list_steam_client_pids`, `read_steam_process_start_tokens`, `parse_record`, `decide_rearm` (D-12 drain).

**Event** in `events.rs` (full-state, no deltas): add after line 59
```rust
#[serde(rename = "adoptionState", rename_all = "camelCase")]
AdoptionState { app_id: String, seq: u64, adopted: bool, signed_in: Option<bool> },
```
and add it to `kind()`, `app_id()`, `seq()` match arms (lines 67-110); delete `RearmSettled` from all four places in the same commit (Pitfall 8; update `tests/fixtures/state-events.json` and `sidecarInternal.ts` zod schema).

---

### Test: `tests/adoption.rs`, `tests/hold_migration.rs` (Rust)

**Analog:** `tests/update.rs` header (lines 1-40): `ScriptedRunner` for fake helper output, `RecordingHost`, `FakeClock`, helper imports `gamelib_steampoll::testing::ScriptedRunner`, `json!`. Use `tests/running.rs` for paused-time lifecycle (start/stop, ticks). `tests/hold.rs` (36 passing tests) is the pattern for drain/parse_record; reuse `fixtures/restart_hold/ts-written.json`. No real Steam in unit tests.

---

### New rustInvoke ops (watch, unwatch, drain, discard, read app state)

**Analog:** `steampoll_install_cancel_delegated`. Touchpoints, in order (RESEARCH "Deletion surface" last paragraph): `gamelib-steampoll/src/dispatch.rs` (OPS list, sorted) and `tests/dispatch.rs`; `src-tauri/src/steampoll_dispatch.rs` (`rpc_*` handler); `src-tauri/src/rust_dispatch.rs`; `src-tauri/src/ipc_contract.rs`; `src/common/types/sidecarTransport.ts` (`RUST_STEAMPOLL_*`); `src/common/types/ipc/rustInvoke.ts` (zod args); `src/backend/__tests__/tauriShellSource.test.ts` census; `pollRust/steamPollTypes.ts`. AppId validated `^\d{1,10}$` at every op. Naming trap: `steampoll_running_hold` is unrelated, do not delete.

---

### `src/backend/sidecar/steamPollEventRegistration.ts` (handler)

**Analog:** itself, `applyEvent` (lines 130-196). Add an `adoptionState` case in the same shape as the existing ones (idempotent, answers `applied: true`, no path or payload in logs):
```ts
case 'macArchVerdict':
  await applyMacArchVerdict(deps, ev.appId, ev.verdict)
  return { applied: true, title: titleOf(ev.appId) }
```
On `adopted`: `clearPendingAdoption`, send the page push. Cache `signedIn`. Clearing an absent record is a no-op. Remove the `rearmSettled` case (lines 182-195) and update the header comment (line 6-7 kind list). `INSTALL_STATE_KINDS` (line ~199) must not include `adoptionState` (per-(appId,kind) guard).

---

### `src/backend/storeManagers/steam/macSteamAdoption.ts` + `playAdoption.ts`

**Analog:** `macSteamAdoption.ts` itself (386 lines).

**Record shape** (lines 57-64; add optional `pids?: {pid, startToken}[]` and keep reading old `steamPid`; the validator `readPendingAdoption` lines 76-105 must stay lenient):
```ts
export interface PendingAdoptionRecord {
  steamPid: number
  manifestPath: string
  baseline: AcfSnapshot
  recordedAt: number
}
```

**Pure decision** (lines 205-217) is the extension point: add `platform`, `steamSignedIn`, and helper/log evidence inputs; add an `'open-steam'` outcome (D-03). Off-Mac, `currentPid !== record.steamPid` must NOT return `clear-and-launch` on its own (Pitfall 2). `gameUninstall.ts:483` also calls it; keep its tests green.

**Restart** (`restartMacSteamForAdoption`, lines 303-386): keep logic verbatim; generalise `RestartDeps` (lines 255-265): `launchRunGameId` becomes "relaunch Steam alone" for D-02 (`open -b com.valvesoftware.steam` on Mac, `steam.exe` no args on Windows, plain `steam` on Linux via `deps.openExternal`, not `ProcessRunner.openDetached`, which is Mac-only). Sleep uses unref'd `clock.setTimeout` (lines 296-300): keep (sidecar exit contract).

**Play gate** to extract into `playAdoption.ts` (from `gameLaunch.ts` lines 208-275, which is `if (isMac) {`): record read -> `probeMacSteamPid` -> `decidePlayAdoption` -> switch on `clear-and-launch` / `unknown` (WR-01, keep record) / `restart` -> refusal copy for `game-running` / `steam-busy` / `quit-timeout`:
```ts
const outcome = await restartMacSteamForAdoption(steamGame.appId, createRestartDeps({...
  launchRunGameId: () => steamGame.deps.openExternal.openExternal(url, { activate: false }) }))
if (outcome.kind === 'relaunched') { clearPendingAdoption(...); watchSteamLaunch(...); return true }
// refuse; never plain rungameid; record stays
notify(steamGame.deps, { title: game, body })
return false
```
Keep the three `gamelib:steam.adoptRestart.*` i18n keys. `gameLaunch.ts` is 965 lines vs the 1000-line ceiling: leave `launch()` a short call. Pid probe `probeMacSteamPid` (lines 224-250) uses `createFakeHomeProfile({prefix})`: any new TS child spawn must do the same (convention). Prefer no new TS spawn (helper read lives in Rust).

D-06 is structural: `launchDispatch.ts` `runDispatch` picks `game.launchWithoutSteam()` before `game.launch()`. Add a test and a comment naming D-06 only.

---

### `src/backend/storeManagers/steam/gameInstallDepot.ts` (install-end branch)

**Analog:** itself, lines 585-614. The `else if (isMac)` branch sets `deferredPoll.handoff` and records the pid in the caller (`runNativeDepotDownload`); generalise to all OSes (record writer + watch op) and make the `else` branch on non-Mac use the same record path. Do not delete the hold off-Mac before this lands (Pitfall 1: gate `hold_eligible` in `install_once.rs` ~198 by platform until wave B).

---

### `AdoptionNote.tsx` (component, async label) and `adoptionStatus.ts` (query + push)

**Analog (component):** `src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx`. Pattern: `useTranslation('gamelib')`, `useEffect` with a `cancelled` flag, `window.api.*` query on mount, re-read keyed on `useLibraryState((s) => s.libraryStatus.find(...)?.status)`, hooks before any early return, failures render nothing:
```tsx
const { t } = useTranslation('gamelib')
const libraryStatus = useLibraryState(
  (s) => s.libraryStatus.find((g) => g.appName === appName)?.status)
useEffect(() => { let cancelled = false; const run = async () => {
  const result = await window.api.getSteamUpdateInfo(appName)
  if (cancelled) return ... }; ...
```
Add the push listener (`steamAdoptionStatus {appName, pending, steamSignedIn, seq}`) validated like `handleSteamRequestNoticeSignal` (numeric appId regex, finite seq, newer-seq-wins).

**Analog (channel wiring):** `steamDirectLaunchVerdict`: `common/types/ipc/steam.ts`, `preload/api/steam.ts`, `sidecar/steamFlowRegistration.ts`, `src-tauri/src/ipc_contract.rs`, census tests (`ipcDomainCensus`, `flowRegistrationCensus`). Actions "Restart Steam now" and "Open Steam" are single-flight per app (reuse `launchFlights.singleFlightLaunch`).

---

### `GameStatus.tsx` / `MainButton.tsx` / refusal notice

**Analog:** `GameStatus.tsx` lines 200-211 is the branch to rework. Keep it only for the 1026 producer (Open Question 1), not for pending-adoption:
```tsx
if (hasCapability(runner, 'installManagedExternally') && is.installing &&
    statusContext === 'steam-waiting-for-restart') {
  return t('status.steamWaitingRestart', 'Restart Steam to finish')
}
```
Also touch `MainButton.tsx` ~205, `hooks/constants.ts` ~47, `hooks/hasStatus.ts`. Rewrite `MainButton.steamWaitingRestart.test.tsx`. For D-05 notice-with-action, extend the closed `REQUEST_KINDS` set in `frontend/state/SteamRequestNotice.ts` and render an optional action in `SteamEngineLaunchNotice`, gated on `getSteamDirectLaunchVerdict(...).applies`; or ship refuse-and-notify with a hook (Open Question 2, planner decides).

---

## Shared Patterns

### AppId validation and untrusted input
**Source:** `gamelib-steampoll/src/update.rs` `is_valid_app_id` (1-10 ASCII digits) and `hold.rs` `parse_record`.
**Apply to:** every new op, the helper argv, the hold drain. Paths come from the poll roots resolver, never op args.

### Helper path from host only
**Source:** `update.rs` line 71 `host.bridge_helper_path().filter(|p| Path::new(p).exists())`.
**Apply to:** the Rust app-state reader. Missing/failed -> typed unavailable (D-10).

### Single writer per store
`steam_restart_hold.json`: Rust only. `steam_pending_adoption.json` (`stores.ts:340-344`): TS only. D-12 migration uses Rust drain -> TS writes pending -> Rust discard (idempotent). No Rust reader of the TS store; TS pushes watch/unwatch ops.

### Idempotent event application
**Source:** `steamPollEventRegistration.ts` header lines 22-32 (seq guard, stale seq answered `applied: true`, only thrown apply answers `applied: false`).

### Logging
**Source:** same file header: channel, appId and kind only; never a SteamID, path, or title (T-28-04).

### Sidecar exit contract
No new TS timers/handles: restart wait uses unref'd clock timers (`macSteamAdoption.ts:296-300`); the watch lives in Rust.

### Fake-HOME rule for spawn tests
`createFakeHomeProfile()` for any TS spawn (see `probeMacSteamPid`); Rust tests use `ScriptedRunner`.

### Verify and gates
`npx prettier --check` scoped to written paths (check `--file-info` first). Keep `steamPollsPortComplete.test.ts` fixture directories (delete scenarios, not `timelines/`, `expected-ts/`, `divergences.json`). Rebuild helper (`pnpm build-steam-bridge`) and sidecar (`pnpm build:sidecar`) before live tests.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Windows/Linux evidence readers (HKCU `ActiveUser`, `connection_log.txt` `[Logged On`, `content_log.txt` "Loaded N apps" offset+count, `libraryfolders.vdf` `apps` map) inside `adoption.rs` | utility | file-I/O | No code reads these yet. Reuse `gamelib-steamfiles` `real_hkcu_dword` and `libraryfolders` reads; plain string scan of a capped log tail; rule specified in Open Question 3. |

## Metadata

**Analog search scope:** `native/steam-bridge/helper`, `src-tauri/crates/gamelib-steampoll/{src,tests}`, `src/backend/storeManagers/steam`, `src/backend/sidecar`, `src/frontend/screens/Game/GamePage/components`.
**Pattern extraction date:** 2026-11-17
