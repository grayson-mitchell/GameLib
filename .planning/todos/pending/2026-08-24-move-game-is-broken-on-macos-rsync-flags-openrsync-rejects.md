---
created: 2026-08-24T00:00:00.000Z
title: "Move Game is BROKEN on every modern macOS — `moveOnUnix` passes two rsync flags Apple's `openrsync` rejects, and the capability probe only checks that a binary EXISTS"
area: backend-utils
status: OPEN
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
