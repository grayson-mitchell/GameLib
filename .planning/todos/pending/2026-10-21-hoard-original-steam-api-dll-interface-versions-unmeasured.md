---
created: 2026-10-21
title: "Hoard's (63000) original steam_api.dll interface versions are still unmeasured -- Task 1 of 51-11 was skipped"
area: steam-bridge
files:
  - meta/sdk/acceptance-interface-versions.json
  - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-11-SUMMARY.md
severity: major
platform: macos
ready: blocked
---

## What happened

Plan 51-11's Task 1 (`checkpoint:human-action`, `gate="blocking"`) asked the operator to
produce an ORIGINAL copy of Hoard's `win32/steam_api.dll` (about 118368 bytes) so its real
interface versions could be `strings`-extracted and recorded. The operator could not get this
file during the 51-11 execution session: the CrossOver bottle `GameLibSteamBridge` had no
network path to Steam's content CDN ("no internet connection" on launch, confirmed via
`content_log.txt` showing zero download activity that day), and the operator explicitly said
to skip Task 1 and proceed with Tasks 2/3 instead.

51-11's extractor and manifests therefore only cover XCOM: Enemy Unknown's (200510) measured
versions for the first locked interface group (SteamUser016, SteamFriends011, SteamUtils005,
STEAMAPPS_INTERFACE_VERSION004, STEAMUSERSTATS_INTERFACE_VERSION010) plus the pre-existing
SteamUser023/SteamFriends018 manifests (now completed to full real layouts, but still not
tied to any measured title -- `meta/sdk/acceptance-interface-versions.json` records them with
`"titles": []`).

## What is blocked

- `meta/sdk/acceptance-interface-versions.json`'s `SteamUser023`/`SteamFriends018` entries
  cannot gain `"titles": ["63000"]` until Hoard's real dll is measured -- it is NOT safe to
  assume Hoard actually needs exactly these two versions; that was a Phase 24-era placeholder
  choice, never measured.
- Full D-51-14 acceptance coverage for Hoard (the locked acceptance-set anchor) is not
  achieved by 51-11. XCOM's coverage is real; Hoard's is not yet substantiated by any
  measurement.
- The 24-UAT Gate 4 re-run (Hoard playable through the widened bridge) cannot be meaningfully
  attempted until this is resolved -- the shim may or may not actually serve whatever version
  Hoard's real dll expects.

## How to unblock

1. Fix the `GameLibSteamBridge` CrossOver bottle's network access (or reinstall Hoard through
   a bottle that has it), so Steam can actually download/verify Hoard (small download, "63000
   is small" per the original Task 1 instructions).
2. Run the Task 1 verification exactly as written in 51-11-PLAN.md: `stat -f %z <path>`
   (expect roughly 118368, NOT the 805888-byte Phase 24 shim), then
   `strings -a <path> | grep -E '^(Steam[A-Za-z]+0[0-9]{2}|STEAM[A-Z]+_INTERFACE_VERSION0[0-9]{2})$' | sort -u`.
3. Add the measured versions to `meta/sdk/acceptance-interface-versions.json` with
   `"titles": ["63000"]`, run `pnpm extract-proton-inventory --versions <the measured list>`,
   complete the shimCoverage.ts wiring the same way 51-11 did for XCOM, and re-run the Gate 4
   live gate.

`ready: blocked` because this needs the operator's own CrossOver/network fix and real hardware
access, not just code.
