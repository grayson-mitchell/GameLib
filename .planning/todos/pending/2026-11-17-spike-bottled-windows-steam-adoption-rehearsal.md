---
created: 2026-11-17T00:00:00.000Z
title: "Optional: rehearse the Windows adoption spike on the Mac's bottled Windows Steam"
area: steam-install
files:
  - .planning/todos/pending/2026-11-16-spike-steam-startup-and-sign-in-adoption-on-windows.md (the real run)
  - .planning/spikes/083-adoption-signal-without-restart/README.md
severity: minor
platform: macos
ready: live-gate
---

## Problem

This is an optional early signal for the Windows adoption spike (Phase 81 D-14). The
`GameLibSteam` CrossOver bottle runs the real Windows Steam client, so it can answer
questions 1–3 cheaply:
- Does Steam adopt at startup?
- Does it stay unaware while running?
- Does it adopt at sign-in?

## Limits

This does **not** decide the Windows arm:
- Wine's registry (question 4, HKCU Apps) and URL handling (question 5, `steam://exit`) are
  not Windows'.
- The bottle path is a different install route from GameLib's native Windows depot install.

Skip this if the Windows machine is to hand anyway.

## Solution

Ask the Windows todo's questions 1–3 against the bottle's `steamapps`, using a small game.
Note the answers in the Windows todo as a prior, not a result.
