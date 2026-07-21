---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 06
artifact: trace
gap: G-23-02
status: awaiting-live-run
requirements: [REQ-23-06, REQ-23-07]
last_updated: 2026-07-21
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

## Live-run recording template (23-07 fills in)

**Title / appId used:**

**`steam-flags-census` log lines (all three stages, verbatim from `~/Library/Logs/GameLib/gamelib.log`):**

- `stage=plan-build`:
- `stage=download-entry`:
- `stage=download-complete`:

**Verdict — which single hypothesis (H1-H5) is confirmed:**

**Supporting reasoning (which census field(s) matched the confirm/refute criteria above):**

**Implied fix shape (handed to 23-08):**

**Did the two `stage=plan-build`/`stage=download-entry` census lines match exactly, or diverge (H5)?**

**`jobCount` / `reconciledSkipped` from `stage=download-complete` (H4 check):**

**`chmodAttempts` / `modeCallsites` from `stage=download-complete` (H3 check — did chmod even fire?):**

**Gate 1 re-run comparison (if performed): did a fresh multi-depot native install's census match or
diverge from the single-depot HUMANKIND-equivalent census?**

## Scope fence

macOS only, per D-07 (`23-CONTEXT.md`) — this trace and the instrumentation it documents cover the
macOS native-install path exclusively. Windows/Linux `EDepotFileFlag` coverage (Windows read-only/
hidden attributes via `depot/fileAttributes.ts`, Linux execute-bit parity) is explicitly deferred, per
the existing D-07 scope note in `23-CONTEXT.md` and `23-UAT.md`'s own "Windows/Linux coverage" section
— not tracked by this document, not a gate for this phase.
