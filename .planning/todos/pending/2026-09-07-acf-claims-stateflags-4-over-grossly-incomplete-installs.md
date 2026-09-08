---
created: 2026-09-07
title: "Two Steam-written ACFs (38410, 718850) claim StateFlags=4 over grossly incomplete native installs — GameLib's new structural gate is unproven live and both installs are still unrepaired"
area: steam-depot
status: OPEN
severity: major
platform: any
ready: live-gate
split_from: .planning/todos/completed/steam-depot-install-fails-with-unclassified-generic-error.md (RESOLVED 2026-09-08; this defect was NOT closed with it)
debug_session: .planning/debug/steam-depot-unclassified-generic-error.md
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
---

# 2026-09-08 — CORRECTION: this todo's central claim was false. Neither damaged ACF was written by GameLib

The original title and "Measured 2026-09-07" section below both assert **GameLib
wrote** `appmanifest_38410.acf` and `appmanifest_718850.acf` with a false
`StateFlags=4`. That claim does not hold up and is corrected here, in place,
rather than left standing under a `critical` rating it no longer earns.

- **Neither manifest was written by GameLib.** Both carry fields
  `buildAppManifestText` never emits: `StagingSize`, `LastPlayed`,
  `DownloadType`, `UpdateResult`, `BytesToStage`, `BytesStaged`,
  `TargetBuildID`, `AllowOtherDownloadsWhileRunning`, `ScheduledAutoUpdate`,
  `MountedConfig` (GameLib writes `MountedDepots`, not `MountedConfig`), plus
  `dlcappid` sub-keys and, on 718850, an `InstallScripts` block.
  `buildAppManifestText` (`src/backend/storeManagers/steam/depot/manifest.ts`)
  emits a fixed 15-key top-level field set — `appid`, `Universe`,
  `StateFlags`, `installdir`, `name`, `LastUpdated`, `SizeOnDisk`, `buildid`,
  `LastOwner`, `BytesToDownload`, `BytesDownloaded`, `AutoUpdateBehavior`,
  `InstalledDepots`, `UserConfig`, `MountedDepots` — unchanged since
  `523e92565` (2026-07-17; confirmed via `git show 523e92565` — that commit
  touched only doc comments and a numeric guard, not the field list). Steam
  wrote both `StateFlags=4` values, not GameLib.
- **The identifying heuristic in "Measured 2026-09-07" below does not hold.**
  `BytesToDownload`/`BytesDownloaded` are written by the real Steam client
  too, so "presence ⇒ GameLib-written" is false. The 19-ACF sweep that
  produced the table below did not actually establish authorship for any row
  in it.
- **Item 1 of "What to do" is REFUTED, at the source.** `SizeOnDisk` is
  written from `measureInstalledBytes(installRoot)`
  (`src/backend/storeManagers/steam/depot.ts:2805-2822`) — a real recursive
  `readdir`/`stat` walk over the actual install tree, confirmed by reading
  its body, not a manifest-derived sum. The "Suspected mechanism" section's
  byte-exact coincidence with the `InstalledDepots` sum is a property of a
  **Steam-written** manifest, and says nothing about how GameLib's own writer
  behaves.
- **Item 2 of "What to do" is answered, but rejected as specified.** The
  236 MB overshoot `finalizeToSteam`'s doc comment warns about (spike 001) is
  from summing per-depot totals across a **multi-depot** install; it is not a
  general per-entry aggregate-vs-manifest threshold, so no such cross-check
  was added, and none is needed for the defect this todo actually described.
- **Item 3 of "What to do" is still open** — 718850's shape (whether its
  13.6 GB shortfall is unowned/unselected DLC depots entering the
  `selectAllDepots` union, vs. a genuine download failure) was not
  established by this correction and remains unestablished.
- **What quick task 260908-nbd did ship, and what that does and does not
  prove.** Commits `5f0f37112` (feat) and `744f93d65` (test) added
  `verifyStructuralIntegrity(plan, installRoot)`
  (`src/backend/storeManagers/steam/depot/reconcile.ts`) — a post-download,
  no-sha1 type+size re-check of every planned file, wired into
  `downloadDepotFiles` and ANDed into `allFilesVerifiedThisRun` so a tree
  damaged *after* being written (clobbered, truncated, replaced by a
  directory) now fails closed to `StateFlags=1026` instead of earning an
  unproven `4`. This closes the structural half of the completeness gate
  **at the desk**: 8 new unit tests plus 4 new end-to-end tests (through the
  real `downloadSteamDepots` orchestrator, real fs) prove it forces 1026 on
  simulated post-write damage while a genuinely complete run — including one
  with non-regular (directory/zero-size) entries — still earns 4. **No live
  Steam run has yet exercised this new check.** The "discriminating run,
  still NOT taken" section below is unchanged and still owed.

## Disposition: this todo stays OPEN, retitled, rescoped to `major`

- The remaining unclosed subject is real: the live discriminating gate
  described below (plant a **non-empty** directory at `master.dat`, install
  on the **native** path, observe `ENOTEMPTY` + failure + `1026`) has not
  been run, and the two named live installs are still damaged and unrepaired.
  `ready: live-gate` already says exactly that, unchanged.
- This is not moved to `completed/` or replaced with a fresh residue todo —
  doing so would break the `split_from`/`debug_session` provenance chain, and
  would read as "answered" when the premise it opened on has just been shown
  false. The record is corrected in place instead.
- `severity` changes from `critical` to `major`: `critical` rested on "a
  shipped claim is false" — GameLib itself writing an untrue `StateFlags=4`
  over a broken install. That specific claim is now refuted for both
  observed ACFs. What remains — an unproven-live fail-closed path plus two
  damaged installs still repairable by the user — is "a feature broken or a
  measurement silently contaminated" (`major`), not `critical`. `platform:
  any` and `ready: live-gate` are unchanged.
- The "Cleanup still owed" section below is kept verbatim: no code change
  repairs either tree, and repair remains the user's decision (Steam →
  "Verify integrity of game files"). This quick task performed no repair
  action against either install, and touched nothing under `~/Library/
  Application Support/Steam` or any `steamapps` tree.

## Why this is split out

Found while actioning the 2026-08-27 UNCLASSIFIED-generic-error todo. It is a
**distinct and more severe defect** than the diagnostic gap that todo asked about,
it affects live user data on this machine right now, and it is not what that todo
was about. Recorded separately rather than folded in.

## Measured 2026-09-07

Swept all 19 GameLib-written ACFs (identified by the presence of
`BytesToDownload`/`BytesDownloaded`, which bottled-Steam-written manifests omit —
that distinction is what makes this NOT the case dismissed as `not-a-bug` in
`.planning/debug/steam-native-false-completion.md`) and compared each
`SizeOnDisk` against real bytes on disk:

| appId | title | StateFlags | claimed | real on disk | delta |
| --- | --- | --- | --- | --- | --- |
| 38410 | Fallout 2 | **4** | 591,399,306 | 258,221,501 | **-56.3%** |
| 718850 | Age of Wonders Planetfall | **4** | 17,151,298,416 | 3,560,381,799 | **-79.2%** |

The other 17 match within 0.0%. `StateFlags "4"` means full ownership — **Steam
runs no verify pass**, so neither install will ever be detected or repaired. The
user gets a game that silently does not work.

**Corrected 2026-09-08: the "GameLib-written" identification above does not hold**
— see the correction section at the top of this file. The measured deltas
themselves are not disputed; only their attributed authorship is.

## Two DIFFERENT shapes, do not assume one cause

- **38410** — one manifest entry (`master.dat`, ~333 MB) exists on disk as an
  empty DIRECTORY. Shortfall is byte-exactly that one file (333,177,805).
- **718850** — 1315 files present, 24 empty dirs, 13.6 GB absent spread across many
  files. **Not established**: this may instead be unowned/unselected DLC depots
  entering the `selectAllDepots` base+DLC union, which would make its `SizeOnDisk`
  overstatement a plan-accounting bug rather than a download failure.

## Suspected mechanism (NOT established)

`SizeOnDisk` for 38410 is byte-exactly `InstalledDepots` 38414 (88,913,882) +
38415 (502,485,424) — a **manifest-derived sum**. `finalizeToSteam`'s own doc
comment says it must never be one:

> measure REAL bytes on disk (never a manifest-derived sum — spike 001: a summed
> total overshoots multi-depot installs by 236MB)

For a genuinely complete install the sum and the real measurement coincide, so
this is only observable on incomplete ones — which is exactly where it matters and
exactly where no test looks.

Separately, `canWriteFullOwnership` requires `failures.length === 0 &&
allFilesVerified && allModesApplied`. For 38410 that gate plausibly passed
*legitimately*: if `master.dat`'s plan entry carried `DIRECTORY_FLAG (64)`, the
mkdir succeeds, `reconcile.ts`'s `directoryVerified` passes on the retry, and no
failure is ever recorded. If so the defect is upstream in flag handling, and the
gate is an accessory rather than the cause.

**Corrected 2026-09-08: this whole section describes a Steam-written manifest**
(see the correction at the top), not GameLib's own gate — it is retained for the
`InstalledDepots`/byte-exactness observation, which is still true, but is no
longer evidence about GameLib's `canWriteFullOwnership` path.

## What to do

1. ~~Determine whether `SizeOnDisk` is written from a real on-disk measurement or a
   manifest sum, and pin it with a test against an INCOMPLETE install (the only
   case that discriminates).~~ REFUTED 2026-09-08: it is `measureInstalledBytes`,
   a real recursive on-disk sum — see correction section above.
2. ~~Decide whether the completeness gate should independently cross-check measured
   bytes against the manifest total before granting StateFlags=4~~ ANSWERED,
   REJECTED AS SPECIFIED 2026-09-08: the 236 MB figure is a multi-depot summation
   artifact, not a per-entry threshold — see correction section above.
3. Establish 718850's shape before assuming it shares 38410's cause. **Still
   open.**

## Live damage, not yet repaired

Both ACFs are still on disk claiming completeness. Repair is a user decision (Steam
"Verify integrity of game files", or reinstall) — **not** something to do silently
while investigating, and deliberately not done here.


---

# 2026-09-08 — the parent todo closed; this one is UNTOUCHED and now has NO cover story

The cross-depot collision that produced 38410's damaged install is fixed and
live-verified (`0a6e5e91b` + `037f0e4d3`, parent todo now in `completed/`). **That
tells us nothing about this defect**, and the parent's closure must not be read as
progress here.

## What the 2026-09-08 live re-drive did and did not show

A real Fallout 2 install ran to completion against live Steam. The ACF it wrote
carries `StateFlags=4` over an install whose measured bytes (591,399,306) match the
manifest sum byte-exactly — the gate behaving **correctly**. A correct pass over a
complete install is not evidence about the incorrect pass over an incomplete one.

**It also went to the CrossOver bottle, not the native Steam tree** (38410 is a
Windows title). Both damaged installs — 38410 (−56.3%) and 718850 (−79.2%) — are on
the **native** path. Whatever chose native in August chooses bottle now. That
divergence is itself unexplained and may mean this defect is native-path-specific;
establish which root a run targets before treating its ACF as a data point.

## The discriminating run, still NOT taken

Plant a **non-empty** directory at `master.dat` in the target install root, install,
and observe three things:

1. `clearStaleDirectoryAtFilePath` must refuse it with `ENOTEMPTY` (this also gives
   the parent's repair half its only live coverage — the re-drive's fresh target
   meant it logged nothing);
2. the install must FAIL;
3. the ACF must read **`1026`**, the verify handoff.

If it writes `4` over that failure, this defect is caught live and in the act. Drive
it against the **native** path if possible, since that is where both observed
failures occurred.

**Note added 2026-09-08 (quick task 260908-nbd):** `verifyStructuralIntegrity`
now exists and is wired into the completeness gate (see the correction section
at the top of this file), so a run that hits post-write damage of this shape
should now fail closed to `1026` at the desk level. This discriminating run is
still the only way to confirm that live, and has still not been taken.

## Cleanup still owed

The damaged installs are untouched by any code fix and still need Steam's "verify
integrity": native 38410 (`master.dat` is still an empty directory,
258,221,501 B under a `StateFlags=4` manifest) and native 718850.
