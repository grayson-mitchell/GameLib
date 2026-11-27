# Phase 88.2 deferred items

## From 88.2-24

- `src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts` "ensureValveClient > rejects a symlink entry"
  fails on this macOS machine: the extraction step reports `unzip extraction failed` where the test expects the substring
  `regular file`. Not investigated further: `valveClient.ts` imports nothing 88.2-24 touched (no runner, utils or
  launcher), and the machine's `/usr/bin/unzip` is Apple's Info-ZIP 6.00 build, so it looks environmental. Out of scope;
  left alone.

## From 88.2-29

- `children::tests::terminate_all_sigkills_a_tokio_helpers_member_that_ignores_sigterm` (added in 88.2-28) failed once
  in about five runs of `cargo test -p gamelib-proc` on macOS, while the host was also compiling (`hard` was empty). Likely
  cause, not confirmed: `STUBBORN_GROUP` prints the member's pid (`echo $!`) before the subshell's `trap '' TERM` is in
  place, so under load SIGTERM can reach the member first and the group empties without a hard kill. Passes on every
  quiet re-run (3 of 3). A readiness line after the trap would remove the race. Not touched by 88.2-29 (no change to
  `terminate_all`); left alone.
- Resolved by the orchestrator before the 88.2-31 push: the member now prints its own pid (`echo $$`) after its
  `trap` and then `exec`s, so the line cannot arrive before SIGTERM is ignored. 6 of 6 runs green.

## From 88.2-30

- `src/backend/__tests__/quitTeardownWiring.test.ts` "C4b: gamelib-proc terminate_group is SIGTERM to the negated pgid ->
  bounded try_wait -> SIGKILL -> wait()" fails at HEAD, independent of 88.2-30 (that plan touches none of it).
  `loadKillTreeRsCode()` cuts `kill_tree.rs` at its first `    #[cfg(test)]`; 88.2-27 (`4ad3be901`) put one at line 429,
  before `pub fn terminate_group(` (line 509), so `extractBracedBlock` finds no marker. The pin should cut at the last
  `    #[cfg(test)]`. Not fixed here (scope boundary).
