---
slug: cross-depot-collision-1026
status: awaiting_human_verify
trigger: "Action pending todo .planning/todos/pending/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md — unresolved cross-depot file collisions (XCOM 200510, depots 200522 vs 225341 under XEW/) leave a GameLib-direct install stuck at StateFlags=1026. Determine the real Steam client's winner rule (do not guess), implement it in resolveDepotPathCollisions (src/backend/storeManagers/steam/depot/pathCollisions.ts), and verify against the winning claim."
created: 2026-10-24
updated: 2026-10-24
source_todo: .planning/todos/pending/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md
related_todo: .planning/todos/pending/2026-10-23-bottled-route-restart-steam-to-finish-is-a-dead-end.md
related_debug: .planning/debug/resolved/steam-1026-download-restart.md (different defect — 1026 misclassification on the OFF path; not this one)
---

# Debug: cross-depot file collisions leave GameLib-direct install stuck at StateFlags=1026

## Symptoms

Prefilled from the source todo (which is the operator's record of two live reproductions); the operator was not re-asked.

- **Expected:** A GameLib-direct depot install of XCOM: Enemy Unknown (appId 200510, 9 depots, 9723 files) finishes, passes post-download structural re-verification, and is written as StateFlags=4 (installed, launchable).
- **Actual:** Post-download re-verification finds 11 of 9723 planned entries wrong-size, all under `XEW/` (Enemy Within expansion), and fails closed to StateFlags=1026. Tile stays on the downloading icon with "restart Steam to finish"; the game cannot be launched.
- **Error messages:** `downloadDepotFiles: appId=200510 post-download structural re-verification found 11 of 9723 planned entries damaged or missing — failing closed to StateFlags=1026 instead of an unproven StateFlags=4: "XEW\XComGame\CookedPCConsole\IpDrv.upk" wrong-size (expected=67223 found=67211) …` — correlates with `buildDepotPlan: UNRESOLVED cross-depot path collision ... claimed by depot(s) 200522,225341`.
- **Timeline:** Phase 51-19 live gate item 5 (2026-10-22, two consecutive installs at 21:13:11 and 21:25:23, same 11 files both times — deterministic, not network). Recurred 2026-10-23 (51-28, 51-UAT item 17) on the bottled-Steam route at 20:22:07; bottled Steam later adopted and repaired the files itself.
- **Reproduction:** Fresh Mac, packaged debug bundle, install XCOM 200510 through GameLib's own depot downloader. Files affected include `XEW\XComGame\CookedPCConsole\IpDrv.upk`, `XComGame.upk`, `Engine.upk`, `DefaultGame.ini` and others under `XEW\XComGame\...`. Base game `Binaries/Win32/XComGame.exe` unaffected.

## Known mechanism (from todo, unverified by this session)

`resolveDepotPathCollisions()` (`src/backend/storeManagers/steam/depot/pathCollisions.ts`) only resolves the directory-marker-vs-file shape (Fallout 2). For two real files claimed by different depots it deliberately logs `UNRESOLVED cross-depot path collision … no winner guessed` and leaves both in the plan. Last write wins on disk; verification against the other claim's size fails.

## Constraints

- **Do not guess the winner rule.** Determine how the real Steam client picks a winner when two depots of one app ship the same path. Candidates: depot order in the app's `depots` section; a language/DLC-specific depot overriding the base depot; the later manifest. Evidence sources: the depot manifests themselves (sizes/SHA per claim), PICS appinfo depot metadata (dlcappid, config/language, depotfromapp, shared install), the 2026-10-23 observation that bottled Steam repaired the files (on-disk bytes after a Steam repair vs each depot's manifest entry reveal which claim wins), and open-source reimplementations (SteamKit2 / DepotDownloader / steamcmd behaviour) where they document a rule.
- If the rule cannot be established from evidence, the fallback is: the verifier judges a collided path against the content actually written, not an arbitrary claim, so the install is not reported as damaged. Say plainly which of the two outcomes was achieved.
- Repo conventions apply (`Skill("gamelib-conventions")`): any spawned child process in `src/`/`meta/` tests uses `createFakeHomeProfile()`; run `npx prettier --check` over exact paths written.
- After code changes run `graphify update .`.
- Do not modify the bottled-route "Restart Steam to finish" dead-end — that is a separate todo.

## Current Focus

- hypothesis: (none yet)
- next_action: gather initial evidence — read pathCollisions.ts and its callers/verifier; find what depot metadata (order, dlcappid, language, manifest IDs) is available at plan time; look for any recorded XCOM 200510 manifests/logs/ACF in the repo, session scratchpads or the bridge bottle; research the Steam client's documented/observed collision rule
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- Bottled Steam repaired the install (files mtime 20:42, 2026-10-23). On disk, all 11 collided files (IpDrv, GuidCache, Startup, XComGame, Engine, Core, XComUIShell_SF, XComStrategyGame, GameFramework .upk; DefaultGame.ini, DefaultInput.ini) match depot 200522's claim sizes, not 225341's. So for this pair real Steam's winner is 200522.
- appinfo.vdf order: 225341.. precede 200522 (200522 last, as in the ACF InstalledDepots); 200522 is also lowest numeric id and has the later manifest gid. One pair cannot separate "last in appinfo order", "lowest id" and "later manifest". GameLib's plan loses appinfo order (JS Record numeric-key sorting), so the general rule cannot be implemented from evidence.

## Eliminated

- Language/DLC-specific override: both depots have dlcappid 225340, no language; not the discriminator.

## Resolution

- root_cause: resolveDepotPathCollisions leaves two real-file claims; last write wins and verifyStructuralIntegrity judged the file against every claim, so one always mismatched -> 1026.
- fix: FALLBACK outcome. verifyStructuralIntegrity (depot/reconcile.ts) passes a collided regular-file path iff the on-disk file is size+sha1 identical to one of the claims. No winner rule implemented.
- verification: new reconcile.test.ts cases (either claim passes; truncated/foreign content fails; non-collided unchanged); steam test dir 2115 pass.
- files_changed: src/backend/storeManagers/steam/depot/reconcile.ts, src/backend/storeManagers/steam/__tests__/reconcile.test.ts

## Follow-up: appinfo-order rule implemented (user decision)

- Where order is lost: steam-user's getProductInfo parses the PICS appinfo VDF text with kvparser into a plain JS object; integer-like keys enumerate in ascending numeric order, so 200522 sorts before 225341. The raw text only exists inside the ClientPICSProductInfoRequest response callback (EMsg 8903) and is discarded.
- Recovery: depot/appinfoOrder.ts `withAppInfoOrderCapture` temporarily taps client._send around the two getProductInfo calls in depot.ts (base app and DLC apps), reads the depot ids from the raw VDF text in textual order (`extractDepotOrder`), and restores _send afterwards. Plan entries now carry `ownerAppId` and `appinfoRank`.
- Rule (resolveDepotPathCollisions): for 2+ real-file claims on one path, if every claimant has a rank in the SAME owning app's appinfo, the later-ranked depot wins and the others' entries are dropped (logged as RESOLVED with winner, losers, rule); `droppedBytes` is returned and subtracted from totalBytes. Directory-vs-file (Fallout 2) logic is unchanged. Otherwise (missing rank, different owning apps, mixed shapes) the path stays UNRESOLVED and the reconcile.ts verifier fallback (size+sha1 matches any claim) applies. Resolved paths have one claim left, so they are verified strictly against the winner.
- Evidence check: bottle appinfo.vdf (binary, read-only) lists 225341 before 200522; the 11 repaired files on disk have 200522's sizes; tests use those 11 real collided entries and assert 200522 wins all, plus a case where appinfo order and numeric order disagree.
- LIMITS, stated plainly: one depot pair cannot distinguish "later in appinfo order", "lowest depot id" and "later manifest gid". The rule matches the only observation; it is not proven in general. A second collided title where these differ would settle it. Also unverified live: that the PICS text response orders depots the same as the local binary appinfo.vdf, and the capture has only been exercised against fakes (no live Steam run).
- files_changed (additional): depot/appinfoOrder.ts (new), depot/pathCollisions.ts, depot.ts, __tests__/pathCollisions.test.ts, __tests__/appinfoOrder.test.ts
