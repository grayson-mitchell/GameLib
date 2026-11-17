---
spike: 089
name: pinned-dylib-source-and-signing
type: standard
validates: "Given the need for a pinned libsteam_api.dylib, when its sources are surveyed (game copies, bundling, Valve's client-update CDN) and the signing posture is checked, then there is a genuine, Valve-signed, integrity-checkable source that matches the bridge dispatch's SDK surface and needs no redistribution or re-signing"
verdict: VALIDATED
related: [087, 088, 043, 005a]
tags: [steam, macos, bridge, libsteam_api, pinning, cdn, client-update, vz, codesign, notarization, licensing]
---

# Spike 089: Where a pinned libsteam_api.dylib comes from, and what signing it needs

## What This Validates

Given that 087 showed the live client serves a pinned older dylib, the question is where a pin comes
from. It must be genuine (Valve-built, unmodified), verifiable, and on the dispatch table's SDK surface,
and it must load without GameLib redistributing or re-signing Valve's binary.

## Research

| Source | Genuine / Valve-signed | Matches dispatch SDK | Redistribution | Verdict |
|--------|------------------------|----------------------|----------------|---------|
| Copy out of an installed **game** (BG2EE, WoG, DREDGE) | Genuine bits, but **re-signed by the game developer**. Bundle-sealed copies fail dyld once lifted out (087) | v023 builds ship MMS **v002**, so no | Copy from the user's own disk | ✗ unreliable: depends on what the user owns |
| **Bundle** a redist copy inside GameLib.app | Valve-signed if taken from the client package | Yes, if we pick the build | GameLib would ship a Valve binary. The Steamworks SDK redist terms grant redistribution to Steamworks partners inside their own application, and GameLib is not one | ✗ licensing exposure, plus notarization needs every nested Mach-O signed acceptably |
| **Snapshot the user's client copy** when its sha matches the pin | Valve-signed, the user's own install | Only while Steam still ships that build | None | ✓ zero-network path, but only for users who had the build installed |
| **Fetch from Valve's client-update CDN** (the `webhelpers_osx` package of a named client build) | **Valve-signed, standalone-valid, byte-identical** to the installed client copy | Yes: pick the build | None. Valve's own servers, same pattern as NotProton fetching steamclient from Valve's client package (043), within the DRM-boundary memory | ✓ **chosen** |

## How to Run

```bash
./fetch-pin.sh /tmp/pin     # downloads, verifies sha2vz, decodes .vz, verifies dylib sha256 + Valve team
# then, against live signed-in Steam (087's harness):
../087-pinned-libsteam-api-live-ipc/harness /tmp/pin/libsteam_api.dylib 480 pin
```

## What to Expect

`fetch-pin.sh` ends with `pinned dylib OK … (Valve MXGJJ98X76, SteamAPI_SteamUser_v023)`, and the
harness prints `"ok":true` (see `results-cdn-pin.jsonl`).

## Investigation Trail

1. **Locate the client copy's package.** The Mac client keeps its update packages in
   `Steam.AppBundle/Steam/Contents/MacOS/package/`, with manifests `steam_client_osx.manifest`
   (version 1792618285, Oct 28) and `steam_client_signed-2_osx.manifest` (1794536281, Nov 14).
   `steam_client_signed-2_osx.installed` lists
   `Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib,394304;…`.
2. **Decode the packages.** They are `VZa` files: `VZa` + 4-byte stamp + 5-byte LZMA props + LZMA1
   stream + footer (crc32, size, `zv`). `vz.py` rebuilds an LZMA-alone header and checks size and CRC.
   Every local package decoded. The dylib lives in **`webhelpers_osx`** (2.35 MB compressed), not in
   `bins_osx`.
3. **Identity of the current build.** The extracted dylib is **byte-identical** to the installed copy
   (`247fca03…b659`), `codesign -v` reports it valid on disk standalone, and it is Valve-signed
   (`MXGJJ98X76`). The client's own update channel is a genuine source.
4. **Does the CDN keep old builds?** HEAD/range requests to `client-update.akamai.steamstatic.com`,
   `client-update.steamstatic.com` and `cdn.cloudflare.steamstatic.com/client` return **206 for both
   the current package and the Oct 28 manifest's older package** (`…6d8f8e88…_2348800`). The
   manifest names (`steam_client_signed-2_osx`) 404 on these hosts, and `steam_client_osx` returns 200.
   Packages are addressed by content name, so a pin only needs the file name and its hash.
5. **Fetch the old build.** The download matches the manifest's `sha2vz` exactly. The manifest's `sha2`
   (for the plain `.zip`) does **not** match our decoded vz payload, so verify `sha2vz` plus the dylib's
   own sha256, never `sha2`. The dylib inside (built 2026-10-21, 395,104 B, `4162eb40…6bac`) is
   Valve-signed, standalone-valid, x86_64 + arm64, and exports **SteamUser_v023, Friends_v018,
   MatchmakingServers_v003**. That is the pre-Nov-10 build and exactly the dispatch's surface.
6. **Coverage and live run.** Of the 192 flat symbols the helper needs, this pin is missing none
   (only `SteamAPI_Init`, which is just a name in a log list). The 087 harness against it, with live
   Steam on AppIDs 480 and 257350, passed everything: InitFlat, real SteamID, AppID, manual dispatch,
   and 703→1101 (`results-cdn-pin.jsonl`, `run-cdn-pin.log`).

## Signing and notarization

- **Today:** GameLib.app is ad-hoc signed (`tauri.macos.conf.json` `signingIdentity: "-"`). The
  helper is ad-hoc and linker-signed with **no hardened runtime**, and the only entitlement is
  `allow-jit`. Library validation does not apply, so the helper loads the Valve-signed pin as it
  loads the client copy. **Pinning changes nothing here.**
- **Under Developer ID + hardened runtime (notarized builds):** loading *any* Valve-team dylib (the
  client copy or the pin) needs `com.apple.security.cs.disable-library-validation` on the helper.
  That is a cost of the bridge itself, not of pinning.
- **Fetched, not bundled:** a pin downloaded at runtime into GameLib's Application Support dir sits
  outside the notarized bundle, keeps Valve's signature untouched, and never needs GameLib to
  re-sign Valve code. Files the app writes itself are not quarantined unless the app opts into
  `LSFileQuarantineEnabled`.

## Results

**VALIDATED.** The source for a pin is **Valve's client-update CDN**: one named `webhelpers_osx`
package from a chosen client build, verified by `sha2vz` and then by the extracted dylib's sha256
and Valve team ID. It gives a genuine, unmodified, Valve-signed dylib on exactly the SDK surface the
dispatch was generated against, without GameLib shipping Valve binaries.

Recommended shape for the build:

1. **Pin record** in code: package name, `sha2vz`, dylib sha256, expected `SteamUser_vNNN`. Bump it
   only together with a dispatch regeneration.
2. **Resolve order:** the cached pin in `~/Library/Application Support/GameLib/steam-api/<sha>/`, then
   **snapshot** the user's client copy if its sha equals the pin, then **fetch** from the CDN, then the
   **client copy** as a last resort, logged as `UNPINNED` (offline first run, or CDN retired the build).
   Keep the client-copy fallback: 261113-n39's version probing already makes it degrade gracefully.
3. Fetch and verify in the Rust side (reqwest + sha2, with the vz decode as ~15 lines of `lzma-rs` or
   `xz2`), never in the sidecar at boot. A sidecar fetch would break the bounded-boot-work convention.

Open risks:

- **CDN retention is unproven beyond about 4 weeks** (the Oct 21 build was served on Nov 17). Once a
  pin is cached locally it never needs the CDN again, but a fresh install after Valve purges the build
  falls to the client copy. A periodic HEAD check in CI would catch a retired pin before users do.
- **Licensing:** fetching Valve's own file from Valve's servers onto a machine that already runs Steam
  is the NotProton/Proton pattern the DRM-boundary memory allows. It is a judgment call, not a
  reviewed legal position.
