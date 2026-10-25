---
phase: 261025-rkj-bridge-first-launch-steam-shared-redists
reviewed: 2026-10-25T00:00:00Z
depth: quick
files_reviewed: 11
files_reviewed_list:
  - src/backend/storeManagers/steam/bridge/sharedRedists.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - public/fixes/284100-steam.json
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Quick 261025-rkj: Code Review Report

**Reviewed:** 2026-10-25
**Depth:** quick (pattern scan plus targeted reads of the focus areas)
**Files Reviewed:** 11
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope: diff 7278e637c..HEAD, excluding .planning/. The tokenizer, classifier, ledger and the
`downloadSharedRedistDepots` failed/skipped split are mostly sound. No failure path settles the
ledger: offline, appinfo throw, per-depot throw, download failure, timeout, non-success exit,
unsafe entry and ledger-write throw all either return early or set `failed`/`stop`/`anyFailed`.
`runBounded` unrefs and clears its timer on every path. The tests write only to per-test
`mkdtemp` dirs and only remove those dirs.

Main defects:
1. `.cmd` processes go through `cmd /c` with no metacharacter filtering, so the argv-only
   containment contract does not hold.
2. The spawned installer child is not unref'd, which breaks the sidecar exit contract the module
   header says it meets.
3. The shared cache uses two single-flight keys per depot (`script:` and `full:`), so the two
   downloads can write the same files at the same time.
4. 228980's `installdir` is not validated before it is used as the cache root.

## Critical Issues

### CR-01: `.cmd` installscript processes run through `cmd /c` with no metacharacter rejection, which breaks the T-rkj-02 containment

**File:** `src/backend/storeManagers/steam/bridge/sharedRedists.ts:323-355` (and `classifySharedRedist` 245-249, which accepts `.cmd` for `vcredist`)
**Issue:** `buildRedistProcessCommandParts` checks the process path with a prefix test and a
`..` test, then for `.cmd` returns `['cmd', '/c', procPath, ...args]`. Nothing rejects `& | < > ^ ( ) % ! "`.
Wine's argv-to-command-line step quotes `procPath` because the cache root contains spaces
(`Application Support`, `Steamworks Shared`). cmd.exe's `/c` rule removes the outer quotes when the
quoted text holds a special character or there are more than two quotes. So a process like
`%INSTALLDIR%\_CommonRedist\vcredist\2010\a & reg add HKCU\... /f & b.cmd`:
- passes `classifySharedRedist` (right prefix, no `..`, ends in `.cmd`), so it becomes an
  automatic `vcredist` with no opt-in;
- passes `contained()`;
- runs `reg add ...` (or anything else) in the bottle.

The same applies to a decoded `\"` in the path, and to `%VAR%` expansion. For kind `other`, args
go into `cmd` with no filtering at all. The function's doc says "Argv array only, never a shell
string". For `.cmd`, the argv is a shell string. Exploiting this needs bad 228980 depot content,
but this function exists to contain exactly that.
**Fix:** Reject cmd metacharacters in anything that reaches `cmd /c`, and drop `.cmd` from the
automatic `vcredist` class unless a measured script needs it:
```ts
const CMD_META = /[&|<>^()%!"]/
if (lowerProc.endsWith('.cmd')) {
  if (CMD_META.test(procPath) || args.some((a) => CMD_META.test(a))) return null
  return ['cmd', '/c', procPath, ...args]
}
// and for every kind: if (procPath.includes('"')) return null
```
Add a test with `a & evil.exe & b.cmd` and `a" & x "b.cmd` process entries, asserting `null`.

## Warnings

### WR-01: The installer child handle is never unref'd, so a hung or timed-out installer keeps the sidecar alive after stdin EOF

**File:** `src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts:21-27, 143-174`; `src/backend/launcher.ts:1539-1542`
**Issue:** The header says the sidecar exit contract holds ("every timer is unref'd"). But the
contract also covers child handles. `runWineCommand` spawns a child with piped stdout/stderr and no
`unref()`. After the 300 s timeout, `runBounded` returns but the child and its pipes stay
referenced. Quitting the app during a DXSETUP run, or after a timeout, means the sidecar does not
exit by drain until the installer exits, which can take unbounded time (T-rkj-09 accepts that the
installer is never killed). The convention notes that `smoke:sidecar` does not catch slow exit.
**Fix:** Have `runWineCommand` accept `onSpawn(child)` (or a `detachOnTimeout` option). On timeout,
call `child.unref()`, `child.stdout?.unref?.()` / `destroy()` and `child.stderr?.destroy()`.
Otherwise, correct the header to state the limit plainly and file a todo.

### WR-02: The `script:` and `full:` single-flight keys do not exclude each other, so concurrent launches of two games write the same depot files at once

**File:** `src/backend/storeManagers/steam/depot.ts:1310-1318, 1365-1381`
**Issue:** Single-flight works per key, but one depot has two keys. Suppose game A is in
`full:228983` (writing every file, including `installscript.vdf`). Game B then declares the same
depot, sees no index entry yet, and starts `script:228983`, which writes `installscript.vdf` into
the same `installRoot` at the same time. `downloadDepotFiles` runs reconcile and writes per file,
with no cross-run lock. Related problems:
- The index read-modify-write at 1378-1381 is not atomic across the `await`s (read, mkdir, write),
  so a concurrent finish can drop the other run's entry.
- Line 1329-1330 writes the stale local `index` copy back, not a fresh read, so it clobbers other
  runs' entries.
- A joined single-flight runs the first caller's closure, so it uses the first caller's
  `signal`/`downloadFiles`.
- One game can run an installer from the cache while another game re-downloads that depot after a
  GID bump.
**Fix:** Use one per-depot single-flight (`depot:${id}`) around the whole script-then-full sequence,
and re-check the index inside it. Always re-read the index before every write, at 1329 too. Write
it atomically (write to `index.json.tmp`, then `rename`).

### WR-03: The 228980 `config.installdir` is used as the cache root without validation

**File:** `src/backend/storeManagers/steam/depot.ts:1189-1192`
**Issue:** `resolve(opts.cacheSteamappsDir, 'common', installdir)` accepts any PICS string. An
absolute path, `..`, or a string with `"`/`%`/`&` moves the cache root, and so every installer path,
outside `sharedRedist/steamapps`. Through `toBottleWindowsPath` (which rejects only CR/LF/NUL),
those characters then reach `cmd /c` (see CR-01). The rest of the codebase rejects these shapes for
game installdirs (`sanitizeInstalldir` in `installLocation.ts:194`). This path skips that check.
**Fix:** Use `sanitizeInstalldir` (or the same denylist). On rejection, fall back to
`SHARED_REDIST_DEFAULT_INSTALLDIR`, then assert
`relative(resolve(cacheSteamappsDir,'common'), installRoot)` has no `..` and is not absolute.

### WR-04: A deterministic rejection or persistent installer failure never settles and costs every launch a CM round trip and up to 5 minutes

**File:** `src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts:292-299, 317-328, 362`
**Issue:** An entry that `buildRedistProcessCommandParts` rejects (unsafe, a fixed property of that
manifest GID) sets `anyFailed`, the same as a transient failure. So does an installer that always
exits non-zero under CrossOver. Neither case ever settles. Every later launch makes CM calls,
spawns `reg query`, and for a failing installer blocks the game launch for up to
`REDIST_PROCESS_TIMEOUT_MS`, with no backoff. `ledger.timedOut` is written (line 311) but never
read, so its data cannot drive a backoff.
**Fix:** Record policy rejections as a per-GID `rejected` ledger bucket that counts as settled for
that GID. Read `ledger.timedOut` and failure counts and skip an entry after N consecutive failures
for the same GID, with a log line.

### WR-05: `fromIndex` assumes a full cache, but only `installscript.vdf` is checked and the index is never cleared after installer failure

**File:** `src/backend/storeManagers/steam/depot.ts:1310, 1364`
**Issue:** When the GID matches and the script exists, the full download is skipped. If any other
cached file is missing or truncated (cleanup tools, an interrupted earlier write after the index
was written, a manual delete), the installer fails every launch (WR-04). Nothing removes the index
entry, so the cache never repairs itself.
**Fix:** Always run `download(entry, entry.files)`. `reconcilePartialState` already skips present,
sha1-verified files, so a warm cache costs only hashing. Or, when an installer fails, have the
runner drop the depot's index entry.

### WR-06: The awaited redist step has no cancellation path

**File:** `src/backend/storeManagers/steam/games.ts:3269-3277`; `sharedRedistInstall.ts:223-233`
**Issue:** `downloadSharedRedistDepots` accepts `signal`, but the runner never passes one, and the
launch awaits the whole step: downloads plus up to 300 s per installer. If the user stops the game
or quits while the status shows 'redist', nothing aborts the download or stops the loop.
**Fix:** Thread the launch's abort signal (or a per-appId `AbortController` that is aborted on stop)
into `installSteamBridgeSharedRedists`. Pass it to `downloadSharedRedistDepots` and check it
between entries.

## Info

### IN-01: A failed HasRunKey write still marks the entry done and settles

**File:** `src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts:331-351`
**Issue:** The header calls the registry mark authoritative. When `reg add` times out or fails, the
code only warns, then records `done` and can settle. The ledger and registry then disagree, and
anything that reads the HasRunKey, such as a real Steam client in the bottle or a user-run Steam,
would re-run the installer. A cosmetic risk only, since the installer itself succeeded.
**Fix:** Do not set `settled` when any mark write failed. Keep `done` so the installer is not
re-run.

### IN-02: Ledger keys collide for entries without a HasRunKey

**File:** `src/backend/storeManagers/steam/bridge/sharedRedists.ts:442-447`
**Issue:** Two opted-in `other` depots with the same entry name and no `HasRunKey` both map to
`|name`, so the second one is silently treated as done. Names containing `|` are ambiguous too.
**Fix:** Include the depot id in the key when `hasRunKey` is undefined.

### IN-03: The KV1 tokenizer does not handle `[$COND]` conditionals

**File:** `src/backend/storeManagers/steam/bridge/sharedRedists.ts:114-116, 132-136`
**Issue:** A bare `[$WIN64]` after a value is read as the next key, which shifts key/value pairing
for the rest of the block. The classifier's strict checks would mostly fall back to `other`, but
an opted-in script could be misread without any error.
**Fix:** After a value token, skip a following bare token that matches `/^\[.*\]$/`.

### IN-04: The ledger and the shared-redist index are written non-atomically

**File:** `src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts:129-136`; `depot.ts:1120-1128`
**Issue:** If the process crashes mid-`writeFile`, the JSON is torn. That is recoverable (the file
reads as empty, and the registry precheck saves the installers), but it costs a full re-evaluation.
**Fix:** Write to a temp file and `rename` it into place.

### IN-05: The test hard-codes a real `/tmp` path for `steamSupportPath`

**File:** `src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts:42-44`
**Issue:** It is safe today because `downloadSharedRedistDepots` is mocked, so nothing writes
there. But it is a fixed shared path outside the per-test `mkdtemp`. If the depot mock is ever
removed, the test writes to a real shared location.
**Fix:** Point the mock at a path under the per-test `mkdtemp` dir, or assert the mocked downloader
received `cacheSteamappsDir` without the test depending on it.

---

_Reviewed: 2026-10-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_

## Fix Report

**Fixed at:** 2026-10-25
**Fixer:** Claude (gsd-code-fixer), on branch `quick-261002-b63` directly (no worktree, as instructed)
**Scope:** CR-01, WR-01..WR-06, IN-01..IN-05. All 12 findings fixed, none skipped. IN-04 and IN-05 were optional and are done too.

| ID    | Commit      | Status                          |
| ----- | ----------- | ------------------------------- |
| CR-01 | `5b94fb9da` | fixed                           |
| WR-03 | `d227e7e5e` | fixed                           |
| WR-01 | `30dbbc3e2` | fixed: requires human verification (live sidecar exit not measured) |
| WR-02 | `af2e42702` | fixed: requires human verification (concurrency logic) |
| WR-05 | `63bc1016c` | fixed                           |
| WR-04 | `db379f50c` | fixed: requires human verification (backoff policy values) |
| WR-06 | `c433f130f` | partial: no launch signal exists at the call site |
| IN-01 | `87dc84c93` | fixed                           |
| IN-02 | `060931634` | fixed                           |
| IN-03 | `b471ae7a1` | fixed                           |
| IN-04 | `2a857a42e` | fixed (ledger); index half landed in `af2e42702` |
| IN-05 | `366810976` | fixed                           |

### CR-01
`hasCmdMetachar` (`& | < > ^ ( ) % ! @ "`) is checked in `buildRedistProcessCommandParts`:
- on the expanded path and every argument of a `.cmd`;
- on the install dir, for every kind;
- for a quote in any process path.

`classifySharedRedist` also returns `other` for an auto-kind process with any of these characters after the `%INSTALLDIR%` prefix. It stays data-driven: there is no depot-id table. `.cmd` stays in `vcredist`, because the measured 2015 and 2022 scripts need it. Spaces and `+` are not treated as metacharacters, so those scripts still build.

Tests cover the reviewer's `a & evil.exe & b.cmd` and `a" & x "b.cmd`, a `reg add` injection, each metacharacter in path, arg and install dir, a leftover `%VAR%`, and the classifier.

### WR-03
The 228980 `installdir` goes through `sanitizeInstalldir` plus the cmd-metacharacter check. On rejection it falls back to `Steamworks Shared` and logs a warning. After that, `relative(<cache>/common, installRoot)` is asserted to be non-empty, not `..`, and not absolute. Tests cover traversal, absolute path, separator, quote, `&`, `%`, blank and non-string.

### WR-01
`runWineCommand`'s `wait:false` path spawns with three `'pipe'` stdio streams and keeps neither the child nor the pipes unref'd. Each pipe is a `net.Socket` that libuv counts, and so is the process handle. The timeout race does nothing to them, so a hung installer held the loop open past stdin EOF.

The fix adds an opt-in `onSpawn(child)` to `WineCommandArgs`. It is called once, synchronously, after `spawn`. No other caller passes it, so their behaviour is unchanged.

`runBounded` passes `unrefWineChild`, which unrefs the process handle and its stdin, stdout and stderr pipes at spawn, not only on timeout. `unref()` does not stop `data` or `close`, and while the Rust peer is alive stdin keeps the loop open, so nothing changes in normal operation.

Not done:
- the timed-out child is still not killed (T-rkj-09 stands);
- the launcher's one-line `onSpawn?.(child)` call has no unit test (there is no `runWineCommand` harness); it is covered by typecheck only;
- the sidecar exiting promptly with an installer in flight was not measured live (`smoke:sidecar` cannot see slow exit).

### WR-02
The `script:`/`full:` single-flight keys are replaced by a FIFO lock per `(cache dir, depot)` around the whole script-then-full sequence:
- a waiter runs its own closure, with its own `signal` and `downloadFiles`;
- it re-reads the index inside the lock;
- every index change is a fresh read-modify-write under a separate index lock, written to a unique temp file and then renamed;
- the depot lock may take the index lock, never the reverse.

Tests cover no per-depot overlap, a waiter taking the fast path with its own closure, a waiter aborted while another caller holds the lock, and two concurrent index writers keeping both entries with no `.tmp` left behind.

Not addressed: one game can still run an installer out of the cache while another game re-downloads that depot after a GID bump. The lock covers the download phase only; the runner does not hold it while installers run.

### WR-05
Before the fast path, every regular manifest file must exist at its manifest size (symlinks must exist). Each file an installscript process names directly must also match its manifest SHA1. Hashing is limited to installer binaries, so a `.cmd`'s sibling payloads are checked by size only. On a mismatch, the depot's index entry is dropped and the full download runs again. Tests cover a deleted, truncated and same-size corrupted DXSETUP.exe, and a failed repair leaving no index entry. A mutation check (verification disabled) turned all 4 red.

### WR-04
New ledger buckets (all optional on read, so older ledgers still load):
- `failures`: per-GID consecutive-failure count;
- `rejected`: per-GID containment rejection.

Behaviour:
- **Rejected entry:** every process is built before any runs. If one is rejected, none run. The rejection is recorded against that GID, the entry is skipped while the GID matches, and it does not block settling. It appears in `settled.rejected` and is never put in `done`.
- **Failure (non-success exit, timeout or throw):** bumps the count, which resets on a GID change.
- **Backoff:** after 3 consecutive failures, or 2 when `timedOut` says the last one was a timeout, the entry is skipped with a warning for 72h after its last failure, then retried once. A skipped entry still blocks settling.
- **Success:** clears `failures`, `timedOut` and `rejected`.

Residual: a backed-off game still makes the CM round trip on every launch, because it is never settled. What it saves is the wine spawns and the 5-minute timeouts. The 3/2/72h values are policy choices, not measurements.

### WR-06
`installSteamBridgeSharedRedists(appId, settings, signal?)` passes the signal to `downloadSharedRedistDepots` and checks it before every entry. An aborted run never settles.

**No abort signal exists at the call site.** The bridge launch path in `games.ts` has none, and `stop()` cannot reach this step, because `bridgeLaunchBottles` is recorded only after it. The call site passes no signal and has a comment saying so. Stopping during `redist` still does not cancel the step. Fixing that needs a launch-scoped AbortController that `stop()` aborts, which is a behaviour change to `stop()` that needs a live gate.

A call that joins an in-flight run for the same appId shares the first caller's signal; this is documented.

### IN-01
If `reg add` fails or throws after a successful installer:
- the entry stays done, so the installer is not re-run;
- the entry is recorded in `markPending`, which blocks settling;
- later launches retry only the mark, and the bottle settles once it is written.

### IN-02
An entry without a HasRunKey is keyed `|<depotId>|<name>`. `%` and `|` inside a key part are percent-encoded. Keys with a HasRunKey keep their existing shape, so ledgers written before this change still match.

### IN-03
A `[...]` conditional on the same line is skipped:
- after a value;
- after a key, only when a `{` follows (so a bare `[x]` value is still read as the value).

Conditionals are not evaluated; every variant is kept in file order. A mutation check turned the 2 new conditional tests red.

### IN-04 / IN-05
- **IN-04:** the ledger is written via unique temp file + rename.
- **IN-05:** the test's `steamSupportPath` is now a getter over a per-test `mkdtemp` dir, which `afterEach` removes. The runner's `cacheSteamappsDir` is asserted to be under it.

### Verification
- `npx jest src/backend/storeManagers/steam src/backend/__tests__/knownFixes src/backend/__tests__/steamBridgeKnownFixes.test.ts`: 69 suites, 2645 tests, all pass.
- `pnpm codecheck`: clean.
- `eslint` on the 9 touched source/test files: 0 errors. The 60 warnings are all pre-existing, in `launcher.ts` (17) and `games.ts` (43); neither has a warning on a changed line.
- `npx prettier --check` scoped to the same 9 paths, each confirmed `"ignored": false` with `--file-info`: clean.
- `graphify update .`: run.

Test hygiene:
- every new test writes only under per-test `mkdtemp` dirs and removes only those;
- wine, the CM client and the network are mocked throughout;
- no test spawns a process.
