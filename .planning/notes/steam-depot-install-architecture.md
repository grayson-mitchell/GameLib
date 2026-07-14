---
title: Steam native install via depot download — architecture decisions & research
date: 2026-07-14
context: /gsd-explore session — replacing the `steam://rungameid` install handoff with a depot download GameLib itself owns, for real progress reporting and fewer broken/lost installs
related_phase: TBD (candidate — see .planning/seeds/steam-native-install.md)
---

# Steam Native Install — Architecture Decisions

## Problem

GameLib currently installs Steam games by shelling out to `steam://rungameid/{appId}`.
The Steam client does the download and GameLib gets **nothing back**: no progress, no
error surface, no control, no recovery. This is the root of the "broken and lost
installs" complaint — GameLib cannot even observe the failure, let alone fix it.

Every other store in GameLib owns its own download (legendary / gogdl / nile, each a
bundled binary whose stdout Heroic parses for progress). Steam is the odd one out.

## Locked decisions

### D-1 — Launch stays with Steam; only the download moves to GameLib

Downloading depot content gets **files on disk**, not a game Steam considers installed —
and not, for a large share of the catalog, a game that will *launch*. DRM-wrapped titles
call into `steam_api.dll` / `steamclient.so` on startup and refuse to run unless the
Steam client is running and believes the user owns and installed that app. Depot
download bypasses the download, **not the DRM**.

Therefore: GameLib downloads into a real `steamapps/` library folder and writes an
`appmanifest_{appId}.acf` so the Steam client **adopts** the install. Launch continues
to go through `steam://rungameid`, so DRM is satisfied. Steam client remains a hard
dependency — but only at launch, never for the download.

### D-2 — Steam owns updates; GameLib owns only the first install

GameLib writes an honest `.acf` pinned to the manifest it actually downloaded. Steam
notices newer builds and patches them with its own delta system, which is far better
than anything we would build.

**This decision is load-bearing for the architecture choice below.** The hard part of a
depot downloader — delta-patching against an existing install, resume, integrity repair —
is precisely the part a first-install-only scope does not need. Any future move to
"GameLib owns updates too" re-opens the build-vs-bundle question from scratch.

## The `.acf` adoption trick

Do **not** write `StateFlags = 4` ("fully installed") and assert our download was perfect.
Community practice is `StateFlags = 1026` (`UpdateRequired` 2 + `UpdateStarted` 1024).
Steam then runs its own verify pass, **repairs anything we got wrong**, and flips the flag
to `4` itself.

This makes Steam a safety net rather than an adversary, which is exactly aligned with the
"fewer broken installs" goal. Cost: a full on-disk hash pass on first launch (slow for
large games, but not a re-download).

`StateFlags` bitmask: `1`=Uninstalled, `2`=UpdateRequired, `4`=FullyInstalled, `8`=Encrypted,
`16`=Locked, `32`=FilesMissing, `64`=AppRunning, `128`=FilesCorrupt, `256`=UpdateRunning,
`512`=UpdatePaused, `1024`=UpdateStarted, `2048`=Uninstalling.

Minimum fields for Steam to recognize a directory: `appid`, `Universe` (=1), `StateFlags`,
`installdir`. Real manifests also carry `name`, `LastUpdated`, `SizeOnDisk`, `buildid`,
`LastOwner`, `BytesToDownload`/`BytesDownloaded`, `AutoUpdateBehavior`, `UserConfig`,
`InstalledDepots` (map of `depotId → {manifest, size}`), `MountedDepots`.

**Confidence: LOW.** This entire area is reverse-engineered community knowledge with zero
Valve documentation. Known failure modes: stale `buildid` or manifest-ID mismatch → forced
re-download; missing `InstalledDepots` entries → Steam thinks the depot isn't installed;
malformed VDF → silently ignored or corrupted. Must be validated empirically before any
plan locks it in.

## The two candidate architectures

### Option A — In-process via `steam-user` (TypeScript)

`steam-user` already holds GameLib's authenticated CM connection and exposes the needed
primitives: `getManifest()`, `getDepotDecryptionKey()` (cached 14 days),
`getCDNAuthToken()`, `getManifestRequestCode()`, `downloadChunk()`, and `downloadFile()` —
which already does parallel chunk fetching (up to 4 concurrent) with SHA1 verification.

- **No .NET runtime, no second auth stack, no stdout scraping.** Native progress events.
- Reuses the existing session directly — satisfies the original "no second logon" goal for free.
- DoctorMcKay [declined to ship a `downloadGame()` orchestrator](https://github.com/DoctorMcKay/node-steam-user/issues/183)
  (closed `wontfix`, 2018) — the library stops at primitives. But given D-2, the orchestrator
  we need is small: get manifest → walk file list → `downloadFile()` each with concurrency → retry.
- **Costs:** we own protocol fragility if Valve changes something. LZMA decompression wants
  the optional `lzma-native` package for acceptable speed — a **native module**, cutting
  against the deliberate pure-JS constraint in the stack doc (a pure-JS fallback exists, just slower).
- No mature JS reference implementation exists (the `depot-downloader` npm package has 1 star,
  0 dependents — do not build on it).

### Option B — C# wrapper around DepotDownloader

- **The stock CLI cannot be handed an existing token.** Flags are `-username` / `-password` /
  `-remember-password` / `-qr` / `-no-mobile` / `-loginid`; tokens cache to `account.config`
  (.NET `IsolatedStorageFile`). A request for a `-refresh_token` flag
  ([issue #500](https://github.com/SteamRE/DepotDownloader/issues/500)) was **closed as not planned**.
- The token field exists one layer down: `Steam3Session.cs` checks
  `SteamUser.LogOnDetails.AccessToken` and skips credential login when it is pre-populated.
  Reaching it requires a **custom C# wrapper project** depending on DepotDownloader, calling
  `ContentDownloader.DownloadAppAsync(appId, depots, branch, os, arch, language, lv, isUgc)`.
- Inherits a battle-hardened, community-forked engine. Derives the `.acf` from data it already
  retrieved rather than hand-tracked state (less drift risk).
- **Costs:** a second language, toolchain, and release pipeline permanently inside an Electron
  repo. Requires .NET 8; self-contained builds published for win x64/ARM64, linux x64, macOS
  Intel + Apple Silicon (~30MB each). Note the NuGet package is stale at 2.7.5 — GitHub releases
  are at v3.4.0; pull from source/releases, not NuGet.

## Status: RESOLVED — Option A chosen, both unknowns validated

Spikes 001 and 002 settled this against a real machine. See
`.planning/spikes/MANIFEST.md` for the full findings and the locked requirements.

**Unknown B — does Steam adopt a hand-written `.acf`? → YES.** (Spike 001.) Wrote our own
manifest for WazHack with `StateFlags = 1026`, restarted Steam: Steam verified it, flipped the
flag to `4` (`FullyInstalled`) itself, downloaded **zero bytes**, and the game launched via
`steam://rungameid`. Decision D-1 holds end to end.

**Unknown A — can `steam-user` download a full game in-process? → YES.** (Spike 002.)
**171/171 files, byte-identical to what the real Steam client downloaded**, 6.3s at 17.8 MB/s.

### → Option A (in-process via `steam-user`). Option B is REJECTED.

The C# wrapper has no remaining justification. Corrections to the analysis above, learned by
building it:

- **`lzma-native` is NOT required.** Pure-JS LZMA is byte-correct, just 2.2× slower
  (8.1 vs 17.8 MB/s). The no-native-modules constraint holds — this was the main cost held
  against Option A and it evaporated.
- **`steam-user`'s convenience helpers are broken**, but its hard parts are not. `getManifest()`
  truncates every filename to an AES block boundary and `downloadChunk`/`downloadFile` throw.
  Neither is a protocol problem — decrypting by hand recovers perfect plaintext and a valid
  LZMA container. We reimplement just those two pieces (~100 lines,
  `.planning/spikes/002-steam-user-depot-download/steam-depot.mjs`). CM auth, PICS, depot keys,
  raw manifests, and content-server discovery — the parts we'd least want to own — all work.
- **The orchestrator is small precisely because of D-2.** No delta-patching, no resume, no
  repair. Get the manifest, fetch each chunk, place it at its offset, verify. The hard parts of
  DepotDownloader are exactly the parts we scoped out.

### Still open

- **`@node-steam/vdf` corrupts 64-bit IDs** (spike 001). GameLib already uses it on `.acf`
  files. Audit existing call sites — likely harmless today, fatal once we write manifests.
- **Retry across content servers is mandatory** — ~16% of chunks fail at concurrency 8.
- **Untested:** multi-depot and large (50 GB) games, streaming to disk (files are currently
  assembled in RAM), resume-after-interruption, and DRM on a confirmed hard-DRM title.

## Legal / ToS

No explicit Valve statement approving or banning third-party depot downloading was found in
the Steam Subscriber Agreement or Valve legal pages. DepotDownloader (SteamRE, built on
SteamKit2) has existed for years with an active fork ecosystem and is widely referenced in
Steam community threads — strong circumstantial evidence of informal tolerance, but **not
documented legal clearance**.

This is the same risk class GameLib already accepted for `legendary` / `gogdl` / `nile` (all
unofficial reverse-engineered store clients) and for `steam-user` / `steam-session` themselves
(unofficial CM-network clients). **Not a new category of exposure.**

## Sources

- [DepotDownloader issue #500 — refresh tokens (closed, not planned)](https://github.com/SteamRE/DepotDownloader/issues/500)
- [DepotDownloader `Steam3Session.cs`](https://github.com/SteamRE/DepotDownloader/blob/master/DepotDownloader/Steam3Session.cs)
- [DepotDownloader `ContentDownloader.cs`](https://github.com/SteamRE/DepotDownloader/blob/master/DepotDownloader/ContentDownloader.cs)
- [node-steam-user — Steam CDN Client wiki](https://github.com/DoctorMcKay/node-steam-user/wiki/Steam-CDN-Client)
- [node-steam-user issue #183 — `downloadGame()` (closed wontfix)](https://github.com/DoctorMcKay/node-steam-user/issues/183)
- [pinkwah/steam-appmanifest](https://github.com/pinkwah/steam-appmanifest/blob/master/README.md)
