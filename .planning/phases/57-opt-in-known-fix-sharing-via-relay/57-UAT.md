---
status: testing
phase: 57-opt-in-known-fix-sharing-via-relay
source: [57-12-PLAN.md]
started: 2026-11-02
---

# Phase 57 UAT: live done-when gate on this Mac

Precondition (read first). Turn Share detected game fixes ON before the first GameLib install of
title A. Title A and title B must each be 32-bit Mac titles with no entry in public/fixes/ or the
known-fixes repo steam/ folder (otherwise D-12 skips them), and neither may have been installed by
GameLib before (check: quit GameLib, then `find ~/Library -path '*store_cache/steam_metadata.json'`
and confirm the appId's entry has no `mac_arch` / `mac_arch_verified` keys). If only one such title
exists, reuse A for item 5 only after quitting GameLib, deleting the `mac_arch`, `mac_arch_source`
and `mac_arch_verified` keys from A's entry in that file, AND deleting the `steam_known_fix_reports`
store file (`find ~/Library -name 'steam_known_fix_reports*'`) - otherwise item 5 passes for the
wrong reason (sent record or guard, not the setting).

Title A appId: TBD (record when picked). Title B appId: TBD (record when picked).
Relay: https://gamelib-fix-relay.gamelib.workers.dev/v1/reports

Restart `pnpm tauri:dev` fresh first: a running dev session never picks up sidecar rebuilds.

## Tests

### 1. Toggle visible and off by default
expected: Share detected game fixes appears in General settings on this Mac with an (i) help icon on its label line, and is off by default.
result: pending

### 2. Setting ON, fresh install of title A sends a report
expected: With the toggle ON (and any `steam_known_fix_reports` store file deleted), a fresh install of title A logs `Known-fix report: sending appId <A> macArch=32 op=add` and `relay answered HTTP 201 (created)`.
result: pending

### 3. PR on known-fixes carries the correct file
expected: A PR exists on grayson-mitchell/known-fixes on branch report/steam-<A> whose steam/<A>-steam.json is `{ "title": <Steam name>, "macArch": "32" }` with 2-space JSON and a trailing newline, and whose body cites GameLib 0.8.0 and the Mach-O check. Record the PR URL here.
result: pending

### 4. Reinstall of A with setting ON does not re-report
expected: Uninstall and reinstall A with the setting still ON: no new `Known-fix report: sending` line and no new commit on the PR branch (steamMetadataStore guard, D-18).
result: pending

### 5. Setting OFF sends nothing
expected: Toggle OFF, fresh install of title B (or A after the full clear in the precondition): the log has the existing `formatMacArch32KnownFixEntry` line but no `Known-fix report: sending` line, and no branch report/steam-<B> appears on known-fixes.
result: pending
