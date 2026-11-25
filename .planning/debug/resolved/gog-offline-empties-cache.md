---
status: resolved
trigger: "An offline launch empties the GOG library cache (gog_library.json, gog_api_info.json) — todo .planning/todos/pending/2026-11-22-gog-offline-launch-empties-library-cache.md"
created: 2026-11-22
updated: 2026-11-25
---

## Symptoms

expected: An offline launch with a populated GOG cache leaves store_cache/gog_library.json and gog_api_info.json byte-identical and shows the 10 cached GOG games.
actual: Renderer logs `No cache found, getting data from gog...`, calls refreshLibrary('gog'); every GOG fetch fails (8 × `Could not get game info for <id>`); the refresh still completes and writes its empty result — gog_library.json 10 games → 66 B, gog_api_info.json 104 KB → 66 B; library shows GOG 0.
errors: 8 × `Could not get game info for <id>` (offline / ENOTFOUND)
timeline: Found in Phase 85 live gate 85-20 launch 1 (2026-11-22, v0.11.0, Wi-Fi off). v0.10.0 baseline also logged `No cache found` with the 10-game file on disk (online, so it refetched unnoticed) — the "no cache" read is likely pre-existing, not a Phase 85 regression.
reproduction: Populated GOG cache, network off, launch GameLib. Evidence: /tmp/gamelib-gate-2026-11-22T03:38:53Z/ (launch1-gog_library.emptied.json, gamelib-launch-1.log, notes.log) and 85-20-SUMMARY.md item 3.

## Two parts

1. Why the renderer sees "no cache" when the file is populated (renderer read of GOG cache comes back empty on both builds). Check the 85-16 Rust snapshot serves gog_library / gog_api_info to loadGOGLibrary.
2. A failed refresh must not overwrite a good cache: when every fetch fails, keep the existing cache and report the refresh as failed.

Done when: offline launch leaves both files byte-identical and shows cached games; a jest case covers "refresh with every fetch failing keeps the cache".

Starting points: src/frontend/state/libraryState.ts (refreshLibrary no-cache branch, ~line 632); src/backend/storeManagers/gog/library.ts (refresh writes the result even when every fetch failed).

## Current Focus

hypothesis: (confirmed) The version-change cache cleanup empties the GOG stores. Renderer HeroicVersion effect -> window.api.clearCache(false, true) -> sidecar clearCache() runs gog.apiInfoCache.clear() + gog.libraryStore.clear() + installInfoStore + achievementStore; offline, the following refreshLibrary('gog') cannot repopulate. refresh() was NOT the writer on launch 1.
reasoning_checkpoint:
  hypothesis: "An app version change makes the renderer send clearCache(false, true); the sidecar clears the GOG library and api-info stores unconditionally, and with the network off the refresh that follows cannot refill them, so the cache the user had is gone."
  confirming_evidence:
    - "launch-1 log: `Updated to a new version, cleaaning up the cache.` precedes the `Could not get game info` lines and `No cache found`; the same sequence is in the v0.10.0 baseline's first launch (online, so refetched)."
    - "the 66 B file is envelope-only (no `games` key, no `__timestamp`): exactly what Store.clear() leaves, and something refresh() never writes."
    - "offline refresh() returns at the isOnline() check before any fetch or write; no `Getting GOG library` line until the operator's online Refresh."
    - "RED test: offline clearCache(false, true) turned a seeded gog.libraryStore into [] ; GREEN once the version-change clear is deferred."
  falsification_test: "If the 66 B file were written by refresh(), the log would show `Getting GOG library` and the file would carry a `games` key; if the read path were broken, launches 2-8 on the same build would also log `No cache found`. Neither is the case."
  fix_rationale: "The wipe exists so the next refresh refetches; offline that refetch is impossible, so wiping is all cost. Deferring the version-change clear to runOnceWhenOnline leaves the cache alone while offline and does exactly the old thing once online. Status-based skipping would be wrong: the monitor starts as 'check-online' (isOnline() false) so an ordinary online launch racing the probe would lose its clear."
  blind_spots: "Live behavior not yet exercised (jest only). If the app quits before a connection returns the clear is skipped for that version (accepted: caches rebuild on the next online refresh; store schema versioning covers shape changes). Epic and Nile share the same handler and are deferred identically; not live-tested."
  candidate_causes:
    - "code: clearCache() clears library stores with no offline guard (confirmed)"
    - "environment: network off at the moment of the version-change clear (confirmed, the trigger)"
    - "data/config: localStorage last_version differs from the app version, so the clear fires (confirmed, the precondition)"
    - "code: renderer/Rust-snapshot read path returns empty for a populated file (eliminated)"
    - "code: refresh() persisting an all-failed result (not the launch-1 writer; real latent defect, fixed as the second cause)"
  and_gate: "yes. The loss needs the clear (version change) AND offline together; fix 1 breaks the conjunction. Separately, an online refresh with every per-game fetch failing could overwrite the cache; fix 2 covers that independent path."
test: live — offline launch after a version change leaves gog_library.json / gog_api_info.json byte-identical and shows the cached GOG games; back online the deferred clear runs and the library refetches.
expecting: shasum of both files identical before/after the offline launch; GOG shows its cached games; log has `Updated to a new version` but no `No cache found`.
next_action: none, resolved 2026-11-25 (live verified by the operator). Prepared 2026-11-23: sidecar build/main/sidecar.js (02:19) already carries the fix; pre-test copy of both cache files + before.sha in the session scratchpad gog-cache-backup/; read-only check script gog-offline-check.sh next to it. Steps: online launch, set localStorage last_version to '0.0.1' via the auto-opened devtools console, quit; Wi-Fi off; relaunch; run the script; Wi-Fi on.

## Evidence

- timestamp: 2026-11-22
  checked: gamelib-launch-1.log (v0.11.0, Wi-Fi off) line order 17:24:28-30
  found: `[Frontend] Updated to a new version, cleaaning up the cache.` (17:24:28) comes BEFORE the six `Could not get game info` lines and BEFORE `[Frontend] No cache found, getting data from gog...` (17:24:29). The strings come from src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx:71-72 (`window.api.clearCache(false, true)`), whose sidecar handler (shellFilesFlowRegistration.ts `clearCache`) calls utils.ts clearCache(deps, undefined, fromVersionChange=true) -> gog.apiInfoCache.clear(), gog.libraryStore.clear(), gog.installInfoStore.clear(), gog.achievementStore.clear() (+ legendary + nile caches).
  implication: The "no cache" is real and deliberate — the cache was emptied moments earlier by the version-change cleanup. It is not a read-path failure.

- timestamp: 2026-11-22
  checked: gamelib-old-after-p5.log (v0.10.0 baseline first launch, online)
  found: same sequence at 17:11:11-17:11:17: `Updated to a new version` -> `No cache found, getting data from gog...` -> `Getting GOG library` -> `Saved games data`. Online, so the refresh repopulated unnoticed.
  implication: explains the todo's "v0.10.0 also logged No cache found with the file on disk": same version-change wipe, healed by the online refetch. Pre-existing, not a Phase 85 regression.

- timestamp: 2026-11-22
  checked: launch1-gog_library.emptied.json (66 B) vs what refresh() writes
  found: the file is only `{"__internal__":{"gamelib":{"schemaVersion":3}}}` — no `games` key and no `__timestamp`. refresh() always sets `games` (at least [redist]) plus `__timestamp.games` when it writes; Store.clear() produces exactly the envelope-only file. gog_api_info.json 104202 B -> 66 B is likewise a clear().
  implication: the writer on this run was clearCache(), not refresh().

- timestamp: 2026-11-22
  checked: GOG refresh() control flow (src/backend/storeManagers/gog/library.ts 545-674) against launch-1 log
  found: offline, refresh() returns at `if (!this.deps.onlineMonitor.isOnline()) return` (line 566) BEFORE any fetch or write; the log has no `Getting GOG library` line until the operator's online Refresh at 17:28:12. The 8 `Could not get game info for <id>` lines are GOGGame.getGameInfo() (gog/games.ts:195) failing a libraryStore lookup on an already-cleared store (8 = the installed GOG games), NOT fetch failures as the todo assumed.
  implication: the todo's Part 2 premise ("every fetch failed, refresh wrote its empty result") does not describe launch 1.

- timestamp: 2026-11-22
  checked: gate launches 2-8 logs (version unchanged, populated file)
  found: no `Updated to a new version` and no `No cache found` line; gate notes record the library showing GOG games with the populated file; the renderer snapshot serves gog_library (store boot 105 opened, 0 read-only).
  implication: the 85-16 Rust snapshot / renderer CacheStore read path serves gog_library correctly. Part 1 (read-path hypothesis) is false.

- timestamp: 2026-11-22
  checked: GOG refresh() lines 577-649 for the online all-failed case
  found: when galaxy library returns entries but every getGamesdbData throws (5 retries each), the loop pushes nothing; gamesObjects stays [redist] and line 649 `libraryStore.set('games', gamesObjects)` persists it over the good cache; `apiInfoCache.commit()` also rewrites the cache file. A partial failure likewise silently drops each failed game.
  implication: a real, separate latent defect (matches the todo's Part 2 wording) even though it was not the writer in launch 1.

- timestamp: 2026-11-22
  checked: online_monitor.ts runOnceWhenOnline / status model
  found: initial status is 'check-online' (isOnline() false) until the first probe resolves; runOnceWhenOnline(cb) runs cb now if online, else on the next 'online' event. A plain `isOnline()` guard at clearCache time would therefore wrongly skip the clear on every ordinary online launch that races the probe.
  implication: the offline guard must defer (runOnceWhenOnline), not skip on isOnline()===false.

- timestamp: 2026-11-22
  checked: fix 1 RED/GREEN (src/backend/sidecar/__tests__/shellFilesFlows.test.ts, describe 'version-change clear waits for a connection')
  found: RED before: offline clearCache(false, true) emptied gog.libraryStore (Array [] instead of the seeded game). After wrapping the version-change clear in onlineMonitor.runOnceWhenOnline: 30/30 pass, incl. pins for online-immediate, clear-when-online-returns, and user-initiated clear still immediate offline.
  implication: fix 1 addresses the observed writer.

## Eliminated

- hypothesis: The renderer read of gog_library / gog_api_info comes back empty while the file is populated (85-16 Rust snapshot / CacheStore read path bug).
  evidence: launches 2-8 on the same v0.11.0 build read the populated file with no `No cache found` and show the GOG games; on launch 1 the file was already empty (clear()-shaped) by the time of the read.
  timestamp: 2026-11-22

- hypothesis: refresh() wrote the empty result in launch 1 (every fetch failed, refresh persisted it).
  evidence: offline refresh() returns before any fetch/write; no `Getting GOG library` log line; the 66 B envelope-only shape has no `games` key, which refresh() never writes.
  timestamp: 2026-11-22

## Resolution

root_cause: Two independent causes of the same loss. (1) PRIMARY, observed on launch 1: on a version change the renderer sends clearCache(false, true) and the sidecar's clearCache() empties gog.apiInfoCache / gog.libraryStore / installInfoStore / achievementStore unconditionally; offline, the refreshLibrary('gog') that follows cannot refill them, so gog_library.json went 10 games -> 66 B and gog_api_info.json 104 KB -> 66 B. The "no cache" log was the clear working, not a read-path fault (the read path is fine: launches 2-8 read the populated file). (2) LATENT, same todo's Part 2: GOG refresh() persisted whatever it assembled from the fetches that worked, so an online refresh whose per-game fetches all failed wrote [redist] over the cached library (and a partial failure dropped each failed game). The todo's account (refresh wrote an empty result offline) does not match launch 1: offline refresh() returns before any fetch/write.
fix: (1) src/backend/sidecar/shellFilesFlowRegistration.ts: the version-change clearCache (args[1] === true) now runs through onlineMonitor.runOnceWhenOnline (immediately when already online, on the next 'online' otherwise; own try/catch since it runs after the handler returns); the user-initiated clear is unchanged. handlers.ts passes services.onlineMonitor. (2) src/backend/cache.ts: new CacheStore.discard() (leave in-memory mode without writing). src/backend/storeManagers/gog/library.ts refresh(): remembers the cached entries, a game whose fetch exhausts its retries keeps its cached entry, and when every fetch failed it logs `Could not get data for any of the N GOG games, keeping the cached library`, discards the apiInfoCache batch and returns without writing libraryStore.
verification:
  target_test: { result: pass, detail: "shellFilesFlows.test.ts 'version-change clear waits for a connection' (4 cases: offline keeps cache + no refresh; clears + refreshes once online returns; online clears at once; user-initiated clear still immediate offline); gog/library.test.ts 'refresh() keeps the cached library when per-game fetches fail' (4 cases); cache.test.ts discard() (2 cases). RED observed first: offline clear emptied the library; refresh wrote [redist] only / dropped the failed game; discard() undefined." }
  mutation_check: { result: skipped, reason_if_skipped: "no Stryker configured in this repo", mutant_killed: n/a }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, detail: "Fix 1 defers (not removes) the clear; fix 2 adds a guard plus per-game fallback. The offline skip is the RCA's point." }
  adjacent_tests: { result: pass, suites_run: ["src/backend/sidecar (all)", "src/backend/storeManagers/gog (all)", "src/backend/__tests__ (all)", "src/backend/stores (all)"], detail: "251 suites passed, 6132 tests, 5 pre-existing skips; tsc --noEmit clean; eslint --quiet clean on the 7 touched files; prettier --check clean" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, detail: "source files restored from HEAD (only my four were touched): 5 tests failed (1 shellFilesFlows offline, 2 cache discard, 2 gog library); reapplied: 69/69 pass" }
  guardrail_verdict: accepted
  live_verification: { result: pass, date: 2026-11-25, detail: "Operator, live pnpm tauri:dev. Pre-launch hashes taken with GameLib quit (gog_library.json 13756 B, gog_api_info.json 104359 B, mtime 17:14). Offline version-change launch 17:21:37: log `Updated to a new version` at 17:21:39, NO `No cache found` while offline, files untouched (next mtime 17:22:32, 5 s after `Connectivity: online` at 17:22:27); operator confirmed GOG showed its cached games offline (no cover art, separate pre-existing issue). On reconnect the deferred clear ran and GOG refetched (`Getting GOG library`, `Saved games data`), sizes back to 13756 / 104359. Online version-change run 17:24:45 refetched GOG and ended with its games." }
files_changed:
  - src/backend/sidecar/shellFilesFlowRegistration.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/cache.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - src/backend/__tests__/cache.test.ts

## Follow-ups (filed 2026-11-25, out of scope for this fix)

- Online version-change launch: the startup GOG refresh (17:24:46) starts before the renderer's version-change clear (17:24:47), so the clear empties gog_api_info.json (66 B) after the refresh filled it. Same timing before the fix (the online path is unchanged). Todo: 2026-11-25-version-change-clear-races-startup-gog-refresh.md
- On reconnect after an offline launch, `Getting GOG library` runs twice back to back (17:22:28 and 17:22:32). Todo: 2026-11-25-gog-double-refresh-on-reconnect.md
- Offline, library tiles show no cover art (art is remote). Todo: 2026-11-25-offline-library-shows-no-cover-art.md
- Code landed in 92d9c391a (committed as WIP by another session before Phase 87 execution); this archive closes it.
