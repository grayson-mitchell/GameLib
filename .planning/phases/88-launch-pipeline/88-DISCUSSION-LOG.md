# Phase 88: Launch pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 88-launch-pipeline
**Areas discussed:** Where 88 ends vs managers, Game lifetime and quit, Golden trace oracle, Live gate across 3 OSes

---

## Where 88 ends vs managers

| Option | Description | Selected |
|--------|-------------|----------|
| Shared pipeline + spawn | Rust owns funnel, builders, wrappers, gamescope, known-fix env/overlays and the spawn; manager launch() stays TS via shims until 91/92 | ✓ |
| One Rust launch op per game | TS manager supplies runner-specific args only; pulls 91/92 logic into 88 | |
| Builders only | Rust builds argv/env, TS keeps spawning; conflicts with SC4 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port it, streaming shim | Rust owns every runner spawn; TS shim streams lines to onOutput until 91/92; commandRunner deleted in 88 | ✓ |
| Keep a slim TS runner until 91/92 | Only the launch spawn moves; SC4 amended | |

| Option | Description | Selected |
|--------|-------------|----------|
| All of it, bridge via shims | Known-fixes fully ported; bridge modules shimmed until 97 | ✓ |
| Launch-facing parts only | Reader/layering stays TS for the bridge until 97 | |

**User's choice:** the recommended option each time.

---

## Game lifetime and quit

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as before: ask, then kill | Same dialog; Yes kills the game tree via gamelib-proc; only crash survival changes | ✓ |
| Let games survive quit | Quit never kills a running game | |
| Ask with a choice | Dialog offers leave-running vs close-game | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing, as before | A surviving game shows as not running | |
| Re-adopt the running game | Boot finds surviving Game-class trees and shows them as Playing | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Status + playtime + after-script | pid + start-time record; Playing; playtime and after-script on exit; no log resume | ✓ |
| Status only | | |
| Defer to its own phase | | |

**Notes:** re-adoption was flagged as new capability beyond parity; the user kept it in 88.

---

## Golden trace oracle

| Option | Description | Selected |
|--------|-------------|----------|
| Pinned base env, full compare | Fixed synthetic base env; golden stores the full env | ✓ |
| Delta only | Store only added/changed variables | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inject platform, record anywhere | All targets recorded on one machine; Rust replays on three-OS CI | ✓ |
| Record each OS on its own CI leg | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-axis + pairwise | Every axis value, all toggle pairs, named incident scenarios | ✓ |
| Full cartesian | | |
| You decide | | |

---

## Live gate across 3 OSes

| Option | Description | Selected |
|--------|-------------|----------|
| Operator live check on all three | Real Windows and Linux machines | |
| macOS live, Win/Linux CI + Phase 99 | Golden replay + stub-game CI smoke; SC2 amended | ✓ |
| macOS + one other OS live | | |

macOS gate items selected (multi-select): native + CrossOver/Staging launch; single flight + quit; Force Quit survival + re-adopt; known fix + pre/post scripts (all four).

---

## Claude's Discretion

- Crate layout, sub-slice order, op names, streaming shim transport, per-launch record format,
  recorder/fixture format, pairwise generator, and anti-cheat coverage approach.

## Deferred Ideas

- Real-title Windows/Linux launch checks → Phase 99.
- Resuming log capture for a re-adopted game.
- Quirk fixes → individual todos.

## Plan-time split (2026-11-25) — planner recommendation, approved by the user (D-30, D-31)

Asked at `/gsd-plan-phase 88` after research. Approved: "Split into 4"; after-script on quit-kill: "Next boot".

**88 — Launch scaffolding and known fixes (~14 plans).** Wave 1 authoring plan, no code: `88-HUMAN-UAT.md` (four D-17 items), the `82-STATE-OWNERSHIP.md`/utils-inventory amendment in one pass (D-24 `pci_ids_*` and `info-caches:systemInfo`, D-28 rows, Q5 deferral rows — `online_monitor`, `connectivityNow`, `gamedetails` stay), each row targeted to its sub-phase; the SC2 wording for 88.3 (D-16). May run before 87 closes. Then a prerequisite plan whose automated check fails if any 87 gap code-plan SUMMARY is missing (87-61..87-67, 87-70; equivalently 87-68). Then: re-target the 13 `deletedBy: 88` schedule rows (the three `enginewine/tools.ts` rows go to 97, Q8); `launchPortComplete.test.ts` with a no-`GAMELIB_LAUNCH` describe and RED-first slice describes; `gamelib-launch`(+cli) and `gamelib-knownfix`(+cli) skeletons with CI `-p` wiring and `EXPECTED_LOCKFILE_CRATE_NAMES`; the shared `launchOracle` harness (reusing `engineWineOracle`, pinned base env D-12, injected platform/probes D-13, in-repo pairwise generator with coverage assertion and planted-gap self-test, `classes.json`); known-fix goldens and full port (reader/layering, `knownFixLaunch`, registry, `dllOverrides`, strict ustar overlay archive, overlay install, fetcher, report), native `getKnownFixes`/`getGamelibFixStatus`, async shims (deletedBy 91/92, 93, 97), one sync reader twin pinned by vectors (deletedBy 89/97); delete `knownFix*` TS.

**88.1 — Launch builders and prepare steps (~14 plans).** Builder vectors (`setupEnvVars` extensions over 87's `gamelib-wine` core, `setupWrapperEnvVars`, `setupWrappers` with shlex parity, gamescope with help-probe forms); `prepare_launch`/`prepare_wine_launch` traces across the pairwise matrix; anti-cheat at launch; `check_wine_before_launch`, `download_default_wine` (D-28); `isMacSonomaOrHigher`, `isEpicServiceOffline`, `removeQuoteIfNecessary`; system info + `pci_ids_*` into `gamelib-info` with native `getSystemInfo`/`copySystemInfoToClipboard`; async ripple of builder call sites (deletedBy 91/92). Deletes builder TS, `gamescopeCommand.ts`, `utils/systeminfo`, those `utils.ts` rows.

**88.2 — Command runner and game processes (~15 plans).** Runner goldens (70 `commandRunner` tests as named scenarios, eight-flag and PowerShell redaction, streamed transcripts, `runScriptForGame`, `spawnAsync`); `gamelib-proc` Windows `start_time`, non-kill-on-close Game job, stamp-checked `kill_game_tree`, orphan-harness arms on three legs (Q6); `call_runner` (Helper for runner commands, Game for launches), private capture file (D-29), abort by id, dedup, 50-chunk window delta; streaming shim (`runnerOutput`/`spawned` frames, `runner_kill`); launch variant of `run_wine_command` closing 87's three `deltas.json` entries; running-game registry (D-07) with `killTracked` shim; quit "game running" condition (D-27); `errorHandler`/`askForceUninstall` introduce the `ManagerHooks` transport (D-26) with `force_uninstall` first; Windows `GetCommandLineW` quoting cross-check incl. `.bat`/`.cmd`. Deletes `commandRunner.ts`; `spawnAsync.ts` becomes a scheduled shim.

**88.3 — Launch funnel, re-adoption and the live gate (~15 plans).** Funnel oracle (ordered event/log/store transcript of `runLaunchEventCallback`); Rust funnel over full `ManagerHooks`, starting with a stub long-hook tracer proving an hours-long invoke on `LONG_RUNNING_CHANNELS`; hand the live game to the exit watch on sidecar EOF; RAII single-flight (D-04), `launchEventCallback` shim, Steam dispatch join shim (deletedBy 90.2); Rust as single per-game log writer (D-29); playtime, `tsStore`, `runsForMe`; window raiser (shim deletedBy 96); re-adoption (0600 record, bounded Registrant-held boot task, "re-adopted" line, re-emit after `frontendReady`; semantics D-31); todos (D-29 resume todo; SIGKILL todo body updated, not closed); final deletion and survivor sweep incl. both oracle harnesses; stub-game smoke with single-flight join; clean-worktree proof, signed build, `88-HUMAN-UAT.md` run by a non-author plan.

**Carry into every sub-phase's must_haves.** Flagged assumption: SVC-03's spec-less edge probe is `unclassified`/unresolved; the D-14 matrix stands in for edge coverage. Prohibitions (descriptor-less): (1) no line 88 adds to gamelib.log carries a URL, query, header, token, account name or profile path; (2) no runner credential (the eight flags) appears unredacted; (3) a game's or script's env never gains or loses a variable vs the TS golden except documented `deltas.json` entries; (4) a graceful quit never ends or orphans a running game without the prompt, recorded as a behaviour change; (5) re-adoption and quit-kill never signal a process not proven by pid + start stamp; (6) the remote known-fix layer never carries tier-2 data and the tier-1 allow-list is never widened; (7) no golden diff carries a fix; no rollback flag or sidecar fallback. Threat IDs `T-88-NN`, `T-88.1-NN`, … unique across plans.
