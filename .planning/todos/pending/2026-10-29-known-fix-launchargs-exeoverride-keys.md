---
created: 2026-10-29
title: "Add launchArgs and exeOverride known-fix keys"
area: known-fixes
severity: minor
platform: any
ready: human
source: "quick 261029-8ws external fix-format research, 2026-10-29"
files:
  - src/backend/knownFixes.ts
---

## Problem

append_argument (39) + replace_command (49) = 88 protonfixes files have no GameLib equivalent.

## Context

Neither key runs new code, so both are tier-1 candidates. `ready: human` because tier placement (tier 1 vs tier 2) is an operator decision. See "External formats (researched 2026-10-29)" in `.planning/notes/per-game-compat-fixes-architecture.md`.

## Next

Operator decides the tier, then implement the keys in the matching key list.
