# Spike Manifest

## Idea

**Steam native install.** Replace GameLib's `steam://rungameid` install handoff — a black
box that returns no progress and no errors — with a depot download GameLib owns, exactly as
it already does for Epic (legendary), GOG (gogdl), and Amazon (nile). GameLib writes the
files into a real `steamapps/` library plus an `appmanifest_{appId}.acf` so the Steam client
**adopts** the install; launch still goes through `steam://` so DRM keeps working, and Steam
owns all future updates with its own delta-patching.

**GameLib owns the first install. Steam owns everything after.**

Background: `.planning/notes/steam-depot-install-architecture.md`
Seed: `.planning/seeds/steam-native-install.md`
Open questions: `.planning/research/questions.md` (Q3, Q4, Q5)

## Requirements

Design decisions established so far. Non-negotiable for the real build.

- **Launch stays with Steam.** Depot download bypasses the download, not the DRM. Files on
  disk do not make a DRM-wrapped game launch. (D-1)
- **Steam owns updates; GameLib owns only the first install.** No delta-patching, no resume,
  no integrity repair — that is the hard part and we deliberately scoped it out. Any move to
  "GameLib owns updates" re-opens the entire build-vs-bundle architecture decision. (D-2)
- **Write `StateFlags = 1026`, never `4`.** Claiming `FullyInstalled` asserts our download was
  byte-perfect; if it wasn't, Steam trusts the lie and the user gets a broken game. `1026`
  (`UpdateRequired|UpdateStarted`) asks Steam to verify and repair, making it a safety net
  rather than an adversary.
- **64-bit IDs are strings, end to end.** Depot manifest GIDs and SteamID64s exceed
  `Number.MAX_SAFE_INTEGER`. `@node-steam/vdf.parse()` silently rounds them and produces a
  wrong manifest GID — which is exactly how you cause a forced re-download. *(Established by
  spike 001.)*
- **Depot selection is driven by PACKAGE-LEVEL OWNERSHIP, through two channels.** A depot is
  installed iff it appears in an owned package's `depotids`, OR it carries a `dlcappid` whose
  app the user owns. Neither channel alone is sufficient. Depots can also live in a DLC's OWN
  app entry (walk `extended.listofdlc`), and language-specific depots must be filtered to the
  user's language. No combination of `optional`/`systemdefined` flags can substitute for
  ownership — two PICS-identical depots differ only in whether they are owned. Verified 11/11
  against real installs. *(Established by spike 001; rule in `001-acf-adoption/select.mjs`.)*
- **Never write `StateFlags = 4` for a manifest with a wrong `InstalledDepots` set.** A wrong
  depot set is the one condition that provokes a re-download. Any manifest writer must be
  able to prove its depot selection before writing. *(Established by spike 001.)*

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | acf-adoption | standard | Given a real Steam install, when GameLib writes its own `appmanifest.acf`, then Steam adopts it and launches the game with no re-download | ✓ VALIDATED | steam, appmanifest, acf, depot, vdf |
| 002 | steam-user-depot-download | standard | Given an authenticated `steam-user` connection, when we `getManifest()` + `downloadFile()` a small app, then all files land on disk hashing correctly | ○ NOT RUN | steam, depot, download |

### 001 — acf-adoption (VALIDATED)

**The core architecture works.** Wrote our own manifest for WazHack, restarted Steam:
Steam verified it, flipped `StateFlags` `1026` → `4` (`FullyInstalled`) by itself, downloaded
**zero bytes** (game dir byte-identical to the pre-swap backup), and the game **launched via
`steam://rungameid`**. The "GameLib writes the manifest → Steam adopts it → Steam launches"
model holds end to end.

- ✓ **`StateFlags = 1026` is correct.** Steam verifies-and-repairs rather than trusting us.
- ✓ **Manifest format fully cracked.** Field set and casing (`universe`/`lastupdated` are
  lowercase, while `SizeOnDisk`/`StateFlags` are cased) reproduced exactly.
- ✓ **`Bytes*` / `DownloadType` / `TargetBuildID` are free** — Steam recomputes them.
- ⚠ **Found a critical latent bug:** `@node-steam/vdf` corrupts 64-bit manifest GIDs
  (`…854` → `…700`). GameLib already uses this library on `.acf` files. **Audit call sites.**
- ✓ **Depot selection SOLVED.** PICS-alone selection was invalidated (passed on WazHack,
  failed on all 10 other games). With the authenticated license list, the two-channel
  ownership rule now reproduces Steam **11/11 exactly — depot-for-depot and GID-for-GID.**
- ~ **`SizeOnDisk` is not a derived sum** (corrects an earlier claim). Steam measures real
  bytes on disk; a manifest sum overshoots on multi-depot games (Wasteland 3 by 236 MB).
  Believed bookkeeping, but untested when wrong.
- ~ **DRM caveat:** WazHack was not confirmed hard-DRM-wrapped. The launch path is proven;
  one confirmation against a DRM-heavy title is worth doing before shipping.
