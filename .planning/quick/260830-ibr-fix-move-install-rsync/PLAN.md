---
type: quick
slug: fix-move-install-rsync
quick_id: 260830-ibr
created: 2026-08-30
autonomous: true
closes: [D-35-19-08, D-35-19-07]
found_by: 35-19 live gate (criterion 13)
files_modified:
  - src/backend/utils.ts
  - src/backend/__tests__/moveOnUnix.test.ts
---

# Quick: fix move-install (openrsync flags + the `rm -rf` success test)

Both defects live in `moveOnUnix` (`src/backend/utils.ts`) and were found by the Phase 35-19 live
gate, criterion 13. Neither was introduced by the Electron cutover — `git blame` puts both at
upstream Heroic `c62820dc3e` (2024-03-26).

## D-35-19-08 — latent data loss (fix first; higher severity)

`utils.ts:1287` guards an `rm -rf` of the SOURCE install with `if (code !== 1)`. rsync documents
many non-1 failures — 2, 10, 11, 12, **23 (partial transfer)**, 24, 30. Every one reads as success,
so a partial transfer leaves an incomplete copy at the destination and then recursively deletes the
original. It did not fire during the gate only because openrsync happens to exit `1` on a bad flag.

`spawnAsync` returns `code: number | null`. `null` (killed by signal) must also not delete.

**Fix:** `code === 0` at `:1287` and at `:1301` (the `mv` fallback carries the same inverted test).

## D-35-19-07 — move-install broken for every macOS 15+ user

Apple ships **openrsync** (`openrsync: protocol version 29 / rsync version 2.6.9 compatible`) as
`/usr/bin/rsync` since Sequoia. It rejects two of the five flags passed at `utils.ts:1224-1231`, so
the move aborts with `rsync: unrecognized option '--no-human-readable'` and an "Error Moving Game"
toast.

Measured on this machine, not assumed:

| flag | openrsync |
| --- | --- |
| `--archive`, `--compress`, `--remove-source-files`, `--progress` | OK |
| `--no-human-readable` | **REJECTED** |
| `--info=name,progress` | **REJECTED** |

The existing `mv -f` fallback never engages because its guard is `which rsync`, which **succeeds**
under openrsync. So detection must be of the IMPLEMENTATION, not the binary's existence.

### Why the flags differ, and why the parser needs no change

`--no-human-readable` is not decoration: GNU rsync groups digits (`12,582,912`), which would break
the `/^\s+(\d+)/` byte parse in the progress callback. openrsync prints plain digits already and
implements neither that flag nor `--info=`.

Verified end-to-end with a real 20 MB two-level transfer: `--archive --compress
--remove-source-files --progress` under openrsync exits 0, recurses, removes sources, and emits

```
big1.bin
       12582912 100%  377.75MB/s   00:00:00 (xfer#1, to-check=1/3)
```

Replaying the EXISTING parser over that captured output yields `percent=100 eta='00:00:00'
bytes=12582912` with filenames tracked correctly. **The progress parser is left untouched.**

**Fix:** probe `rsync --version`; pick the openrsync flag set or keep the GNU set unchanged.
Keeping GNU's flags byte-identical means Linux/GNU behaviour cannot regress.

## Out of scope (recorded, deliberately not changed)

`moveOnWindows` (`utils.ts:1183`) tests `if (code !== 0)` and logs "Finished Moving" in that branch.
robocopy's exit codes are unusual (0–7 are non-failures, 0 meaning "nothing copied"), so this is not
obviously the same bug, and there is no Windows machine in this session to test against. Flagged in
the summary; not touched.

## Tasks

1. Fix both success tests to `code === 0`.
2. Add implementation detection and per-flavour flag sets.
3. Add `src/backend/__tests__/moveOnUnix.test.ts` covering: exit 23 must NOT delete the source;
   exit 0 must; `null` must not; openrsync gets `--progress` and never the two rejected flags; GNU
   keeps its exact original flag list.
4. `pnpm codecheck` + targeted jest, then commit.

## Success criteria

- No `rm -rf` of the source on any non-zero or null exit code.
- On a machine reporting openrsync, the spawned argv contains neither `--no-human-readable` nor
  `--info=name,progress`.
- On GNU rsync the argv is unchanged from today's, entry for entry.
- The progress-parsing callback is not modified.
- New tests fail against the pre-fix code (anti-vacuity).
