---
spike: 049
name: adoption-corrupt-file
type: standard
validates: "Given a GameLib install with one same-size, same-mtime corrupted file and one 1-byte-truncated file, when a running Mac Steam adopts it via `steam://install/<appId>`, then Steam's scan detects both (content check, not size-only) and repairs only those files"
verdict: VALIDATED
related: [047, 048, 003]
tags: [steam, macos, appmanifest, acf, adoption, steam-url, verify, integrity, repair, live]
---

# Spike 049: Adoption Scan vs a Corrupt File

> **Correction 2026-10-29 (quick 261029-ji2):** `steam://install/<appId>` opens Steam's install DIALOG; adoption proceeds only after a human clicks Install. Evidence: Steam console_log shows `ExecuteSteamURL: "steam://install/<id>"` then `Installs.ContinueInstall` 5-8 s later in these runs (the operator clicking); in the live GameLib run and a repro the dialog was off-screen and Steam logged `Installs.CancelInstall`. So it is NOT unattended / "no click" / "toast only". What still holds: once adoption proceeds, Steam's scan hash-checks content (049: 169/2), repairs only bad files, downloads no game content (047/048), keeps the same PID. Production now uses restart-on-Play (a Steam that starts after GameLib wrote the files adopts at startup, spikes 001/003).

## What This Validates

048 left one question open: is the adoption scan (`Validation: full scan … found N/M matching
files`) a content check or only a size check? 640 MB/s on Civ V fit either. The answer decides
whether Steam's scan backs up GameLib's own per-chunk sha1 gate, or whether a silently corrupt
GameLib file would be adopted as "Fully Installed".

## Design

One adoption, two damaged files. Both damages were made after restoring the pristine 047 clone,
and both kept the original mtime (`touch -r`):

| File | Damage | Caught by a size check? | Caught by a content check? |
|---|---|---|---|
| A `Data/sharedassets0.assets.resS` (11,639,116 B) | 16 bytes XOR-flipped at offset 5,819,558 (mid-file, so a head/tail sample misses it) | no | yes |
| B `Data/sharedassets2.assets` (4,634,904 B) | truncated by 1 byte (positive control) | yes | yes |

Reading the result: `169/2` means content hashing, `170/1` naming only B means size-only, and
`171/0` means no check at all.

Setup: `steam://uninstall/264160` (operator confirmed), restore clone, damage A and B, write the
production 1026 handoff ACF (`backup/`), fire `steam://install/264160`.

## Investigation Trail

1. Damage applied: A's sha1 `3cd98c92…` became `3b5fd6b5…` with size and mtime unchanged. B went
   4,634,904 → 4,634,903 bytes with mtime unchanged.
2. Fired 00:33:37Z. Steam logged `Validation: full scan … found 169/2 matching files … in 0
   seconds`, then `Found 169 pre-existing matching files for depot 264162 (101152858 bytes)`.
   101,152,858 = 117,426,878 − 11,639,116 − 4,634,904 exactly, so **both A and B were rejected**.
   (The scan line's "115.94 MB" does not equal either figure. It is not explained, and it does
   not affect the verdict.)
3. `update started : download 32586288/36221712 … stage 101152858/117426878`, then
   `Downloading 17 chunks for depot 264162`. 17 = ⌈11.64 MiB⌉ + ⌈4.63 MiB⌉ = 12 + 5, so Steam
   re-fetches **every chunk of each bad file**, not just the 16 damaged bytes. The ACF passed
   through StateFlags 1026 with the real Bytes* during the fetch, then commit, *Fully
   Installed*, BuildID 9044149, about 3 s end to end. Same PID.
4. **Repair is byte-exact.** All 171 files' sha1 equal the pristine clone, and only A and B have
   new mtimes.
5. **This decodes 047's line.** In `download X/Y`, X counts bytes already satisfied from disk out
   of the total Y. 047/048's `36221712/36221712` and `5515564032/5515564032` therefore meant
   "nothing left to fetch", and here 36,221,712 − 32,586,288 = 3,635,424 compressed bytes were
   actually downloaded.

## Results

**VALIDATED.** The adoption scan checks **content**. A same-size, same-mtime corruption in the
middle of a file is caught exactly like a truncation. Steam then repairs only the bad files
(whole-file re-fetch) and lands on Fully Installed with no restart.

Signal for the build:

- **Adoption by URL is self-healing.** A GameLib install that slips past its own sha1 gate is
  not adopted corrupt. Steam fixes it and the user sees a short download. GameLib's gate is
  still worth keeping, because it is what avoids a large re-fetch, but it is no longer the only
  safeguard on this path.
- **A bad file costs its whole size**, not the damaged chunk. Fine for a stray file. A
  systematically wrong install (wrong depot or manifest GID) would come close to a full
  re-download, which is spike 001's existing rule.
- **During a repair, GameLib sees StateFlags 1026 with live `BytesDownloaded`/`BytesToDownload`.**
  The existing install poller can already render that as progress, but it must not read 1026
  here as "waiting for Steam restart".
- Not tested: whether *adopt-at-startup* (Steam quit, then launched) does the same content scan.
  003's "Verifying file sizes only" log line suggests it may not, which would make the URL path
  the stronger of the two.
