---
created: 2026-11-10T00:00:00.000Z
title: 'GOG comet panics at start: --from-heroic reads heroic/gog_store, GameLib keeps auth under gamelib/gog_store'
area: backend
severity: medium
platform: any
ready: code
found_by: 'Operator, during the Phase 66.1 live check (66.1-HUMAN-UAT.md item 3); pre-existing, not a 66.1 regression'
files:
  - src/backend/storeManagers/gog/games.ts (comet spawn: `--from-heroic --username … --quit`)
  - src/backend/storeManagers/gog/electronStores.ts or gog stores factory (where gog_store/auth.json lives)
  - public/bin/*/comet (upstream imLinguin/comet v0.2.0)
---

## Problem

When a GOG game launches, GameLib starts comet (the GOG Galaxy communication service) with
`--from-heroic --username <user> --quit`. comet then panics immediately:

```
thread 'main' panicked at src/import_parsers/heroic.rs:53:38:
Failed to read heroic auth file: Os { code: 2, kind: NotFound, ... }
```

`--from-heroic` reads Heroic's config dir (`~/Library/Application Support/heroic/gog_store/auth.json`
on macOS). GameLib renamed its user-data dir to `gamelib`, so the file is at
`~/Library/Application Support/gamelib/gog_store/auth.json`, and comet never finds it. The game still
runs, but Galaxy features (achievements, overlay presence via comet) are unavailable.

Reproduced outside the app by running the comet binary directly with the normal environment, so this
predates Phase 66.1, which only moved comet's spawn onto the process runner. The runner launches and
kills it correctly (gamelib.log "Launching Comet!" / "Killing Comet!").

## Fix direction

Check comet's CLI for an explicit auth/config path option, or an env var such as `HEROIC_CONFIG_PATH`
or `XDG_CONFIG_HOME`, and pass GameLib's gog_store location. Otherwise use comet's token-based mode
(`--access-token/--refresh-token/--user-id`) from the gog configStore. Add a test that pins the argv/env.
Verify live: `pgrep -fl comet` shows comet running while a GOG game plays.
