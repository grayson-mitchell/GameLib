# 56-06 (ntdll applier + allowlist table): facts confirmed read-only by two planner runs

Both runs were stopped by the safety classifier before they wrote a PLAN.md. These values were
measured against installed CrossOver 26.3.0.39832 on 2026-10-28.

Probe script: .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-06-reference/probe.js

## Hashes and patch site
- Clean ntdll sha256: `6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387`
- Payload sha256: `e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb` (832 bytes). Must
  equal 56-03 `DETOUR_BUILD_ROWS`.
- Patched sha256: `c0e21a9a5250f0a97c08d3c3e1798566255387213e2553b1e555264fb9ded97e`
- Hook RVA `0x44972`. The stolen bytes there are `4883bc24f000000000`.

## Clean ntdll layout
- Size: 685648 bytes, 11 sections.
- FileAlignment 0x200, SizeOfHeaders 0x400.
- SizeOfImage 0xae000, which equals the pinned `.npdet` section RVA.
- First free section-header slot at file offset 832.
- ImageBase 0x170000000, CheckSum 0xa95b4.
- Leave CheckSum unchanged. The patched sha only matches if it is not recomputed, which is
  NotProton's behaviour.

## CrossOver build detection
- `/Applications/CrossOver.app/Contents/Info.plist` is an XML plist. `CFBundleVersion` is
  `26.3.0.39832`.

## Repo constraints
- tsconfig targets es2017, so no bigint literals.
- `pnpm find-deadcode` is a CI baseline ratchet. Use `// ts-prune-ignore-next` for exports that
  only later plans consume.
- Backend jest runs under a redirected HOME (`src/backend/jest.setupContainment.ts`). Gate the
  real-CrossOver test on whether the file exists, using the `describe.skip` pattern in
  `helperIntegration.test.ts`.
- Jest has no custom testMatch, so `__tests__/ntdllPatch.realCrossover.test.ts` will be picked up.
- From `src/backend/storeManagers/steam/bridge/drm/__tests__` to the repo root is 7 `..`.
- `bridge/drm/` doesn't exist yet. Wave-1 plans 56-04 and 56-05 create it.

## Outline contract
See the 56-06 row and note in `56-PLAN-OUTLINE.md`. 56-08 depends on 56-06.
