# Quick 261108-avs: Gate overlay desktop smoke tests Summary

Both overlay smoke suites (`overlayInputSmoke`, `overlayInputProbeSmoke`) now skip unless `GAMELIB_DESKTOP_SMOKE=1`, logging a console.warn naming the var; the launchctl probe is short-circuited when gated off.

## Changes
- `desktopSmoke` constant; `describeDarwin` = darwin && desktopSmoke, else `describe.skip` (beforeAll clang builds never run).
- `windowServer = desktopSmoke && hasWindowServer()`; no-window-server warn only when gated on.
- Header docs updated with run command.

## Verification
- Gated-off: `Tests: 16 skipped, 16 total`; per-file runs each emit the gate warning (7 and 9 skipped).
- Note: when both files run in one jest invocation with the default reporter, the console.warn lines are not displayed for fully skipped suites (jest quirk); they show per file or with a single file.
- tsc (tsconfig.meta.json), eslint, scoped prettier: pass.
- Not run with GAMELIB_DESKTOP_SMOKE=1 (cursor warp).

## Deviations
None.
