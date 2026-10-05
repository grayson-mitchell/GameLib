---
created: 2026-10-05T00:00:00.000Z
title: "Login/i18n minor defects: a rejected Humble login watch leaves an inert blank login screen; literal &quot; likely visible in the sideload import hint"
area: ui
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 36"
files:
  - src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:124
  - src/frontend/screens/Login/components/HumbleLogin/index.tsx:57-75
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:385-391
  - public/locales/en/gamelib.json
---

## Problem

1. **Humble login watch has no catch** (`HumbleLoginSurface.tsx:124`): `void runHumbleLoginWatch()`.
   If `humbleStartLogin` rejects (sidecar disconnect; this channel is exempt from the 60s timeout) or
   `humble.login(result)` throws, state stays `idle`, neither `onDone` nor `onCancelled` runs,
   `loginInFlight` stays true and the wrapper stays inert. HumbleLogin draws nothing while idle, so
   there is no close button.
2. **Literal `&quot;` likely visible** (`SideloadDialog/index.tsx:385-391`): the
   `<Trans ns="gamelib" i18nKey="sideload.import-hint.content">` has no `shouldUnescape`, and the
   en/de/fr values contain `&quot;{{doorLabel}}&quot;`. The repo's own
   `wikiLinkTrans.realI18next.test.ts:13-17` measured that entities render as text without
   `shouldUnescape`. Not run here — lower confidence.

## Failure scenario

1. The only way out is leaving the Login screen. Needs an unusual backend failure.
2. Users see `&quot;Door&quot;` instead of quotes.

## Suggested fix

1. try/catch the watch and set `{phase:'error'}` so the Dialog with its close button shows.
2. Use real `"` in the three catalogues, or add `shouldUnescape` with a real-i18next test.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
