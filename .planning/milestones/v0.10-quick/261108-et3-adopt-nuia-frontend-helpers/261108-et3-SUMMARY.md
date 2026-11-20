---
phase: quick-261108-et3
plan: 01
status: complete
completed: 2026-11-08
commit: 04932c253
---

# Quick 261108-et3: noUncheckedIndexedAccess for src/frontend/helpers

Bucket fixed to 0 (130 sites), added to ADOPTED_BUCKETS and the ratchet-test assertion, baseline key deleted, todo updated (1059 remaining in all). One commit, 04932c253.

## Approach
- Layout axes bound as `axes[N] ?? NaN` (runtime-identical to undefined); hat passes `axes[NON_STANDARD_HAT_AXIS] ?? NaN`; buttons use `btn?.pressed ?? false` at each checkAction call.
- gamepad.ts checkAction: `triggeredAt !== undefined && now - triggeredAt > totalDelay` (priming-frame swallow preserved).
- Tests: local `__tests__/defined.ts` (copied from engine), `button()` helper in handleStopInstallation so `toBeUndefined` cannot pass vacuously.

## Behaviour change (sole)
An absent button read via `btn.pressed` in GameCube/N64/genius/ps layouts previously threw a TypeError in the rAF loop; it now reads not-pressed. Valid controllers are identical.

## Deviations
Prettier `--write` on DeferredChannelCallSiteGuard and gamepadDisconnect tests (format only). The todo file is prettier-ignored, so it was not checked.

## Verification
Ratchet PASS, `--list` empty, codecheck green, jest helpers + ratchet test green (224 helpers tests), eslint 0 errors (3 pre-existing warnings in gamepad.ts), boundaries green, find-deadcode clean for touched files, planning-gates 12/12, no added `!` or `as any|unknown`.
