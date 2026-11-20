---
phase: quick-261029-quw
plan: 01
status: complete
subsystem: frontend/library
tags: [library, filter-panel, focus-row, sign-in-notice]
key-files:
  created:
    - src/frontend/helpers/signInIdentityResync.ts
    - src/frontend/helpers/__tests__/signInIdentityResync.test.ts
  modified:
    - src/frontend/components/UI/Header/index.tsx
    - src/frontend/components/UI/Header/index.css
    - src/frontend/screens/Library/librarySort.ts
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/state/GlobalState.tsx
commits:
  - 19f50e378 feat: panel reorder, Filters heading, Sort font, drop Group by (Task 1)
  - 706a96bb0 fix: focus row column count, heading -4px, hero art top-aligned (Task 2)
  - 7ba00e7ec fix: sign-in identity resync (Task 3)
---

# Quick 261029-quw: Library screen tidy-ups

All nine items done in three code commits. No locale files touched.

## Interpretations

1. Focus row one longer than the grid row: the track clipped at the grid's content edge C, but the grid only places whole columns, so the strip painted the left part of tile n+1 in the empty band. `.focusRowTrack` now has `inline-size: max(w + 30px, round(down, 100% - 15px + 1.5rem, w + 1.5rem) - 1.5rem + 30px)`, so it shows exactly n tiles plus ring room. CSS only.
2. Stale sign-in banner: see the trace below.
3. "Reduce focus font by 4": the focus-row strip heading (`.focusRowStrip .libraryHeader`) is now `calc(var(--text-2xl) - 4px)`. The panel's "Focus row" group title is `--text-xs`, so 4px less would be 7px.
4. Hero tile art alignment: `object-position: center top` on `.gameCard.justPlayed .justPlayedImg`, so the letterbox bands collect below the art.
5. Panel order: icons, search, Focus row, Sort by, Filters heading, Views/Collections, facets, footer.
6. "Filters" heading reuses the existing `header.filters` key as an `h2` (`--text-md`, bold, default colour).
7. Sort label and select are `--text-xs + 2px`.
9. Group by removed end to end (type, key, writer, option, tour step, context, pipeline `installing` memo). `readLibrarySortPrefs` ignores `libraryGroupBy` and `sortInstalled`, so nobody is stranded in a grouping. `sortAndGroupLibrary` is now `sortLibrary`. The `gamelib:library.groupBy.*` and `gamelib:tour.library.groupBy` catalog entries stay (keepRemoved).

## Task 3: login-path trace (which context field each path leaves stale)

| Store | Selector reads | Login path | Writes the field from | Stale risk |
|---|---|---|---|---|
| Epic | `epic.username` | `epicLogin` | `response.data?.displayName` | yes if absent |
| Epic | same | Tauri OAuth `completeOAuthLogin` | payload `username?` | yes if absent |
| GOG | `gog.username` | `gogLogin` / OAuth | `response.data?.username` / payload `username?` | yes if absent |
| Amazon | `amazon.user_id` | `amazonLogin` | `response.user?.user_id` | yes if absent |
| Amazon | same | OAuth `nile` | payload `user_id?` | yes if absent |
| Humble | `humble.isLoggedIn`, `expired` | `humbleLogin` | sets `isLoggedIn: true`, `expired: false` | no; backend-only completions (not via this wrapper) are not reflected |
| Steam | `steam.username` | `steamLogin` (Runner `login`) | `result.username` (optional) | yes: **this is the main culprit**, a QR or other path returning no username leaves `steam.username` undefined, so the row stays `not-connected` |

Culprit paths that leave the banner stale: `steamLogin` with no `username` in its result (primary), the Tauri OAuth completion for legendary, gog and nile when the payload omits `username` or `user_id`, and any login that finishes in the backend without going through a GlobalState wrapper.

Fix: one pure helper, `resyncSignInIdentity(current, read)`, mirrors the initial-state expressions and returns only differing fields (null, undefined and '' count as the same absent identity, so a no-op returns `{}` and skips `setState`). GlobalState's private `resyncSignInIdentityFromStores` applies it, then calls `rearmFromCurrentState`. It runs from `handleSuccessfulLogin`, `steamLogin`, `humbleLogin` and the end of `refreshLibrary`. `LibrarySignInNotice` is unchanged.

## Verification

- `pnpm codecheck` clean. eslint on touched files: no errors. Prettier applied on touched files.
- `pnpm jest src/frontend/components/UI/Header src/frontend/screens/Library src/frontend/screens/WebView` and the new helper test: green (Library+Header 1263 tests, plus the sweep tests).
- Focus-row sweep (w in 140/156/188/320, C up to 2400) uses the real `pageScrollDelta` and `canScrollForward`, with a non-vacuity case showing the old clip left a sliver.
- `graphify update .` run.

## Needs live confirmation (owed to operator)

- Panel order and heading look; Sort font size.
- Focus strip ends where the grid row ends at several window widths (CSS `round()` is untested in a real engine: jest only checks the arithmetic and CSS text).
- Hero art top lines up with neighbours.
- Sign in to a store with its notice showing and watch the row clear. In `humbleLogin` and `steamLogin` the resync runs right after `setState`, so `rearmFromCurrentState` reads pre-flush state there; the end-of-refresh call re-arms again with settled state.

## Deviations from Plan

- [Rule 3] Removed the now-unused `libraryStatus` destructure in `Library/index.tsx` (the `installing` memo was its only reader), which was an eslint error.
- The focus-row test normalises whitespace in the `inline-size` text because prettier wraps the long `calc()`/`round()` across lines.

## Deferred Issues

- `src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts` C3 ("pre-existing plain install entry untouched") fails on `label: t('button.install')` in `GameCard/index.tsx`. Not touched by this plan (that file has no diff here), so out of scope and left alone.

## Self-Check: PASSED

Commits 19f50e378, 706a96bb0, 7ba00e7ec exist; created helper and test files exist; public/locales unchanged apart from the operator's pre-existing gamepage.json edit, which stays unstaged.
