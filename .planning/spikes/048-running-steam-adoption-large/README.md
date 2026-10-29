---
spike: 048
name: running-steam-adoption-large
type: standard
validates: "Given native Mac Steam running and a large multi-depot install (Civ V, 7.72 GB, 22 depots, 10,897 files) with a GameLib 1026 handoff ACF written after Steam last looked, when `open -g steam://install/<appId>` fires, then Steam adopts it in bounded time with no restart and no game-content download"
verdict: VALIDATED
related: [047, 001, 003]
tags: [steam, macos, appmanifest, acf, adoption, steam-url, stateflags, multi-depot, dlc, large-install, live]
---

# Spike 048: Running-Steam Adoption — Large Game

> **Correction 2026-10-29 (quick 261029-ji2):** `steam://install/<appId>` opens Steam's install DIALOG; adoption proceeds only after a human clicks Install. Evidence: Steam console_log shows `ExecuteSteamURL: "steam://install/<id>"` then `Installs.ContinueInstall` 5-8 s later in these runs (the operator clicking); in the live GameLib run and a repro the dialog was off-screen and Steam logged `Installs.CancelInstall`. So it is NOT unattended / "no click" / "toast only". What still holds: once adoption proceeds, Steam's scan hash-checks content (049: 169/2), repairs only bad files, downloads no game content (047/048), keeps the same PID. Production now uses restart-on-Play (a Steam that starts after GameLib wrote the files adopts at startup, spikes 001/003).

## What This Validates

047 proved `steam://install/<appId>` adopts a GameLib install on a running Steam, but on a
117 MB, single-depot game where the scan took "0 seconds". This asks whether it scales: a
7.72 GB, **22-depot** game (base + DLC + language depots) — how long does the scan take, does
any depot fall through to a download, and does anything else change on disk?

## How to Run

Same harness as 047 (`probe.mjs`, copied, plus an early exit once Steam's scheduler releases
the app so a long scan does not need a fixed timeout):

```bash
cd .planning/spikes/048-running-steam-adoption-large
node probe.mjs fire 8930 steam://install/8930 600 <label>
```

## Investigation Trail

1. **Setup.** Civilization V (8930) was installed at StateFlags 4, and its ACF was already in
   GameLib's `buildAppManifestText` field shape (no `BytesToStage`/`BytesStaged`, `UserConfig`
   and `MountedDepots` empty), with no content_log history for 8930, consistent with a
   GameLib-written install. APFS-cloned the 10,897-file folder aside (1.4 s, no extra space), fired
   `steam://uninstall/8930` (operator confirmed; Steam deleted dir + ACF at 13:29:20), restored
   the clone, and wrote the production 1026 handoff ACF (StateFlags 1026, Bytes* "0", the same
   22 `InstalledDepots`; see `backup/`).
2. **048-1 passive control** (20 s): 0 content_log lines, ACF untouched. Same as 047.
3. **048-2 — install URL.** Fired 00:30:02Z. Timeline from Steam's own log:
   - 13:30:09: *Update Required, Update Optional → Update Running*; Steam overwrites the ACF
     with a placeholder (StateFlags **18**, buildid 0). 047 had StateFlags 2; the extra 16 bit
     is *Update Optional*, which WazHack did not show.
   - 13:30:09 → 13:30:22: 22 depot **manifest** fetches (one HTTPS 200 per depot), no chunks.
   - 13:30:34: `Validation: full scan … found 10897/0 matching files (7.72 GB/7.72 GB) in 12
     seconds`, then one `Found N pre-existing matching files for depot …` line for **every one
     of the 22 depots**, each byte count equal to that depot's `InstalledDepots.size`.
   - 13:30:36: `update started : download 5515564032/5515564032 … stage 7716100293/…`,
     the same planned-bytes counter as 047, already complete in the same line.
   - 13:30:37: commit, *Fully Installed*, `finished update, 22 mounted depots (BuildID 4390913)`,
     `scheduler finished : removed from schedule`.
   **Wall clock: about 28 s from Steam's first state line, about 35 s from the URL.**
4. **Chased the disk delta** (+1,396 bytes, 10,897 → 10,898 files):
   - `installscript.vdf` (1,396 B) is **new**. It is absent from the clone, so the
     GameLib-era install never had it. Steam created it during adoption with no chunk download.
   - 3 **zero-byte** `.lua` files got fresh mtimes. Steam recreates empty files rather than
     comparing them. Harmless.
   - The other **10,894 files are untouched** (pre-13:30 mtimes).
   - `Downloading N chunks` lines after the fire: **0**.

## Results

**VALIDATED.** Adoption by URL scales to a 7.72 GB, 22-depot game: ~28 s end to end on a
running Steam, every depot matched from disk, no restart, no game-content download.

Signal for the build:

- **The cost is about 15 s of manifest fetches (one per depot) plus a scan of about 1.5 s per
  GB.** Here that was 12 s for 7.72 GB, about 640 MB/s on this Mac's internal SSD. Budget for
  more on large or external-drive libraries. GameLib should show "Steam is verifying…" and
  watch the ACF for StateFlags 4 rather than treat the fire as instantly done.
- **Steam's placeholder StateFlags varies** (2 in 047, 18 here, then 1042 mid-commit). Don't
  match an exact intermediate value; wait for bit 4 *and* `buildid` ≠ 0.
- **GameLib's install omits `installscript.vdf`** and Steam fills it in on adoption.
  Adoption repairs this for free, but it hints at something to check: do installs adopted
  *at startup* (Steam quit) also get it? Not tested.
- **Not settled: whether the scan hashes or only checks sizes.** 640 MB/s is consistent with
  either on this SSD. A same-size corrupt-file arm would decide it, and that matters for
  trusting GameLib's sha1 gate versus Steam's. Also untested: incomplete files, an external
  library folder, Steam offline or signed out, and firing during another download.
