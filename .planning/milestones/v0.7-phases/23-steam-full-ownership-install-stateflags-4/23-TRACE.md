---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 06
artifact: trace
gap: G-23-02
status: verdict-recorded
verdict: H2
requirements: [REQ-23-06, REQ-23-07]
last_updated: 2026-08-16
---

# G-23-02 Root-Cause Trace: EDepotFileFlag Mode Application

**TRACE BEFORE FIX (user-locked).** This document establishes the hypothesis space and the offline
evidence for blocker gap **G-23-02** — it designs NO fix. The fix is gated on the live-run verdict
23-07 records using the census instrumentation Plan 06 Task 1 added
(`src/backend/storeManagers/steam/depot/flagsCensus.ts`, `steam-flags-census` log lines at
`stage=plan-build` / `stage=download-entry` / `stage=download-complete`).

## Symptom

HUMANKIND (Steam appId `1124300`, Denuvo, native Apple-Silicon macOS build) installed cleanly via
GameLib's native `StateFlags=4` full-ownership path — Gate 2 Attempt 2 in `23-UAT.md` confirms steps
1–4 PASS (`appmanifest_1124300.acf` written with `StateFlags "4"`, no verify/re-download observed by
the real Steam client). Launch then failed:

> GameLib reported "Failed to start process for this game: OS error 256". Root cause confirmed on
> disk: **0 of 18,809 installed files carry the execute bit.** The main binary
> `Humankind.app/Contents/MacOS/Humankind` and the nested helper
> `Contents/Frameworks/ZFGameBrowser.app/Contents/MacOS/ZFGameBrowser` both landed `-rw-r--r--`.

The `StateFlags=4` full-ownership path deliberately skips Steam's own verify pass (which would
otherwise set POSIX mode bits per `EDepotFileFlag`), so GameLib's own `applyEDepotFileModes`
(`depot.ts:1274` — chmod `0o755` when `flags & (EXECUTABLE_FLAG=32 | CUSTOM_EXECUTABLE_FLAG=128)`,
called from `downloadSingleFile`'s `if (file.flags)` guard at `depot.ts:1195`) is the ONLY place that
can set `+x` on this path. For this install, it applied to nothing.

A manual `chmod +x` on the two binaries above unblocked the launch and let Gate 2's Denuvo-launch
hypothesis be confirmed (Denuvo accepted the GameLib-installed / Steam-adopted file set with no
re-validation) — but the underlying defect (native install produces non-executable binaries) is
unfixed, and every native macOS (and likely Linux) game installed via this path is unlaunchable until
G-23-02 is closed.

## Hypothesis matrix

| ID | Statement | Confirms | Refutes | Implied fix shape |
|----|-----------|----------|---------|--------------------|
| **H1 — flags never populated** (leading hypothesis) | `fetchDepotPlanEntry` (`depot.ts:524-531`) copies `flags: f.flags` straight from steam-user's `content_manifest.parse()`. `flags` is proto2 `optional uint32 = 3`; if the decoder omits it (or exposes it under a different key/shape than expected) every `DepotPlanFile.flags` is `undefined`, so `if (file.flags)` (`depot.ts:1195`) and `!file.flags` (`depot.ts:1261`, `healReconciledFileModes`'s skip guard) both skip 100% of files. This is the only hypothesis that explains 0/18,809 with **zero recorded mode-application failures** — a real chmod failure would have surfaced as a `DepotDownloadFailure` (T-23-03), and none did. It is also the only hypothesis directly implicated by the test-coverage gap: every `flags`-bearing assertion in the pre-23-06 `depot.test.ts` hand-constructs a `DepotPlanFile` literal with a numeric `flags:` value — none exercises the real `parser.parse()` → `fetchDepotPlanEntry` mapping, so a dropped/renamed/`undefined` `flags` field from the real parser would be invisible to the whole suite while every mode-application unit test kept passing. | `stage=plan-build` census shows `flagBearing: 0` for the whole plan (not just the failing file) AND `chmodAttempts: 0` at `stage=download-complete`. | `stage=plan-build` census shows `flagBearing > 0` (proves flags DO reach the plan; the defect is elsewhere in the pipeline). | Fix `fetchDepotPlanEntry`'s manifest field mapping (or the parser call it depends on) so `flags` is read correctly from the real `content_manifest` payload. |
| **H2 — flags populated but this manifest carries no executable bits** | The manifest itself never marks HUMANKIND's binaries `Executable`/`CustomExecutable` (a content-authoring artifact, not a GameLib bug) — Steam's own verify pass would then be relying on a DIFFERENT signal (e.g. a hardcoded per-title exception, or inferring executability from `.app`/Mach-O structure) that GameLib's manifest-only approach doesn't replicate. | `flagBearing > 0` AND `executableFlagged: 0` in the SAME census. | `executableFlagged > 0` (the bits ARE in the manifest; a code path is failing to act on them). | A macOS Mach-O-structure fallback (chmod `.app/Contents/MacOS/*`) as a SECONDARY safety net — never the primary fix (user-locked: no blanket safety net without first proving H1/H2). |
| **H3 — modes applied then lost** | `applyEDepotFileModes` DID chmod the file, but something later overwrote/replaced it with a non-executable copy (e.g. a subsequent reconciliation pass re-touching the file, or chmod targeting a stale/wrong path that isn't the one Steam/the OS ultimately resolves). | `chmodAttempts > 0` (proves the chmod branch fired) while the on-disk binary is still confirmed non-executable at launch time. | `chmodAttempts === 0` (chmod never even attempted — rules out "applied then lost" entirely, points back to H1/H4). | Find and fix the later overwrite/second-write path; ensure `downloadSingleFile`'s mode-application step is the LAST write to `dest` before the function returns. |
| **H4 — downloadSingleFile never reached those files** | The reconciler (`reconcilePartialState`, consulted at `depot.ts:1326`) treated the binaries as already-verified-complete (e.g. from a stale prior partial attempt) and excluded them from the download job list; `healReconciledFileModes`'s own `!file.flags` skip guard (`depot.ts:1261`, inherited from the SAME potential H1 defect) then ALSO skipped them during the heal pass, so neither the fresh-download mode-application step NOR the heal step ever called `applyEDepotFileModes` on them. | `jobCount` (jobs.length after reconciliation) is far below `totalFiles` on what should have been a FRESH install (no prior partial state), AND `modeCallsites` for those specific files never increments (though the census doesn't isolate per-file — a `jobCount ≈ totalFiles` with `chmodAttempts: 0` still narrows toward H1/H4 jointly, and `reconciledSkipped` at `stage=download-complete` isolates how many files the reconciler treated as pre-verified). | `jobCount ≈ totalFiles` (every file WAS a fresh download job — reconciliation didn't skip anything, so H4 doesn't apply; the defect must be H1/H2/H3/H5). | If reconciliation is wrongly treating a fresh install's files as already-verified, fix the reconciler's freshness check; if `healReconciledFileModes`'s `!file.flags` skip guard is inheriting H1's empty-flags defect, the FIX is H1's fix (fixing flags population fixes the heal path too, since it shares the same guard). |
| **H5 — flags dropped between plan-build and download** | `buildDepotPlan` (plan-build, returns a `DepotPlan`) and `downloadDepotFiles` (download, receives that SAME `DepotPlan` object as its first argument) are two different functions/call sites — if anything serializes/deserializes, clones, or otherwise round-trips the plan between the two (e.g. IPC to the renderer and back, `JSON.parse(JSON.stringify(...))`, or a cache/store write-then-read) a lossy step could silently drop `flags` even though `fetchDepotPlanEntry` populated it correctly. | `stage=plan-build` census shows `flagBearing > 0` while the SAME plan's `stage=download-entry` census (computed on the plan `downloadDepotFiles` actually received) shows `flagBearing: 0` — a direct divergence between the two log lines is the exact fingerprint. | The two census lines are IDENTICAL (proves the plan object reaching `downloadDepotFiles` is byte-for-byte the one `buildDepotPlan` returned — no serialization boundary in between is dropping anything). | Locate and fix whatever intermediate step round-trips the plan (likely IPC serialization if the plan crosses a process boundary) — preserve `flags` through it. |

**Note:** H1 and H2 are the only two hypotheses that would ever justify a Mach-O-structure fallback
(chmod based on file path/structure rather than manifest flags), and even then it is explicitly a
SECONDARY defensive measure, never the primary fix — the user has locked "no blanket safety net before
proving the flags defect" (this plan's explicit non-goal).

## Offline evidence

Gathered read-only from this machine's real Steam library
(`~/Library/Application Support/Steam/steamapps/common/`) on 2026-07-21, using the exact commands
below. **Important caveat established by this gathering exercise itself:** the on-disk state for
HUMANKIND and Cyberpunk 2077 has visibly changed since their respective UAT recordings (see
"Gate 1 trustworthiness assessment" below) — both installs show file counts and Steam-reported
`StateFlags` diverging from what was recorded at UAT time, apparently from unrelated concurrent
activity on this machine earlier the same day (2026-07-21). This is recorded as an INFERENCE, not a
fact — no root cause for the drift was investigated (out of scope for this read-only trace task).
Where the offline census here conflicts with the UAT's own live-recorded numbers, **the UAT recording
is the authoritative primary evidence** (it was captured at the moment of the actual failed launch,
before any further disk-state drift); today's offline pass is corroborating/secondary evidence only.

### Execute-bit census per installed title

Commands used:
```
find "<installdir>" -type f | wc -l
find "<installdir>" -type f -perm -u+x | wc -l
du -sh "<installdir>"
stat -f '%Sp %N' "<binary path>"
```

| Title | Present? | Total regular files (today) | Files with any `+x` (today) | `du -sh` (today) |
|---|---|---|---|---|
| HUMANKIND (1124300) | yes | 1967 | **0** | 1.2G |
| Cyberpunk 2077 (1091500) | yes | 52 | **0** | 5.9G |
| WazHack (264160, spike-003 single-depot control) | yes | 171 | **1** | 112M |

Primary Mach-O binary inspection (`stat -f '%Sp %N'`):
- HUMANKIND: `Humankind.app/Contents/MacOS/` is present as a directory but is **completely empty**
  (0 entries) as of this trace session — `stat` on `Humankind.app/Contents/MacOS/Humankind` returns
  "No such file or directory". Same for the nested helper's directory,
  `Humankind.app/Contents/Frameworks/ZFGameBrowser.app/Contents/MacOS/` (also empty). This means the
  two binaries the UAT recorded as `-rw-r--r--` on 2026-07-21 are **no longer present at all** —
  something removed them (not just their mode) between the UAT recording and this trace session, the
  same day. The UAT's own recorded stat (`-rw-r--r--` for both) remains the authoritative evidence for
  what actually happened at launch time; this trace cannot re-confirm it by direct inspection today.
- Cyberpunk 2077: **no `.app` bundle and no Mach-O binary of any kind exists anywhere under this
  install directory.** `find "Cyberpunk 2077" -iname "*.app"` returns nothing. The only files present
  are engine config (`.ini`/`.json`/`.xml`), shader caches, and REDengine `.archive` data files under
  `archive/Mac/content/`. There is no executable to inspect the mode of.
- WazHack (control): `WazHack.app/Contents/MacOS/WazHack` is present and correctly `-rwxr-xr-x`.

### `.acf` field dump (`inspect-acf.mjs`)

Commands used (per this task's read_first, `.planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs`):
```
node .planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs humankind-23-06 \
  "$HOME/Library/Application Support/Steam/steamapps/appmanifest_1124300.acf"
node .planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs cyberpunk-23-06 \
  "$HOME/Library/Application Support/Steam/steamapps/appmanifest_1091500.acf"
node .planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs wazhack-23-06 \
  "$HOME/Library/Application Support/Steam/steamapps/appmanifest_264160.acf"
```
(Snapshots saved next to the script: `snapshot-humankind-23-06.acf`, `snapshot-cyberpunk-23-06.acf`,
`snapshot-wazhack-23-06.acf` — small text `.acf` files, referenced here by path per the script's own
convention, not committed.)

| Title | StateFlags (today) | BytesToDownload | BytesDownloaded | SizeOnDisk | buildid | Consistent? |
|---|---|---|---|---|---|---|
| HUMANKIND (1124300) | `4` | `0` | `0` | `37592580261` (~35GB) | `23181593` | Steam still treats this as FullyInstalled/no-verify-pending |
| Cyberpunk 2077 (1091500) | **`36`** (= FullyInstalled(4) + FilesMissing(32)) | `0` | `0` | `89902191642` (~84GB) | `20383525` | **Diverged from `StateFlags=4`** — Steam's OWN client has since flagged this install `FilesMissing`. `SizeOnDisk` still claims ~84GB but the actual on-disk content is 5.9GB — a ~93% shortfall. This is Steam's own bookkeeping catching up to a large amount of missing content, observed independently of anything GameLib did in this trace session. |
| WazHack (264160, control) | `4` | `117426878` | `117426878` | `117426878` | `9044149` | Fully self-consistent, matches the actual 112MB on disk |

Hogwarts Legacy (appId `990080`, the title Gate 1's flip-flop defect was originally diagnosed
against) is **no longer installed at all** — neither `appmanifest_990080.acf` nor its `common/`
directory exist on this machine any more. It was evidently uninstalled entirely at some point after
the Gate 1 fix landed.

### Inference: last touched by Steam vs. GameLib (mtime comparison)

Commands used: `stat -f '%Sm' "<path>"` on the `.acf`, the install directory itself, and the
most-recently-modified file inside it.

| Title | `.acf` mtime | installdir mtime | Most-recent file inside | Inference |
|---|---|---|---|---|
| HUMANKIND | 2026-07-21 10:27:29 | 2026-07-21 10:27:26 | a `.webm` movie asset, same timestamp | Touched TODAY, hours before this trace session — well after the UAT's recorded launch failure (also 2026-07-21, earlier). Something modified this install after the defect was recorded; given `Contents/MacOS/` is now empty, this is consistent with a partial removal/cleanup, not a Steam-mediated re-verify (a re-verify would re-populate the executable, not delete it). |
| Cyberpunk 2077 | 2026-07-21 06:33:16 | 2026-07-21 06:32:22 | a `.archive` data file, same timestamp | Also touched TODAY, earlier in the morning. Consistent with the `StateFlags=36` FilesMissing finding above — something removed a large fraction of this install's content after Gate 1's original PASS (2026-07-19). |
| WazHack (control) | 2026-07-19 20:06:27 | 2026-07-19 20:06:17 | a Unity `.assets.resS` file, same timestamp | Unchanged since 2026-07-19 (the spike-003 era) — this install has been stable and was NOT touched by today's (2026-07-21) activity. Its correctly-applied `+x` predates this trace session and cannot be freshly attributed to the current Task-1 instrumentation (which did not exist when WazHack was installed) — whether WazHack's `+x` came from GameLib's code or an earlier Steam-mediated verify pass during spike-003 development is **not resolved by this trace** (inference, not fact: no log evidence from that install session was available to check). |

**These mtimes are an inference about recency and ordering only** — no causal mechanism for the
HUMANKIND/Cyberpunk changes was investigated here (out of scope for a read-only trace task); flagged
for 23-07 to account for when planning the live run (see below).

## Gate 1 trustworthiness assessment

Gate 1 (`23-UAT.md`) recorded a hardware PASS on 2026-07-19: a multi-depot native macOS install
adopted `StateFlags=4` with no verify/re-download, and the title launched. Because HUMANKIND — same
platform, same `StateFlags=4` code path, tested two days later on 2026-07-21 — installed cleanly but
completely failed to launch on the exact same execute-bit defect this trace exists to root-cause,
**Gate 1's launch half is NOT trustworthy until this trace resolves why modes applied (or appeared to
apply) there but not for HUMANKIND.**

This offline pass cannot settle that question, and in fact makes it harder to settle by direct
re-inspection: the offline evidence above shows BOTH of Gate 1's plausible reference titles have
degraded since the PASS was recorded — Hogwarts Legacy (the title the original flip-flop defect was
diagnosed against) is fully uninstalled, and Cyberpunk 2077 (the multi-depot title `23-UAT.md`'s
preconditions section names as the intended target) now shows `StateFlags=36` (FilesMissing) with only
~7% of its expected on-disk content remaining, and **zero Mach-O binaries present anywhere in its
install directory** — there is nothing left to `stat` for an execute-bit verdict either way.

**Which way does the available evidence point?** Weakly, but not conclusively, toward "Gate 1's
launch was NOT a clean StateFlags=4-path cold launch that proves modes applied correctly":
- HUMANKIND (definitively confirmed by the UAT's own live recording, not this offline pass): 0/18,809
  files `+x`, matching this trace's H1-as-leading-hypothesis reasoning above.
- Cyberpunk 2077, at the time it presumably had its full content, is not directly re-inspectable now
  — the only surviving signal is that the leading candidate explanation in the plan
  ("Gate 1's launch went through the Steam UI, which re-applies modes, rather than a GameLib cold
  launch") remains UNREFUTED by anything gathered here, since no log evidence of Cyberpunk's original
  `flags`/mode-application state survived (the `steam-flags-census` instrumentation this plan adds did
  not exist at install time, so no historical log line can be consulted either).
- If Cyberpunk's launch on 2026-07-19 truly went through a StateFlags=4 GameLib-authored install with
  NO Steam-mediated re-verify (as Gate 1's own text claims: "Steam shows the game Ready with NO verify
  pass and NO re-download"), then either (a) Cyberpunk's manifest DID carry executable flags that
  HUMANKIND's did not (H2, title-specific manifest difference), or (b) the actual LAUNCH step itself
  (not the install) went through a path that doesn't require `+x` to already be set (e.g. `steam://`
  handing off to the real Steam client, which could conceivably chmod on launch rather than on
  install) — this is a NEW candidate worth the live run checking directly rather than inferring.

**This is recorded as an open, unresolved question for 23-07's live run, not a conclusion.** The
live run should, if possible, re-run Gate 1's multi-depot scenario fresh (a clean re-install, not a
reused/degraded prior install) with the new `steam-flags-census` logging in place, and directly
compare its `stage=plan-build` / `stage=download-entry` / `stage=download-complete` census lines
against a fresh HUMANKIND (or equivalent Denuvo native title) re-install's census lines.

---

### RESOLVED 2026-08-16 by 23-07 Task 2 — **VERDICT: MASKED**

**Observation 1 — the planned cold-launch test is not performable.** Cyberpunk 2077's install is
unchanged from the 2026-07-21 offline pass: `52` regular files, `0` with `+x`, **no `.app` bundle and
no Mach-O binary anywhere under the install root**, `.acf` `StateFlags 36` (FullyInstalled +
FilesMissing) with `SizeOnDisk` still claiming ~84GB. Task 2's step 1 anticipated the "binaries do
NOT carry `+x`" branch; the actual state is stronger — **there is no binary to launch at all.** A
GameLib cold launch would therefore fail for reasons unrelated to execute bits and would return no
signal, so it was deliberately **not attempted**. Consequently the two conditions Task 2's acceptance
criteria ask to record — whether the Steam client was confirmed not running before the launch, and
whether Steam auto-started during it — are **not applicable: no launch was performed.**

**Observation 2 — operator recall (step 3).** Asked directly whether the 2026-07-19 Gate 1 launch was
performed via the Steam client's Play button or via GameLib, the operator answered: **cannot recall
confidently.** Recorded as an honest UNKNOWN per step 3's explicit instruction not to reconstruct it.

**Observation 3 — the decisive measurement, substituted for unavailable recall.** Rather than resting
the verdict on memory, Cyberpunk's own manifest was censused using the same before-any-bytes technique
that closed Task 1: a GameLib install was started and cancelled immediately after `buildDepotPlan`
returned.

```
(21:49:53) [INFO]:    [Steam]:           steam-flags-census stage=plan-build appId=1091500 depots=3 totalFiles=133 flagBearing=32 executableFlagged=0 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=32 symlinkEntries=0 zeroSizeEntries=32 distinctFlagValues=[64]
(21:49:53) [INFO]:    [Steam]:           steam-flags-census stage=download-entry appId=1091500 totalFiles=133 flagBearing=32 executableFlagged=0 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=32 symlinkEntries=0 zeroSizeEntries=32 distinctFlagValues=[64]
```

**`executableFlagged=0`, `distinctFlagValues=[64]` across all three depots** — the identical signature
to HUMANKIND. Cyberpunk 2077's manifest carries no executable flags either.

**Verdict: MASKED.** A GameLib `StateFlags=4` install of Cyberpunk 2077 would land **zero** executable
files, exactly as HUMANKIND's did. Therefore the successful launch Gate 1 recorded on 2026-07-19
**cannot** be explained by execute bits GameLib applied — the writer had none to apply. Something
outside GameLib's install path supplied them (or the launch did not originate from a GameLib-authored
`StateFlags=4` install at all). **Gate 1's launch half does not stand** and needs the cheap
re-confirmation planned in 23-10.

**Honesty limit — what this does NOT establish.** This proves what did *not* launch Cyberpunk; it does
not identify what did. The specific mechanism — Steam UI Play button, versus a `steam://` handoff that
starts the Steam client which then re-applies modes — remains **unobserved**, and is no longer
observable on this machine (no binary survives, and the install has since been overwritten by the
Task 2 census run). 23-10 should confirm Gate 1 against a title that is *freshly* installed by GameLib
and launched with the Steam client verified not running, rather than attempting to reconstruct the
2026-07-19 event.

### Cross-title pattern (all `stage=plan-build` censuses gathered by this trace)

| Title | appId | depots | totalFiles | flagBearing | executableFlagged | distinctFlagValues |
|---|---|---|---|---|---|---|
| WazHack | 264160 | 1 | 198 | 28 | **1** | `[32,64]` |
| HUMANKIND | 1124300 | 2 | 18949 | 140 | **0** | `[64]` |
| Cyberpunk 2077 | 1091500 | 3 | 133 | 32 | **0** | `[64]` |

In every case `flagBearing` equals `directoryEntries` exactly, except WazHack's single extra
executable. **Two of three native macOS titles carry no executable flag whatsoever, and the third
carries exactly one** — so a manifest bearing usable execute bits is the exception, not the rule.
This generalises Task 1's finding beyond the single failing title: 23-08's fix cannot treat missing
executable flags as an anomaly to special-case, because it is the normal condition. Note the depot
counts (1, 2, 3) also rule out any depot-count-dependent cause across the whole observed range.

## Live run 1 — WazHack (264160), single-depot native control

Recorded 2026-08-16. Electron runtime (the Tauri sidecar's file logger is not readable — stdout is
the RPC pipe), `enableSteamNativeInstall` ON, no `GAMELIB_SPIKE_STATEFLAGS4` env flag.

**T-23-22 freshness — established by the census itself, not by trusting the uninstall.** The prior
copy was uninstalled first and a pre-run baseline captured to
`~/Library/Logs/GameLib/23-07-archive/wazhack-pre-uninstall-baseline.txt` (2026-08-14T08:28:20Z).
That uninstall is, however, the subject of an open concurrent debug session
(`.planning/debug/wazhack-uninstall-reverts.md`, 2026-08-16): the UI reported completion and then
reverted to showing the title installed. So the uninstall's *own report* cannot be used to certify a
fresh run — precisely the stale-prior-install scenario T-23-22 warns produces a falsely-confirmed H4.

The census settles it independently: `jobCount=198` equals `totalFiles=198` with
`reconciledSkipped=0`. Every entry was downloaded and the reconciler skipped nothing. Had files
survived the uninstall, 23-03's reconciler would have sha1-verified and skipped them, driving
`reconciledSkipped>0` and `jobCount<198`. **Inference (mechanism not separately investigated):** the
uninstall did delete from disk and only the library's *displayed* install state reverted — which is
consistent with the debug session's own symptom description. Either way the run is certified fresh by
direct measurement, so H4's refutation below does not rest on the uninstall having worked.

**Title / appId used:** WazHack / `264160` — single depot (`264162`), native macOS.

**`steam-flags-census` log lines (all three stages, verbatim from `~/Library/Logs/GameLib/gamelib.log`):**

- `stage=plan-build`:
```
(21:13:03) [INFO]:    [Steam]:           steam-flags-census stage=plan-build appId=264160 depots=1 totalFiles=198 flagBearing=28 executableFlagged=1 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=27 symlinkEntries=0 zeroSizeEntries=27 distinctFlagValues=[32,64]
```
- `stage=download-entry`:
```
(21:13:03) [INFO]:    [Steam]:           steam-flags-census stage=download-entry appId=264160 totalFiles=198 flagBearing=28 executableFlagged=1 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=27 symlinkEntries=0 zeroSizeEntries=27 distinctFlagValues=[32,64]
```
- `stage=download-complete`:
```
(21:13:15) [INFO]:    [Steam]:           steam-flags-census stage=download-complete appId=264160 totalFiles=198 flagBearing=28 executableFlagged=1 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=27 symlinkEntries=0 zeroSizeEntries=27 chmodAttempts=1 modeCallsites=1 jobCount=198 reconciledSkipped=0 distinctFlagValues=[32,64]
```

**Execute-bit census of the landed install (read-only, no chmod performed):**

| Measure | Value |
|---|---|
| Total regular files | `171` |
| Files with any `+x` | `1` |
| Primary binary | `-rwxr-xr-x .../WazHack.app/Contents/MacOS/WazHack` |

`198` census `totalFiles` = `171` regular files + `27` directory entries, self-consistent.

**Written `.acf` (`inspect-acf.mjs`):** `StateFlags 4`, `BytesToDownload 117426878`,
`BytesDownloaded 117426878`, `SizeOnDisk 117426878`, `buildid 9044149` — fully self-consistent,
Steam treats it as FullyInstalled with no verify pending. (`LastOwner` deliberately not transcribed,
per T-23-20.)

### Verdict for run 1: H1, H3, H4, H5 all REFUTED — the defect did NOT reproduce

| ID | Status | Refuting field value |
|----|--------|----------------------|
| H1 | **REFUTED** | `stage=plan-build flagBearing=28` (not `0`), `distinctFlagValues=[32,64]`, and `chmodAttempts=1` (not `0`). The steam-user parser mapping at depot.ts:524-531 **does** populate `EDepotFileFlag`. |
| H2 | **not applicable to this title** | `executableFlagged=1`, not `0`. H2's predicate is unmet here; it is neither confirmed nor refuted for the *failing* title. See "surviving hypothesis" below. |
| H3 | **REFUTED** | `chmodAttempts=1` **and** the landed binary is `-rwxr-xr-x`. Modes were applied and retained, at the correct path. Exact 1:1 correspondence: 1 `executableFlagged` → 1 `chmodAttempt` → 1 `+x` file on disk. |
| H4 | **REFUTED** | `jobCount=198` equals `totalFiles=198` and `reconciledSkipped=0` — every entry was downloaded, the reconciler skipped nothing. |
| H5 | **REFUTED** | `plan-build flagBearing=28` == `download-entry flagBearing=28`, with identical `distinctFlagValues=[32,64]` and identical every-field values. No serialization boundary drops flags. |

**Cross-check against Steam's own output — the strongest single result of this run.** The 2026-08-14
pre-uninstall baseline captured the *Steam-installed* WazHack: `171` regular files, `1` with `+x`,
that one being `Contents/MacOS/WazHack` at `-rwxr-xr-x`, with
`PlugIns/unitypurchasing.bundle/Contents/MacOS/unitypurchasing` at `-rw-r--r--`. GameLib's native
install reproduced that layout **exactly** — same counts, same file, same modes, same
`-rw-r--r--` on `unitypurchasing`. (`file` reports `unitypurchasing` as a Mach-O *bundle*, which is
`dlopen`'d rather than `exec`'d and correctly needs no execute bit; Steam does not set one either.)
The mode pipeline is not merely internally consistent — on this title it is byte-for-byte identical
to the reference implementation.

**Surviving hypothesis: H2, or a shape the H1-H5 matrix does not cover.** Because the pipeline is
proven faithful — it applies exactly the flags the manifest carries, no more and no less — HUMANKIND's
recorded `0 of 18,809 +x` implies its manifest carried no executable flags for those paths, which is
H2. **This run cannot establish that**, and one structural limit must be recorded rather than glossed:

> **The control is single-depot (`depots=1`); the failing title is multi-depot.** A defect that only
> manifests when flags are merged across multiple depots would be invisible to this run and is not
> represented anywhere in the H1-H5 matrix. The matrix was built on the premise (§Hypothesis matrix)
> that H1 is a property of the parser mapping and therefore title-independent — that premise held and
> H1 is now refuted, but refuting it moves the surviving space into title- and depot-shape-specific
> causes that a single-depot control is by construction unable to reach.

Per this plan's step 7 (`flagBearing > 0` ⇒ escalate to the failing title), run 2 was performed
against HUMANKIND. **Its `stage=plan-build` line returned `executableFlagged=0`, confirming H2** —
see the verdict below. Both concerns raised in this section are settled there: the cause is manifest
content, and the `depots=2` census shows no multi-depot merge defect.

*(Method note for future traces: the decisive line is emitted at `buildDepotPlan` return —
depot.ts:748 — **before any bytes download**. Run 2's install failed at 17% yet still yielded a
complete verdict, so this observation never requires a full re-download.)*

## Live run 2 — HUMANKIND (1124300), the failing multi-depot title

**Status: CENSUS CAPTURED 2026-08-16. Verdict closed — H2 CONFIRMED.**

Fresh run, certified by direct measurement: HUMANKIND was uninstalled first (Steam handled the
prompt), and before the install the install directory was **gone**, residual file count **0**,
`appmanifest_1124300.acf` **absent**, no `downloading/1124300` staging directory, and
`libraryfolders.vdf` lists a single library so no second copy could hide elsewhere. T-23-22 satisfied.

The install later failed partway (see "Incidental defect" below), but **both pre-download census
stages had already been emitted**, and those are the stages the verdict depends on.

**`steam-flags-census` log lines (verbatim from `~/Library/Logs/GameLib/gamelib.log`):**

- `stage=plan-build`:
```
(21:28:43) [INFO]:    [Steam]:           steam-flags-census stage=plan-build appId=1124300 depots=2 totalFiles=18949 flagBearing=140 executableFlagged=0 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=140 symlinkEntries=0 zeroSizeEntries=146 distinctFlagValues=[64]
```
- `stage=download-entry`:
```
(21:28:43) [INFO]:    [Steam]:           steam-flags-census stage=download-entry appId=1124300 totalFiles=18949 flagBearing=140 executableFlagged=0 readonlyFlagged=0 hiddenFlagged=0 directoryEntries=140 symlinkEntries=0 zeroSizeEntries=146 distinctFlagValues=[64]
```
- `stage=download-complete`: **not emitted** — the run did not reach completion. Not required for the
  verdict: H2's predicate is evaluated entirely on `plan-build`.

### VERDICT: **H2 CONFIRMED**

> **H2 — flags populated, but this manifest carries no executable bits.**

Confirming field values: `flagBearing=140` (> 0, so flags *are* populated) **and**
`executableFlagged=0`. Decisively corroborated by `distinctFlagValues=[64]` — across **both** depots
(`depots=2`) the only `EDepotFileFlag` value present anywhere in HUMANKIND's manifest is `64`
(`Directory`). There is no `32` (`Executable`) and no `128` (`CustomExecutable`). The 140
flag-bearing entries are exactly the 140 `directoryEntries`.

This closes G-23-02: GameLib applied precisely the modes HUMANKIND's manifest specified, and the
manifest specified no executable bits for any of its 18,949 entries. The `0 of 18,809 files +x`
recorded at the original launch failure is the writer behaving **correctly** against a manifest that
carries nothing to apply. Under `StateFlags=4` Steam runs no verify pass, so nothing downstream ever
supplies the missing bits — the title is unlaunchable.

**Refutations of the other four hypotheses** (run 1 = WazHack `264160`, run 2 = HUMANKIND `1124300`):

| ID | Status | Field value that refutes it |
|----|--------|------------------------------|
| H1 | **REFUTED** | run 2 `flagBearing=140`, not `0` — the parser mapping populates flags for this title too; run 1 additionally showed `chmodAttempts=1`. The defect is not a dead mapping. |
| H3 | **REFUTED** | run 1 `chmodAttempts=1` with the landed binary at `-rwxr-xr-x` — modes are applied and retained at the correct path. Run 2 has no executable flags to attempt, so no "applied then lost" case exists. |
| H4 | **REFUTED** | run 1 `jobCount=198` = `totalFiles=198` with `reconciledSkipped=0` on a certified-fresh install — the reconciler skips nothing. Run 2 was likewise certified fresh (empty install root, no `.acf`, no staging dir). |
| H5 | **REFUTED** | In **both** runs `plan-build` and `download-entry` are field-for-field identical (run 1 `flagBearing=28`/`[32,64]`; run 2 `flagBearing=140`/`[64]`). No serialization boundary drops flags. |

The single-depot-control concern raised in run 1 is also now **resolved**: run 2's `depots=2` census
shows flags surviving a two-depot merge intact (140 directory flags carried through to
`download-entry` unchanged). There is no multi-depot-specific defect — the cause is the manifest
content itself.

### Implied fix shape (handed to 23-08)

**`EDepotFileFlag` is not a sufficient source of executability on macOS, and must stop being treated
as one.** The decisive cross-run evidence:

| | WazHack (264160) | HUMANKIND (1124300) |
|---|---|---|
| Manifest `executableFlagged` | `1` | `0` |
| Steam's own install, files with `+x` | `1` of `171` | **`18,002`** of `18,809` |

Steam's own installed HUMANKIND carries 18,002 execute bits — per-file, not blanket (`.wem`, `.txt`,
`.dll`, `.manifest` are excluded; and `freetype6.dylib` is `+x` while `freetype6` beside it is not),
captured to `~/Library/Logs/GameLib/23-07-archive/humankind-pre-uninstall-baseline.txt`. Since the
manifest supplies **zero** executable flags, **the real Steam client is demonstrably deriving those
bits from something other than `EDepotFileFlag`.** A writer that only replays manifest flags cannot
reproduce Steam's result, and `StateFlags=4` guarantees no later verify pass will repair it.

This selects **23-08's H2 branch**, including its Task 3 secondary fallback: derive executability by
**Mach-O magic-byte detection, never by path** (23-08's own grep gate requires
`grep -c "Contents/MacOS"` to return `0`). Note run 1's constraint on any such heuristic — Steam
leaves Mach-O *bundles* (`unitypurchasing`, `freetype6`) non-executable while marking executables and
dylibs `+x`, so magic-byte detection must discriminate Mach-O subtype, not merely "is Mach-O".

**Fail-closed interaction (REQ-23-01).** Until executability can be established, `StateFlags=4` is
unsafe for such a title: `canWriteFullOwnership(...)` should decline and fall back to Phase 21's
`1026` verify-handoff, letting Steam's verify pass supply the bits. Run 2 never wrote an `.acf` at
all (`no acf` on disk after the failure), so this trace does not observe the gate's live behavior.

### Incidental defect found during run 2 — orphaned depot download (NOT G-23-02)

`(21:36:40) [ERROR]: [DownloadManager]: Installation of 1124300 failed with: install did not settle —
connection may be stale`, immediately followed by `Installation of 1124300 failed!`. **The depot
chunk-stream loop did not stop.** `[Timing] chunk-stream stats` continued past the failure through at
least `@696s` (21:40:20, `percent=17%`), with the on-disk file count still climbing (4,297 files
observed after the reported failure) — the download outlived the DownloadManager's own abort.

The failure timestamp coincides with a concurrent library sync on the same connection
(`SteamUser.ensureConnected: already connected (fast path, canary OK)` 21:36:40,
`Steam: fetched 378 owned games` 21:36:41, `Steam library sync complete: 378 games` 21:36:43),
so the settle-check plausibly lost a race with the connection canary. **Inference, not fact — no
mechanism was investigated.** This is adjacent to 23-05's single-flight/abort-before-restart work but
is a distinct shape: not two concurrent installs, but one install whose failure path fails to cancel
its own worker. Recorded here for triage; it is **out of scope for G-23-02 and for this plan.**

**Contamination warning — HUMANKIND's current on-disk state is NOT admissible evidence.** Read-only
census taken 2026-08-16 alongside run 1:

| Measure | 2026-07-21 (this document, §Offline evidence) | 2026-08-16 (today) |
|---|---|---|
| Total regular files | `1967` | `18809` |
| Files with any `+x` | `0` | `18002` |
| `Contents/MacOS/Humankind` | absent (directory empty) | present, `-rwxr-xr-x` |
| `ZFGameBrowser` helper | absent | present, `-rwxr-xr-x` |
| `.acf` `BytesDownloaded` | `0` | `15166122928` |

The install has gone from partially-deleted to fully present with execute bits since the trace was
written, and the file count now matches the UAT's original `18,809` exactly. **Inference, not fact
(no mechanism was investigated):** this is consistent with a full Steam-mediated re-download/repair in
the interim, rather than with mode-only re-application to the files GameLib originally wrote — a
mode-only repair would not restore binaries that §Offline evidence recorded as *absent*. Either way,
nothing about GameLib's writer can be read off this install today. Note also `SizeOnDisk`
(`37592580261`) still exceeds `BytesDownloaded` (`15166122928`), so Steam's own bookkeeping for this
title remains internally inconsistent.

**Required to close the verdict:** HUMANKIND's `stage=plan-build` census line (`depots`,
`flagBearing`, `executableFlagged`), captured from a GameLib native install that may be cancelled as
soon as the line appears.

**Gate 1 re-run comparison (if performed): did a fresh multi-depot native install's census match or
diverge from the single-depot control's census?** — pending run 2.

## Scope fence

macOS only, per D-07 (`23-CONTEXT.md`) — this trace and the instrumentation it documents cover the
macOS native-install path exclusively. Windows/Linux `EDepotFileFlag` coverage (Windows read-only/
hidden attributes via `depot/fileAttributes.ts`, Linux execute-bit parity) is explicitly deferred, per
the existing D-07 scope note in `23-CONTEXT.md` and `23-UAT.md`'s own "Windows/Linux coverage" section
— not tracked by this document, not a gate for this phase.
