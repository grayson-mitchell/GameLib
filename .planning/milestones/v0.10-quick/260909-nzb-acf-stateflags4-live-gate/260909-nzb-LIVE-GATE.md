# 260909-nzb — LIVE GATE CONTRACT

**Subject:** prove that GameLib's StateFlags=4 completeness gate fails CLOSED to
`1026` on a damaged native install — both halves of it, separately.

**Status:** DRIVEN 2026-09-09. All three gates PASS. See §8.

**Why two gates and not one.** `clearStaleDirectoryAtFilePath` (`depot.ts:1074`)
rethrows its ENOTEMPTY refusal into `failures[]`. `runLooksComplete`
(`depot.ts:2700`) is `allJobsAttempted && failures.length === 0 &&
!opts.signal?.aborted`, and `verifyStructuralIntegrity` runs ONLY inside
`if (runLooksComplete)` (`depot.ts:2703`). An ENOTEMPTY run therefore has
`runLooksComplete === false` and never reaches the structural check. The two
halves are mutually exclusive by construction.

**Why post-write damage is the only shape that reaches Gate B.**
`verifyStructuralIntegrity` and the reconciler's `regularFileVerified` share the
same `regularFileShape` predicate (`reconcile.ts:112`). The structural check is
that predicate WITHOUT the sha1; the reconciler is it WITH the sha1. Structural is
therefore strictly weaker, so any damage present before reconciliation is caught
and repaired by the reconciler and never reaches it. Only damage landing after a
file is reconciled/written, and before the post-download check, discriminates.

---

## §0 Target

| Field | Value |
| --- | --- |
| appId | **112100** (Avadon: The Black Fortress) |
| depot | **112102** |
| installdir | `Avadon The Black Fortress` |
| install root | `~/Library/Application Support/Steam/steamapps/common/Avadon The Black Fortress` |
| ACF | `~/Library/Application Support/Steam/steamapps/appmanifest_112100.acf` |
| SizeOnDisk claimed | 121,853,904 B |
| on disk at baseline | 1209 files, 121,853,904 B — byte-exact, install is COMPLETE |

Chosen because it is small, mac-native, and **already fully on disk**, so every run
is a cheap resume-over-existing-content pass (the reconciler sha1-skips everything)
rather than a real download.

Its ACF field set is exactly `buildAppManifestText`'s 15 keys — `MountedDepots`,
no `MountedConfig`, no `StagingSize`/`LastPlayed`/`DownloadType`/`InstallScripts`
— so it is provably **GameLib-written** and provably took the native path. That is
what makes it a valid fixture under the corrected authorship rule
(authorship is decided by FIELD SET, never by the presence of `BytesToDownload`).

### Explicitly NOT appId 38410

38410 is a **Windows** title. `routeThroughBottle = forceWindowsViaBottle ||
this.isBottleEligible()` (`games.ts:1077`) routes it to `installBottleNative`,
which writes into the CrossOver bottle's steamapps, not the native tree. That is
why the 2026-09-08 re-drive landed in the bottle and learned nothing. Do not
substitute it. Do not substitute 718850 either — it is one of the two damaged
installs this gate must not touch.

### Routing pre-flight (measured 2026-09-09, re-assert at run time)

`~/Library/Application Support/gamelib/store_cache/steam_metadata.json` entry
`112100`: `platformsCaptured=true`, `is_mac_native=true`, `is_windows_native=true`,
`mac_arch="64"` (`mac_arch_source="macho"`, `mac_arch_verified=true`), no
`forcedWindowsViaBottle`.

Against `isBottleEligibleFromPlatforms()` (`games.ts:1890-1907`): the
`mac_arch === '32'` branch is false, and the
`platformsCaptured === true && is_mac_native === false` branch is false. So
`routeThroughBottle` is false → **native path**.

This store is mutable, and a desk read is not a run-time measurement. **Each run
MUST re-assert routing** by confirming the install log names the native install
root above and NOT any `GameLibSteam*` bottle root.

---

## §1 Preconditions

Each is a command with an expected result. All must hold before any gate runs.

1. **Steam client NOT running, and stays quit for the WHOLE gate.**
   `pgrep -fl steam_osx` → no output.
   A running Steam rewrites `libraryfolders.vdf` and eats the fixture; it also
   never rescans an ACF mid-session, so it cannot adopt anything written here.
   NOTE: a lingering `ipcserver` process is **not** the client — do not mistake it
   for a failed precondition.
2. **Build identity — the running sidecar contains the code under test.**
   `grep -c verifyStructuralIntegrity build/main/sidecar.js` → ≥1
   `grep -c 'post-download structural' build/main/sidecar.js` → ≥1
   `grep -c 'is a file in the depot manifest, but a' build/main/sidecar.js` → ≥1
   AND the sidecar process start time must be LATER than `sidecar.js`'s mtime.
   A gate against a stale sidecar measures nothing.
3. **Native install enabled + authenticated.**
   `enableSteamNativeInstall` true in the GameLib config;
   `steam_store/config.json` has `refreshToken` and `isLoggedIn: true`.
4. **Target intact at baseline.** 1209 files totalling 121,853,904 B under the
   install root.
5. **Free space** on the Steam volume > 1 GiB.

---

## §2 Backup ledger

`cp` + `shasum -a 256` BEFORE the run; re-hash AFTER restore; the two must match.

**Never `git checkout --` anything** — the repo's post-checkout hook fires and
attempts a helper-binary download. Restore by `cp` from the hashed backup only.

Baseline hashes already recorded 2026-09-09 (backup dir: session scratchpad
`gate-backup/`, ledger `BASELINE.sha256`):

| file | pre-run sha256 | post-restore sha256 |
| --- | --- | --- |
| `appmanifest_112100.acf` | `32aa707b19c80389a0cc5bbb401ffbf1f174f83d0115ee0d96fae5d0a58e8984` | _(fill)_ |
| `libraryfolders.vdf` | `8dcc03c4aff78e4584c0e3d2d8713f632a2c76efee7fa4365c4dfb0886904505` | _(fill)_ |
| `Avadon.app/Contents/Resources/AvScenData.dat` (6,026,632 B) | _(fill before Gate A)_ | _(fill)_ |
| `Avadon.app/Contents/MacOS/Avadon` (4,273,440 B) | _(fill before Gate B)_ | _(fill)_ |

**Untouchable control hashes** — recorded so it is provable this gate never
touched either damaged install. Re-check at the end; they must be unchanged:

| file | sha256 |
| --- | --- |
| `appmanifest_38410.acf` | `8a48ad5a4caf9db4edb7ed9a74364fbd0bb694862b5e4a1dc2a0c3f064b3241f` |
| `appmanifest_718850.acf` | `add630ea02bd70bdec4d4c7732c5e51a438c788c5df5f655619aa6b7e57787bf` |

Both install trees themselves are equally out of scope: no repair, verify, delete
or mutation. See §10.

---

## §3 Log capture discipline

Backend `logWarning`/`logInfo` land in **`~/Library/Logs/GameLib/gamelib.log`**,
NOT in the `tauri:dev` terminal. Every required string below is written there.

`log_writer.ts:143` does `renameSync(logFilePath, logFilePath + '.old')` on the
first write of each process — **one `.old` slot only**. A third app launch
therefore destroys the FIRST launch's evidence.

Therefore: **before every relaunch**, archive the current log to a unique name in
this quick directory:

    cp ~/Library/Logs/GameLib/gamelib.log \
       .planning/quick/260909-nzb-acf-stateflags4-live-gate/gamelib-<run-id>.log

Run ids: `gateA`, `gateB`, `control`. Each verdict row in §8 cites its archive.

---

## §4 Gate A — the ENOTEMPTY / repair half

1. Back up and move `appmanifest_112100.acf` aside so GameLib reads the title as
   not-installed. Archive the log (§3), then refresh the library / relaunch.
2. Plant a **NON-EMPTY** directory at a planned FILE path: back up and delete
   `Avadon.app/Contents/Resources/AvScenData.dat` (6,026,632 B — the largest
   entry, certainly a planned file), `mkdir` at that exact path, and drop a
   sentinel file inside it so `rmdir` cannot succeed.
3. Install through the app UI.

**PASS requires ALL FOUR:**

- **A1** the ENOTEMPTY refusal fires naming `AvScenData.dat`. Grep a SHORT
  fragment — `is a file in the depot manifest, but a` — never the whole sentence;
  the message is wrapped across source lines.
- **A2** the install FAILS.
- **A3** the resulting ACF reads `StateFlags` **1026**.
- **A4** the `post-download structural` line is **ABSENT**. This absence is a PASS
  condition, not an unexplained silence: `failures.length > 0` ⇒
  `runLooksComplete === false` ⇒ the structural check is skipped. A4 is the direct
  live confirmation of the mutual exclusion.

**MUST NOT appear:** `removed a stale empty directory` — that is the empty-dir
repair branch, and its presence means the plant was empty and the gate measured
the wrong branch. Treat as **BLOCKED — wrong branch exercised**, re-plant, retry.

4. Restore `AvScenData.dat` from backup and verify by hash.

---

## §5 Gate B — the structural half

The run must otherwise look complete (`failures.length === 0`) while carrying
post-write damage, so `runLooksComplete` stays true and the structural check is
actually reached.

1. ACF still aside. Delete ONE file so the reconciler schedules exactly one
   download job: `AvScenData.dat` again (6,026,632 B — large enough to hold the
   download phase open for a usable window, small enough to be cheap).
2. **Arm a background watcher BEFORE starting the install.** It polls at
   ~50–100 ms for `AvScenData.dat` to reappear — the writer does `open(dest, 'w')`
   directly at the final path, with no temp-and-rename, so its appearance marks
   the download job starting and therefore marks reconciliation as already
   FINISHED. On trigger it immediately truncates a DIFFERENT, already-present file
   that the reconciler will have SKIPPED: `Avadon.app/Contents/MacOS/Avadon`
   (4,273,440 B), via `: > <path>`.
   The watcher MUST log its own trigger timestamp and truncation result, and MUST
   be able to report "never fired".
3. Install.

**PASS requires BOTH:**

- **B1** the `post-download structural` warning fires naming
  `Contents/MacOS/Avadon` with `expected=4273440 found=0`.
- **B2** the ACF reads **1026**.

**Failure-to-arm is an explicit, distinct outcome.** If the watcher never fired,
or fired after the structural check had already run, the result is
**BLOCKED — window missed**. That is retryable, and it is neither a PASS nor a
FAIL of the gate. Recording it as a FAIL would libel correct code; recording it as
a PASS would be fabrication.

4. Restore `Contents/MacOS/Avadon` and `AvScenData.dat` from backup, verify by hash.

---

## §6 Negative control — MANDATORY, runs LAST

An undamaged resume of 112100: ACF still aside, install tree fully restored from
backup (**verify every restore by sha256 first**), then install.

**Expected: `StateFlags=4`.**

Without this, a `1026` from Gate A or Gate B proves nothing. The live null
hypothesis is that this title never earns a `4` at all — in which case both gates
merely re-measured a pre-existing condition.

**If the negative control does not produce `StateFlags=4`, Gates A and B are
UNARBITRABLE — not passed.** Record them with that word.

---

## §7 Traps — each an explicit step, not prose

1. Steam stays QUIT for the whole gate. Verify at the start of each run.
2. **Re-verify `libraryfolders.vdf` by sha256 AFTER each run, not only before.**
   Steam rewrites it and has eaten fixtures before; a check made only beforehand
   is void by the time the run is scored.
3. Read `StateFlags` from the ACF on disk after each run AND record the ACF's
   mtime beside it, so a stale read is detectable.
4. `steam-flags-census stage=download-complete` is PLAN-derived. Its counts prove
   nothing about what was actually transferred. Never cite it as evidence of a
   download.
5. Grep log evidence with SHORT fragments only. Every required string is wrapped
   across source lines; grepping a full sentence returns zero against a correctly
   firing gate.
6. Re-assert native routing per run (§0) — the metadata store is mutable.
7. Restore EVERY backup by hash at the end; the ledger's post-restore column must
   equal the pre-run column. Re-check the two untouchable control hashes too.

---

## §8 Verdict table

Filled by the orchestrator from OBSERVED output only. Empty until driven.

| Gate | Expected | Observed | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| **Gate A** (ENOTEMPTY) | refusal naming `AvScenData.dat`; install fails; ACF `1026`; NO `post-download structural` | refusal fired naming `Avadon.app\Contents\Resources\AvScenData.dat` with `ENOTEMPTY: directory not empty`; `downloadSteamDepots ... download failed — 1 file failure(s)`; ACF `StateFlags "1026"` (od-verified); `post-download structural` **absent (0 hits)**; `removed a stale empty directory` absent (0) | **PASS** | `gamelib-gateA.log`, `acf-gateA-1026.acf` |
| **Gate B** (structural) | `post-download structural` naming `Contents/MacOS/Avadon`, `expected=4273440 found=0`; ACF `1026` | `post-download structural re-verification found 1 of 1215 planned entries damaged or missing — failing closed to StateFlags=1026 instead of an unproven StateFlags=4: "Avadon.app\Contents\MacOS\Avadon" wrong-size (expected=4273440 found=0)`; ACF `StateFlags "1026"` (od-verified); `jobCount=1 reconciledSkipped=1214` so `failures.length===0` and `runLooksComplete` stayed true | **PASS** | `gamelib-gateB.log`, `acf-gateB-1026.acf`, watcher `FIRED 17:53:12 ... 4273440 -> 0` |
| **Negative control** | ACF `StateFlags=4` | Ran **twice**, both `StateFlags=4`: (1) fresh install `jobCount=1215 reconciledSkipped=0` -> `Writing StateFlags=4 full-ownership manifest`; (2) resume `jobCount=0 reconciledSkipped=1215` -> `StateFlags=4` | **PASS** | `gamelib-control.log` |

### Corroborating arithmetic (independent of the log)

Each 1026 ACF's `SizeOnDisk` equals the pristine total minus exactly the damaged file, which
independently confirms `measureInstalledBytes` is a real on-disk walk:

- Gate A: 121,853,904 - 6,026,632 (`AvScenData.dat`) = **115,827,304** = observed.
- Gate B: 121,853,904 - 4,273,440 (`Contents/MacOS/Avadon`) = **117,580,464** = observed.

Both 1026 manifests also carry `buildid "0"` and `BytesDownloaded "0"` - the honest handoff shape,
never a partial-looking 4.

### Deviations from this contract, recorded

1. **The negative control ran FIRST, not last (§6 ordering).** The first install attempt resolved
   `installdir` to the fallback `app_112100` (see §11) and became a clean fresh-install control. A
   second control then ran as a resume. Both passed, so Gates A and B are arbitrable; the ordering
   change cost nothing, and running it twice is stronger than the single run §6 asked for.
2. **Gate A's first arming targeted the wrong root** (`common/app_112100`) and measured nothing;
   re-armed against `common/Avadon The Black Fortress` once the warm path was confirmed. The
   wrong-root run is not counted as a gate result.
3. **One BLOCKED attempt preceded all of this** - Keychain approval timed out
   (`refresh token read failed (timeout)`), zero bytes transferred. Recorded as BLOCKED, not FAIL.

## §11 UNPLANNED FINDING - `installdir` falls back to `app_<appid>` on a cold client

Measured across the four runs. On the **first** install of a session the log shows:

    SteamGame: PICS returned no usable installdir for appId 112100 (absent or blank), using fallback "app_112100"
    SteamGame: appId 112100 installed to fallback directory "app_112100" (PICS installdir was absent/unresolved)

`resolveSteamInstallTarget` completes in **1ms**, before `SteamUser.ensureConnected` has run its
`cold-connect path took 1629ms`. So on a cold session there is no PICS appinfo to read an
`installdir` from, and the install lands in a **duplicate directory** rather than the real one.
Once the client is warm, the same title resolves correctly to `Avadon The Black Fortress` - proven
by runs 3 and 4 in this very session.

Consequence observed live: a 119 MB duplicate of Avadon now sits at
`steamapps/common/app_112100`, orphaned, while the ACF points at `Avadon The Black Fortress`.
This very likely also explains the pre-existing `app_257350`, `app_25900` and `app_402060`
directories in that same folder. Filed as its own todo.

---

## §9 Honesty clause

If a gate cannot be driven, the honest outcome is **BLOCKED, with the reason**.
Never a fabricated pass.

A `not attempted` row is a legitimate result. An invented one is not.

The Expected column above is a **prediction**. It is never evidence, and it must
never be copied into the Observed column. Observed is filled from log output and
on-disk ACF bytes, or it is left `not driven`.

A green verdict that was never run is worse than an open gate, because it retires
the question.

---

## §10 Out of scope

- **No source change under `src/backend/storeManagers/steam/`.** The gate exists to
  measure the shipped code; editing it — including "harmless" extra logging —
  invalidates the measurement. Asserted mechanically:
  `git diff --name-only -- src/backend/storeManagers/steam/` must be empty.
- **No repair of either damaged install.** Native **38410** (`master.dat` still an
  empty directory, 258,221,501 B present under a `StateFlags=4` manifest) and
  native **718850** (13.59 GB short) are NOT repaired, deleted, verified,
  re-installed or otherwise mutated by this gate. Repair is the user's decision.
  Their control hashes in §2 prove non-interference.
- The only paths this gate may write under `~/Library/Application Support/Steam`
  are 112100's own ACF and install tree, each backed up and restored.
