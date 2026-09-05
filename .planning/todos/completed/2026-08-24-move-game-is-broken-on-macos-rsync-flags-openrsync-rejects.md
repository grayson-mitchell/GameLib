---
created: 2026-08-24T00:00:00.000Z
title: "Move Game is BROKEN on every modern macOS — `moveOnUnix` passes two rsync flags Apple's `openrsync` rejects, and the capability probe only checks that a binary EXISTS"
area: backend-utils
status: "RESOLVED 2026-09-05 by quick-260905-upz. moveOnUnix now probes rsync's capability
  (flavour), branches its flag list on openrsync vs GNU, and the mv-fallback/rsync success tests
  were both corrected to code === 0; a unit test pins the argv per flavour. Not claimed: the
  openrsync branch has not been exercised live on macOS in this session, so this closes on code,
  not on an observed move. Same root cause and fix as
  2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md."
discharged: 2026-09-05
discharged_by: quick-260905-upz
severity: major
files:
  - src/backend/utils.ts
---

## Observed

Found by the operator on 2026-08-24 driving **step 5 of `34.6-LIVE-GATE.md`** (`moveInstall`), on
commit `c13b9e398`, macOS 26.5.2 (build 25F84), moving Endless Sky (GOG `1829678475`, 419 MB).

An in-app error dialog appeared:

```
Error: Error Moving Game rsync: unrecognized option `--no-human-readable'
usage: rsync [-0468BCDEFHIKLOPRSTWVabcdghiklnopqrtuvxyz] ...
```

`gamelib.log` carries the full trace at 20:41:52:

```
[Gog]:     Moving Endless Sky to /Users/…/GameLib/GameLibMoveTestFixture
[Backend]: moving command: rsync --archive --compress --no-human-readable
           --remove-source-files --info=name,progress …
[Gog]:     Error moving Endless Sky to … rsync: unrecognized option `--no-human-readable'
[Backend]: Error while moving 1829678475 to … rsync: unrecognized option `--no-human-readable'
```

## Root cause

`src/backend/utils.ts:1204-1231` (`moveOnUnix`) decides whether to use rsync like this:

```ts
let rsyncExists = false
try {
  await execAsync('which rsync')
  rsyncExists = true
} catch (error) { logError(error, LogPrefix.Gog) }
if (rsyncExists) {
  await spawnAsync('rsync', [
    '--archive', '--compress', '--no-human-readable',
    '--remove-source-files', '--info=name,progress', origin, destination
  ], …)
```

**The probe tests EXISTENCE, not CAPABILITY.** On macOS `/usr/bin/rsync` exists, so `rsyncExists`
is true — but it is Apple's **`openrsync`**, not GNU/samba rsync:

```
$ /usr/bin/rsync --version
openrsync: protocol version 29
rsync version 2.6.9 compatible
```

Measured on this machine, **two of the five flags are rejected**:

| Flag | openrsync | Notes |
|---|---|---|
| `--archive` | OK | |
| `--compress` | OK | |
| `--no-human-readable` | **REJECTED** | the one that surfaced; rsync 3.x-only |
| `--remove-source-files` | OK | |
| `--info=name,progress` | **REJECTED** | rsync 3.1+-only; absent from openrsync's usage |

So fixing only `--no-human-readable` moves the failure to `--info=` on the very next run. Both must
be handled together.

`--info=name,progress` is also what drives the progress callback that feeds `currentFile` /
percent / ETA / bytes, so it is not a cosmetic flag — dropping it silently removes move progress
reporting.

## Why this is worse than it looks

The `else` branch immediately below is a **working fallback that is never reached on macOS**:

```ts
} else {
  const { code, stderr } = await spawnAsync('mv', ['-f', install_path, destination])
```

`mv -f` would have completed this same-volume move instantly. The feature is broken not for lack of
a working path but because the probe chooses the wrong one.

Blast radius: every macOS user, for every runner — `moveOnUnix` is shared. Apple replaced GNU rsync
with openrsync as `/usr/bin/rsync`; any Mac without a Homebrew rsync earlier on `PATH` hits this.
A developer machine with `brew install rsync` would MASK it entirely, which is a plausible reason
it has gone unnoticed.

## Secondary defect in the fallback itself

The `mv` arm reads:

```ts
if (code !== 1) { return { status: 'done', installPath: destination } }
```

Any exit code other than exactly `1` — including `2`, `127` (command not found), or a signal-derived
code — is reported as **success**. If the fallback ever does start being used, a failed `mv` will
report a completed move and the library will record an install path that holds nothing. Fix this in
the same pass; do not leave it as the newly-live path.

## Suggested fix

1. Replace the existence probe with a **capability** probe — run the candidate binary once and check
   it accepts the flags (or detect the `openrsync` banner explicitly), rather than trusting `which`.
2. On openrsync, either drop to a supported flag set (`--archive --compress --remove-source-files`
   plus `--progress`/`--out-format=` for progress, both of which openrsync DOES list) or take the
   `mv -f` fallback. If progress reporting is dropped, say so in the log rather than silently
   losing it.
3. Fix the `code !== 1` success test in the `mv` arm before that arm becomes reachable.
4. Add a unit test pinning the exact argv, so a future flag addition cannot silently re-break a
   platform nobody runs the mover on in CI.

## What this does NOT indict

The `moveInstall` **IPC channel is fine** and this run proves it end-to-end: the invoke resolved,
`assertContainedPath` passed, the status update and notification fired, the GOG store manager was
reached, the real error propagated back, and the in-app error dialog rendered through
`showDialogBoxModalAuto`'s `sendFrontendMessage('showDialog')` path. Phase 34.6 ported this
correctly; the defect is in inherited `moveOnUnix` platform handling and predates the port.

Live-gate step 5 should record the CHANNEL as passing and this as a separate, real product defect.

## Notes

No `resolves_phase:` — not resolved by Phase 34.6 and must not be auto-closed by it.

Reaching this at all required the 60-second workaround from
[[2026-08-24-opendialog-is-missing-from-long-running-channels-so-every-file-picker-flow-dies-silently]],
which independently confirms that diagnosis: the identical gesture completed under the bound and
failed above it.

Related: [[upstream-port-verbatim-ships-silent-defects]] · [[live-gate-beats-green-suite-three-times]]

---

## Disposition (2026-09-05, quick-260905-upz) — DISCHARGED

### The observation

```
$ sed -n '1200,1245p' src/backend/utils.ts
  let rsyncFlavour: 'gnu' | 'openrsync' | null = null
  try {
    const { stdout } = await execAsync('rsync --version')
    rsyncFlavour = /openrsync/i.test(stdout) ? 'openrsync' : 'gnu'
  } catch (error) {
    logError(error, LogPrefix.Gog)
  }
  if (rsyncFlavour) {
    const origin = install_path + '/'
    const rsyncArgs =
      rsyncFlavour === 'openrsync'
        ? ['--archive', '--compress', '--remove-source-files', '--progress']
        : [
            '--archive',
            '--compress',
            '--no-human-readable',
            '--remove-source-files',
            '--info=name,progress'
          ]
    ...

$ grep -vE '^\s*(//|\*|/\*)' src/backend/utils.ts | grep -n "rsyncFlavour\|no-human-readable"
1057:  let rsyncFlavour: 'gnu' | 'openrsync' | null = null
1060:    rsyncFlavour = /openrsync/i.test(stdout) ? 'openrsync' : 'gnu'
1064:  if (rsyncFlavour) {
1067:      rsyncFlavour === 'openrsync'
1072:            '--no-human-readable',
1077:      `moving command (${rsyncFlavour}): rsync ${rsyncArgs.join(

$ grep -rn "moveOnUnix\|moveInstall" src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/gog/games.ts
src/backend/storeManagers/legendary/games.ts:19:  moveOnUnix,
src/backend/storeManagers/legendary/games.ts:359:    const moveImpl = isWindows ? moveOnWindows : moveOnUnix
src/backend/storeManagers/gog/games.ts:9:  moveOnUnix,
src/backend/storeManagers/gog/games.ts:782:    const moveImpl = isWindows ? moveOnWindows : moveOnUnix

$ sed -n '1246,1266p' src/backend/utils.ts
    if (code === 0) {
      logInfo(`Finished Moving ${title}`, LogPrefix.Backend)
      await spawnAsync('rm', ['-rf', install_path])
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  } else {
    const { code, stderr } = await spawnAsync('mv', ['-f', install_path, destination])
    if (code === 0) {
      return { status: 'done', installPath: destination }
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  }

$ grep -n "openrsync\|no-human-readable\|toHaveBeenCalledWith" src/backend/__tests__/moveOnUnix.test.ts
124:    test('openrsync is never passed the two flags it rejects', async () => {
131:      expect(args).not.toContain('--no-human-readable')
155:    test('openrsync still takes the rsync path — it does NOT fall through to mv', async () => {
```

### The claim that MAY now be made

All four suggested fixes in this todo are answered by code that survives comment-stripping: (1)
`moveOnUnix` probes rsync's actual implementation via `rsync --version` rather than trusting `which
rsync`'s existence check; (2) the openrsync branch only uses flags openrsync accepts, dropping both
`--no-human-readable` and `--info=name,progress` in favour of `--progress`; (3) the `code !== 1`
inverted success test named in this todo (attributed to `D-35-19-08`) is gone from both the rsync
arm and the `mv` fallback arm, both now testing `code === 0`; (4) `moveOnUnix.test.ts` pins the
per-flavour argv, including asserting the rejected flags are absent on openrsync. Both `legendary`
and `gog` `moveInstall` route through this same shared `moveOnUnix`.

### The claim that still may NOT be made

That the openrsync branch has been exercised against a real openrsync binary and a real move, live,
in this session. This closes on the code being correct and unit-tested, not on an observed move.

### Residue and its owner

None. Same root cause and fix as
`.planning/todos/completed/2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable.md`
— see that record for the cross-reference.
