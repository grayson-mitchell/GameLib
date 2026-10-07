---
created: 2026-10-03T00:00:00.000Z
title: "OAuthLogin (GOG/Epic/Amazon) and HumbleLogin share a wasteful Retry: TauriLoginPanel's own full window.location.reload(), not a Dialog remount via overlayMountKey"
area: frontend
severity: minor
platform: any
ready: code
status: RESOLVED
resolved: 2026-10-08
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

## Resolution (2026-10-08, quick 261008-aoe)

- **The `onRetry` seam.** `TauriLoginPanel` takes an optional `onRetry?: () => void`. Its Retry button calls `onRetry()` with zero
  arguments when the host supplied one (never `onClick={onRetry}`, which would forward React's SyntheticEvent into host code), and
  otherwise calls `window.location.reload()`, still the file's single reload site. The panel gained no hook and stays invocable as a
  plain function.
- **Remount, not reload.** `Login/index.tsx` gained `retryLoginOverlay`, which re-opens the current overlay through `openLoginOverlay`.
  That bumps `overlayMountKey`, so React discards the old overlay subtree and mounts a fresh one. The remount is itself the re-trigger:
  `useTauriOAuthLogin`'s mount effect runs a new `run()` capture for the OAuth overlay, and `HumbleLoginSurface`'s mount effect restarts
  the Humble login watch (the replaced surface's cleanup sends `humbleStopLogin()` first). `onRetry` is not wrapped in `useCallback`
  and never enters the hook's dependency array, so 261003-s04's D-2 (two empty-dependency callbacks) still holds.
- **Wired:** `OAuthLogin` (GOG, Epic/legendary, Amazon/nile) and `HumbleLogin`, each with a required `onRetry` that
  `Login/index.tsx` passes as the named reference `retryLoginOverlay`.
- **Unchanged:** the `/loginweb/<runner>` routes (`WebView/index.tsx` and `HumbleLoginSurface`'s no-`renderState` fallback) pass no
  `onRetry` and keep the panel's reload. Both are pinned by zero-`onRetry` source gates.
- **Bundled fix, not in the original fix shape:** `OAuthLogin`'s `dismiss` now goes through `bindOverlayDismiss`, as Steam's and
  Humble's already did. That clears the `overlayDismiss.test.ts` failure present since `d6c124006` (261003-s04), and it matters more now
  that Retry makes replacing an overlay with another of the same runner a routine path.
- **Gates:** `TauriLoginPanel.test.tsx`, `oauthLoginOverlay.test.ts`, `loginCrossfade.test.ts` and `overlayDismiss.test.ts` (plus the
  untouched `loginInFlightUiReachability.test.tsx`). Commits: `c0f82e282` (RED), `4d0099ea9` (GREEN), `95f9eebba` (RED),
  `e1529b6fb` (GREEN).
- **Not proven by any automated check:** fix-shape item 3's LIVE half, a real Retry click on one OAuth runner and on Humble. It is
  carried by the `<human-check>` in the 261008-aoe plan and is pending operator verification. The residual Humble stop/start ordering
  risk (T-AOE-02: `humbleStopLogin` travels `sidecar_send`, `humbleStartLogin` travels `sidecar_invoke`, so arrival order at the sidecar
  is not guaranteed) is accepted there, and a todo should be filed if the Humble Retry shows an instant timeout.
