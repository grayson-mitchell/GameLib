---
quick_id: 260909-nzb
date: 2026-09-09
status: complete
---

# 260909-nzb — SUMMARY

Actioned `.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md`.

## What was corrected at the desk

1. **Item 3 ANSWERED, its hypothesis REFUTED.** 718850's shortfall is not the
   `selectAllDepots` DLC-union artifact the todo suspected. DLC-tagged depots total
   561,517,956 B against a 13.59 GB shortfall; the base depots alone (16,589,780,460 B)
   overshoot what is on disk (3,560,381,799 B) by 13.03 GB. DLC covers at most 4.1%.
   It is real content missing from base depot 718851.
2. **"Suspected mechanism" RETIRED.** `SizeOnDisk` equals `sum(InstalledDepots[].size)`
   byte-exactly in **18 of 23** manifests on this machine — healthy and damaged,
   Steam-written and GameLib-written alike. Byte-exactness is the ordinary case and
   discriminates nothing.
3. **The gate design was WRONG and was corrected before it was driven.** An ENOTEMPTY
   refusal populates `failures[]`, so `runLooksComplete` is false and
   `verifyStructuralIntegrity` is skipped entirely. The repair half and the structural
   half are mutually exclusive and need two runs. Driving the todo's single prescribed
   run would have produced a green result proving the wrong half.

## What the live gate measured

Native path, appId 112100, live Steam, real fs. **All three gates PASS.**

| Gate | Verdict | Key evidence |
| --- | --- | --- |
| Gate A — ENOTEMPTY | **PASS** | refusal naming `AvScenData.dat`; install failed; ACF `1026`; structural line **absent** (confirms the mutual exclusion live) |
| Gate B — structural | **PASS** | `post-download structural ... "Avadon.app\Contents\MacOS\Avadon" wrong-size (expected=4273440 found=0)`; ACF `1026` |
| Negative control | **PASS** ×2 | fresh install and resume both earned `StateFlags=4` |

**`verifyStructuralIntegrity` is now proven live** — the todo's headline claim
("unproven live") is discharged for the structural half. One attempt before these was
**BLOCKED** on Keychain approval and is recorded as BLOCKED, not as a failure.

## Unplanned finding, filed

`resolveSteamInstallTarget` (1 ms) runs before `SteamUser.ensureConnected` (1629 ms
cold connect), so the first install of a session has no PICS appinfo and falls back to
a duplicate `app_<appid>` directory. Filed as
`.planning/todos/pending/2026-09-09-cold-session-installdir-falls-back-to-app-appid.md`.

## What remained OPEN at the time of writing (SUPERSEDED — see the note at the end)

**Both damaged installs are still damaged and still unrepaired, deliberately.** Native
**38410** (`master.dat` still an empty directory, 258,221,501 B under a `StateFlags=4`
manifest) and native **718850** (13.59 GB short) were not repaired, verified, deleted
or mutated by this task — the user chose to leave them alone. Their ACF sha256 hashes
were recorded before the gate and re-verified after, unchanged:

- `appmanifest_38410.acf` = `8a48ad5a4caf9db4edb7ed9a74364fbd0bb694862b5e4a1dc2a0c3f064b3241f`
- `appmanifest_718850.acf` = `add630ea02bd70bdec4d4c7732c5e51a438c788c5df5f655619aa6b7e57787bf`

Note these two manifests were written by the **Steam client**, not GameLib, so a proven
fail-closed GameLib gate does not explain them. The todo stays `status: OPEN`,
`severity: major`, `ready: human` — the only outstanding item is the user's repair
decision.

## Cleanup — DONE 2026-09-09

The 119 MB orphan created by this session's first (cold) install at
`steamapps/common/app_112100` was **removed on the user's explicit instruction**.
Before deleting, it was confirmed unreferenced: no `appmanifest_*.acf` named
`app_112100`, the 112100 ACF pointed at `Avadon The Black Fortress`, and `lsof`
showed no open handles. After deleting, the surviving install was re-verified at
1209 files / 121,853,904 B with `AvScenData.dat` and the `Avadon` binary hashing to
their pre-run values.

**The three PRE-EXISTING `app_*` directories were left alone** — `app_257350`,
`app_25900`, `app_402060`. They predate this session, they are the user's data, and
removing them is the user's decision, not cleanup owed by this task. They are almost
certainly earlier instances of the same cold-session fallback defect (see the todo
filed above).

## Restoration

Every mutated path was restored and hash-verified against its pre-run value: the 112100
ACF, `AvScenData.dat`, `Contents/MacOS/Avadon`, and `libraryfolders.vdf`. The Avadon
tree is back to 1209 files / 121,853,904 B. No file under
`src/backend/storeManagers/steam/` was modified — the gate measured shipped code.


---

## SUPERSEDED 2026-09-09 (later the same day) — both games uninstalled

The "What remained OPEN" section above says native 38410 and 718850 are still damaged
and unrepaired by user decision. **The operator reversed that decision shortly after and
asked for both to be removed from disk.** Both were uninstalled through Steam's own
`steam://uninstall/<appid>` (Steam was running by then, so hand-deleting underneath it
was rejected as unsafe); ~2.7 GB reclaimed, manifest count 23 → 21, nothing else
affected. Both damaged ACFs were preserved first under `damaged-acf-evidence/` with
hashes matching the pre-gate controls. Corrected in place on the closed todo too.
