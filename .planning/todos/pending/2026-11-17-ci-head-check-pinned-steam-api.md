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
