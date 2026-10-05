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

## Resolution (2026-10-05)

Both items confirmed by a failing test before any product change.

### 1. Humble login watch rejection → error state

**Change.** `HumbleLoginSurface.tsx`: `void runHumbleLoginWatch()` became
`runHumbleLoginWatch().catch(...)`. A rejection — `humbleStartLogin`/`humbleReconnect` rejecting,
or `humble.login(result)` throwing — now logs `phase=error (login watch rejected: …)` and sets
`{ phase: 'error', message }` with the error's own message, the same shape `useTauriOAuthLogin`'s
catches use, so `HumbleLogin`'s overlay mounts its Dialog (with the close button) and
`TauriLoginPanel` renders its existing error branch. A rejection after unmount stays silent
(`mounted` check), matching the resolved arms. No new catalogue key.

**RED.** New behavioural test `WebView/__tests__/HumbleLoginSurfaceWatchRejection.test.tsx`
(hook-mocked, component called as a function, same harness style as the Humble Keys suite): 3 of
4 failed on the unfixed code — rejected start, throwing `humble.login`, rejected reconnect — each
left the last rendered state at `{ phase: 'idle' }`; the positive control (`done` → `onDone`)
passed.

**GREEN.** 4/4; `src/frontend/screens/WebView` + `src/frontend/screens/Login`: 25 suites / 406
tests, including the existing source-text gate `HumbleLoginWatchErrorHandling.test.ts`.

### 2. Literal `&quot;` in the sideload import hint

**Change.** `SideloadDialog/index.tsx`: `shouldUnescape` on the `sideload.import-hint.content`
`<Trans>`. Catalogue values untouched — the entity is in en and in 44 machine-filled locales
(45 of 49), and fixing it in the catalogues would have meant editing 44 non-en files.

**RED.** New `SideloadDialog/__tests__/importHintTrans.realI18next.test.ts`, following
`wikiLinkTrans.realI18next.test.ts`'s method (real i18next + fs backend, the `<Trans>` attributes
read from the production source, a plain `<a>` for `NavLink`): before the fix the `en` assertion
and the per-locale "no visible entity" assertion failed for every locale whose value carries
`&quot;` — markup contained `&amp;quot;`. `bg`/`hu`/`ja`/`lt`, which use typographic quotes,
passed.

**GREEN.** All 52 tests pass (49 locales + 3); `pnpm i18n` leaves `public/locales` unchanged.

**Checks.** `pnpm codecheck` clean; eslint 0 errors on the four touched files (2 pre-existing
warnings in `SideloadDialog/index.tsx` at lines 157 and 182); prettier clean.

**Not verified.** No live app run. The import-hint test renders a reconstructed element, not the
production component (no DOM renderer in this project), exactly the limit its precedent states.
The Humble rejection path was not reproduced against a real sidecar disconnect.
