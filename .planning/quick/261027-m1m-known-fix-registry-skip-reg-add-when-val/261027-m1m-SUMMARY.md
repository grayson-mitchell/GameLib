# Quick 261027-m1m: skip known-fix reg add when value already set

Known-fix registry values already present in the prefix's system.reg/user.reg (same type and data) no longer spawn `reg add`, and a timed-out `reg add` child is now SIGKILLed.

## Commits
- dd0b27fd9: knownFixesRegistry.ts (parser, skip, kill, knownFixPrefixDir) + tests
- 2bd985685: Steam bridge passes `getBottleDir(...)` and forwards `onSpawn` + tests

## What changed
- `wineRegistryValueIsSet` returns true only on exact header/arch/section/name/type/data match; every doubt falls back to `reg add`. Parser wrapped in try/catch.
- `applyRegistryFixes(raw, ctx, run, prefixDir?)`: reads each .reg once per call, logs one info line per skipped (fix, view). `run` gained an optional 2nd arg `onSpawn`.
- On timeout, the captured child is killed with SIGKILL (only if exitCode/signalCode null) and a warning says "killed". `REGISTRY_FIX_TIMEOUT_MS` is still 15_000.
- `knownFixPrefixDir(gameSettings)` for the non-Steam path (proton -> `<prefix>/pfx`; wine/toolkit -> prefix; crossover -> bottle dir; else undefined). No static launcher or steam/bottle import added.

## Verification
- jest knownFixesRegistry.test.ts: 32/32 pass. steamBridgeKnownFixes.test.ts: 64/65 pass.
- `npx tsc --noEmit`: clean. `npx prettier --check` on all four files: clean.

## Deviations
- [Rule 3] The bridge "times out a never-settling call" test used fake timers; the new real async .reg read now precedes the timer, so it hung. Fixed with `doNotFake: ['setImmediate']` plus yields before advancing.

## Deferred / pre-existing
- `steamBridgeKnownFixes.test.ts` "bundled 63000 profile" fails: it asserts `public/fixes/63000-steam.json` does not exist, but that file is tracked in git. Unrelated to this change; not fixed.

## Live check: passed (operator, 2026-10-27)
After a `tauri dev` restart, the operator launched Unclaimed World (284100) three times (16:32:52, 16:33:25, 16:33:38). Each launch logged both "already set in system.reg, skipping reg add" lines (/reg:32 and /reg:64), ran no `reg add` Wine command, and saw the game process 1-2 s after the exe started. Before the fix, slow launches took 53-66 s from the exe start to the game process, after 15 s registry timeouts.
