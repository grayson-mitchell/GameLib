---
created: 2026-11-10T00:00:00.000Z
title: 'Depot installs ignore the per-app beta branch chosen in Steam'
area: steam
severity: minor
platform: any
ready: code
---

GameLib always installs the `public` branch. The branch is hardcoded in two places:
`src/backend/storeManagers/steam/depot/select.ts:171` (`branch = 'public'`), and the manifest
request-code refresher at `depotRust/install.ts:107`. It never reads the beta the user picked in
Steam's Properties → Betas. That choice is stored as a hex blob under `UserAppConfig/<appId>` in
`userdata/<id>/config/localconfig.vdf`, and as `UserConfig.BetaKey` in an existing ACF.

Found in the phase 73 post-deletion smoke (2026-11-10). GameLib installed ADOM (333300) at public
manifest 1735692159990042256 (build 5820078), and the Rust pipeline did exactly what it planned.
The Steam client then adopted the install and applied the saved beta `release-101`: it fetched
manifest 1547379086645511101, swapped about 15 files and rewrote the ACF to build 3512046 with
`UserConfig`/`MountedConfig BetaKey`. Steam corrects this itself when it adopts the install, so
the only cost is a wasted delta download. It has been like this since phase 21, so it is not a
phase-73 regression.

Raise to `medium` if a path Steam never adopts must respect the beta. That covers bridge installs
(the bottle's own steamapps), installs while Steam is not running, and phase 74's bridge-game
updater, which would otherwise update a beta user back to public.

Fix direction: read the BetaKey, pass it as `branch` into `select.ts` and the request-code
refresher, and write it into the ACF `UserConfig`. Password-protected branches need
`CheckAppBetaPassword` and are out of scope unless asked for.

Evidence: `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/0f6e4bdc-f756-4997-848e-d58a531e00f4/scratchpad/smoke73/adom-buildid-finding.md`
(session scratchpad, may be gone), Steam `content_log.txt` 2026-11-08 22:00:54 ("beta changed:
release-101") and 2026-11-10 07:32:00–07:32:06.

## Resolution

Closed by quick 261110-up7.

- Resolver order: ACF `UserConfig.BetaKey`, then the localconfig.vdf `UserAppConfig/<appId>` binary-KV blob (decoded; verified against the real ADOM 333300 blob), then `public`.
- The branch is checked against the app's `depots.branches`; unknown and password-protected branches fall back to `public` with a log line and never fail the install. Invalid key shapes are rejected the same way.
- The branch flows to `selectAllDepots`, the buildid read, manifest request codes and resume verify (prescreen and selected-files too).
- BetaKey is written into the ACF `UserConfig` by both the Rust and TS writers (neither emits MountedConfig). Public installs write the byte-identical ACF as before.
- A depot with no manifest on the beta branch falls back to its public manifest, with a log line.
- Still out of scope: CheckAppBetaPassword.
- Live confirmation: re-install ADOM (333300) with release-101 selected in Steam and check Steam's content_log shows no "beta changed" delta after adoption.
