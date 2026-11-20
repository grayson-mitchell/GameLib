---
phase: quick-261106-pr4
plan: 01
status: complete
live_gate: outstanding
commits: [e4b4ec81b, 7dc212ce7]
---

# Quick 261106-pr4: Stack the Humble expiry toast in a shared NoticeStack

The Humble expiry toast and the Steam engine/overlay/exit notices now share one fixed bottom-right `.noticeStack` region, mounted once as `<AppNoticeStack />` in `App.tsx`. Steam is first and Humble is last, so Humble sits nearest the corner. Both notices use one shared slot lifecycle (`renderNoticeSlot` + `useNoticePhaseFallback`). The Humble toast wears the sketch 006 variant-A surface.

## Commits
- `e4b4ec81b` feat: NoticeStack region, shared slot lifecycle, Steam returns a fragment, single App mount.
- `7dc212ce7` feat: Humble toast as the last slot, with its tests.

## Verification (actual results)
- Jest (Frontend project), NoticeStack, SteamEngineLaunchNotice and HumbleExpiryToast suites: 3 suites, 36 tests, all pass.
- `pnpm codecheck` passes. `pnpm lint` exits 0 (0 errors; pre-existing warnings only).
- Scoped `prettier --check` passes on every written path (it was run for real; the paths are not prettier-ignored).
- `grep steamEngineLaunchNoticeRegion src/frontend` finds nothing.
- Task 2's `! grep -E '^\s*(position|bottom|right|z-index|box-shadow|border-radius):'` on the Humble scss does match one line: `border-radius: var(--space-3xs)` on `.humbleExpiryToastAction`, the Reconnect button's own radius. That is not the toast surface, so I left it. Every toast-level rule the grep targets is gone.

## Decisions
- **Suppression is held until the toast is fully gone (phase null), not released at leave.** This matches SteamEngineLaunchNotice (`shown !== null`). Releasing at leave would let the native store embed repaint over the toast mid slide-out.
- **`:not(:first-child)` margin stays correct.** `SteamEngineLaunchNotice` returns a fragment or null, so all slots are direct children of `.noticeStack`. With no Steam slots, the Humble slot is first and gets no top margin. With Steam slots present, the Humble slot gets `--space-sm`. A comment in `NoticeStack/index.scss` records this.
- Humble has no hover handlers and no countdown bar. It still never auto-hides.

## Deviations from Plan
- **[Rule 3 - test harness] The Steam test needed one more rename than the plan listed.** The plan named only `slotOf`, `OUT`, `CLOSE` and the `PHASE_FALLBACK_MS` import. One assertion also checked the class `steamEngineLaunchNotice--leaving`, which is now `noticeStackToast--leaving`. I renamed it. Other than that, the pre-existing Steam cases are unchanged. It never queried the region class. The new case asserts the root is a `React.Fragment` and has no region node.
- Both fallback closures in the Steam component were made null-safe (`shown && setShown(...)`) instead of capturing `cur`. They are only invoked while the notice is live, so behaviour is the same.

## Known Stubs
None.

## Live gate: OUTSTANDING (not verified, do not treat as passed)
The todo `2026-11-05-humble-expiry-toast-overlaps-steam-notice-stack` stays in `.planning/todos/pending/` with `ready: live-gate` unchanged. Steps:
1. Run `pnpm tauri:dev` (never `tauri:dev:run`). Restart dev first so the sidecar is rebuilt.
2. Trigger a Humble session expiry and a Steam engine/overlay launch notice together.
3. Confirm they stack without overlap, with Humble at the bottom.
4. Dismiss either one. Confirm its slot collapses and the survivor glides into place.
5. Repeat under macOS "Reduce motion". Only a fade should play.

## Self-Check: PASSED
Created: `src/frontend/components/UI/NoticeStack/{index.tsx,noticeSlot.tsx,index.scss,__tests__/NoticeStack.test.tsx}`. Commits `e4b4ec81b` and `7dc212ce7` exist. `graphify update .` was run.
