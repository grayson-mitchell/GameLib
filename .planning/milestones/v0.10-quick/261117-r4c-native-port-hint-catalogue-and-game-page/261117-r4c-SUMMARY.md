---
status: complete
quick: 261117-r4c
commits: [b74e7c9b3, 20e70fdc1, ca5563472]
---

# Quick 261117-r4c: Native port hint catalogue and game-page block

Checked-in catalogue (fallout1-ce, fallout2-ce, openmw, openloco) with a validated loader/matcher in `src/common/nativePortCatalogue.ts`, and a `NativePortInfo` block on the game page Info tab (Steam AppId match + platform gate, setup steps by dataStyle, install-gated Show data folder / Copy install path, external link, not-tracked line). Hint-only: no download/launch.

## Commits
- b74e7c9b3: catalogue JSON, loader, matcher, Common test (21 tests)
- 20e70fdc1: NativePortInfo component, en gamelib strings, render test
- ca5563472: wiring into GamePage Info tab and `.nativePortInfo` CSS

## Verification
- Common test: 21 pass. Frontend: NativePortInfo, EngineNotices, HumbleOriginInfo, labelSuiteI18nCensus: 40 pass.
- `tsc --noEmit` clean; eslint 0 errors (warnings only, pre-existing in GamePage/index.tsx plus `any` warnings in the new test file); scoped prettier clean (gamelib.json prettier-ignored, JSON parses).

## Deviations
None.
