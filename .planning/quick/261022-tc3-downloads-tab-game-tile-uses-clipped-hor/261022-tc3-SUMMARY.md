# Quick 261022-tc3 Summary

Downloads hero cover tile now uses portrait art (override-aware) via a new pure `heroCoverSources` helper, falling back to landscape `art_cover`.

- Task 1 (903bbec35): `heroCoverSources` in heroModel.ts, order overrides.art_square, art_square, overrides.art_cover, art_cover; 6 new tests in heroModel.test.ts.
- Task 2 (76fcb630d): DownloadHero/index.tsx hoists `libraryEntry`, builds cover from gameInfo with library-entry fallback and overrides, passes `src`/`fallback` to the cover CachedImage.

Verification: DownloadManager jest 66 passed, tsc clean, prettier clean, lintScoped production+tests PASS (no re-pin). The RED-first run was skipped (tests and implementation written together).

Deviations: none. `graphify update .` skipped: `graphify` is not on PATH.

Manual check pending: start a Steam install and confirm the tile shows the tall capsule.
