# Steam native install (GameLib-owned depot download + ACF adoption)

Blueprint for replacing GameLib's `steam://rungameid` install black-box with a depot download
GameLib owns (like legendary/gogdl/nile), writing a real `steamapps/` library + `appmanifest.acf`
so the Steam client adopts the install; launch stays on `steam://` so DRM keeps working. This line
shipped as Phases 21/23. All three spikes VALIDATED.

## Requirements (non-negotiable)

- **Launch stays with Steam.** The depot download bypasses the download, not the DRM. Files on
  disk do not make a DRM-wrapped game launch. *(D-1)*
- **`StateFlags`: full-ownership `4` is achievable, `1026` is the fallback.** Original "never write
  4" rule was **superseded by spike 003** once Phase 21 added a per-chunk sha1 integrity gate. On
  real hardware Steam accepted a GameLib-written `4` with no verify/re-download and the game
  launched. Load-bearing for a trustworthy `4`: `StateFlags=4` + `BytesToDownload==BytesDownloaded`
  (`!=0`) + current public buildid + correct `InstalledDepots` + **Executable(32)/CustomExecutable(128)
  file modes**. Keep `1026` as fallback when completeness can't be proven. *(D-2 reversal)*
- **64-bit IDs are strings, end to end.** Depot manifest GIDs and SteamID64s exceed
  `Number.MAX_SAFE_INTEGER`. `@node-steam/vdf.parse()` silently rounds them → wrong GID → forced
  re-download. Audit every vdf/acf call site. *(001)*
- **Depot selection is driven by PACKAGE-LEVEL OWNERSHIP, two channels.** A depot installs iff it's
  in an owned package's `depotids` OR carries a `dlcappid` the user owns; also walk
  `extended.listofdlc`, and filter language-specific depots to the user's language. No
  `optional`/`systemdefined` flag substitutes for ownership. Verified 11/11 vs real installs. *(001)*
- **Never write `StateFlags=4` (or 1026-with-claims) for a wrong `InstalledDepots` set.** A wrong
  depot set is the one condition that provokes re-download. *(001)*

## How to Build It

- **Download in-process via `steam-user`** — proven byte-identical to Steam's own download. No
  DepotDownloader, no .NET, no second auth stack. *(002; `sources/002-.../steam-depot.mjs`)*
- **Use `getRawManifest()` + your own decrypt/decompress (~100 lines).** Do NOT use `steam-user`'s
  `getManifest()` filenames (truncated to an AES block boundary) or `downloadChunk`/`downloadFile`
  (throw). The protocol is fine; only steam-user's handling is wrong. *(002)*
- **Retry chunks across DIFFERENT content servers** — ~16% of chunks drop at concurrency 8; normal,
  not a protocol error. *(002)*
- **Manifest format:** field casing matters (`universe`/`lastupdated` lowercase; `SizeOnDisk`/
  `StateFlags` cased). `SizeOnDisk` is real measured bytes, not a manifest sum (overshoots on
  multi-depot). Depot selection rule lives in `sources/001-acf-adoption/select.mjs`. *(001)*

## What to Avoid

- **`@node-steam/vdf` on 64-bit numeric fields** — corrupts GIDs (`…854`→`…700`). Strings only.
- **PICS-alone depot selection** — passed on WazHack, failed on 10/11 other games. Use the
  authenticated license list + two-channel ownership rule.
- **`lzma-native` as a hard dep** — pure-JS LZMA is correct, 2.2× slower (8.1 vs 17.8 MB/s). The
  no-native-modules constraint holds; `lzma-native` is an optional speedup only. *(002)*
- **Trusting `Bytes*`/`buildid` as "free"** — they were free under 1026 only because Steam
  recomputes them during its verify pass; under StateFlags=4 (no verify) they become load-bearing.

## Constraints

- Requires the user's Steam client for launch (`steam://rungameid`) — a valid audience assumption.
- Untested edges (per spike notes): very large (50 GB) games, streaming-to-disk (spikes assemble in
  RAM), resume-after-interruption, and confirmation against a hard-DRM-wrapped title.

## Origin

Synthesized from spikes: 001, 002, 003.
Source files: `sources/001-acf-adoption/`, `sources/002-steam-user-depot-download/`,
`sources/003-stateflags4-full-ownership/`.
Operationalized in Phases 21 (native install) and 23 (full-ownership StateFlags=4).
