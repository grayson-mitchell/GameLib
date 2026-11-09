---
spike: 076
name: bridge-delta-update
type: standard
validates: "Given a stale bridge install, when its installed manifest is diffed against the current public one and patched in place at chunk level, then the tree matches the new manifest byte for byte, user files survive, and we know the delta bytes vs a full download"
verdict: VALIDATED (chunk-level delta, live on Mining Mechs and Manor Lords clones; 6/6 stale installs measured)
related: [001, 002, 003, 067a, 067b, 070, 073, 075]
tags: [steam, depot, delta, update, bridge, rust, gamelib-depot, phase-74, live]
---

# Spike 076: Delta update for a stale bridge install

## What This Validates

Phase 74 says bridge games must be updated by GameLib itself, with a delta download in the Phase
73 Rust pipeline (`DepotRef.fromManifest` is reserved for it and returns `delta_unsupported`
today). Spike 070 left six naturally stale installs. This spike measures what a delta costs on
each, then applies one for real on APFS clones of two of them and checks the result against the
new manifest.

## Research

- **Steam's update model:** a manifest lists files, each with an ordered list of chunks
  (SHA-1, offset, original and compressed size). Chunks are content-addressed, so a new build
  can reuse a chunk anywhere in the old build. Steam's own updater copies reused chunks from the
  local files and downloads only chunks it has nowhere on disk.
- **What exists in-repo:** `gamelib-depot` has the manifest parser (`parse_manifest`), the chunk
  decoder (`container::decode_chunk`: decrypt, decompress, size and SHA-1 gate), a manifest cache
  (`ManifestStore`, keeps the 2 newest GIDs per depot) and a **file-level** reconcile: a present
  file whose SHA-1 matches is kept, anything else is re-downloaded whole. That reconcile is
  already a file-level delta, which is why the two levels are compared here.
- **Approaches:**

| Approach | Download | Complexity | Verdict |
|---|---|---|---|
| Re-install (full) | whole build | none | baseline |
| File-level (today's reconcile pointed at the new manifest) | every changed file, whole | none: reconcile + delete removed | loses badly on Unreal/Unity packs |
| Chunk-level (Steam's model) | only chunks absent from disk | plan + temp-file build + commit | **chosen** |

## How to Run

```bash
cargo build --release   # bins: spike-076-delta (stage 1 diff), apply (stage 2)
node stage1.mjs "$TMPDIR/gamelib-dev-secret-vault.json" [appid]   # -> runs/stage1.{log,jsonl}
python3 table.py                                                  # -> runs/stage1-table.md
node stage2.mjs "$TMPDIR/gamelib-dev-secret-vault.json" <appid>   # APFS clone -> plan -> fetch -> apply
CORRUPT="data.win@<off>,<off>" node stage2.mjs <vault> 1603180    # forced local-chunk rejection
```

Node does the CM work (depot key, request codes, CDN hosts) and the CDN fetches. Rust uses
production's `gamelib_depot` parser and decoder. The depot key goes to Rust on stdin and is never
printed or written. Clones and chunks live in the gitignored `out/` and were deleted after the
runs; the real installs were never written to (Manor Lords' real `steam_api64.dll` is still the
shim afterwards).

These runs were **unwrapped** (Mac Steam online), deliberately: the wrap would hold Mac Steam
offline for the minutes the hashing takes, and 075 had just shown an unwrapped session leaves
Friends alone. `connection_log` stayed silent again.

## Investigation Trail

1. **Old manifests are still served.** `getManifestRequestCode` returned a code for every
   install-time GID (6/6, installs 2–8 weeks old) and the CDN served both manifests. The six
   depots weren't in GameLib's `depot-manifests` cache (installed before Phase 73), so this was
   the deciding question for "do we need the old manifest cached?". Answer: no, but cache it
   anyway.
2. **Stage 1, diff and local audit on all six** (`runs/stage1-table.md`):

| Game | files =/~/+/- | full MiB | file-level MiB | chunk-level MiB | reused: moved in file / cross-file / same offset (MiB) |
|---|---|---|---|---|---|
| Mining Mechs | 47/2/0/0 | 110 | 18.8 | **5.7** | 13 / 0 / 0 |
| Core Keeper | 1418/54/0/0 | 547 | 65.3 | **34.2** | 26 / 0 / 95 |
| Hell Clock | 252/58/0/0 | 1,468 | 496 | **435** | 41 / 0 / 28 |
| The Planet Crafter | 350/508/2/0 | 3,581 | 514 | **96.7** | 87 / 0 / 1,613 |
| Abiotic Factor | 29/8/0/0 | 2,288 | 2,220 | **444** | 4,496 / 0 / 163 |
| Manor Lords | 52/57/3/0 | 7,011 | 6,710 | **916** | 8,169 / 3,670 / 529 |

   File-level barely beats a full download on the two Unreal games: they ship a few huge
   `.pak`s and every update touches all of them. Chunk-level is 4–8× smaller there.
   Most reused data has **moved** within its file, and Manor Lords pulls 3.7 GB **across**
   files. No removals in any of the six.
3. **Local audit against the OLD manifest:** every install matched except
   `steam_api64.dll` (the bridge shim, all six) and, on Manor Lords,
   `stagedbuild_manorlords.ini` and `movies/version.txt`. The game itself rewrote those, and the
   update changes `version.txt`. Files outside the manifest are all GameLib's or the
   runtime's: `.gamelib-orig`, `gamelib_bridge.cfg` (two copies), `.dxvk-cache`, a d3d11 log.
4. **Stage 2, apply on Mining Mechs (clone):** plan 8 ms → 18 CDN chunks (5.7 MiB, 0.6 s) +
   13.1 MiB from verified local chunks → build 54 ms → commit → **48/49 files match the new
   manifest**; the one miss is the shim, whose file the update didn't change, so it survived as
   it should.
5. **Stage 2, apply on Manor Lords (clone), the hard case:** plan 8.1 s (reads and hashes
   12.4 GB of candidate chunks) → 2,178 CDN chunks, 915.6 MiB in 50.5 s → build 17.7 s →
   **111/112 match**. The miss is `stagedbuild_manorlords.ini`, game-modified and unchanged by
   the update, so correctly left alone; the drifted `version.txt` was rebuilt correctly. About
   83 s end to end, against ~6.5 min for the 7 GB full download on this line.
6. **The update replaced the shim.** Manor Lords' new build ships a new `steam_api64.dll`
   (316,608 B vs 295,336 B). After the delta the file is the new genuine Valve DLL and
   `.gamelib-orig` is still the *old* genuine one. Left like that, the game runs without the
   bridge, and a later "restore originals" would downgrade the DLL.
7. **Forced fallback:** 3 corrupted 4-byte spots in Mining Mechs' `data.win` → plan rejected
   3 local candidates by SHA-1, CDN chunks 18 → 21 (8.7 MiB), result still 48/49.

## Results

**VALIDATED: a chunk-level delta updates a stale bridge install correctly and cheaply.** It's
correct because every patched tree matched the new manifest except files the update didn't touch
(the shim, a game-modified ini). It's cheap because downloads were 4–8× below file-level on the
big games and 7.7× below a full install on Manor Lords. It's robust because a corrupt local
chunk falls back to the CDN.

**Requirements for Phase 74's delta (`fromManifest`):**

- **Chunk-level, not file-level.** Today's reconcile alone barely beats a full download on Unreal
  titles: 6.7 vs 7.0 GB on Manor Lords, 0.9 GB chunk-level.
- **Build new files beside the old tree, then commit.** Reuse is mostly moved-in-file and can be
  cross-file (3.7 GB on Manor Lords). So no old file may be overwritten or deleted until every
  new file that reads from it is built: temp files, verify `sha_content`, then rename, then
  delete removed files. Interrupted before the commit, the old tree is intact. Interrupted
  during it, each file is whole-old or whole-new, and the existing SHA-1 reconcile against the
  new manifest finishes the job.
- **SHA-1 every reused chunk from local bytes.** Never trust that a file matches its manifest:
  the shim and game-written files drift. A rejected chunk becomes a CDN chunk.
- **Peak extra disk = the total size of changed files** (about 13 GB for Manor Lords with the
  temp-file build). Check free space for that before starting, not for the download size.
- **The old manifest can come from the CDN.** Request codes were issued for all six install-time
  GIDs. Still, cache each install's manifest in `ManifestStore` at install time and protect it
  from `KEEP_GIDS` pruning while installed, so an update doesn't depend on Valve serving it.
- **Shim handover:** if a shimmed `steam_api*.dll` is in the change set, write the new genuine
  DLL to `.gamelib-orig`, then re-place the shim and rewrite `gamelib_bridge.cfg` (the redist
  ledger and DRM verdicts are keyed by GID too, per the Phase 74 goal). If it isn't in the change
  set, leave the shim alone; it survived both runs untouched.
- **Keep unowned files:** everything GameLib or the game adds outside the manifest survived,
  because only manifest-owned paths are written or deleted.
- **Leave game-modified, unchanged files alone,** the way Steam's update does. A later Verify
  (todo `implement-steam-verify-and-move-install`) is the place to repair them.

**Not tested:** removed files (none of the six removed any), multi-depot apps, file-mode/
executable flags (the harness ignores them; `post.rs` handles them in production), resume
after an interrupted commit, the game running during the update, and launching the patched
game through the bridge (the clones were never re-shimmed or run). The Phase 74 live gate
covers the last one.
