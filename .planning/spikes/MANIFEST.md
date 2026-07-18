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
- **Write `StateFlags = 1026`, never `4`.** ~~Original rule~~ — **SUPERSEDED by spike 003 (2026-07-17).**
  Was correct only while the download had no integrity guarantee. Phase 21's per-chunk sha1 gate + spike
  003's exec-bit handling make a trustworthy `StateFlags 4` achievable: on real HW Steam accepted a
  GameLib-written 4 with no verify/re-download and the game launched. Full-ownership (StateFlags=4) is the
  new direction — see spike 003 + Phase 22. The 1026 path may stay as a fallback when completeness can't
  be proven. Load-bearing for a trustworthy 4: StateFlags 4 + BytesToDownload==BytesDownloaded(!=0) +
  current public buildid + correct InstalledDepots + **Executable(32)/CustomExecutable(128) file modes**.
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
- **Download in-process via `steam-user`; do NOT bundle DepotDownloader.** Proven byte-identical
  to Steam's own download. No .NET, no second auth stack, no stdout scraping. *(Spike 002.)*
- **Do NOT use `steam-user`'s `getManifest()` filenames or `downloadChunk`/`downloadFile`.**
  Both are broken against current Steam — filenames come back truncated to an AES block
  boundary, and chunk download throws. Use `getRawManifest()` plus our own decrypt/decompress
  (~100 lines, see `002-steam-user-depot-download/steam-depot.mjs`). The underlying protocol is
  fine; only steam-user's handling of it is wrong. *(Spike 002.)*
- **Retry chunks across DIFFERENT content servers.** Steam's CDN edges drop connections under
  concurrency; ~16% of chunks fail without retry. This is normal, not a protocol error.
  *(Spike 002.)*
- **`lzma-native` is optional.** Pure-JS LZMA is correct, just 2.2× slower (8.1 vs 17.8 MB/s).
  The project's no-native-modules constraint holds. *(Spike 002.)*
- **Never write `StateFlags = 4` for a manifest with a wrong `InstalledDepots` set.** A wrong
  depot set is the one condition that provokes a re-download. Any manifest writer must be
  able to prove its depot selection before writing. *(Established by spike 001.)*

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | acf-adoption | standard | Given a real Steam install, when GameLib writes its own `appmanifest.acf`, then Steam adopts it and launches the game with no re-download | ✓ VALIDATED | steam, appmanifest, acf, depot, vdf |
| 002 | steam-user-depot-download | standard | Given an authenticated `steam-user` connection, when we fetch a depot manifest and download every chunk, then all files land on disk SHA1-verified and byte-identical to Steam's own install | ✓ VALIDATED | steam, depot, download, cdn, lzma, crypto |
| 003 | stateflags4-full-ownership | standard | Given a 100%-downloaded (per-chunk sha1-verified) WazHack macOS depot, when GameLib writes StateFlags=4 + consistent bytes + current buildid, then Steam shows it Installed with NO verify/re-download and it launches with DRM intact | ✓ VALIDATED (Steam trusts 4; exec-bit fix → launches) | steam, appmanifest, stateflags, full-ownership, d-2-reversal |

> **⚠ Spike 003 deliberately RE-OPENS two locked requirements** — "Write StateFlags=1026, never 4" and D-2 ("Steam owns completion; GameLib owns only first install"). Justification: Phase 21 shipped a per-chunk sha1 integrity gate, so "our download was byte-perfect" is now checkable. Note spike 001 found `Bytes*`/`buildid` were "free" ONLY because Steam recomputed them during its 1026 verify pass — under StateFlags=4 (no verify) they are expected to become load-bearing. If 003 INVALIDATES, the 1026 requirement stands.

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

### 002 — steam-user-depot-download (VALIDATED)

**Option A wins; the C# DepotDownloader wrapper is rejected.** Downloaded WazHack's macOS depot
entirely in-process — **171/171 files, byte-identical to what the real Steam client
downloaded**, in 6.3s at 17.8 MB/s.

The twist: `steam-user` gets everything *hard* right (CM auth, PICS, depot keys, raw manifests,
content servers) and both *easy* things wrong. `getManifest()` truncates every filename to an
AES block boundary (`UnityEngine.SubstanceModule.dll` → `UnityEngine.Substan`), and
`downloadChunk`/`downloadFile` throw outright. Neither is a protocol problem — decrypting by
hand recovers perfect plaintext and a valid LZMA container. We reimplemented just those two
pieces (~100 lines).

- ✓ **Byte-identical to Steam**, verified against a real install.
- ✓ **Pure-JS LZMA works** — `lzma-native` is a 2.2× speedup, not a requirement. The
  no-native-modules constraint holds.
- ⚠ **Retry across content servers is mandatory** — ~16% of chunks fail at concurrency 8.
- ○ Untested: multi-depot games, large (50 GB) games, streaming to disk (files are currently
  assembled in RAM), and resume-after-interruption.

---

## Idea B — macOS native Steam bridge (Phase 22's preferred long-term architecture)

**Distinct idea line from spikes 001–003.** Replicate Linux/Proton's model on macOS: run ONE
**native** macOS Steam client and bridge each bottled Windows game's Steamworks IPC out to it,
instead of bottling a full Windows Steam client per CrossOver bottle. If feasible, the whole
Phase 22 per-bottle-login problem dissolves (one native client = one login; cheap per-game
prefixes). Seed: `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`.

Spikes 004a/004b/004c are three sub-probes of ONE feasibility question (not comparison variants).
Investigation/feasibility only — not building the bridge.

### Requirements (Idea B — emerged from spike 004)

- **Bridge at the `steam_api` flat-API layer, out-of-process — NOT the in-process `lsteamclient`
  thunk.** The proven approach (L4D2-launcher) is a PE32 `steam_api.dll` shim in the bottle
  marshaling over **TCP (localhost)** to a native Mach-O helper that loads the real
  `libsteam_api.dylib`. The Linux-style in-process winelib PE→Mach-O thunk is blocked on macOS
  (no build toolchain locally; Rosetta/protobuf interconnect) and is Valve/CodeWeavers-scale. *(004a/004b)*
- **Proxy the running, signed-in native Mac Steam client — never replicate auth.** DRM/`SteamAPI_Init`
  succeeds because it's the genuine client. The helper hardcodes nothing; it reads real
  SteamID/persona/auth from the live client. *(004b/004c)*
- **The native surface already exists on every user's machine.** `steamclient.dylib`
  (universal, arm64, exports `CreateInterface`) and `libsteam_api.dylib` (full pipe/user IPC
  surface) ship with Steam; macOS Steam's IPC transport is a **Mach service** (`ipcserver`,
  `com.valvesoftware.steam.ipctool`). A bridge links against surfaces the user already has — no
  bundling of Valve libraries. *(004c)*
- **Generate Steamworks vtables from a pinned SDK version.** L4D2 generated from SDK 1.53a for
  correct `__thiscall` arg counts / `ret N` and pack(4)→pack(8) callback repacking. Version drift
  breaks the ABI. *(004b)*
- **The helper/shim MUST supply the game's real AppID before init.** `SteamAPI_InitFlat` with no
  `steam_appid.txt` / `SteamAppId` returns "No appID found" and every interface accessor returns
  NULL. For a bottled game this is the game's own appID; `480` (Spacewar) suffices for
  identity-only handshakes. Host helper needs no code signing/entitlements to load the dylib. *(005a)*
- **Known-hard gap: P2P / multiplayer *join*.** Single-player, auth, persona, listen-server
  hosting, and server-browsing are proven; inbound P2P handshake needs `InitRelayNetworkAccess()`
  + proactive `AcceptP2PSessionWithUser` and remains only partially fixed upstream. *(004b)*
- **Seed trigger_condition needs revising.** The seed assumed the bridge is gated on a macOS
  `lsteamclient`. Spike 004 shows a *lower, working* bridge tier already exists — the gate is
  "productionize the out-of-process steam_api bridge," not "port lsteamclient." *(004b)*

### Spikes (Idea B)

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 004b | community-lsteamclient-survey | standard | Given the Whisky/GPTK/CrossOver/Wine ecosystems, when surveyed for a macOS lsteamclient port or Win↔native-Steam bridge, then find existing art or rule it out | ✓ VALIDATED | steam, macos, bridge, survey, lsteamclient |
| 004a | wine-mach-o-thunk | standard | Given a Wine/CrossOver PE process, when it calls a native macOS .dylib via the winelib thunk, then the cross-boundary call returns correct data | ⚠ PARTIAL (in-process thunk blocked; routed around by out-of-process TCP) | steam, macos, wine, thunk, winelib |
| 004c | native-mac-steam-ipc-surface | standard | Given the installed native macOS Steam client, when inspected for an attachable Steamworks IPC surface, then determine bridge-in vs headless-shim | ✓ VALIDATED | steam, macos, ipc, steamclient, mach-service |
| 005a | native-steam-helper-handshake | standard | Given running signed-in Mac Steam + on-disk libsteam_api.dylib, when a native helper (not launched by Steam) dlopens it and inits, then it returns the user's real SteamID + persona | ✓ VALIDATED (live: SteamID64 + persona read from running client) | steam, macos, bridge, handshake, libsteam_api |

> **Overall 004 feasibility:** The bridge IS feasible **via the out-of-process `steam_api` TCP
> bridge** (proven single-player; eliminates per-bottle login — the whole win over Phase 22),
> **not** via a Linux-style in-process `lsteamclient` (blocked on macOS Wine build tooling +
> Rosetta/protobuf; still dual-client today). If productionized, it likely supersedes much of
> Phase 22's multi-bottle machinery — but P2P multiplayer and packaging/portability are real
> remaining work. Phase 22 remains the ship-now answer.
