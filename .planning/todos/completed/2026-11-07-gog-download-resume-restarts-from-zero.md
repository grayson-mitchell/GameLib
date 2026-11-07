---
created: 2026-11-07T00:00:00.000Z
title: 'GOG download resume restarts from 0%'
area: downloads
severity: medium
platform: any
ready: code
found_by: 'Phase 62 smoke 2 (62-UAT.md), pre-existing, not caused by phase 62'
---

Pausing a GOG download (Endless Sky 1829678475) at 12.07% and resuming re-runs a byte-identical gogdl download command (--platform osx --skip-dlcs --lang en-US, support dir gog-support/1829678475) and progress restarts at 0%. Investigate gogdl resume behaviour and the support dir. Not confirmed against a pre-62 build.
