---
created: 2026-11-23T08:00:00.000Z
title: "wine and fallback-engine downloads use one stream where the TS used five ranged connections"
area: wine
files:
  - src-tauri/crates/gamelib-wine/src/manager/install.rs (installVersion: the download through ctx.fetch)
  - src/backend/utils.ts (downloadFile: the EasyDl multi-connection download the TS wine manager and DXMT use)
severity: minor
platform: any
ready: code
---

## Problem

The TS wine manager downloaded a release archive through `downloadFile` (`backend/utils.ts`), which hands the
transfer to EasyDl: a `HEAD` for the size, then ranged `GET`s over five parallel connections. The Rust wine-manager
port (87-19, now the only wine manager since 87-20 switched the channels and 87-22 deleted the TS) downloads through
`ctx.fetch` with one `GET` on one stream. A multi-hundred-megabyte Wine, Proton-GE or CrossOver archive therefore
arrives on one connection, which on a host that throttles per connection is slower than the TS was.

Phase 87 copied every other behaviour of the wine manager unchanged, and this is the one place the port deliberately
does not match. The 87-07 oracle's goldens pin the `HEAD` plus a single `GET` (the oracle replaced EasyDl with a
stand-in that made exactly those two requests, D-10), so the Rust replay passes either way and a ranged download
is a visible change of its own (D-16), not part of the port.

## Why it is parked

The download is correct and resumes nothing it did not resume before; it is slower only where a single connection is
throttled. Ranged parallel download changes the request pattern (`Range` headers, a size known up front, reassembly
and a checksum over the joined file), so it belongs in its own change with its own goldens.

## If it ever matters

Add a ranged, bounded-parallel download to the shared Rust download helper (the `ctx.download` seam), fall back to the
single stream when the server sends no `Accept-Ranges` or no `Content-Length`, keep the sha512 check over the joined
file, and record new goldens for the ranged requests. Plan 87-48 adds the fallback engine's download to the same
helper, so land this there or just before it and both callers get it.
