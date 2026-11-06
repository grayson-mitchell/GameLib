---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 10
subsystem: steam-bridge-drm
tags: [drm-mode, packaging, licence-separation, sha-pinned-download, codesign]
requires: [56-02, 56-03, 56-04]
provides:
  - src/common/steamclientLayerCatalogue.ts
  - src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts
  - meta/buildSteamClientLayerArchive.ts
  - native/steam-bridge/steamclient-layer/NOTICE
affects: [56-11, 56-15]
tech-stack:
  added: []
  patterns: [overlay-installer analog, deterministic ustar archive, fake-HOME codesign spawn]
key-files:
  created:
    - src/common/steamclientLayerCatalogue.ts
    - src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/steamclientLayerInstall.test.ts
    - meta/buildSteamClientLayerArchive.ts
    - meta/__tests__/steamclientLayerNotice.test.ts
    - native/steam-bridge/steamclient-layer/NOTICE
  modified:
    - THIRD-PARTY-NOTICES.md
    - package.json
decisions:
  - "Pins taken from the wave-1 outputs in build/steamclient-layer/steamclient-layer-cx26.3.0.39832/ (no rebuild); every sha matches the 56-02/56-03 values"
  - "NOTICE is build-agnostic (literal cx<build>), so one pin serves every catalogue entry"
metrics:
  tasks: 3
  completed: 2026-10-28
---

# Phase 56 Plan 10: steamclient-layer component packaging Summary

On-demand, sha-pinned `steamclient-layer-cx26.3.0.39832` component: catalogue in the signed app, deterministic operator-built archive (`pinned: match`, byte-identical on rebuild), Node-side verified installer that strips the `.so` signature under a fake HOME, plus NOTICE and THIRD-PARTY-NOTICES licence separation.

## Exported signatures

- `ensureSteamclientLayerComponent(opts: { appFolder: string; crossoverBuild: string }, deps: SteamclientLayerInstallDeps = {}): Promise<DrmStepResult<SteamclientLayerReady>>`
- `SteamclientLayerReady = { componentId; componentDir; crossoverBuild; files: { lsteamclientDll; lsteamclientSo; detourPayload; helperExe; licence; notice }; source: 'cache' | 'download' }`
- `SteamclientLayerInstallDeps = { fetchArchive?; runCodesign?; lookupEntry?; timeoutMs?; codesignTimeoutMs?; onFetchStart? }`
- Catalogue: `SteamclientLayerFileLicence`, `SteamclientLayerCatalogueEntry`, `STEAMCLIENT_LAYER_RELEASE_REPO`, `STEAMWORKS_LICENSE_SHA256`, `steamclientLayerFileNames`, `steamclientLayerLicenceFor`, `STEAMCLIENT_LAYER_CATALOGUE`, `lookupSteamclientLayer`, `steamclientLayerArchiveUrl`, `steamclientLayerReleasePageUrl`.

## Pins (from the wave-1 outputs, not a rebuild; Node v22.23.4)

| file | sha256 | size |
| --- | --- | --- |
| LICENSE.lsteamclient | 80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1 | 7435 |
| NOTICE | dd9c7c74ca5e2b62a82bb32926b45333d7b2fd7f1dd8a917b2feb0579f1c11bc | 4017 |
| detour-cx26.3.0.39832.bin | e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb | 832 |
| lsteamclient.dll | 22bb19413ce1f66c771c2d54260f6811480375db66c74e60c66a02d307b5cb76 | 33904653 |
| lsteamclient.so | dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d | 2388896 |
| steam.exe | 4a67c58a41792e8a784bea7338adaf3d7d3713dc6d20ccaf61895edfdb32e6ba | 193536 |
| archive steamclient-layer-cx26.3.0.39832.tar.gz | c58a40c67c5d9093970227327bcceb5c2e457bc81b0a58559d9cb65777aeb187 | 5359548 |

Archive kept for 56-15 at `build/steamclient-layer/steamclient-layer-cx26.3.0.39832.tar.gz` (gitignored). The source gates confirmed `lsteamclient.so` is a thin unsigned x86_64 Mach-O and `lsteamclient.dll`/`steam.exe` are PE x86_64.

## Commits

- 60edf9213 test: RED, catalogue/NOTICE/builder tests plus NOTICE
- 0bcaa76ad feat: catalogue and archive builder (pin run)
- 1695304fc test: RED, THIRD-PARTY, scripts and packaging-separation gates
- 721267bf2 feat: THIRD-PARTY-NOTICES section and the two package scripts
- 61a2efde4 test: RED, installer tests
- 5aa0cc9b9 feat: ensureSteamclientLayerComponent

## Notes for downstream plans

- 56-11: `onFetchStart` is the progress hook; the step slot is "component" (after the CrossOver allowlist, before the runner).
- 56-15 publish list: the archive asset plus `native/steam-bridge/steamclient-layer/ntdll-patch/COPYING` and `helper/LICENSE` beside it on the release page, with the tag on a commit that contains the corresponding source. Nothing was published here.
- 56-15 re-pin rule: any rebuild means re-pinning both the catalogue and the THIRD-PARTY-NOTICES table; `steamclientLayerNotice.test.ts` fails until both agree.
- 56-03's verification grep over package.json for `buildDrmNativeParts` now matches by design (the `build:drm-native` script is added here).

## Deviations from Plan

None - plan executed as written. Minor: the THIRD-PARTY separation sentence wraps across lines under prettier, so the test whitespace-normalises the document before matching.

## Verification

- jest: drm dir, fakeHomeIsolation, knownFixOverlayInstall, steamclientLayerNotice all green (277 passed, 1 skipped unrelated to this plan); real-codesign and real-staging cases executed.
- `pnpm codecheck` clean; prettier check clean; `node meta/findDeadcode.cjs` reports nothing for the new modules.
- `pnpm -s build:steamclient-layer-archive --build 26.3.0.39832` ends `pinned: match`.
- No workflow, tauri.conf.json, signMachOResources or buildSteamBridgeShims reference to the component; no binary committed.
- REQUIREMENTS.md is absent in this repo, so `requirements.mark-complete` was not applicable.

## Known Stubs

None.

## Self-Check: PASSED
