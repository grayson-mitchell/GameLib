---
created: 2026-09-07
title: "Two Steam-written ACFs (38410, 718850) claim StateFlags=4 over grossly incomplete native installs — GameLib's new structural gate is unproven live and both installs are still unrepaired"
area: steam-depot
status: "RESOLVED 2026-09-09 by quick-260909-nzb -- both subjects in the title are discharged, on different grounds. (1) THE STRUCTURAL GATE IS NO LONGER UNPROVEN LIVE: Gate A (ENOTEMPTY refusal + failed install + StateFlags=1026, with the post-download structural line ABSENT), Gate B (mid-run truncation of a reconcile-SKIPPED file -> 'post-download structural re-verification found 1 of 1215 planned entries damaged or missing ... expected=4273440 found=0' + StateFlags=1026, with jobCount=1 reconciledSkipped=1214 proving failures.length===0 so the check was genuinely reached), and a negative control that PASSED TWICE (fresh install and resume both earned StateFlags=4, so neither 1026 is a pre-existing condition and the gates are arbitrable). Evidence committed under .planning/quick/260909-nzb-acf-stateflags4-live-gate/. (2) THE TWO DAMAGED INSTALLS ARE NOT A GAMELIB DEFECT AND THE USER HAS DECIDED TO LEAVE THEM: the 2026-09-08 correction established by FIELD SET that Steam, not GameLib, wrote both StateFlags=4 manifests, so a proven fail-closed GameLib writer does not explain them and no code change here can repair them; repair was always the user's call and on 2026-09-09 the user explicitly chose to leave both alone. Native 38410 (master.dat still an empty directory, 258,221,501 B under a StateFlags=4 manifest) and native 718850 (13.59 GB short) therefore remain DAMAGED ON DISK BY DECISION, not by oversight -- their ACF sha256 values were recorded before the gate and re-verified unchanged after it. Also closed at the desk: item 3 ANSWERED (718850's shortfall is real content missing from base depot 718851, NOT the selectAllDepots DLC union -- DLC-tagged depots are 561,517,956 B against a 13.59 GB shortfall and the base depots alone overshoot disk by 13.03 GB), and the 'Suspected mechanism' section RETIRED (SizeOnDisk == sum(InstalledDepots.size) byte-exactly in 18 of 23 manifests, so byte-exactness is the ordinary case and carries no signal). The todo's own prescribed single discriminating run was CORRECTED before being driven: an ENOTEMPTY refusal populates failures[], making runLooksComplete false and skipping verifyStructuralIntegrity entirely, so it would have proven the repair half while leaving the structural half -- the thing the title called unproven -- still unproven. RESIDUE FILED, NOT BURIED: 2026-09-09-cold-session-installdir-falls-back-to-app-appid.md (major, ready: code)."
resolved_by: quick-260909-nzb
severity: major
platform: any
ready: human
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

  **Corrected 2026-09-09: the "Not established" clause above is now settled, and
  it is FALSE.** The DLC-union explanation is refuted by arithmetic — see item 3
  of "What to do" below. DLC depots total 561,517,956 B against a 13.59 GB
  shortfall; the base depots alone overshoot what is on disk by 13.03 GB.

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

**RETIRED 2026-09-09: the byte-exactness observation carries NO SIGNAL, so this
section's central inference is dead.** Swept all 23 manifests in
`~/Library/Application Support/Steam/steamapps` and compared `SizeOnDisk` against
`sum(InstalledDepots[].size)`: they are byte-exactly equal in **18 of 23** —
spanning healthy AND damaged installs, Steam-written AND GameLib-written ones
alike. Byte-exactness is the **ordinary case**, not a symptom, so "`SizeOnDisk`
is byte-exactly the `InstalledDepots` sum" discriminates nothing and was never
evidence of a manifest-derived sum. The 5 that differ are 291650, 57300 (+1657),
8930 (−1396), 91310, and 402060 (which carries no `InstalledDepots` block at
all).

That the differing rows include **GameLib-written** manifests with small non-zero
deltas independently corroborates the 2026-09-08 correction above: a real
recursive `measureInstalledBytes` walk is exactly what produces a total that
lands *near but not on* the manifest sum. A manifest-derived sum could not.

This section is retained as a historical record of a hypothesis that was tested
and did not survive. Do not cite it as evidence.

## What to do

1. ~~Determine whether `SizeOnDisk` is written from a real on-disk measurement or a
   manifest sum, and pin it with a test against an INCOMPLETE install (the only
   case that discriminates).~~ REFUTED 2026-09-08: it is `measureInstalledBytes`,
   a real recursive on-disk sum — see correction section above.
2. ~~Decide whether the completeness gate should independently cross-check measured
   bytes against the manifest total before granting StateFlags=4~~ ANSWERED,
   REJECTED AS SPECIFIED 2026-09-08: the 236 MB figure is a multi-depot summation
   artifact, not a per-entry threshold — see correction section above.
3. ~~Establish 718850's shape before assuming it shares 38410's cause.~~
   **ANSWERED 2026-09-09 — the DLC-union hypothesis is REFUTED by arithmetic.**
   `appmanifest_718850.acf`'s `InstalledDepots` holds **9 depots totalling
   17,151,298,416 B**. The depots carrying a `dlcappid` sub-key total only
   **561,517,956 B**. The base depots alone — 718851 (16,328,140,703) + 718853
   (261,639,757) = **16,589,780,460 B** — already exceed the **3,560,381,799 B**
   actually on disk. So excluding **every** DLC depot still leaves a **13.03 GB**
   shortfall, against a total shortfall of **13.59 GB**: DLC can account for at
   most **4.1%** of it. The `selectAllDepots` base+DLC union is therefore NOT the
   explanation. This is a broad genuine content shortfall in **base depot
   718851**, not a plan-accounting artifact.

   On-disk shape, measured the same day: 1315 files, 305 directories of which 24
   are empty, the empties spread across `Content/DLC00`–`DLC05` pack/library dirs
   and `Language/*/Text`; largest file actually present is 654 MB
   (`Content/Title/Libraries/PFX/Particles.clb`). The spread — content present
   throughout the tree with much absent alongside it — is the shape of an
   incomplete transfer, not of a wholly-omitted depot.

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

> **Superseded in DESIGN 2026-09-09** — not in motivation. The run below is still
> owed, but as specified it proves only the ENOTEMPTY *repair* half; it cannot
> reach `verifyStructuralIntegrity` at all. See the 2026-09-09 section at the end
> of this file for why, and for the corrected two-run design.


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


---

# 2026-09-09 — the prescribed discriminating run CANNOT prove the structural gate

The "discriminating run, still NOT taken" section above prescribes **one** run and
claims it catches this defect "live and in the act". It cannot. The run it
describes proves the **repair** half only, and is structurally incapable of
reaching the structural half — the very thing this todo's title calls "unproven
live".

## The mechanism, at file:line

- `clearStaleDirectoryAtFilePath` (`src/backend/storeManagers/steam/depot.ts:1074`)
  does not swallow the refusal — it **rethrows** it, wrapped, so it lands in
  `downloadDepotFiles`' `failures[]`.
- `runLooksComplete` (`depot.ts:2700`) is
  `allJobsAttempted && failures.length === 0 && !opts.signal?.aborted`.
- `verifyStructuralIntegrity` is called **only** inside `if (runLooksComplete)`
  (`depot.ts:2703`).

So an ENOTEMPTY run has `failures.length > 0` ⇒ `runLooksComplete === false` ⇒
**the structural check is skipped entirely.** The two halves are mutually
exclusive by construction. They need **TWO different runs**.

## Why post-write damage is the ONLY shape that reaches the structural gate

`verifyStructuralIntegrity` (`depot/reconcile.ts:262`) and the reconciler's
`regularFileVerified` both call the **same** `regularFileShape` predicate
(`reconcile.ts:112`) — present, regular file, exact expected size. The structural
check is that predicate **without** the sha1; the reconciler is that predicate
**plus** a sha1.

The structural check is therefore strictly **weaker** than the reconciler. Any
damage present *before* reconciliation is caught by the reconciler, scheduled as a
download job, and repaired — so it never reaches the structural check. The two
differ only in **when** they run. That leaves exactly one window in which the
structural gate is the sole catcher: damage applied **after** its file was
reconciled or written, and **before** the post-download check. Gate B below has to
be driven by mid-run fault injection; there is no way to arrange it by planting
damage up front.

## The corrected design: two runs plus a control

- **Gate A — ENOTEMPTY / repair half.** Plant a NON-EMPTY directory at a planned
  file path. Expect the refusal naming the file, the install to FAIL, and the ACF
  to read `1026`. The `post-download structural` line must be **ABSENT** — its
  absence is a PASS condition here, and is itself the direct live confirmation of
  the mutual exclusion above.
- **Gate B — structural half.** A run that otherwise looks complete
  (`failures.length === 0`) while carrying post-write damage, so `runLooksComplete`
  stays true and the structural check is actually reached. Expect the
  `post-download structural` warning and `1026`. If the injection window is missed
  the run is **BLOCKED — window missed**: retryable, and neither a pass nor a fail.
- **MANDATORY negative control.** An undamaged run of the same title must still
  earn `StateFlags=4`. Without it a `1026` proves nothing — the live null
  hypothesis is that the chosen title never earns a `4` at all, in which case both
  gates merely measured a pre-existing condition and are **UNARBITRABLE**.

## Target correction: NOT 38410

38410 is a **Windows** title, and `routeThroughBottle = forceWindowsViaBottle ||
this.isBottleEligible()` (`games.ts:1077`) now routes it to `installBottleNative`.
That — not chance — is why the 2026-09-08 re-drive landed in the CrossOver bottle
instead of the native tree, and why it learned nothing about this defect. The gate
uses a small **mac-native** title already fully on disk (appId **112100**, Avadon:
The Black Fortress, depot 112102, 121,853,904 B), so it runs as a cheap
resume-over-existing-content pass rather than a real download.

Full contract, including the backup/restore ledger and the trap checklist:
`.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md`

**Not yet driven.** `ready:` stays `live-gate`.


---

# 2026-09-09 — LIVE GATE RESULT: all three gates PASS. The structural gate is now proven live.

Driven on this Mac against live Steam, native path, appId **112100** (Avadon: The
Black Fortress, depot 112102). Contract and full evidence:
`.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md` §8.

| Gate | Verdict | Observed |
| --- | --- | --- |
| **Gate A** — ENOTEMPTY / repair half | **PASS** | refusal fired naming `AvScenData.dat` with `ENOTEMPTY: directory not empty`; install FAILED (1 file failure); ACF `StateFlags "1026"`; `post-download structural` **absent** |
| **Gate B** — structural half | **PASS** | `post-download structural re-verification found 1 of 1215 planned entries damaged or missing — failing closed to StateFlags=1026 instead of an unproven StateFlags=4: "Avadon.app\Contents\MacOS\Avadon" wrong-size (expected=4273440 found=0)`; ACF `StateFlags "1026"` |
| **Negative control** | **PASS** (ran twice) | fresh install `jobCount=1215 reconciledSkipped=0` → `StateFlags=4`; resume `jobCount=0 reconciledSkipped=1215` → `StateFlags=4` |

## What this discharges

- **`verifyStructuralIntegrity` is no longer "unproven live".** Gate B forced it, live,
  through the real orchestrator against real Steam: post-write damage to a
  reconcile-SKIPPED file produced the structural warning and a `1026`, not an
  unearned `4`. The title's claim on the structural half is **discharged**.
- **Finding 3's mutual exclusion is confirmed live, not just by reading.** On Gate A
  the `post-download structural` line did **not** appear, exactly as predicted:
  `failures.length > 0` ⇒ `runLooksComplete === false` ⇒ the structural check is
  skipped. One run genuinely cannot prove both halves.
- **The 1026 fallback is honest.** Both damaged runs wrote `buildid "0"` and
  `BytesDownloaded "0"`, never a partial-looking `4`.
- **`measureInstalledBytes` re-confirmed as a real on-disk walk, arithmetically.**
  Gate A's `SizeOnDisk` 115,827,304 = 121,853,904 − 6,026,632 and Gate B's
  117,580,464 = 121,853,904 − 4,273,440 — each exactly the pristine total minus the
  one file damaged in that run.
- **The negative control matters:** the same title earned `StateFlags=4` twice in the
  same session, so neither `1026` is a pre-existing condition and the gates are
  **arbitrable**.

## What this does NOT discharge

Nothing here repairs or explains the two damaged installs. `StateFlags=4` over
native **38410** and native **718850** was written by the **Steam client**
(2026-09-08 correction), and this gate exercised **GameLib's** writer. A proven
fail-closed GameLib gate says nothing about manifests GameLib did not author.

## Unplanned finding, filed separately

The first install of a session resolves `installdir` to a fallback `app_<appid>`
because `resolveSteamInstallTarget` (1ms) runs before `SteamUser.ensureConnected`
(1629ms cold-connect), so PICS has no appinfo yet. It created a 119 MB duplicate at
`steamapps/common/app_112100`. Filed as
`.planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md`.

## Frontmatter

`ready:` moves `live-gate` → **`human`** (not `code`): every gate now has a
non-BLOCKED verdict, so no live run remains, and no code work remains either — the
only outstanding item is the **user's repair decision** on the two damaged installs,
which is precisely what `human` denotes. `status: OPEN` and `severity: major` stay:
both installs are still damaged and unrepaired.


---

# 2026-09-09 — CLOSED

Closed by quick task `260909-nzb`. Both subjects in the title are discharged, on
different grounds — see the `status:` frontmatter for the full record.

## Why this closes even though two installs are still broken on disk

Because the damage is **not GameLib's, and not unowned**:

- The 2026-09-08 correction proved by **field set** that the Steam client wrote both
  `StateFlags=4` manifests. GameLib's writer emits a fixed 15-key set; both of these
  carry `MountedConfig`, `StagingSize`, `LastPlayed`, `dlcappid` sub-keys and (on
  718850) `InstallScripts`. So no GameLib code change repairs them, and the
  now-proven fail-closed gate does not explain them.
- Repair was always the user's decision. **On 2026-09-09 the user made it: leave both
  alone.** That is the `ready: human` item resolved — with a decision, which is what
  `human` means. It is not an item left dangling.

**Both installs remain damaged on disk, deliberately.** Native **38410**
(`master.dat` is still an empty directory; 258,221,501 B present under a
`StateFlags=4` manifest) and native **718850** (13.59 GB short). If either game
misbehaves, the fix is Steam → *Verify integrity of game files*; nothing in GameLib
will detect them, because `StateFlags=4` means Steam runs no verify pass.

## Do NOT re-open this on rediscovering the damage

A future sweep of `steamapps` will find both of these again. They are **known,
investigated, and deliberately left** — not a new finding. Re-deriving them costs the
multi-session investigation recorded in this file and in
`.planning/debug/steam-depot-unclassified-generic-error.md`. Read the `status:` field
before opening anything new about 38410 or 718850.

## What genuinely remains open, elsewhere

`.planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md`
— `resolveSteamInstallTarget` (1 ms) runs before `SteamUser.ensureConnected`
(1629 ms cold connect), so the first install of a session has no PICS appinfo and
lands in a duplicate `app_<appid>` directory. Found by this task's gate. It is almost
certainly what produced the pre-existing `app_257350`, `app_25900` and `app_402060`
directories, which were left untouched as user data.


---

# 2026-09-09 (later the same day) — DISPOSITION CHANGED: both games UNINSTALLED

**The `status:` frontmatter above, and the "# 2026-09-09 — CLOSED" section, both say the
two installs "remain DAMAGED ON DISK BY DECISION". That is now STALE.** The operator
reversed the decision shortly after this todo was closed and asked for both games to be
cleaned off disk. Corrected here in place rather than by rewriting the closing record,
which was accurate when written.

## What was removed

Uninstalled through **Steam's own uninstall** (`steam://uninstall/<appid>`), not by hand
— Steam had started at 18:03 and was a live writer to `steamapps`, so deleting
underneath it would have risked an inconsistent Steam-side state. Both apps were
confirmed present in `libraryfolders.vdf`'s apps map first, because the verb is a silent
no-op against an unadopted app.

| appId | title | ACF | install dir |
| --- | --- | --- | --- |
| 38410 | Fallout 2 | removed | `common/Fallout 2` removed (246 MB) |
| 718850 | Age of Wonders: Planetfall | removed | `common/Age of Wonders Planetfall` removed (2.4 GB) |

~2.7 GB reclaimed. Manifest count 23 → 21. Verified that nothing else was affected: the
remaining `common/` listing is the prior one minus exactly these two plus the
`app_112100` orphan this task created. Both games **remain owned and reinstallable** —
only local content was removed.

## Evidence preserved before deletion

Both damaged ACFs were copied to
`.planning/quick/260909-nzb-acf-stateflags4-live-gate/damaged-acf-evidence/` with their
sha256 values, which match the pre-gate control hashes
(`8a48ad5a…` / `add630ea…`). The forensic record of this todo therefore survives the
deletion of its subject.

## One last live confirmation, captured on the way out

Steam restarted at **18:03** and ran a full startup scan over both damaged manifests.
It left them **byte-identical** — no verify, no repair, no downgrade to `1026`. That is
this todo's central claim demonstrated directly rather than argued: `StateFlags=4` means
**Steam runs no verify pass**, so an install damaged under that flag is never detected
and never self-repaired. It is the reason the defect mattered, observed one last time
immediately before the evidence was destroyed.

**The todo stays closed.** This changes the disposition of the damage, not the finding.
