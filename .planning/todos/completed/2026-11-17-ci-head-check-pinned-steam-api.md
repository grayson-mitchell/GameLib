---
created: 2026-11-17T00:00:00.000Z
title: "CI: HEAD-check that Valve's CDN still serves the pinned libsteam_api package"
area: steam
severity: minor
platform: any
ready: code
source: 'quick 261117-ubb, deferred spec item 6'
files:
  - src-tauri/crates/gamelib-depot/src/steam_api_pin.rs
  - .github/workflows
---

## Problem

The macOS bridge helper loads a pinned libsteam_api.dylib that GameLib fetches once from Valve's
client-update CDN and caches (quick 261117-ubb). Whether Valve keeps serving the pinned package
(`PIN.package` in `steam_api_pin.rs`) is only proven to about 4 weeks (spike 089, Open risks). If
the CDN drops the build, a user with no cache lands UNPINNED on the Steam client's own copy
(logged as UNPINNED by both the sidecar and the helper), and nothing tells the maintainers.

A cached pin never needs the CDN again, so this affects only fresh installs and users who cleared
the cache.

## Solution

A scheduled GitHub workflow (weekly is enough) that sends a HEAD request for `PIN.package` to each
host in `CDN_HOSTS` and fails when neither answers 200 with `Content-Length` equal to
`PIN.package_size`. Read the package name and size out of `steam_api_pin.rs` rather than copying
them into the workflow, so a pin bump cannot leave the check stale. A failure is the prompt to
re-pin (a new package, `pnpm gen-vtables`, and the helper header sha) or to host the dylib
ourselves.

## Resolution

Done by quick 261119-a23 (commits `e64930db0` and `4a6fc2e4d`). `meta/steamApiPinCdnCheck.cjs`,
run as `pnpm check:steam-api-pin-cdn`, sends one HEAD request per host in `CDN_HOSTS` and exits 0
only if at least one host answers 200 with a `Content-Length` equal to `PIN.package_size`. The
weekly workflow `.github/workflows/steam-api-pin-cdn.yml` runs it Mondays at 06:30 UTC, on
`workflow_dispatch`, and on push/PR filtered to the pin file, the script and the workflow itself.

The package name, size and hosts are parsed out of `steam_api_pin.rs` at run time by a strict
textual parser (a malformed or reshaped file exits 2 before any request), and a jest guard keeps
all of them out of the workflow and the script. Redirects are not followed, mirroring production's
`redirect::Policy::none()`, and a missing `Content-Length` is a failure. When no host passes, the
`::error::` line names the remedy (re-pin with `pnpm gen-vtables` and the helper header sha, or
host the dylib ourselves); an all-transport-failure run is reported as unreachable with advice to
re-run first.

Live run, 2026-11-19: `client-update.steamstatic.com` status 200, content-length 2348800;
`client-update.akamai.steamstatic.com` status 200, content-length 2348800. Both match
`PIN.package_size`.

The check does not prove the body: no sha2vz, VZ decode, member extraction, dylib sha256 or Valve
signature, and it runs from GitHub's runners only, not users' regional CDN edges. It is
deliberately not a required check, because it can go red with no change in the repo.

**Follow-up (human, CI):** after this lands on main, the push trigger fires, because the workflow
file is in its own `paths:` filter. Confirm that run is green in the Actions tab, or run it once
via workflow_dispatch.
