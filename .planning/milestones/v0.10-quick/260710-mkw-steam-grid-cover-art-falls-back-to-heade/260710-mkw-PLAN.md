---
phase: quick-260710-mkw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/CachedImage/index.tsx
  - src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
  - src/frontend/screens/Library/components/GameCard/index.tsx
autonomous: false
requirements: [QUICK-260710-mkw]

must_haves:
  truths:
    - "When a Steam grid tile's portrait capsule (library_600x900.jpg) fails to load, the tile shows the game's own header art (header.jpg) instead of the generic placeholder"
    - "When neither the portrait capsule nor the header art loads, the grid tile degrades to the generic missing-art placeholder"
    - "justPlayed tiles and non-Steam runner tiles (legendary/gog/nile/sideload) render exactly as before"
  artifacts:
    - path: "src/frontend/components/UI/CachedImage/index.tsx"
      provides: "Ordered multi-level fallback chain (fallback accepts string | string[])"
      contains: "fallback"
    - path: "src/frontend/screens/Library/components/GameCard/index.tsx"
      provides: "Grid (non-justPlayed) branch passes art_cover before generic placeholder"
    - path: "src/frontend/components/UI/CachedImage/__tests__/index.test.tsx"
      provides: "Unit coverage proving the fallback chain advances src -> fallback[0] -> fallback[1]"
  key_links:
    - from: "src/frontend/screens/Library/components/GameCard/index.tsx"
      to: "CachedImage fallback prop"
      via: "array [getImageFormatting(art_cover, runner), fallBackImageMissing]"
      pattern: "fallback=\\{"
    - from: "src/frontend/components/UI/CachedImage/index.tsx"
      to: "img onError"
      via: "advance through normalized fallback array in order"
      pattern: "onError"
---

<objective>
Fix missing Steam grid cover art. In the Library GameCard grid tile, when a Steam
game's portrait capsule (art_square = library_600x900.jpg) 404s, fall back to the
game's landscape header art (art_cover = header.jpg) before showing the generic
missing-art placeholder.

Root cause: `CachedImage` supports exactly ONE fallback level. Today the grid tile
uses that single slot for the generic placeholder, so there is no room to prefer
the game's own header art first. This plan extends `CachedImage` to support an
ordered fallback chain and wires the grid branch to use it.

Purpose: Steam games with a valid header but no portrait capsule (e.g. Bard's Tale
IV, appid 566090 — header.jpg 200, library_600x900.jpg 404) currently render the
ugly generic placeholder even though real art exists.
Output: Frontend-only change to CachedImage + the GameCard grid branch, plus a unit
test proving the chain order.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Current CachedImage contract (src/frontend/components/UI/CachedImage/index.tsx) -->
interface CachedImageProps {
  src: string
  fallback?: string        // TODAY: single fallback. This plan widens to string | string[].
  className?: string
  onLoad?: (e) => void
  onError?: (e) => void
}
Existing onError behavior: if the http imagecache lookup fails it retries the raw
src (setUseCache(false)); only THEN, on a second error, does it switch to
props.fallback. There is no chaining past the single fallback today.

<!-- GameCard grid render (src/frontend/screens/Library/components/GameCard/index.tsx) -->
// line 132-135: art_cover = header.jpg (Steam) ; cover = art_square = library_600x900.jpg (Steam)
// line 520-534: justPlayed branch renders art_cover (DO NOT TOUCH);
//               else branch renders getImageFormatting(cover, runner) with fallback={fallBackImageMissing}
// imports already present: getImageFormatting (./constants), fallBackImageMissing, fallBackImage

<!-- getImageFormatting (src/frontend/screens/Library/components/GameCard/constants.ts) -->
// returns fallbackImage (gamelib_card.svg) when cover is '' or 'fallback';
// appends ?h=400&resize=1&w=300 for legendary; otherwise returns the url as-is.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend CachedImage to support an ordered fallback chain</name>
  <files>src/frontend/components/UI/CachedImage/index.tsx, src/frontend/components/UI/CachedImage/__tests__/index.test.tsx</files>
  <behavior>
    - Given src that loads: renders src, never touches fallbacks.
    - Given a string fallback (existing callers): on src error, renders that fallback — identical to today's single-level behavior (backward compatible).
    - Given a string[] fallback: on successive load errors, advances src -> fallback[0] -> fallback[1] in order, stopping at the last entry.
    - The http imagecache retry step (try imagecache:// then raw) still applies to each source, including each fallback entry (imagecache only when the value startsWith 'http').
    - When props.src changes, the chain resets to the primary src.
  </behavior>
  <action>
    Widen `fallback` in CachedImageProps to `string | string[]`. Normalize it inside
    the component to an ordered array (`[]` when undefined, `[value]` when a string).
    Replace the boolean `useFallback` state with a numeric index (start at -1 meaning
    "showing primary src"; 0..n-1 index into the normalized fallback array). In
    `onError`: keep the existing imagecache-then-raw retry (when `useCache` is true,
    just setUseCache(false) and return); otherwise advance to the next fallback index
    if one exists, and set useCache based on whether that next fallback value
    startsWith 'http'. The displayed source is the primary src when index is -1, else
    the fallback at the current index; keep wrapping in `imagecache://encodeURIComponent(...)`
    when useCache is true. Reset the index (and useCache/loaded) in the existing
    useEffect keyed on props.src. Do NOT place code blocks in this action — implement
    per the behavior contract above. Keep the single-string path byte-for-byte
    equivalent in outcome so existing callers are unaffected.
    Create the test file under __tests__/ using @testing-library/react + jest,
    firing `error` events on the rendered <img> to assert the src advances through
    the chain (mirror the pattern in existing frontend __tests__ files such as
    src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx).
  </action>
  <verify>
    <automated>yarn jest src/frontend/components/UI/CachedImage --runInBand</automated>
  </verify>
  <done>CachedImage accepts string | string[] fallback; unit test proves src -> fallback[0] -> fallback[1] ordering and that a single string fallback still works.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the grid tile to prefer header art before the placeholder</name>
  <files>src/frontend/screens/Library/components/GameCard/index.tsx</files>
  <action>
    In ONLY the non-justPlayed (else) branch of the cover CachedImage (around lines
    527-534), change the `fallback` prop from `fallBackImageMissing` to an ordered
    array that prefers the game's own header art when it exists and differs from the
    portrait: when `art_cover` is truthy and `art_cover !== cover`, pass
    `[getImageFormatting(art_cover, runner), fallBackImageMissing]`; otherwise keep
    passing `fallBackImageMissing` (a bare string) so behavior for games without a
    distinct header, and for non-Steam runners whose art_square/art_cover match, is
    unchanged. Leave `src={getImageFormatting(cover, runner)}` as-is. DO NOT modify
    the justPlayed branch (lines 520-526) or the logo CachedImage. Do not add any
    backend or type changes beyond this prop.
  </action>
  <verify>
    <automated>yarn tsc --noEmit -p src/frontend && yarn eslint --cache src/frontend/screens/Library/components/GameCard/index.tsx</automated>
  </verify>
  <done>Grid (non-justPlayed) tile passes [art_cover, fallBackImageMissing] when a distinct art_cover exists, else the bare placeholder; justPlayed branch and non-Steam runners unchanged; typecheck + lint pass.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Steam grid tiles now fall back from portrait capsule -> header art -> generic placeholder.</what-built>
  <how-to-verify>
    1. Run the app (`yarn start` or your usual dev launch).
    2. Open the Library in grid layout with a Steam game that has a 404 portrait
       capsule but a valid header — Bard's Tale IV (appid 566090) is the confirmed
       case.
    3. Confirm its tile shows the landscape header art (not the generic gamelib
       missing-art placeholder).
    4. Confirm other Steam games with valid portrait capsules still show the portrait
       capsule (no regression).
    5. Confirm a game with no usable art still shows the generic placeholder.
    6. Confirm the "Recently Played" (justPlayed) row and any Epic/GOG/Amazon tiles
       look unchanged.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what rendered incorrectly</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CDN -> renderer <img> | Image URLs (header.jpg, library_600x900.jpg) already originate from trusted Steam CDN / existing backend-built art fields; no new source is introduced. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | CachedImage <img> src | accept | Only URLs already present on GameInfo (art_cover/art_square) are used; no new or user-controlled URL sources added. |
| T-quick-02 | Denial of Service | fallback chain loop | mitigate | Chain is a bounded ordered array advanced by index; it stops at the last entry and cannot loop back, so a failing image cannot retry indefinitely. |
| T-quick-SC | Tampering | npm/pip/cargo installs | mitigate | No new packages installed; frontend-only change using existing deps. |
</threat_model>

<verification>
- `yarn jest src/frontend/components/UI/CachedImage` passes (chain ordering + backward-compat).
- `yarn tsc --noEmit -p src/frontend` passes.
- `yarn eslint --cache src/frontend/screens/Library/components/GameCard/index.tsx` passes.
- Human visual check confirms Bard's Tale IV (566090) renders header art and no regressions elsewhere.
</verification>

<success_criteria>
- Steam grid tiles whose portrait capsule 404s render the game's header art instead of the generic placeholder.
- Tiles with neither portrait nor header art still show the generic placeholder.
- justPlayed branch and non-Steam runners are byte-for-byte unchanged in behavior.
- CachedImage single-string fallback callers are unaffected (backward compatible).
</success_criteria>

<output>
Create `.planning/quick/260710-mkw-steam-grid-cover-art-falls-back-to-heade/260710-mkw-SUMMARY.md` when done.
</output>
