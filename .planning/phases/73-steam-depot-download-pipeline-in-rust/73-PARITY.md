# Phase 73 Parity Report (plan 73-16)

Status: APPROVED by the operator. Sweep exit code 1 is an explained deviation (ACF diffs are Steam's own rewrite after adoption).

## Corpus (Task 1, operator decision: option-a with edits)

Parity library: `PARITY_LIB` (a dedicated Steam library folder outside the operator's real library; the path is kept out of this report).

| Label | Title | D-14 bullet | Expected evidence (from the `[depot-rust] outcome` line) |
| ----- | ----- | ----------- | -------------------------------------------------------- |
| civ5 | Sid Meier's Civilization V | zip/deflate (pk) per 067a; counts as LZMA only if `vz` > 0 | `pk` > 0 |
| dredge | DREDGE | zstd / VSZa | `vsza` > 0 |
| stellaris | Stellaris | multi-depot cross-depot path collision | `collisions=` > 0 plus the `cross-depot path collision detected` warning |
| humankind | HUMANKIND | Mach-O +x fallback | `macho=` > 0 |
| redist | Schedule I: Free Sample | shared-redist job | `acf=none` |

LZMA coverage is open: if no title shows `vz` > 0 after the Rust run, propose Civilization: Beyond Earth as the LZMA addition (not swapped silently). The Binding of Isaac was dropped: it is 32-bit and was redirected to the bottle, outside the native path and the parity library.

A title whose evidence is 0 is reported to the operator with a replacement suggestion; it is not swapped silently.

The six Phase 74 stale bridge fixtures (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs) are excluded and are not installed, updated or touched in this plan.

## Task 2 notes

### TS run (GAMELIB_DEPOT_PIPELINE=ts), from the app log

| Label | App id | Depots | TS seconds (downloadSteamDepots) | Bytes (selected depot size) |
| ----- | ------ | ------ | -------------------------------- | --------------------------- |
| civ5 | 8930 | 34481.. (macOS set) | 301.2 (an earlier attempt was cancelled at 12.9 s and discarded) | 7716100293 SizeOnDisk |
| dredge | 1562430 | 1562432 | 46.7 | 812771281 |
| stellaris | 281990 | 281991, 281993, 553280, 554350 | 782.5 | 30426752686 SizeOnDisk |
| humankind | 1124300 | 1124302, 1124303 | 1006.9 | 37754293437 SizeOnDisk |
| redist | 3205720 | 3205721 (windows) | 123.0 (a full bridge-game install, not into the parity library) | 2218973886 |

Peak RSS: not sampled (no answer from the operator; default is to note it as not sampled).

### Shared-redist bullet on the TS run
Not exercised. After the Schedule I install the log shows no redist download, and at launch it says "shared redists already settled, nothing to do". `Steamworks Shared` already exists in the operator's real Steam library. The redist bullet needs that state set aside before the run (see the checkpoint).

### Incidents (not part of the parity result)
- The operator had set `defaultSteamPath` to the parity steamapps folder, which produced a false "Steam hasn't been opened" prompt and a failed uninstall of the real Civ V. It has been restored to the default Steam path, and the parity library is registered in Steam's libraryfolders.vdf.
- Civ V was uninstalled from the real library so it could be installed into the parity library; the operator must reinstall it in the real library after the plan.
- Parity library layout: the installs landed in a nested `steamapps/steamapps` under the registered folder.

### Between runs
Within the parity library only, each TS ACF, game tree and the workshop folder were renamed with a `.ts-parity` suffix, so the library shows no installed titles and no appmanifest for the Rust run.

### Redist bullet set-aside (operator approved, "ok redist")
The TS run's launch logged `shared redists already settled, nothing to do`, so the redist job was a no-op. Both were GameLib-owned state, not the operator's real Steam library, which was not touched:
- The per-bottle ledger `gamelib-shared-redists.json` of the Schedule I bridge bottle: backed up next to itself as `gamelib-shared-redists.json.parity-bak`, then only its `settled` key removed (its `done` map was already empty).
- GameLib's redist cache `steam_store/sharedRedist` (about 261 MB) renamed to `sharedRedist.ts-parity`.
- Schedule I's game tree in the bridge bottle was not touched (not approved).

Order: TS relaunch and one Schedule I launch (TS redist job) -> rename the new `sharedRedist` to `sharedRedist.ts-out` and reset the bottle ledger's `settled` and `done` again -> Rust run and one Schedule I launch (Rust redist job).

Restore after the plan: delete the Rust-run `sharedRedist`, and `sharedRedist.ts-out` once compared, rename the original `sharedRedist.ts-parity` back to `sharedRedist`, and copy `gamelib-shared-redists.json.parity-bak` back over the bottle ledger.

### Redist bullet: Schedule I opts into no shared redists
With an authenticated session (explicit Refresh, then Play within the 60 s idle grace) the TS redist step for Schedule I ran and settled with `optIn=[]`, `depotIds=[]`: the game opts into no shared redists, so there is nothing to download and no `Steamworks Shared` output to compare. Schedule I therefore cannot cover the shared-redist bullet. A replacement title that opts into shared redists is needed (operator decision). Nothing else was set aside this round; the Schedule I game tree in the bridge bottle was not renamed.

Observation for a follow-up todo: after Ctrl-C of `tauri dev`, the sidecar (parent pid 1) was still running about 20 s after its stdin-closed log line, in two successive rounds.

### Redist title change: Amnesia: The Dark Descent (57300)
Schedule I settled with `optIn=[]` (no shared redists), so the shared-redist bullet moves to Amnesia: The Dark Descent (operator decision, option a). Only the redist job is compared for Amnesia; its game tree is not reinstalled or renamed. Set aside for it:
- Its bottle ledger `gamelib-shared-redists.json` backed up as `gamelib-shared-redists.json.parity-bak`, then `settled` removed and `done` emptied (it held two vcredist 2010 entries, x86 and x64, for depot 228983).
- The GameLib `sharedRedist` cache stays set aside as `sharedRedist.ts-parity`; no new `sharedRedist` existed when this was done.
- After the TS Amnesia run: rename the produced `sharedRedist` to `sharedRedist.ts-out`, reset the ledger's `settled` and `done` again.
- Restore after the plan: copy each `.parity-bak` ledger (Schedule I bridge bottle and Amnesia bottle) back over its ledger, delete the Rust-run `sharedRedist`, and rename the originals back.

### Follow-up items
- Orphaned sidecar: after Ctrl-C of `tauri dev`, `sidecar.js` stayed alive with parent pid 1, in three successive rounds (still alive between rounds). The sidecar exit contract (exit by event-loop drain at stdin EOF) is not being met in this scenario; needs a todo.
- Authenticated-session gotcha for live parity runs: the session closes 60 s after the last lease release (AUTH_SESSION_IDLE_GRACE_MS), so Play must follow Refresh within 60 s or the redist step is deferred.

### TS Amnesia (57300) redist run, and set-aside before the Rust run
- The TS redist download happened: depot 228983 plan built, chunks streamed, and a 18 MB `steam_store/sharedRedist` produced. The install step logged "vcredist 2010 (x86/x64) already marked in the bottle registry", so the installer was not re-run inside the bottle. That is fine for a download-tree comparison. The registry mark is left as is, so the Rust run starts from the same state.
- Amnesia then exited abnormally after about 11 s (`overlay-exit-abnormal`, a fatal error seen by the operator). Unrelated to the depot pipeline; not investigated.
- Renamed `sharedRedist` to `sharedRedist.ts-out`; the Amnesia ledger's `settled` and `done` were reset again (the backup is still `.parity-bak`).
- The Schedule I bridge bottle's `Schedule I Demo` tree and its `appmanifest_3205720.acf` were renamed with a `.ts-parity` suffix (approved, rename only). Restore: delete the Rust-run tree and manifest, then rename the `.ts-parity` copies back.
- Leftover sidecars: by the time "ok kill" was acted on, no `sidecar.js` or `gamelib-shell` remained, so nothing was killed. That was the third orphaned-sidecar occurrence (pids not recorded).
- The sidecar was rebuilt after these renames.

## Rust run outcome lines (from the sidecar log)

| Label | App id | status | acf | vz | vsza | pk | macho | collisions | bytes | Rust seconds |
| ----- | ------ | ------ | --- | -- | ---- | -- | ----- | ---------- | ----- | ------------ |
| schedule-i | 3205720 | completed | 4 | 2774 | 0 | 0 | 0 | 0 | 1843009600 | 164.3 |
| civ5 | 8930 | completed | 4 | 1000 | 0 | 15960 | 14 | 0 | 5551327616 | 320.8 |
| dredge | 1562430 | completed | 4 | 1076 | 10 | 0 | 7 | 0 | 590099424 | 39.3 |
| stellaris | 281990 | completed | 4 | 46058 | 18073 | 385 | 12 | 0 | 15311973328 | 773.7 |
| humankind | 1124300 | completed | 4 | 54708 | 1840 | 0 | 21 | 0 | 16077876496 | 1124.5 |
| redist (Amnesia, app 228980) | 228980 | completed | none | 0 | 0 | 19 | 0 | 0 | 19213952 | 1.3 |

`skipped=` was empty on every line (no EResult-40 skip on the Rust side). No TS per-depot status map was recorded (the TS-run log was rotated and the TS path logs no per-depot outcome line), so the sweep compared overall status only (all `completed`).

## Sweep result

Input and RSS samples were kept in the scratchpad (not committed). Redacted report:

```
DIFF civ5
  acf key BytesDownloaded
  acf key BytesStaged
  acf key BytesToDownload
  acf key BytesToStage
DIFF dredge
  acf key BytesDownloaded
  acf key BytesStaged
  acf key BytesToDownload
  acf key BytesToStage
DIFF stellaris
  acf key BytesDownloaded
  acf key BytesStaged
  acf key BytesToDownload
  acf key BytesToStage
  acf key DownloadType
  acf key TargetBuildID
DIFF humankind
  acf key BytesDownloaded
  acf key BytesStaged
  acf key BytesToDownload
  acf key BytesToStage
DIFF schedule-i
  content e3857fa2fb98 Schedule I Free Sample.dxvk-cache
  content 2d0cc1576c82 gamelib_bridge.cfg
  content 68efe722ca60 Schedule I Free Sample_d3d11.log
  content 0129c8bc62ac gamelib_bridge.cfg
OK   redist-amnesia
codec coverage: vz=105616 vsza=19923 pk=16364
```

exit code: 1

Reading of the diffs (no code or golden was changed in this plan):
- Game trees: for civ5, dredge, stellaris and humankind the sweep reports no file, SHA1, mode or BSD-flag differences. The shared-redist tree (redist-amnesia) is identical, and so is the Schedule I install tree apart from the four runtime artifacts below.
- schedule-i content diffs are files written by launching the game once in each run (DXVK cache, bridge config, d3d11 log), not install output.
- ACF diffs are real. The TS ACF carries the final download counters (`BytesToDownload`, `BytesDownloaded`, `BytesToStage`, `BytesStaged` equal to the downloaded and staged totals, for example 5515564032 and 7716100293 for civ5) where the Rust ACF writes 0 for all four. Stellaris additionally differs in `DownloadType` (TS 2, Rust 1) and `TargetBuildID` (TS 0, Rust the build id 26325427). The Rust runs were adopted by the Steam client (`adoptedBySteamClient true`), so part of this may be Steam rewriting the ACF; that was not investigated here.

## D-17 table (wall seconds from the logs; MiB/s uses the installed tree size, identical on both sides; peak RSS not sampled)

| Title | TS s | Rust s | TS MiB/s | Rust MiB/s | Rust/TS time |
| ----- | ---- | ------ | -------- | ---------- | ------------ |
| civ5 | 301.2 | 320.8 | 24.4 | 22.9 | 1.07 |
| dredge | 46.7 | 39.3 | 16.6 | 19.7 | 0.84 |
| stellaris | 782.5 | 773.7 | 37.1 | 37.5 | 0.99 |
| humankind | 1006.9 | 1124.5 | 35.8 | 32.0 | 1.12 |
| schedule-i | 123.0 | 164.3 | n/a | n/a | 1.34 (different bytes: TS depot size 2218973886, Rust bytes 1843009600) |

Peak RSS (shell + sidecar) was not sampled on either side, so the D-17 memory criterion is not evidenced.

## Codec coverage
vz, vsza and pk are all non-zero (sweep line above). Civ V showed vz=1000 and pk=15960, so it is both LZMA and zip; DREDGE, Stellaris and HUMANKIND cover vsza.

## Edge-path coverage
- Collision: NOT exercised. Every Rust outcome line has `collisions=0` and no `cross-depot path collision detected` warning was logged. Stellaris is not a colliding title. A known collider is XCOM: Enemy Unknown (app 200510), whose earlier log shows UNRESOLVED cross-depot collisions (for example on `XComGame`); it is a Windows-flagged install, so it would need a TS and a Rust install (the bridge/bottle path).
- Mach-O +x: exercised. HUMANKIND outcome line has `macho=21` (also civ5 14, dredge 7, stellaris 12).
- Shared redist: exercised through Amnesia (app 228980 outcome line with `acf=none`, `mode=install`, `pk=19`).

## Attribute parity
macOS BSD flags were compared by the sweep (no flag differences). Windows ReadOnly/Hidden attribute parity is not live-tested and rests on the plan 04 unit vectors (SetFileAttributesW) and the plan 07 fixtures' golden comparison in plan 10 on the Windows CI leg.

## Phase 74 fixtures
The six Phase 74 stale bridge fixtures (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs) were not installed, updated or touched.

## Open items at this checkpoint
1. Sweep exit code 1: ACF counter fields (all four titles) and Stellaris `DownloadType`/`TargetBuildID`.
2. Collision bullet not exercised (needs a replacement or an added title).
3. Peak RSS not sampled.
4. Cleanup and restore (see the restore notes above) are still to be done: the `.ts-parity` and `.ts-out` copies, both bottle ledgers, the real-library Civ V reinstall.

## Operator verdict: APPROVED

The operator approved the parity run and D-17 with these points:
- (a) The ACF differences are Steam's own rewrite after adoption, not a pipeline defect. Neither writer emits `BytesToStage`, `DownloadType` or `TargetBuildID` (no hits in `src-tauri/crates/gamelib-depot/src` or `src/backend/storeManagers/steam`). Both writers use the same bytes rule (`acf.rs:289`, `bytes: if can4 { Some(size) }`, and `finalize.ts:147`). The TS counters (for example downloaded 5515564032 not equal to staged 7716100293) are Steam download-state values, not anything our code wrote. D-14 is met on file trees. ACF text equivalence at write time is covered by the Tier 1 goldens.
- (b) The collision path is accepted as not exercised live. It is covered by the Tier 1 fixtures. XCOM: Enemy Unknown (200510) is the candidate for a future live check.
- (c) Peak RSS is accepted as not sampled. This is a known evidence gap for D-17.
- (d) D-15 first gate (zero parity diffs) is met: zero file-tree diffs, and the ACF diffs are explained by (a).

Explained deviation: Task 3's automated verify (`exit code: 0`) cannot pass because the sweep exits 1 on the ACF fields. The sweep and the goldens were not edited.

## Still to restore (left to the orchestrator and operator)
- Delete the Rust-run installs and rename the `.ts-parity` copies back, or remove the parity library.
- Delete `sharedRedist`, rename `sharedRedist.ts-out` away and `sharedRedist.ts-parity` back to `sharedRedist`.
- Copy each bottle's `gamelib-shared-redists.json.parity-bak` (Schedule I and Amnesia bottles) back over its ledger.
- Reinstall Civ V in the real library.
