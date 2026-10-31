# Phase 59 Wave 0 harness

Engine probes that close RESEARCH items A1-A5 before engine code depends on them (D-03, D-07, D-11).

## Safety rules

- Every engine call targets a clone inside a `mktemp -d` directory (`CX_BOTTLE_PATH="$WORK/Bottles"` for
  CrossOver, `WINEPREFIX="$WORK/Bottles/<name>"` for Staging). The directory is removed on exit.
- The user's real CrossOver Bottles directory is only ever a `cp -c -R` (APFS clone) source for
  `GameLibSteamBridge-*` bottles. The harness aborts if the clone fails; it never falls back to a full copy.
- Nothing is written under `/Applications/CrossOver.app` or the CrossOver licence file.
- All wine output is capped (`head -c 1048576`), `WINEDEBUG=-all`, `MVK_CONFIG_LOG_LEVEL=0`, calls alarm-bounded.

## Real-profile arm

These are engine probes, not tests of GameLib code. They need the real CrossOver licence read, which is the
declared real-profile arm of the two-profile rule.

## Subcommands

- `./run-wave0.sh adopt` - D-03: Staging-made prefix + minimal `cxbottle.conf` accepted by CrossOver?
- `./run-wave0.sh dxvk` - D-07: DXVK backup (Staging) then restore (CrossOver) on a clone of a bridge bottle.
  Needs DXVK-macOS 1.10.3; set `DXVK_DIR=<dir containing x32 and x64>` if the GameLib tools dir has none.
- `./run-wave0.sh psmatch` - D-11: does a Staging-run process show a `C:\...` command line in `ps`?
- `./run-wave0.sh cleanup` - remove leftover `gl59-*` temp dirs.

Logs land in `logs/<subcommand>-<timestamp>.log`; each ends with its findings line(s).
