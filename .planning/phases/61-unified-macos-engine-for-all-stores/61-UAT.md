---
status: complete
phase: 61-unified-macos-engine-for-all-stores
source: [61-20-PLAN.md]
---

# Phase 61 UAT: Unified macOS engine for all stores

## How to run

- Normal start: `pnpm tauri:dev`.
- Expire the trial: `sandbox-exec -f .planning/spikes/060-crossover-trial-expiry/nolicence.sb pnpm tauri:dev`.
- Hide CrossOver: `sandbox-exec -f .planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb pnpm tauri:dev`.
- `tauri dev` does not rebuild the sidecar: restart dev after backend changes and confirm the mtime of `build/main/sidecar.js` is newer than the last change (`ls -l build/main/sidecar.js`).
- Deadline branch: armed (z-path). Copied from `.planning/spikes/068-nonsteam-first-match-signal/verdict.json` (matchShape `z-path`) and 61-16-SUMMARY.md. Caveat: the live spike evidence was a GPTK launch, so CrossOver non-Steam launches are confirmed only synthetically, and bare-basename launches get no deadline.
- Quit any running game before switching profiles.
- Record the licence mtime before starting and again at the end; it must be unchanged: `ls -la ~/Library/Preferences/com.codeweavers.CrossOver.license`.
- Backdate only a throwaway per-game bottle (the one made in item 4) with `.planning/spikes/060-crossover-trial-expiry/backdate.py`, and back up its `system.reg` first.
- Nothing here renames, moves or edits /Applications/CrossOver.app or the licence file.
- Known gaps going in: the install dialogs were never rendered in tests, so item 4 is their first on-screen check; the per-game bottle name is capped at 64 characters.

## Tests

### 1. Legacy shared-bottle game unchanged

expected: (D-02, D-05, D-08) An existing Epic or GOG game in the `GameLib` bottle launches as before; its Wine tab shows the Engine control on Automatic (derived); its `GamesConfig/<appName>.json` bytes are unchanged after the launch (`shasum` before and after).
result: skipped. No subject: there is no Epic/GOG Windows game in the shared `GameLib` bottle. That bottle no longer exists in CrossOver/Bottles, and the configs naming it belong to Steam apps. The only non-Steam Windows game is GOG Bloody Hell, which is on GPTK with its own prefix.

### 2. Engine control on a non-Steam game

expected: (D-10, D-11) The Wine tab shows the hint and one Engine select with Automatic, CrossOver, both pins and installed Wine Manager Wine-Staging builds; no Wine Version selector, no bottle picker; the prefix field is hidden for a bottle-backed game.
result: pass. Bloody Hell's Wine tab shows the hint and one Engine select (Automatic, CrossOver, pins, Wine-Staging builds), with no Wine Version selector and no bottle picker. The prefix field is shown, which is correct for a plain or legacy prefix.

### 3. Legacy game

expected: (D-07, D-14, D-15) A game previously on GPTK/toolkit or proton (GOG "Bloody Hell" is on GPTK wine64) shows "Legacy: <name>" selected with the Unsupported warning, and the game page shows the "Unsupported engine" badge right after the update; switching to Automatic removes the Legacy entry.
result: issue (minor). Covered: the "Unsupported engine" badge, "Legacy: <GPTK>" selected with the Unsupported warning, and switching to Automatic removes the Legacy entry (pass). The gap: switching a Legacy game (prefixKind 'legacy', which has a winePrefix) to Automatic showed NO "Move this game to its own bottle?" warning. The config got `engineOverride: automatic` with `wineCrossoverBottle` left ''. Cause: `needsFreshBottleConfirm` in src/frontend/screens/Settings/components/engineOverrideLogic.ts:48 returns true only for prefixKind === 'plain'. The backend still routed the game to a fresh per-game bottle (resolveGamePrefix case 4), so D-04's "warn that saves stay behind" is skipped for legacy games that have a prefix.
severity: minor

### 4. New install gets its own bottle

expected: (D-01, D-17) Install a small Epic, GOG, Amazon or sideloaded Windows game on macOS; the install dialog shows the Engine select (default Automatic) and no Wine/bottle picker; after install or first launch `~/Library/Application Support/CrossOver/Bottles/GameLib-<runner>-...` exists with `cxbottle.conf`.
result: pass. Epic "Trash Goblin" (legendary 54f7949350c949c6a2c47f12e7b15636): the install dialog showed the Engine select (default Automatic), with no Wine/bottle picker. Bottle `GameLib-legendary-54f7949350c949c6a2c47f12e7b15636` was created. Launch log: `engine=crossover build=26.3.0.39832 reason=cx-healthy` and `Using CrossOver Bottle "GameLib-legendary-…"`.

### 5. Expired trial falls back

expected: (D-12, D-13) Under nolicence.sb with the item 4 bottle backdated past expiry, launching shows "CrossOver trial expired — using built-in engine", the "Built-in engine (best-effort)" badge, the launch log has `engine=pinned name="..." version=... reason=cx-expired`, and the game runs (Phase 59 carry-forward).
result: pass. Under nolicence.sb with the item 4 bottle backdated: the toast said fallback, the badge read "Built-in engine (best-effort)", and the game ran. Log: `demo-status probe … status=expired`, then `engine=pinned name="Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)" version=11.20 reason=cx-expired`.

### 6. Trial notice

expected: (D-12) The same bottle backdated to 5 days remaining shows the "5 days remaining" notice; at 10 days no notice (59 D-13: notice at 7 days or fewer).
result: pass. With the bottle set to "Demo version (5 days remaining)" (confirmed by `wine --demo-status`), the notice appeared and the launch was cx-healthy. At 10 days remaining there was no notice.

### 7. Hang shows "Game didn't start"

expected: (D-18) Deadline branch is armed (z-path): a game that hangs behind the expired nag is stopped after 180 s with "Game didn't start" and no retry (59 D-10/D-11). The launch log shows the deadline armed and, on a normal start, cancelled at first match. A CrossOver non-Steam launch is only synthetically confirmed, so note what the log shows.
result: pass (partial, accepted by the operator). Normal-start half verified live under real CrossOver for both Epic Trash Goblin (19:47:10, `gameProcessWatch: game process seen` then `launch deadline for key legendary:54f7… cancelled (first-match)`) and GOG Bloody Hell (20:01:38, `cancelled (first-match)` 14 s after launch). This closes spike 068's "CrossOver only synthetically confirmed" caveat for Epic and GOG. Hang half: not reproducible as written, because an expired bottle is detected up front and always falls back to the built-in engine (item 5), so the expired-nag hang no longer occurs. The 180 s fire path is covered by unit tests only. The operator declined a rigged hang.

### 8. Busy shared bottle refuses

expected: (D-16) With one game running in the `GameLib` bottle and CrossOver expired, launching a second game from that bottle shows the "Another game is running in this game's bottle" message and the first game keeps running; the same refusal applies to an engine switch.
result: skipped. No two non-Steam games share the `GameLib` bottle. Covered by unit tests.

### 9. Plain-prefix switch

expected: (D-04) A game on a plain winePrefix shows its matching override (no change on launch); choosing Automatic asks "Move this game to its own bottle?", Move creates a new per-game bottle on next launch, and the old prefix folder is untouched.
result: pass, apart from the item 3 dialog gap. After the item 3 switch, launching Bloody Hell created `GameLib-gog-1542190742` and ran it on CrossOver (`reason=cx-healthy`). The old `~/Games/GameLib/Prefixes/Bloody Hell` was untouched: 1638 files before and after, system.reg/user.reg mtimes unchanged at 16:26:35.

### 10. Global default

expected: (D-09, D-20) On macOS Settings > Defaults shows a global Engine control (Automatic, or the carried-over pick) and no Wine Version selector; a new install defaults to it. When the carried-over global pick is Legacy (global Wine set to GPTK/toolkit or proton before the update), the global control keeps showing "Legacy: <name>" after the install, the new non-Steam install's Engine select defaults to Automatic, and the installed game's Wine tab shows Automatic.
result: pass (D-20 case). Global Settings > Defaults shows "Legacy: Default Wine - Not Found" with the Unsupported warning and no Wine Version selector. Viewing it wrote nothing (global engineOverride still unset). Trash Goblin, installed under that Legacy global, got engineOverride `automatic`.

### 11. Steam regression

expected: (D-12) A Steam bridge title still shows its Engine control, overlay toggle and badge as before, and launches on CrossOver when healthy.
result: pass. Steam "Planet Crafter" (1284190) shows its badge, Engine control and overlay toggle as before. Log: `Engine: 1284190 uses engine=crossover build=26.3.0.39832 reason=cx-healthy`.

### 12. Linux/Windows unchanged

expected: (D-10) On this Mac a Linux-only or Windows-only settings path is not reachable; mark `skipped` with a note unless another machine is available.
result: skipped. Linux/Windows paths are not reachable on a Mac.

## Summary

total: 12
passed: 8
issues: 1
pending: 0
skipped: 3

Licence mtime `com.codeweavers.CrossOver.license`: Oct 22 19:57 before and after, unchanged. The throwaway bottle's InstallTime was restored to its original value after the tests.

## Gaps

### G-1. Legacy game with a prefix gets no "Move this game to its own bottle?" warning (item 3)

status: open
severity: minor
`needsFreshBottleConfirm` (src/frontend/screens/Settings/components/engineOverrideLogic.ts:48) returns true only for prefixKind === 'plain'. A Legacy game (prefixKind 'legacy') with a winePrefix switched to Automatic skips the D-04 warning that saves stay behind, yet the backend routes it to a fresh per-game bottle (resolveGamePrefix case 4). Item 9 confirmed the old prefix is left untouched.
