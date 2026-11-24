---
created: 2026-11-25T00:00:00.000Z
title: "fetchRemoteKnownFixes refuses any app name that starts with two dots, not only a traversing one"
area: backend
severity: minor
platform: any
ready: code
files:
  - src/backend/knownFixesFetcher.ts
  - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/fetcher/expected/rule-unsafe-app-names-write-and-ask-nothing/result.json
---

## Problem

The fetcher's containment check is `rel.startsWith('..')` on the path of the destination relative to the fixes
folder. That is meant to catch a destination outside the folder, but it also matches a file name inside it whose
first two characters are dots: an app name `..dots` gives the destination `..dots-gog.json`, which is inside the
folder and harmless, and is refused with "Refusing known-fixes fetch for unsafe app name".

## Why it is minor

No store id starts with two dots (Steam and GOG ids are numeric, Epic and Amazon ids are alphanumeric), so nothing
real is refused. It is a latent trap for a second caller, and the check reads more strictly than it needs to.

## Recorded, not fixed (D-20)

Phase 88 plan 07 records the behaviour in the golden
`fetcher/expected/rule-unsafe-app-names-write-and-ask-nothing` (five names: `../escape`, `..`, `a/b`, `/abs`,
`..dots`, each refused with no request and no file). The Rust fetcher (88-11) reproduces it as recorded. A fix
would compare path segments (`rel.split(sep)[0] === '..'`) and change the golden in the same commit as its reason.
