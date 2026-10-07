---
phase: quick-261008-aoe
plan: 01
subsystem: frontend/login
tags: [login, oauth, humble, retry, overlay, tauri]
requires: []
provides:
  - TauriLoginPanel optional onRetry seam (reload remains the default)
  - Retry in the OAuth (GOG/Epic/Amazon) and Humble overlays remounts only that overlay
  - OAuthLogin dismiss bound to its mount key
affects:
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/Login/components/OAuthLogin/index.tsx
  - src/frontend/screens/Login/components/HumbleLogin/index.tsx
  - src/frontend/screens/Login/index.tsx
key-files:
  modified:
    - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
    - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
    - src/frontend/screens/Login/components/OAuthLogin/index.tsx
    - src/frontend/screens/Login/components/HumbleLogin/index.tsx
    - src/frontend/screens/Login/index.tsx
    - src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts
    - src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
    - src/frontend/screens/Login/__tests__/overlayDismiss.test.ts
    - .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md
decisions:
  - "onRetry is called with zero arguments from an arrow in the panel, never passed as onClick (T-AOE-03)"
  - "retryLoginOverlay reads openOverlay, not mountedOverlay, so a dismissed overlay in its 500ms exit is never resurrected"
  - "OAuthLogin dismiss joined bindOverlayDismiss (planner-discretion inclusion, fixes the overlayDismiss.test.ts red since d6c124006)"
status: complete
commits: 5
plan_head_before: 0a72a413d2bd571d92a43d7d2f416a82cb416b7b
plan_head_after: d3aa437dd
actuals:
  tokens: 8100
  tasks: 3
  commits: 5
metrics:
  completed: 2026-10-08
---

# Quick 261008-aoe: Retry in TauriLoginPanel hands back to the host

One-liner: `TauriLoginPanel` gets an optional `onRetry` (reload stays the default), and the Login screen's OAuth and Humble overlays pass `retryLoginOverlay`, which re-opens the overlay through `openLoginOverlay` so only that overlay remounts via `overlayMountKey` and its own mount effect starts a fresh sign-in.

Live status: the code and source gates are green. A real Retry click is NOT verified by anything in this run; see "Pending operator verification".

## Commits

My commits, in order:

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 RED | `c0f82e282` | test(261008-aoe): add failing gates for host-supplied Retry on the OAuth overlay |
| 1 GREEN | `4d0099ea9` | feat(261008-aoe): Retry in TauriLoginPanel hands back to the host; OAuth overlay remounts via overlayMountKey |
| 2 RED | `95f9eebba` | test(261008-aoe): add failing gates for Humble Retry remount and OAuthLogin key-bound dismiss |
| 2 GREEN | `e1529b6fb` | feat(261008-aoe): Humble overlay Retry remounts via overlayMountKey; bind OAuthLogin dismiss to its mount |
| 3 | `d3aa437dd` | docs(261008-aoe): resolve the OAuth/Humble overlay Retry todo |

`commits: 5` is counted by hash, not by `rev-list ${plan_head_before}..HEAD`. A concurrent Phase 48 executor was committing on this same branch during the run, so that range reads 12. `plan_head_before` is the HEAD when this task started, and `plan_head_after` is my last commit.

Task 3's `git mv` of the todo out of `pending/` was staged in the shared index and got swept into the concurrent commit `6ff9251e7` (docs(48-11): add plan summary) as a pure R100 rename. My first Task 3 commit attempt then failed on the stale `pending/` pathspec. `d3aa437dd` therefore carries only the `status`/`resolved` frontmatter and the Resolution section. The end state is correct (the todo exists only under `completed/`), but history attributes the rename to the 48-11 commit.

## What changed

- `TauriLoginPanel.tsx`: `Props.onRetry?: () => void`. The Retry button's `onClick` is an arrow that calls `onRetry()` with no arguments when supplied, else `window.location.reload()`. This is still the file's single reload site, with no new hook.
- `OAuthLogin/index.tsx`: required `onRetry`, passed to the panel. Not wrapped in `useCallback` and not routed through a ref, so D-2 (two empty-dependency `useCallback`s) is intact. The D-5 doc paragraph is rewritten.
- `HumbleLogin/index.tsx`: required `onRetry`, passed to the panel in its `renderState` Dialog. `HumbleLoginSurface` is untouched.
- `Login/index.tsx`: `retryLoginOverlay` (early return on `openOverlay === null`, else `openLoginOverlay(openOverlay)`), passed as the named reference `onRetry={retryLoginOverlay}` to both overlays. `<OAuthLogin>`'s `dismiss` now goes through `bindOverlayDismiss(overlayMountKey, overlayMountKeyRef, dismissLoginOverlay)`.
- `/loginweb/*` routes (`WebView/index.tsx`, `HumbleLoginSurface`) pass no `onRetry` and keep the reload.
- The todo moved to `.planning/todos/completed/` with `status: RESOLVED`, `resolved: 2026-10-08` and a Resolution section.

## Test results

Planning-time baseline for the five targeted suites was 79 tests, 78 passing, 1 failing (`overlayDismiss.test.ts:72`). I re-measured it at the start of this run: 78/79 with the same single failure.

| Scope | Before | After |
| ----- | ------ | ----- |
| 5 targeted suites (`TauriLoginPanel`, `oauthLoginOverlay`, `loginInFlightUiReachability`, `loginCrossfade`, `overlayDismiss`) | 79 tests, 78 pass, 1 fail | 97 tests, 97 pass, 0 fail (+18 new tests) |
| 5 `/loginweb/*` regression suites | 67/67 pass (planning-time) | 67/67 pass (ten-suite run: 164/164, 10/10 suites) |

- Task 1 battery: the four named suites, 87/87 green.
- `pnpm codecheck`: clean (`tsc --noEmit` and `tsc -p tsconfig.meta.json --noEmit` both emitted nothing). The required `onRetry` threads through with types intact.
- `pnpm lint`: exit 0, 638 warnings, 0 errors, `production: PASS | tests: PASS` (both ceilings pass).
- `pnpm planning-gates`: 12/12 passed.
- `npx prettier --check` over the eight written `src/frontend` paths: clean. The todo file is under `.planning/`, which is prettier-ignored, so no check was run on it (a `--check` there would be vacuous).
- RED was observed before each GREEN: Task 1 RED had 10 failures across the two suites (5 in `TauriLoginPanel.test.tsx`, 5 in `oauthLoginOverlay.test.ts`); the two default-preserving gates (single reload site, zero `onRetry` in `WebView/index.tsx`) were green at RED by design. Task 2 RED had 4 failures: 3 in `loginCrossfade`, 1 in `overlayDismiss`.

### Falsifiability (mutation proofs)

Each mutation was applied temporarily to a pristine file (backup taken to the scratchpad), the gate run, and the file restored by copying the backup back. SHA-256 before and after were identical each time.

| Gate | Mutation | Observed failure | SHA-256 restored |
| ---- | -------- | ---------------- | ---------------- |
| single reload site / reload default (`TauriLoginPanel.tsx`) | replaced the `window.location.reload()` fallback with `void 0` | 3 failed: the original reload test, "WITHOUT onRetry ... reloads", and the "exactly ONE reload call site" gate | `16cdb806...` matches |
| `WebView/index.tsx` zero-`onRetry` | added `onRetry={undefined}` to the loginweb `<TauriLoginPanel>` | 2 failed: the new absence gate and the existing exact-string regression guard | `2c15d546...` matches |
| `HumbleLoginSurface.tsx` zero-`onRetry` | added `onRetry={undefined}` to its fallback `<TauriLoginPanel>` | 2 failed: the new absence gate and the existing exact-string presence gate | `6fc42ba4...` matches |

## Deviations from Plan

**1. [Rule 3 - Blocking] `/*` inside a line comment defeats `stripSourceComments`**
- Found during: Task 1 GREEN.
- Issue: my first panel comment wrote `` `/loginweb/*` `` inside a `//` comment. The stripper treated `/*` as the start of a block comment and swallowed the code after it, so the new `onRetry?:` source gate could not see the prop.
- Fix: reworded those comments to `/loginweb/<runner>`.
- Files: `TauriLoginPanel.tsx`. Included in `4d0099ea9`.

**2. Plan inclusion, flagged by the planner for veto: `OAuthLogin` dismiss bound.** Executed as written. It turns `overlayDismiss.test.ts` green for the first time since `d6c124006`.

**3. [Process] Shared index.** The staged files and the concurrent Phase 48 committer meant I committed every task with explicit pathspecs (`git commit -- <paths>`), so I never swept in the other session's staged files. The one exception is the todo rename described under Commits.

**4. [Process] A destructive command was denied and nothing was lost.** While setting up the first mutation proof I included a stray `git checkout -- <file>` as a restore line, and the auto-mode classifier denied the command before it ran. I verified the file was unmutated (the implementation was intact), committed GREEN, and then ran the mutation proofs with scratchpad backups plus `cp`-restore and SHA-256 verification instead. No work product was affected.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths or schema changes. T-AOE-01 (key-bound OAuth dismiss), T-AOE-03 (zero-argument call), T-AOE-04 (loginweb routes untouched) and T-AOE-05 (no `useCallback`, D-2 intact) are mitigated and pinned by the gates above. T-AOE-02 (Humble stop/start ordering) is accepted per the plan and observed only by the pending human-check.

## Pending operator verification (not proven by any automated check)

This run cannot see a real app. The plan's live Retry gate has not been run, and the todo's Resolution section says so.

- **Q1 (OAuth):** force one runner into `error` or `timeout` (for example disable networking and click the Amazon tile), re-enable networking, click Retry. Expect no app reload, `[useTauriOAuthLogin] runner=nile phase=teardown` followed by a new `phase=preparing` in gamelib.log, and a fresh native sign-in window.
- **Q2 (Humble):** get the Humble overlay to `error`/`timeout` (the ten-minute WR-03 deadline is the deterministic route) and click Retry. Expect no reload and a fresh native Humble sign-in window, and that the overlay does NOT immediately re-show the timeout Dialog. If it does, that is the T-AOE-02 stop/start ordering race: record it and file a todo, do not patch it here.
- **Q3 (optional):** on a `/loginweb/<runner>` route, a failure's Retry still reloads the app as before.

## Self-Check: PASSED

- All five commits exist: `c0f82e282`, `4d0099ea9`, `95f9eebba`, `e1529b6fb`, `d3aa437dd`.
- The todo exists only at `.planning/todos/completed/...` and `pending/` is empty of it.
- The ten scoped suites, `pnpm codecheck`, `pnpm lint` and `pnpm planning-gates` were green on the final tree.
