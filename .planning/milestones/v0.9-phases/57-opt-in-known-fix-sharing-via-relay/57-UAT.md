---
status: complete
phase: 57-opt-in-known-fix-sharing-via-relay
source: [57-12-PLAN.md]
started: 2026-11-02
updated: 2026-11-02
---

# Phase 57 UAT: live done-when gate on this Mac

Precondition (read first). Turn Share detected game fixes ON before the first GameLib install of
title A. Title A and title B must each be 32-bit Mac titles with no entry in public/fixes/ or the
known-fixes repo steam/ folder (otherwise D-12 skips them), and neither may have been installed by
GameLib before. Check: quit GameLib, then `find ~/Library -path '*store_cache/steam_metadata.json'`
and confirm the appId's entry has no `mac_arch_verified` and no non-known-fix `mac_arch: '32'`. The
real gate (`verifyMacArchGroundTruth`, src/backend/storeManagers/steam/library.ts) skips only when
`mac_arch_verified` is true or `mac_arch` is '32' from a non-known-fix source. A
`mac_arch: 'unknown'|'64'` with `mac_arch_source: 'minos'` is library-sync metadata, not a prior
install, and does not disqualify a title. If only one such title exists, reuse A for item 5 only
after quitting GameLib, deleting the `mac_arch`, `mac_arch_source` and `mac_arch_verified` keys from
A's entry in that file, AND deleting the `steam_known_fix_reports` store file
(`find ~/Library -name 'steam_known_fix_reports*'`) - otherwise item 5 passes for the wrong reason
(sent record or guard, not the setting).

Title A appId: 98800 (Dungeons of Dredmor). Title B appId: 41500 (Torchlight).
Relay: https://gamelib-fix-relay.gamelib.workers.dev/v1/reports

Restart `pnpm tauri:dev` fresh first: a running dev session never picks up sidecar rebuilds.

## Tests

### 1. Toggle visible and off by default
expected: Share detected game fixes appears in General settings on this Mac with an (i) help icon on its label line, and is off by default.
result: pass - toggle present in General with the (i) on the label line, OFF by default (user confirmed during setup).

### 2. Setting ON, fresh install of title A sends a report
expected: With the toggle ON (and any `steam_known_fix_reports` store file deleted), a fresh install of title A logs `Known-fix report: sending appId <A> macArch=32 op=add` and `relay answered HTTP 201 (created)`.
result: pass - log 15:48:13 `verifyMacArchGroundTruth resolved appId 98800 to mac_arch '32'` and `Known-fix report: sending appId 98800 macArch=32 op=add (macho, GameLib 0.8.0)`; 15:48:20 `relay answered HTTP 201 (created)`. The first attempt at 15:42 was inconclusive because of a pre-existing Mach-O locator bug (picked DredmorSchema.xsd), fixed in c08346ded; the retest passed.

### 3. PR on known-fixes carries the correct file
expected: A PR exists on grayson-mitchell/known-fixes on branch report/steam-<A> whose steam/<A>-steam.json is `{ "title": <Steam name>, "macArch": "32" }` with 2-space JSON and a trailing newline, and whose body cites GameLib 0.8.0 and the Mach-O check. Record the PR URL here.
result: pass - https://github.com/grayson-mitchell/Known-Fixes/pull/1, branch report/steam-98800, only file steam/98800-steam.json = {title "Dungeons of Dredmor", macArch "32"}, 2-space indent and trailing newline; body cites GameLib 0.8.0 and the post-install Mach-O check, "Reports received: 1". Left open. A later commit 9bc5236 on that branch backfilled notes.macArch (operator-approved scope addition, see 57-12-SUMMARY.md).

### 4. Reinstall of A with setting ON does not re-report
expected: Uninstall and reinstall A with the setting still ON: no new `Known-fix report: sending` line and no new commit on the PR branch (steamMetadataStore guard, D-18).
result: pass - reinstall of 98800 finished 15:56:14 with the toggle ON: zero new `Known-fix report: sending` lines; branch head unchanged at 4261106a5 (02:48Z) at that time.

### 5. Setting OFF sends nothing
expected: Toggle OFF, fresh install of title B (or A after the full clear in the precondition): the log has the existing `formatMacArch32KnownFixEntry` line but no `Known-fix report: sending` line, and no branch report/steam-<B> appears on known-fixes.
result: pass - toggle OFF (config shareDetectedFixes:false), Torchlight 41500 installed 15:57:58: log has `Mach-O ground truth says appId 41500 is 32-bit...` and `resolved appId 41500 to mac_arch '32'`, no sending line; no report/steam-41500 branch or PR on known-fixes.
