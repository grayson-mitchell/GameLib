---
created: 2026-10-03T00:00:00.000Z
title: "OAuthLogin (GOG/Epic/Amazon) and HumbleLogin share a wasteful Retry: TauriLoginPanel's own full window.location.reload(), not a Dialog remount via overlayMountKey"
area: frontend
severity: minor
platform: any
ready: code
found_by: "Quick task 261003-s04 (D-5), carried forward from the already-shipped HumbleLogin overlay"
source: ".planning/quick/261003-s04-move-the-gog-epic-legendary-and-amazon-n/261003-s04-PLAN.md"
files:
  - src/frontend/screens/Login/components/OAuthLogin/index.tsx
  - src/frontend/screens/WebView/components/TauriLoginPanel/index.tsx
  - src/frontend/screens/Login/index.tsx
---

## What is wasteful, not broken

`TauriLoginPanel`'s Retry control is a full `window.location.reload()`. Under GameLib's hash
router that lands the user back on `#/login` (Manage Accounts) after the app re-boots — correct
behaviourally, but it tears down and restarts the entire renderer process just to retry one
OAuth capture attempt. `HumbleLogin` already ships this exact behaviour today; quick task
261003-s04 deliberately matched it for the new `OAuthLogin` overlay (GOG, Epic/legendary,
Amazon/nile) rather than inventing a second, divergent Retry affordance.

## Why it was not fixed in 261003-s04 (D-5)

`Login/index.tsx`'s `openLoginOverlay` already bumps an `overlayMountKey` that could remount just
the Dialog on Retry instead of reloading the whole app — a much cheaper recovery path. It was not
taken because `TauriLoginPanel` cannot be stopped from rendering its own Retry button without
editing that component, and `TauriLoginPanel` was out of scope for that task (it is shared,
read-only infrastructure also used by the `/loginweb/*` routes). Duplicating ~60 lines of
per-phase copy/Retry logic in `OAuthLogin` to avoid the shared control would have added a SECOND,
competing Retry button in the same Dialog — worse than the status quo.

## Fix shape (future task)

1. Give `TauriLoginPanel` a way to hand Retry back to its host (an optional `onRetry` prop,
   defaulting to the current `window.location.reload()` for the `/loginweb/*` routes which have
   no overlay to remount) instead of always reloading.
2. Wire `OAuthLogin` and `HumbleLogin` to pass a remount-based `onRetry` that bumps
   `overlayMountKey` and re-triggers the capture, so only the Dialog/overlay remounts rather than
   the whole app.
3. Re-verify both overlays' existing source-gate suites (`oauthLoginOverlay.test.ts`,
   `loginInFlightUiReachability.test.tsx`, the Humble equivalents) plus a live Retry click on at
   least one OAuth-capture runner and Humble.

## Scope note

This is a UX/performance nicety, not a correctness defect — the current Retry works, it is just
heavier than it needs to be. `severity: minor`.
