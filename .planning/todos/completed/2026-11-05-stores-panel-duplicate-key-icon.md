---
created: 2026-11-05T12:00:00.000Z
title: "Stores panel: Humble Keys and Redeem a Steam key share the same key icon"
area: navigation
files:
  - src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx (faKey at lines 77 and 85)
severity: minor
platform: any
ready: code
---

## Problem

In the Stores tier-2 list, both "Humble Keys" and "Redeem a Steam key" render
`faKey`. Two adjacent rows with an identical glyph read as the same destination,
which defeats the point of iconing every row (sketch 007, shipped for Settings in
quick 261105-o65).

Found during the 2026-11-05 sketch frontier review.

## Solution

Give one of the two rows a distinct glyph. Do not reuse a tier-1 tab icon
(`gamepad`, `sliders`, `store`, `user`). Optional, same pass: the list mixes store
destinations (Epic, GOG, Steam, Amazon Luna) with tools (Store Search, Deals,
Humble Keys, Redeem a Steam key); a `NavShell__tier2Divider` between the two
groups would match the Settings list. That part is a design call, so confirm it
with the user before doing it.

## Resolution

2026-11-05, commit `8d5afdca0`: Redeem a Steam key now uses `faTicket`; Humble Keys keeps `faKey`. The optional store/tool divider was not done (design call, not requested).
