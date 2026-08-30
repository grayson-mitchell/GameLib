---
type: quick
slug: fix-move-install-rsync
quick_id: 260830-ibr
status: complete
created: 2026-08-30
completed: 2026-08-30
closes: [D-35-19-08, D-35-19-07]
commits: [2c9acffb1]
files_modified:
  - src/backend/utils.ts
  - src/backend/__tests__/moveOnUnix.test.ts
---

# Quick: fix move-install (openrsync flags + the `rm -rf` success test) — COMPLETE

Both defects were found by the Phase 35-19 live gate, criterion 13. `git blame` puts both at
upstream Heroic `c62820dc3e` (2024-03-26) — **neither was introduced by the Electron cutover.**

## D-35-19-08 — latent data loss (fixed)

`moveOnUnix` guarded an `rm -rf` of the **source** install with `if (code !== 1)`. rsync documents
many non-1 failures — 2, 10, 11, 12, **23 (partial transfer)**, 24, 30 — and every one read as
success, so a partial transfer would leave an incomplete copy at the destination and then
recursively delete the original.

Now `if (code === 0)`. That also covers `spawnAsync`'s `code: number | null`: a signal kill yields
`null`, and `null === 0` is false, so it correctly refuses to delete. The `mv` fallback carried the
same inverted test (`utils.ts:1301`) and was fixed with it.

## D-35-19-07 — move-install broken for every macOS 15+ user (fixed)

Apple ships **openrsync** as `/usr/bin/rsync` from Sequoia onward. Measured on this machine:

| flag | openrsync |
| --- | --- |
| `--archive`, `--compress`, `--remove-source-files`, `--progress` | OK |
| `--no-human-readable` | **REJECTED** |
| `--info=name,progress` | **REJECTED** |

so the move aborted with `rsync: unrecognized option '--no-human-readable'`. The existing `mv -f`
fallback never engaged, because its guard was `which rsync` — which **succeeds** under openrsync.
Detection is now of the *implementation*, via `rsync --version` (which also proves existence).

### The progress parser is deliberately unchanged

`--no-human-readable` was load-bearing, not decoration: GNU rsync groups digits (`12,582,912`),
which would make the `/^\s+(\d+)/` byte parse read `12`. openrsync prints plain digits already.

Verified against a real 20 MB two-level transfer rather than assumed — `--archive --compress
--remove-source-files --progress` under openrsync exits 0, recurses, removes sources, and emits:

```
big1.bin
       12582912 100%  377.75MB/s   00:00:00 (xfer#1, to-check=1/3)
```

Replaying the **existing** parser over that captured output yields `percent=100 eta='00:00:00'
bytes=12582912` with filenames tracked. So the callback was left untouched, and the GNU flag list is
kept entry-for-entry identical so the already-working path cannot regress.

## Verification

- **12 new tests**, `src/backend/__tests__/moveOnUnix.test.ts` — all pass.
- **Anti-vacuity proven:** 8 of the 12 **fail** against pre-fix code, including every data-loss case
  and the openrsync flag case. Checked by reverting the source semantics in place (via `cp`
  backup/restore — never `git stash`/`git checkout --`, whose post-checkout hook is unsafe here) and
  re-running, then restoring and confirming the file hash matched.
- The 4 tests that pass in **both** versions are deliberate controls: *exit 0 DOES delete* (proves
  the guard is not simply always-false) and *GNU flags unchanged* (proves no regression).
- `tsc --noEmit` clean. `prettier --check` clean on both files. `eslint --quiet` reports one error
  in `utils.ts` at **line 17** (unused `BrowserWindow` import) — pre-existing; all diff hunks start
  at line 1209.
- **Backend jest project: 4294 passed.** The 3 `decompressPool` LZMA failures are **pre-existing and
  environmental** (native addon not loadable here — tests expect `"native"`, get `"pure-js"`).
  Proven, not assumed: the identical 3 fail when re-run against pre-fix code.

## Deliberately not fixed

`moveOnWindows` (`utils.ts:1183`) tests `if (code !== 0)` and logs "Finished Moving" in that branch.
robocopy's exit codes are unusual — 0–7 are non-failures, with 0 meaning "nothing copied" — so this
is not obviously the same defect, and there is no Windows machine in this session to test against.
Flagged rather than changed.

## Not verified live

The fix was proven by unit tests and by direct probing of openrsync's real behaviour, but **an
end-to-end move of a real game install on this machine was not re-run.** The gate's criterion 13
move attempt (Endless Sky, 419M) is the natural live re-test and remains outstanding.

D-35-19-07 and D-35-19-08 should be marked fixed-pending-live-verification in
`.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`, not closed
outright.
