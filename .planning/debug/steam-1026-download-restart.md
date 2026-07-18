---
slug: steam-1026-download-restart
status: awaiting_human_verify
trigger: "OFF-path Steam downloads are misclassified as 'steam-waiting-for-restart' ('reopen Steam') and show NO download progress, because Steam's active-download StateFlags 1026 collides with GameLib's native-install handoff marker GAMELIB_HANDOFF_STATE_FLAGS=1026. In pollInstallOnce (src/backend/storeManagers/steam/library.ts:1280-1281), isWaitingForSteamRestart = result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS treats ANY ACF whose StateFlags is exactly 1026 as a GameLib finished-handoff waiting for a Steam restart. But Steam itself writes StateFlags 1026 (0x400|0x2 = update-running | update-required) during a NORMAL active download on the native-install-OFF path (steam://install handoff — Steam owns the download). CONFIRMED with live ACF data on the user's machine."
created: 2026-07-19
updated: 2026-07-19 (root cause confirmed from live ACF data before session start; awaiting fix design + apply)
related_quick: .planning/quick/260719-aog-steam-native-install-progress-polish-dow/260719-aog-PLAN.md
related_debug: .planning/debug/steam-install-slow-start.md
note: "Investigation was already completed collaboratively in the originating session (static read of pollInstallOnce + live ACF confirmation). This file is seeded with a CONFIRMED root cause; the session's job is to design the discriminator, add regression tests for BOTH paths, apply the fix, and verify — NOT to re-derive the cause from scratch."
---

# Debug: OFF-path Steam downloads show "reopen Steam" + no progress (StateFlags 1026 collision)

## Symptoms

- **Expected:** When a Steam game is actively downloading via the native-install-OFF path (`steam://install` handoff → Steam owns the download → GameLib's `pollInstallOnce` watches the ACF), GameLib shows live download progress on the card / downloads page (percent, and — after quick task 260719-aog — speed + ETA).
- **Actual:** For a game whose ACF `StateFlags` is exactly **1026**, GameLib shows the "reopen Steam" hint (`steam-waiting-for-restart`), greys out the install button, fires a "Restart Steam to finish installing" notification, and shows **NO progress at all** on the downloads page — even though Steam is open and actively downloading the game. The only signal the user gets is that the Install button is no longer available.
- **Discriminating observation (nails it):** A DIFFERENT game downloading at the same time showed "installing correctly" with progress. Live `appmanifest_*.acf` scan on the user's machine (macOS, `~/Library/Application Support/Steam/steamapps/`):
  - `appmanifest_1091500.acf` → StateFlags **1026** → broken ("reopen Steam", no progress)
  - `appmanifest_1295660.acf` → StateFlags **1026** → broken
  - `appmanifest_8930.acf`   → StateFlags **1042** → works ("installing correctly")
  - Both 1026 (`0x400|0x2`) and 1042 (`0x400|0x2|0x10`) are Steam ACTIVELY DOWNLOADING (both carry the `0x400` update-running bit). The `=== 1026` equality happens to catch Steam's 1026 downloads but misses its 1042 downloads — explaining why one game "worked" and the other didn't.
- **Error messages:** none — silent misclassification.
- **Timeline:** Introduced by Phase 21-16 (D-UAT-04), which added `isWaitingForSteamRestart = stateFlags === 1026` so the native-install-ON handoff manifest could surface a passive "restart Steam" hint. That check now also fires for Steam's own active downloads on the OFF path. Quick task 260719-aog (2026-07-19) added speed/ETA/paused polish to this same `pollInstallOnce` — it is DEAD CODE on the OFF path today because the 1026 branch diverts before the normal downloading emit is reached.
- **Reproduction:** `enableSteamNativeInstall` OFF. Click Install on a Steam game in GameLib → `steam://install` handoff → Steam downloads → while the ACF's `StateFlags` sits at exactly 1026, GameLib shows "reopen Steam" with no progress. Confirmed live (see above).

## Confirmed root cause

`GAMELIB_HANDOFF_STATE_FLAGS = 1026` (library.ts:1069) is NOT a unique GameLib-handoff signal. `StateFlags == 1026` (`0x400 | 0x2` = StateUpdateRunning | StateUpdateRequired) is a normal Steam **active-download** state. The equality check at library.ts:1280-1281 therefore reclassifies genuine Steam-owned OFF-path downloads as the native-ON "waiting for restart" handoff, hiding progress behind the restart hint.

## Fix direction (discriminator design — decide in-session)

The poller must distinguish:
- **GameLib finished handoff** (native-install-ON path only): GameLib already downloaded every depot itself and wrote StateFlags 1026 so Steam adopts + verifies the manifest on its next restart. Bytes are complete/frozen; Steam is NOT touching the manifest.
- **Steam mid-download 1026** (OFF path): Steam is actively downloading; `BytesDownloaded` advances across ticks toward `BytesToDownload`.

Candidate discriminators (session picks / combines):
1. **Install path/source** — the cleanest, edge-case-free option. Only the native-install-ON handoff path writes 1026 as a handoff. Track that provenance in `activePolls` / `startInstallPolling` (e.g. an `isNativeHandoff` flag set when the poll is started for a GameLib-written handoff manifest) so the 1026→waiting-for-restart interpretation applies ONLY to native-ON polls. OFF-path 1026 falls through to the normal downloading emit (percent/speed/eta).
2. **Advancing BytesDownloaded** — a poll whose `BytesDownloaded` advances across ticks is a live download, never "waiting for restart". Could gate `isWaitingForSteamRestart` on bytes NOT advancing. Note the cold-start edge: the very first tick has no prior baseline; must not flash the restart hint on tick 1 of an OFF-path download.

## Regression guards (do NOT break)

- **Phase 21-16 / D-UAT-04 native-ON handoff hint MUST still work:** after a genuine GameLib native-install-ON depot download completes and writes 1026, the "Restart Steam to finish" hint + notification must still fire. Add/keep a regression test for this exact path.
- **Never launch/focus/drive Steam** (T-21-16-02) — the fix stays observational.
- **Shared poller — bottle path (GAP-17-BOTTLE-PROGRESS):** `pollInstallOnce` also serves `source:'bottle'`. Its staged-fallback percent derivation must remain unregressed.
- **Quick task 260719-aog speed/ETA/paused logic** must stay intact; once the 1026 misclassification is fixed, that polish becomes LIVE on the OFF path (a nice validation the fix worked end-to-end).

## Scope fence

- Touch only the `pollInstallOnce` classification (library.ts) and, if the path/source discriminator is chosen, `startInstallPolling` + the `activePolls` entry / its callers that start a native-ON handoff poll vs an OFF-path poll.
- Do NOT alter the depot download / StateFlags-4-vs-1026 write logic in depot.ts, buildid threading, file-mode logic, or the single-flight guard (all Phase 23 territory).
- Do NOT regress GOG/Epic/Amazon.

## Current Focus

**CURRENT (2026-07-19) — Fix applied, self-verified, awaiting human hardware verification.**

Fix is committed to the working tree (not yet git-committed — pending explicit
commit step). All automated gates pass:
- `pnpm test src/backend/storeManagers/steam` — 16/16 suites, 677/677 tests.
- `pnpm exec tsc --noEmit` — 0 errors.
- `pnpm exec eslint` on touched files — 0 errors (pre-existing warnings only,
  confirmed identical on the unmodified baseline).
- A pre-existing, unrelated leaked-real-timer crash in the FULL steam suite
  run was confirmed present byte-for-byte on the unmodified baseline (via
  `git stash`) — not a regression from this fix.

- next_action: Present CHECKPOINT REACHED to the user for real-hardware
  verification (fresh OFF-path Steam install should show live progress
  instead of "reopen Steam"). Do NOT mark resolved until user confirms.

---

**PRIOR (2026-07-19) — Fix designed and confirmed against code; applying now.**

Traced all `startInstallPolling()` call sites in `src/backend/storeManagers/steam/games.ts`:
- Line 684 (`installBottleNative`'s legacy sibling — `tellBottledSteamToInstall` dispatch, native-install-OFF, bottle): Steam's bottled client owns the download. OFF path.
- Line 714 (`install()` — `steam://install` handoff, native-install-OFF, native root): Steam owns the download. OFF path. **This is the exact broken path from the live ACF proof.**
- Line 929/931 (`runNativeDepotDownload`, called only AFTER `downloadSteamDepots` in depot.ts has ALREADY finished downloading every depot — native-install-ON, either native or bottle root via `pollerSource`): GameLib wrote the 1026 manifest itself as a finished handoff; Steam has not touched it yet and won't until restart. This is the ONLY call site where "StateFlags 1026 == waiting for restart" is actually true.

Discriminator chosen: install-path/source provenance (Option 1 from the seed, the "cleanest, edge-case-free" one). NOT combining with a bytes-advancing guard — the existing regression test at library.test.ts:2391 explicitly requires "waiting-for-restart" to hold even when a poll's bytes are frozen at a non-complete value, and combining guards adds complexity the path discriminator alone doesn't need.

- reasoning_checkpoint:
  hypothesis: "isWaitingForSteamRestart should be true only when (a) StateFlags===1026 AND (b) this poll was started from the native-ON handoff call site (games.ts:929/931, after depot.ts's own download completed) — not from the OFF-path call sites (games.ts:684, 714) where Steam itself owns the download and 1026 is an ordinary Steam active-download state."
  confirming_evidence:
    - "Live ACF data (seeded): two actively-downloading Steam-owned games sat at StateFlags 1026 and were misclassified; a third at 1042 (also active, but !== 1026) was unaffected — proves the equality check alone is not a valid handoff signal."
    - "Direct read of games.ts:924-932 doc comment: '...same as the legacy steam://install path (D-07)... Start ACF polling so Steam's own verify/repair pass (which flips StateFlags 1026 -> 4) is reflected in the UI' — this is the ONLY call site reached after GameLib's OWN depot.ts download finishes; lines 684/714 are reached BEFORE any Steam-driven download starts (Steam does the downloading itself after that call)."
  falsification_test: "If a native-ON handoff poll (isNativeHandoff:true) at StateFlags 1026 stopped emitting 'steam-waiting-for-restart', or if an OFF-path poll (isNativeHandoff:false/default) at StateFlags 1026 still emitted it, the hypothesis would be wrong. Both directions are covered by new/updated unit tests below."
  fix_rationale: "Root cause is that GAMELIB_HANDOFF_STATE_FLAGS===1026 is necessary but not sufficient — it also requires the poll to have been started from the one call site where GameLib itself just finished the depot download. Tagging provenance at poll-start time (where the call site is unambiguous) and checking it at poll-tick time (where the ACF alone is ambiguous) fixes the root cause rather than patching a symptom (e.g. hiding progress differently, or guessing off bytes alone)."
  blind_spots: "Have not hardware-verified; relying on the seeded live ACF facts + static reads. Assumes no other call site starts a native-ON handoff poll outside games.ts (grep confirms only library.ts itself calls startInstallPolling internally never — confirmed only games.ts calls it)."

- test: Update `describe('pollInstallOnce()')` tests that call `startInstallPolling('730', 60000)` (bare number → defaults to non-handoff) or call `pollInstallOnce` with no active poll at all and assert 'steam-waiting-for-restart' at StateFlags 1026 — these were asserting the OLD (buggy) behavior and must be rewritten to explicitly register a native-ON handoff poll (`{ isNativeHandoff: true }`) first. Add NEW tests: (a) OFF-path poll (default, no isNativeHandoff) at StateFlags 1026 with advancing bytes across ticks emits normal 'installing' + progressUpdate percent, NOT 'steam-waiting-for-restart'; (b) native-ON handoff poll at 1026 with frozen bytes still emits 'steam-waiting-for-restart' + fire-once notification (Phase 21-16 regression, now explicit about provenance); (c) StateFlags 1042 unaffected either way; (d) bottle staged-fallback percent unchanged.
- expecting: After the fix, an OFF-path poll shows live progress/speed/eta (260719-aog) instead of "reopen Steam"; the native-ON handoff still shows the "reopen Steam" hint correctly.
- next_action: Apply the fix (PollOptions.isNativeHandoff, activePolls entry field, pollInstallOnce gate, games.ts call-site tagging), update/add the regression tests above, run steam suite + tsc + eslint, then request human hardware checkpoint.
- tdd_checkpoint:

## Evidence

- timestamp: 2026-07-19 — Live ACF scan on user's macOS machine confirmed StateFlags 1026 games broken (no progress, "reopen Steam") while a StateFlags 1042 game downloaded with correct progress; both actively downloading. Static read of pollInstallOnce (library.ts:1254-1400) confirmed the 1026 equality branch (line 1280) short-circuits to the `steam-waiting-for-restart` context (line 1313) and only emits progressUpdate when `denominator > 0` (line 1384), so an early download with unpopulated BytesToDownload shows nothing at all.
- timestamp: 2026-07-19 — Traced every `startInstallPolling()` call site in games.ts: line 684 (legacy bottle `tellBottledSteamToInstall`, OFF), line 714 (`steam://install` handoff, OFF — the exact broken path), line 929/931 (`runNativeDepotDownload`, reached only AFTER `downloadSteamDepots` already finished — native-ON handoff, the ONLY place 1026 genuinely means "waiting for restart"). No other call sites exist (grep confirmed startInstallPolling is only imported/called from games.ts).
- timestamp: 2026-07-19 — Applied fix: added `isNativeHandoff` to `PollOptions` and the `activePolls` entry shape (library.ts); gated `isWaitingForSteamRestart` on `result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS && poll?.isNativeHandoff === true`; tagged games.ts:929/931 (the native-ON handoff call sites) with `isNativeHandoff: true`, left games.ts:684/714 (OFF-path call sites) untouched (default false).
- timestamp: 2026-07-19 — Updated 3 pre-existing library.test.ts tests that asserted the OLD "bare StateFlags===1026 == waiting-for-restart" behavior (lines ~2391, ~2503, ~2540) to explicitly register a native-ON handoff poll (`{ isNativeHandoff: true }`) first — these were testing the buggy behavior and needed to assert the corrected, provenance-gated behavior instead. Updated 2 games.test.ts assertions (the plain-native and bottle-native "opt-in ON" install tests) to expect `{ isNativeHandoff: true }` in the startInstallPolling call.
- timestamp: 2026-07-19 — Added 4 new regression tests to library.test.ts's `describe('pollInstallOnce()')`: OFF-path 1026 poll with advancing bytes emits live 'installing' progress and NEVER 'steam-waiting-for-restart'/notification; OFF-path 1026 poll's cold-start tick (no prior baseline) never flashes the restart hint; StateFlags 1042 unaffected either way; OFF-path poll never fires the restart notification even while frozen at 1026 across multiple ticks.
- timestamp: 2026-07-19 — Ran `pnpm test src/backend/storeManagers/steam`: 16/16 suites, 677/677 tests passed. `pnpm exec tsc --noEmit`: 0 errors. `pnpm exec eslint` on the 4 touched files: 0 errors, only pre-existing warnings (confirmed byte-for-byte identical via `git stash` baseline comparison — vdf.parse `any` types, i18next `t` import caution, unrelated `require-await` methods). A leaked-real-timer crash in the FULL steam suite run (`readAcfState` hit inside a stale, un-cleaned-up real `setInterval` after a later test file's mocks reset `getSteamLibraries`) was reproduced identically on the unmodified baseline — pre-existing, unrelated to this fix, does not affect pass/fail counts.

## Eliminated

(none yet)

## Resolution

root_cause: |
  `GAMELIB_HANDOFF_STATE_FLAGS === 1026` (library.ts) was used as the sole
  signal for "GameLib finished a native-install-ON handoff, waiting for a
  Steam restart to adopt it". But StateFlags 1026 (0x400 update-running |
  0x2 update-required) is ALSO an ordinary Steam active-download state on
  the native-install-OFF path, where Steam itself owns the download
  (steam://install handoff, or the legacy bottled-client
  tellBottledSteamToInstall dispatch). The equality check alone cannot
  distinguish the two — confirmed via live ACF: two Steam-owned OFF-path
  downloads sat at 1026 and were misclassified (progress hidden behind
  "reopen Steam"), while a third at 1042 (also active, but !== 1026) was
  unaffected.
fix: |
  Added `isNativeHandoff` provenance tracking to the install-poll registry
  (`activePolls`, `PollOptions` in library.ts) — true ONLY for a poll
  started immediately after GameLib's own depot.ts download has already
  finished (games.ts's `runNativeDepotDownload`, the native-install-ON path,
  both plain-native and bottle-native — the two call sites at games.ts
  lines ~929/931). `pollInstallOnce`'s `isWaitingForSteamRestart` now
  requires BOTH `stateFlags === 1026` AND `poll?.isNativeHandoff === true`.
  Every OFF-path `startInstallPolling` call (steam://install handoff at
  games.ts line ~714, legacy `tellBottledSteamToInstall` at line ~684)
  leaves `isNativeHandoff` at its default `false`, so a 1026 manifest on
  those polls now falls through to the normal 'installing' status +
  progressUpdate (percent/speed/eta from quick task 260719-aog), instead of
  the static "reopen Steam" hint.
verification: |
  Self-verified (automated): `pnpm test src/backend/storeManagers/steam` —
  16/16 suites, 677/677 tests passed (includes 4 new regression tests, and 5
  pre-existing tests updated to assert the corrected provenance-gated
  behavior instead of the old buggy bare-1026 behavior). `pnpm exec tsc
  --noEmit` — 0 errors. `pnpm exec eslint` on touched files — 0 errors
  (pre-existing warnings only, confirmed identical on the unmodified
  baseline). HUMAN HARDWARE VERIFICATION STILL OUTSTANDING — cannot
  self-verify that a fresh OFF-path install shows live progress instead of
  "reopen Steam" on the user's real machine; awaiting human checkpoint
  confirmation before marking resolved.
files_changed:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
