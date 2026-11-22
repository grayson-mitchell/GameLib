---
phase: 86-pure-leaf-services
verified: 2026-11-23T00:00:00Z
status: gaps_found
score: 4/5 must-haves verified
covered_files:
  - ".planning/phases/86-pure-leaf-services/86-01-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-01-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-02-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-02-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-03-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-03-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-04-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-04-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-05-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-05-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-06-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-06-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-07-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-07-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-08-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-08-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-09-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-09-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-10-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-10-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-11-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-11-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-12-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-12-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-13-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-13-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-14-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-14-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-15-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-15-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-16-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-16-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-17-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-17-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-18-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-18-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-19-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-19-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-20-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-20-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-21-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-21-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-22-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-22-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-23-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-23-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-24-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-24-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-25-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-25-SUMMARY.md"
  - ".planning/phases/86-pure-leaf-services/86-26-PLAN.md"
  - ".planning/phases/86-pure-leaf-services/86-26-SUMMARY.md"
  - "src-tauri/crates/gamelib-info/src/lib.rs"
  - "src-tauri/crates/gamelib-info/src/recent.rs"
  - "src-tauri/crates/gamelib-info/src/umu.rs"
  - "src-tauri/src/info_dispatch.rs"
  - "src/backend/__tests__/infoPortComplete.test.ts"
  - "src/backend/__tests__/infoShimSchedule.test.ts"
  - "src/backend/gamedetails/dispatch.ts"
  - "src/backend/info/recentGames.ts"
  - "src/backend/info/wiki.ts"
  - "src/backend/launcher.ts"
  - "src/backend/shortcuts/nonesteamgame/nonesteamgame.ts"
  - "src/backend/utils.ts"
covered_digest: "v4:sha256:bd27d6ec569f249a2a9ae55ccf94b421faa888b6e97d4ac2836fb5b9cfd0c6f5"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps:
  - truth: "The ported services behave as before (goal: 'run in Rust and behave as before'), including on the launch, game-page and shortcut paths that call them through the rustInvoke shims"
    status: partial
    reason: "Three shim callers were not given the failure isolation the TS they replaced had. Before the port these calls were in-memory store reads/writes (addRecentGame, attachOverrides) or swallowed their own failures (getUmuId, getWikiGameInfo). Each is now a rustInvoke round trip that can reject (store write refused, :store-unavailable, :not-ready, 60 s transport timeout), and the callers do not catch it. CR-41 is the verified-critical one: the post-game callback aborts, so the card stays on 'playing', save sync is skipped, and a CLI no-GUI launch never exits. The other two shim callers of addRecentGame (steam/launchDispatch.ts, sideload/games.ts) already guard it, which shows the hazard was known and this site was missed."
    artifacts:
      - path: "src/backend/launcher.ts"
        issue: "L474 `await addRecentGame(deps, gameInfo)` unguarded in runLaunchEventCallback (CR-41, review severity critical)"
      - path: "src/backend/info/wiki.ts"
        issue: "getUmuId forwards a rejection; gog/games.ts:747, legendary/games.ts:1073, nile/games.ts:459 await it with no try/catch, so a store failure or timeout rejects launch() on Linux (WR-41). Network failures are swallowed in Rust (umu.rs:84), so only store/transport failures trigger it"
      - path: "src/backend/gamedetails/dispatch.ts"
        issue: "L113 `return (await attachOverrides(deps, tempGameInfo))` unguarded; game page getGameInfo rejects on a Rust round-trip failure (WR-42)"
      - path: "src/backend/shortcuts/nonesteamgame/nonesteamgame.ts"
        issue: "L260 `await getWikiGameInfo(deps, game)` unguarded; addNonSteamGame throws before the shortcut is written although the wiki data only supplies an optional Steam id (WR-42)"
    missing:
      - "try/catch + logWarning around `addRecentGame` at launcher.ts:474 (CR-41 fix is given verbatim in 86-REVIEW.md)"
      - "Best-effort handling for the umu id lookup (catch in the shim, or at the three launch() call sites) and an update of the shim-schedule test that pins 'one typed call' if it moves into the shim (WR-41)"
      - "Fallback to `tempGameInfo` on an attachOverrides rejection and `.catch(() => null)` on the non-Steam wiki lookup (WR-42)"
      - "Unit tests that make each Rust call reject and assert the flow still completes"
deferred: []
advisory: []
behavior_unverified_items: []
coincidental_reliance_items: []
human_verification: []
---

# Phase 86: Pure leaf services Verification Report

**Phase Goal:** The self-contained information and cache services run in Rust and behave as before.
**Requirement:** SVC-01 (the only ID declared by all 26 PLAN files; REQUIREMENTS-v0.11.md maps only SVC-01 to Phase 86; no orphans)
**Verified:** 2026-11-23
**Status:** gaps_found
**Re-verification:** No, initial verification

## Verdict in one paragraph

The port itself is real and proven: the seven slices (plus the deleted `images_cache`) run in the `gamelib-info` crate, every
TS source directory is gone, the delete gates and shim schedule pass, the goldens replay green on three OSes in CI and again
in my own run, and the signed-build live gate proves SC2 on real data (3 pass; the one `issue` is an upstream defect the TS
shared). What I could not accept is the phrase "behave as before" on the **failure path**: converting in-memory calls into
rustInvoke round trips introduced new rejections at four unguarded call sites, one of them on every game launch (CR-41). That
is one small gap, recorded below with its fix. Nothing else blocks.

## Goal Achievement

### Observable Truths (ROADMAP success criteria are the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Wiki game info, CrossOver index, store search and discounts, anti-cheat return the same results for the recorded fixtures as the TS did | VERIFIED | I ran `cargo test -p gamelib-info --features testing` at HEAD: unit 129 + golden_anticheat 12, golden_crossover 7, golden_discounts 13, golden_overrides 16, golden_recent 12, golden_steamgrid 13, golden_storeSearch 24, golden_umu 6, golden_wiki 11, golden_wiki_sources 8, http_replay 31, regex_vectors 5, secrets and the rest, all `0 failed`. CI run 45052890985 on 4e1af5463 recorded 364/363/364 per leg incl. 118 golden tests on ubuntu, windows and macos. Requests are pinned too (D-10) in the same suites. |
| SC2 | Recent games, overrides and the artwork caches read and write the existing files with no data change after upgrade | VERIFIED | Live gate item 4 (signed v0.12.0 installed over signed v0.11.0, identical designated requirement): `games.recent` sha256 `4c7eb5ac...` before and after, `game-overrides.json` sha256 `21aa549b...` before and after, 0 Keychain prompts, both keys found, `store boot ... 0 migrated`. Item 3 passed (SteamGridDB picker, SOMA launch moved to `games.recent[0]`, tray and Library updated without restart). `images_cache` was dead under Tauri and deleted (D-22). Caveat: the artwork-file half of item 4 is vacuous (override stores URLs, no file existed); recorded honestly in the UAT. |
| SC3 | Recorded fixtures exist for each previously untested slice before it is ported | VERIFIED | Commit order from `git log`: recent_games golden `37f4a1c61` (86-04) precedes Rust `604e8f425` (86-08); overrides and anticheat goldens `08580b312` (86-04) precede `d069e1a10`/`fb050d9b1` (86-10, 86-12). Fixture dirs `tests/fixtures/{golden,recorded,state}` exist; `fixtureRedaction.test.ts` is permanent. |
| SC4 | Each ported slice's TS and sidecar registrations are deleted (delete gate per slice passes) | VERIFIED | `src/backend/{wiki_game_info,crossover_index,storeSearch,anticheat,recent_games,game_overrides,steamgrid}` and `images_cache.ts` do not exist; `src/backend/discounts/` holds only `__tests__`. Survivors in `src/backend/info/` are exactly the six scheduled shims/resolvers. I ran `infoPortComplete.test.ts` + `infoShimSchedule.test.ts`: 2 suites, 237 tests, pass. Rust side registers the `info_*` native channels in `info_dispatch.rs`. |
| G | The ported services behave as before, including on the paths that call them | FAILED (partial) | Happy path, data files, keys and goldens: yes. Failure isolation: no. See Gaps. |

**Score:** 4/5 truths verified (0 present-but-behavior-unverified). The plan-level `must_haves` (26 plans) add no truth the above
does not cover; the artifact/key-link verifier flags nothing real (see Required Artifacts).

### Required Artifacts

`gsd_run query verify.artifacts` / `verify.key-links` over all 26 plans: 22 plans fully pass. The residue is explained and is not a gap:

| Plan | Reported | Reality |
|------|----------|---------|
| 86-04, 86-06, 86-07 | `oracle/recorder.ts`, `harness.ts`, `*.oracle.test.ts` not found; links to `src/backend/<slice>/*.ts` "not yet created" | Intentional. D-11 and 86-24 retire the TS oracle harness with its slice; the key-link targets are the TS sources the phase deleted. The goldens and recorded fixtures the oracle produced are committed and replayed by Rust. |
| 86-24 | `meta/genStoreTable.ts` "Missing pattern: store_cache/umu" | False negative. The EXTRA_ROWS are built from `['crossover_index', 'umu', 'wikigameinfo'].map(...)` (genStoreTable.ts:153); `src/common/types/ipc/storeTable.json` is unchanged at HEAD (`git diff --quiet` exit 0). |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `src/backend/info/*.ts` shims | `info_dispatch.rs` natives | `deps.requestRustInvoke(RUST_INFO_*)`, one typed call (D-06) | WIRED (schedule test pins it) |
| `recent::add` | renderer + tray | Rust `FrontendEmitter` + tray refresh (D-08) | WIRED; live item 3 observed tray, Library row and last played update without restart |
| `gamelib-info` caches | StoreHost files | `CacheView` over `gamelib-store`, no `std::fs` in `cache_view.rs` | WIRED (86-25 sweep: 0 hits; live item 4 `0 migrated`) |
| ITAD / SteamGridDB keys | Keychain | `SecretSource` over `keyring_dispatch`, slots unchanged; `-cli` has no keyring (`cargo tree ... | grep -c keyring` = 0) | WIRED; live: `info_secret_get ... outcome=found`, 0 prompts |
| `clearCache` (Settings button, version change) | `info_wiki_cache_clear` | `requestRustInvoke` passed by `registerShellFilesFlows` (HEAD handlers.ts:295) | WIRED |
| per-library sign-out `clearCache(library)` | `info_wiki_cache_clear` | `registerRunnerAuthFlows` is not passed `requestRustInvoke` | NOT WIRED, known/owed (see Warnings) |

### Data-Flow Trace (Level 4)

Wiki, ITAD, SteamGridDB, CrossOver and anticheat values come from recorded real HTTP responses through the Rust `Http` trait to the
op result; the goldens compare the Rust result with what the TS produced from the same responses, so a static return cannot pass.
Live gate item 1 and 2 confirm real data reaches the renderer (ARK, Ara and Alan Wake pages; 20 ITAD results with prices; GOG and
ITAD deals). Status: FLOWING.

### Behavioral Spot-Checks (run by me)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| delete gate + shim schedule | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/__tests__/infoPortComplete.test.ts src/backend/__tests__/infoShimSchedule.test.ts` | 2 suites, 237 tests passed | PASS |
| every golden replays at HEAD | `cd src-tauri && cargo test -p gamelib-info --features testing` | all binaries `0 failed` (golden_recent 12 now, 8 at CI time: quick bax added 4) | PASS |
| no TS source for ported slices | `ls src/backend/<7 dirs> images_cache.ts` | all absent | PASS |
| debt markers | grep TBD/FIXME/XXX/TODO/HACK/todo!() in gamelib-info, info_dispatch.rs, src/backend/info | none | PASS |
| CR-41 present | `sed -n 474p src/backend/launcher.ts` | `await addRecentGame(deps, gameInfo)` bare | CONFIRMED |

I did not re-run the full workspace suites; CI is the evidence for those (below).

### Probe Execution

No `probe-*.sh` is declared by the phase. Step 7c: not applicable.

### Regression gate and CI

CI on `4e1af5463` (contains every Phase 86 code commit): Test 45052890886 (1118 suites, 24152 tests), Rust test 45052890985 (ubuntu,
windows, macos), Code check, Lint, Supply-chain all success. I confirmed the Phase proof table in 86-VALIDATION.md: red items R1-R4
fixed (`dd7872126`, `1a58fe646`), R5 deferred. CI is a shallow clone so R5 does not show there. I did not re-run CI-scale suites.

Commits after `4e1af5463` that touch `src`/`src-tauri` and are not Phase 86: quick-261123-bax (recent-games cap), -bbi (refresh spin),
-9x9 (resetHeroic), `aacc9c11f` (PCGW query encoding); `49f03ab67` (quick-928, anticheat malformed-entry skip and lowercase lookup)
landed before 4e1af5463 and is inside the CI proof. See the next section.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| SVC-01 | 86-01 .. 86-26 (all 26 declare `[SVC-01]`) | Wiki game info, the CrossOver index, store search and discounts, anti-cheat info, recent games, per-game overrides and the artwork caches work as before | PARTIAL: ports, data and live gate satisfied; failure-path parity gap below | SC1-SC4 verified; gap G |

REQUIREMENTS-v0.11.md already shows `SVC-01 | Phase 86 | Complete` and the checkbox `[x]`. That was set before this
verification; it should be treated as premature until the gap closes. No other ID is mapped to Phase 86: no orphans.

### Does quick-261123-bax change what Phase 86 ported? Yes, deliberately

`6e44d4e64` makes `recent::add` truncate `games.recent` to 50 (`MAX_STORED`), by operator ruling 2026-11-23. The TS list was unbounded, and
D-03 had parked this as a pending quirk todo. Consequences, none a gap:

- It is an operator-approved departure, so it does not make "behave as before" unmet; it fixes a quirk the phase had copied on purpose.
- The `sixty-entry-list` golden is no longer a TS output; it was re-derived by hand (61 to 50), so that single case lost its TS-oracle strength. The other golden_recent cases still replay TS output.
- It does not trigger on upgrade: `list` and `remove` never trim, so SC2's "no data change after upgrade" holds. A profile like the operator's (52 entries) is trimmed at its next launch, a visible data change by design.
- The 4e1af5463 CI proof pre-dates bax; I re-ran `golden_recent` locally (12 pass). The live gate recorded 52 entries and so ran on the uncapped behaviour.
- The same holds for quick-928 (anticheat now skips malformed entries and lower-cases the lookup arg): deliberate, inside the CI proof, not a gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/launcher.ts` | 474 | unguarded `await` on a call that can now reject | BLOCKER (the gap) | launch lifecycle can stall |
| `src/backend/storeManagers/{gog,legendary,nile}/games.ts` | 747 / 1073 / 459 | unguarded `await getUmuId` | BLOCKER (same gap, Linux) | launch() rejects on a store failure |
| `src/backend/gamedetails/dispatch.ts`, `shortcuts/nonesteamgame/nonesteamgame.ts` | 113, 260 | unguarded Rust round trip for decoration | BLOCKER (same gap) | game page / shortcut fails whole |

No TBD/FIXME/XXX debt markers in files this phase added.

### Human Verification Required

None. Every behavior-dependent truth has a passing behavioral test or a recorded live observation. The live gate is already run
(86-HUMAN-UAT.md: items 2, 3, 4 pass; item 1 `issue`, adjudicated below).

## Decisions the orchestrator asked for

**1. UAT item 1 `issue` (GOG PCGamingWiki): not a gap.** The GOG page missed PCGamingWiki and HowLongToBeat because PCGamingWiki's
cargoquery answers `permissiondenied` (todo `2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md`). Evidence it is as before and
not a port regression: the TS recorded the same failure live during 86-06 (`recorded/wiki/live-gog-linux`), and the golden `live-gog-linux`
pins `fetchStatus.pcgamingwiki: error`; the todo says the Rust port "must reproduce the current behaviour". The one thing not observed
is the v0.11.0 page for Alan Wake (acknowledged in the UAT), but the TS-recorded golden is stronger evidence than a screenshot. The
Epic and Steam halves of item 1 passed. The text of the UAT item is not literally met and stays `issue`; the remedy is the todo's own
fix (a behaviour change, with re-recorded goldens), not a Phase 86 closure plan.

**2. CR-41, WR-41, WR-42: these are the gap.** They are real (I read launcher.ts:474, wiki.ts, dispatch.ts:113, nonesteamgame.ts:260
at HEAD), new in this phase (before it the calls could not reject or swallowed failures) and they are precisely "Rust-call rejection now
aborts a flow the TS tolerated". Triggers are failure-only (a refused store write such as a read-only newer `config.json`,
`:store-unavailable`, `:not-ready`, a 60 s transport timeout; network errors are still swallowed in `umu.rs`), so most users will not
see them, which is why this is one focused gap rather than a rework. I'd rate CR-41 a real blocker because it sits on every game launch
and the sibling call sites already guard it. It is a few lines plus tests; WR-41 and WR-42 should ride in the same closure plan. The
other 9 warnings and the infos in 86-REVIEW.md I did not treat as blockers (secrets cache staleness, ITAD index RMW, URL encoding, dev
vault races, fixtureRedaction floors, etc.): none contradicts a success criterion, and they should still be dispositioned.

**3. Sign-out wiki-cache clear (`registerRunnerAuthFlows` lacks `requestRustInvoke`): a minor behaviour difference, not a blocker.**
Before, `clearCache(library)` on a GOG/Nile/Legendary sign-out also emptied the wiki cache; now only the Settings "Clear cache" button
and the version-change path do (those pass `requestRustInvoke`), so per-library sign-out leaves the wiki data in place. Wiki data is
public per-game data with a 30-day TTL, nothing account-scoped leaks, and `utils.ts:333-343` documents it as OWED. It can only be
finished once another session's `handlers.ts` edits are committed, so it is a tracked warning to fold into the closure plan, not a reason
by itself to fail the phase.

**4. R5 (stale `meta/i18nForkTouchedFiles.json`): not a goal gap.** It is a locally red A-17 test that CI's shallow clone skips; the
user deferred it. Track it, since the next local `pnpm test` run will be red.

## Warnings (non-blocking, track)

- `registerRunnerAuthFlows` not passed `requestRustInvoke` (item 3 above); inert `?: undefined` dependency members and exemption lists owed until `handlers.ts` is clean.
- R5 stale `meta/i18nForkTouchedFiles.json` (local A-17 red).
- The 86-REVIEW disposition lists all 42 findings `open`; CR-41 and WR-41/42 are folded into the gap, the rest need an owner.
- `REQUIREMENTS-v0.11.md` already marks SVC-01 Complete; revert or hold until the gap closes.
- Item 4's artwork-file half was vacuous (URL-only override), recorded in the UAT; the Windows `images`/steamgrid path proof is CI-only per D-16.
- Items 2's ownership badges were not separately observed (renders only for owned results).

## Gaps Summary

One concern, one root cause: the shims replaced in-memory or self-swallowing calls with rustInvoke round trips, and four callers
were not hardened for the new rejection. Closure is a small, test-backed plan: guard `addRecentGame` at launcher.ts:474, make the umu
id best-effort (Linux launch), fall back on an `attachOverrides` rejection, and catch the non-Steam wiki lookup, each with a test that
makes the Rust call reject. After that the phase goal holds and SVC-01 can stand as Complete. If the owner would rather accept the
edge-case risk, the way to do it is an explicit `overrides:` entry naming CR-41/WR-41/WR-42; I do not suggest one, because the fix is
cheaper than the justification.

---

_Verified: 2026-11-23_
_Verifier: Claude (gsd-verifier)_
