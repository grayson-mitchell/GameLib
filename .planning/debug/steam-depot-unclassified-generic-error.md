---
slug: steam-depot-unclassified-generic-error
status: root-caused-no-fix-applied
created: 2026-09-07
updated: 2026-09-07
source_todo: .planning/todos/pending/2026-08-27-steam-depot-install-fails-with-unclassified-generic-error.md
area: steam-depot
severity: major
trigger: "Steam depot install of Fallout 2 (38410) fails ~5s after click with the UNCLASSIFIED generic fallback 'The Steam download failed.' (depotErrors.ts genericV2) and no chunk-level diagnostic anywhere in the log."
---

# Debug: Steam depot install — UNCLASSIFIED generic error, no diagnostic detail

## Evidence gathered 2026-09-07 (on-disk forensics, no live re-drive)

The Aug 27 `gamelib.log` did NOT survive (only the excerpt quoted in the todo).
Everything below is measured from the surviving on-disk artifacts.

### E1 — `master.dat` is a DIRECTORY where a 333 MB file belongs

`~/Library/Application Support/Steam/steamapps/common/Fallout 2/`:

```
drwxr-xr-x@ 2 graysonmitchell staff 64 Aug 27 18:09 master.dat
```

Every other entry is a regular file written at 18:09. `master.dat` is an **empty
directory**. Fallout 2 cannot run without it.

### E2 — the missing bytes are EXACTLY that one file

| quantity | bytes |
| --- | --- |
| ACF `SizeOnDisk` | 591,399,306 |
| real bytes on disk (49 files) | 258,221,501 |
| shortfall | **333,177,805** |

`SizeOnDisk` is byte-exactly `InstalledDepots` 38414 (88,913,882) + 38415
(502,485,424) — a **manifest-derived sum**, which is precisely what
`finalizeToSteam`'s own doc comment says it must never be ("measure REAL bytes on
disk — never a manifest-derived sum, spike 001").

Entry counts: 49 files + 15 subdirs = 64 present, against the plan's 65. The one
missing entry is `master.dat`-as-a-file.

### E3 — the ACF claims a COMPLETE install (`StateFlags "4"`)

`appmanifest_38410.acf` (written 19:03, i.e. by a LATER run than the 18:09 files)
carries `StateFlags "4"` = full ownership, so **Steam will never verify or repair
it**. It has `BytesToDownload`/`BytesDownloaded`, so it is a GameLib native-writer
manifest, not a bottled-Steam one — this is NOT the case dismissed as `not-a-bug`
in `.planning/debug/steam-native-false-completion.md` (that one was bottle-path and
omitted those fields).

### E4 — a SECOND title is affected, so this is not a one-off

Sweep of all 19 GameLib-written ACFs, `SizeOnDisk` vs real bytes on disk:

| appId | title | StateFlags | claimed | real | delta |
| --- | --- | --- | --- | --- | --- |
| 38410 | Fallout 2 | 4 | 591,399,306 | 258,221,501 | **-56.3%** |
| 718850 | Age of Wonders Planetfall | 4 | 17,151,298,416 | 3,560,381,799 | **-79.2%** |

The other 17 match within 0.0%. Planetfall's shortfall has a DIFFERENT shape (many
absent files across 1315 present, 24 empty dirs) and may instead be unowned-DLC
depots entering the `selectAllDepots` base+DLC union — **not established**.

## Findings

### F1 — the todo's central premise is FALSE (`download-complete` proves nothing)

The todo reasons: "`stage=download-complete` fires on all 65 files, and THEN the
install errors — whatever fails does so after the census believes the download walk
finished."

Both census lines are computed from the **plan**, not from download results:

- `depot.ts:1999` — `stage=download-entry` … `summarizeDepotFlags(plan)`
- `depot.ts:2475` — `stage=download-complete` … `summarizeDepotFlags(plan)`

`totalFiles=65` is identical at both points **by construction** (the doc comment at
:1996 says emitting the same census at both points "is the point"). It is emitted on
the normal return path regardless of `failures.length`. So it never evidenced that
65 files downloaded, and the failure is NOT necessarily downstream of the walk.

### F2 — the diagnostic gap, precisely located

- `depot.ts:2438-2447` — the per-file catch does `failures.push({file, error, cause})`
  and **logs nothing at all**.
- `depot.ts:3008-3025` — the throw site classifies **only `failures[0]`** and logs
  neither the raw error text, nor the failing filename, nor `failures.length`.

So N files can fail and the operator gets one generic sentence with no record of what
failed or why. This is why there is no `reason=` line: the failure was never a chunk
decode failure at all — the decode path (`isDecodeStageError`, :1310) rethrows and is
separately logged; an fs-level error at open/write is swallowed here.

### F3 — leading root-cause hypothesis (NOT established)

`downloadSingleFile` (`depot.ts:1394`) creates a real directory when
`file.flags & DIRECTORY_FLAG (64)`. For `master.dat` to be a directory, its plan entry
must have carried flag 64.

Supporting inference from E3: `reconcile.ts`'s `regularFileVerified` is fail-closed
(`if (!st.isFile()) return false`), so had `master.dat` been a regular-file entry, the
19:03 retry would have re-queued it, hit `EISDIR`, recorded a failure, and written
`StateFlags=1026`. We observe `4`. That is consistent with flag 64 being set: the
mkdir "succeeds", `directoryVerified` passes on the retry, no failure is recorded, and
the completeness gate legitimately writes 4 over a game missing its largest file.

**Decisive test, NOT run:** fetch depot 38415's manifest and read `master.dat`'s
`flags`. Requires a live authenticated Steam CM connection using the user's real
account — deliberately not taken without authorisation. The alternative mechanism
(`mkdir(dirname(dest))` at :1389 creating `master.dat` for a child entry) is not
excluded.

### F4 — the todo's three ranked candidates are all unsupported

1. *degraded fixture* — the fixture is now restored (`steamPlatformsCaptured: true`,
   metadata entry present) and cannot explain a directory on disk.
2. *title-specific depot content / pure-JS lzma* — a decode failure would rethrow via
   `isDecodeStageError` and be logged; no decode line was ever emitted.
3. *Steam 403 rate limiting* — would classify as a network signature, not the generic
   bucket.

## Scope taken

F2 (the diagnostic gap) is fixed here — it is the todo's own stated "more valuable
finding", it is bounded, and it is what makes F3 answerable on the next occurrence.
F1/E1-E4 are recorded. The false-`StateFlags=4` defect (E3/E4) is SPLIT OUT as its own
todo: it is a distinct, more severe defect affecting live user data and is not what
this todo asked about.


---

# ROOT CAUSE CONFIRMED 2026-09-07 — cross-depot path collision

Live manifest probe against Steam CM (authenticated, 469 licenses, read-only).
**Both prior hypotheses are REFUTED and the real cause is established.**

## The evidence

The SAME path `master.dat` is declared by BOTH depots in the plan, with
**incompatible types**:

| depot | entry | size | chunks | flags |
| --- | --- | --- | --- | --- |
| 38414 | `master.dat` | 0 | 0 | **64 (DIRECTORY)** |
| 38415 | `master.dat` | 333,177,805 | 318 | 0 (regular file) |

Depot 38415 in full (4 entries): `fallout2.cfg` 962, `master.dat` 333,177,805,
`patch000.dat` 2,355,526, `critter.dat` 166,951,131 — all flags=0. The other
three are on disk at byte-exact sizes. Only the colliding entry broke.

`selectAllDepots` unions base+DLC depots into ONE plan, and `downloadDepotFiles`
writes every depot's entries into the SAME `installRoot`. Nothing at plan-build
or write time detects that two depots claim one path with different types. The
directory entry won the race, `mkdir`'d `master.dat`, and depot 38415's file
write then failed `EISDIR` — unclassified, hence `genericV2`.

## What this REFUTES (both recorded hypotheses were wrong)

- **F3 / flag-64 on the file:** REFUTED. 38415's `master.dat` is `flags=0` with
  318 chunks. Valve's data is correct.
- **`mkdir(dirname(dest))` at `:1389`:** REFUTED. Zero entries in either depot
  have `master.dat` as a path prefix.

The F3 inference ("StateFlags=4 implies the retry recorded no failure, which
implies flag 64") was **sound reasoning from a false premise**. With `flags=0`
proven, its conclusion collapses — and the false `StateFlags=4` therefore has NO
innocent explanation. That strengthens the split-out todo: the completeness gate
is genuinely unsound, not merely an accessory to a flag bug.

## Benign near-miss, do not confuse the two

Depot 38414 also has a DIRECTORY entry `data\critter.dat` while 38415 has a FILE
`critter.dat`. Those are DIFFERENT paths (`data/critter.dat` vs `critter.dat`) and
do NOT collide. Only `master.dat` collides.

## NOT fixed here — the remedy is a policy decision

A file entry with 318 chunks must beat a size-0/chunks-0 Directory entry on the
same path; that much is clear. What is NOT established is whether the collision is
the real defect or a SYMPTOM of `selectAllDepots` selecting a depot the real Steam
client would not install for this platform. Choosing a resolution policy before
answering that risks fixing the measurement rather than the defect.

Options to weigh:
1. Detect same-path/different-type collisions at plan build; let the chunked file
   entry win; log the collision loudly. Contained, but treats the union as correct.
2. Re-examine `selectAllDepots` — establish which depots real Steam installs for
   this title/platform. Larger, and answers whether the union itself is wrong.

Either way a collision must never again surface as "The Steam download failed."
with nothing in the log; that half is fixed and committed.
