---
phase: quick-260710-rjm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/backend/wiki_game_info/codeweavers/utils.ts
  - src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/frontend/assets/crossover_icon.svg
  - src/frontend/screens/Game/GamePage/components/protonRating.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/protonRating.test.ts
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/crossoverRating.ts
  - src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts
  - public/locales/en/gamepage.json
autonomous: true
requirements: [QUICK-260710-rjm]

must_haves:
  truths:
    - "CodeWeavers parser returns separate macRating and linuxRating from per-OS Review nodes, not the averaged aggregateRating"
    - "GamePage shows a Crossover row on macOS (using macRating), a Proton row for Steam-on-Linux, and a Wine row otherwise"
    - "Old-shaped codeweavers caches (with `rating` but no `macRating`) are treated as stale and refetched"
    - "pnpm codecheck is clean and no source still imports crossoverRating"
  artifacts:
    - path: src/backend/wiki_game_info/codeweavers/utils.ts
      provides: "extractVideoGameJsonLd returning { macRating, linuxRating }"
      contains: "macRating"
    - path: src/frontend/screens/Game/GamePage/components/protonRating.ts
      provides: "protonTierToStars tier->star mapping"
      exports: ["protonTierToStars"]
    - path: src/frontend/assets/crossover_icon.svg
      provides: "monochrome currentColor CrossOver icon"
      contains: "currentColor"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx"
      to: "src/frontend/screens/Game/GamePage/components/protonRating.ts"
      via: "import { protonTierToStars }"
      pattern: "protonTierToStars"
    - from: "src/backend/wiki_game_info/wiki_game_info.ts"
      to: "codeweavers.macRating"
      via: "staleCrossoverData undefined-check"
      pattern: "macRating === undefined"
---

<objective>
Rework GamePage emulation-compat rows. Fix the CodeWeavers rating so the macOS Review score is shown (not the aggregate that averages macOS+Linux), give CrossOver a monochrome inline icon, and add a Proton-emulation row for Steam-on-Linux games.

Purpose: The CodeWeavers page averages a per-OS macOS review (e.g. 5) and Linux review (e.g. 1) into a misleading aggregate (3). Parsing the per-OS review fixes correctness. Steam-on-Linux users get a Proton compatibility row driven by the existing ProtonDB tier data.
Output: Corrected backend parser + type, new Proton star helper + icon asset, rewritten three-row AppleWikiInfo component, and deletion of the now-unused crossoverRating helper.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
Current CodeweaversInfo (src/common/types.ts ~738):
```typescript
export interface CodeweaversInfo {
  rating: number | null
  ratingCount: number | null
  slug: string
}
```
Target:
```typescript
export interface CodeweaversInfo {
  macRating: number | null
  linuxRating: number | null
  slug: string
}
```

SteamInfo (src/common/types.ts ~756):
```typescript
export interface SteamInfo {
  compatibilityLevel: string | null
  steamDeckCatagory: number | null
}
```

appleRating.ts style reference (doc comment + normalize(trim().toLowerCase()) switch) for the new protonRating.ts.

GamePage GameContext destructure used by AppleWikiInfo: `{ wikiInfo, is }`; `is.mac` / `is.linux` / `is.native` booleans; `gameInfo.runner`, `gameInfo.app_name`, `gameInfo.title`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend per-OS CrossOver rating (types, parser, test, cache-stale)</name>
  <files>src/common/types.ts, src/backend/wiki_game_info/codeweavers/utils.ts, src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts, src/backend/wiki_game_info/wiki_game_info.ts</files>
  <behavior>
    - VideoGame + two Review nodes (about.operatingSystem macOS ratingValue 5, Linux ratingValue 1) -> { macRating: 5, linuxRating: 1 }
    - Soft-404 (no VideoGame node) -> genuine miss -> getInfoFromCodeweavers returns { macRating: null, linuxRating: null, slug }
    - VideoGame present but both ratings null -> treated as miss so the single naiveSlugify fallback still fires
    - Fetch rejection -> null (retryable); all existing slugify/naiveSlugify/soft-404/fallback tests still pass
  </behavior>
  <action>
    1a. src/common/types.ts: change `CodeweaversInfo` to `{ macRating: number | null; linuxRating: number | null; slug: string }` (remove `rating` and `ratingCount`).
    1b. src/backend/wiki_game_info/codeweavers/utils.ts: rewrite `extractVideoGameJsonLd` to return `{ macRating: number | null; linuxRating: number | null } | null` (rename the `ParsedRating` interface to `{ macRating, linuxRating }`). Keep the ldJsonRegEx match / JSON.parse / MAX_CONTENT_LENGTH / soft-404 handling verbatim. Walk `@graph` (or `[data]` when no `@graph`). Require a VideoGame node to be present for a HIT. Initialize macRating/linuxRating to null. For each node whose `@type` is (or includes) `"Review"`, read `Number(node.reviewRating?.ratingValue)`; classify OS via `node.about?.operatingSystem` compared case-insensitively to 'macos'/'linux', falling back to `String(node.reviewAspect).toLowerCase()` containing 'macos'/'linux'. Assign to macRating / linuxRating only when `Number.isFinite`. Return null (miss) when no VideoGame node OR both ratings remain null. Update `fetchRatingForSlug` return type to `{ macRating, linuxRating } | null`. In `getInfoFromCodeweavers`: primary hit -> `{ macRating, linuxRating, slug }`; naiveSlugify fallback hit -> `{ macRating, linuxRating, slug: fallbackSlug }`; genuine miss -> `{ macRating: null, linuxRating: null, slug }`; catch -> null. Keep slugify/naiveSlugify/isSoft404/roman-numeral/apostrophe logic unchanged.
    1c. Update __tests__/utils.test.ts: keep every slugify + naiveSlugify test. Replace the `htmlWithVideoGameJsonLd` fixture with one emitting a VideoGame node plus two Review nodes carrying `about.operatingSystem` ('macOS'/'Linux') and `reviewRating.ratingValue`; parameterize by (macRating, linuxRating). Change the HIT test to assert `{ macRating: 5, linuxRating: 1, slug: 'half-life-2' }` for a mac=5/linux=1 fixture. Update the soft-404 miss test to expect `{ macRating: null, linuxRating: null, slug }`. Update the FALLBACK tests to the new shape (fallback hit -> its macRating/linuxRating; both-miss -> both null). Update the UA-regression fixture call to the new signature.
    1d. src/backend/wiki_game_info/wiki_game_info.ts: change `staleCrossoverData` to also refetch old-shaped caches:
    `const staleCrossoverData = (isMac || isLinux) && (!cachedResponse?.codeweavers || cachedResponse.codeweavers.macRating === undefined)`
  </action>
  <verify>
    <automated>pnpm test src/backend/wiki_game_info/codeweavers</automated>
  </verify>
  <done>codeweavers utils.test.ts passes (slugify + new per-OS HIT/miss/fallback); CodeweaversInfo uses macRating/linuxRating; staleCrossoverData refetches undefined-macRating caches.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Proton star helper + monochrome CrossOver icon asset</name>
  <files>src/frontend/assets/crossover_icon.svg, src/frontend/screens/Game/GamePage/components/protonRating.ts, src/frontend/screens/Game/GamePage/components/__tests__/protonRating.test.ts</files>
  <behavior>
    - protonTierToStars: platinum->5, gold->4, silver->3, bronze->2, borked->1 (case-insensitive, trimmed)
    - 'pending', 'native', '', undefined, null, and any unknown value -> null
  </behavior>
  <action>
    Create src/frontend/assets/crossover_icon.svg with EXACTLY:
    &lt;svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"&gt; &lt;rect x="3" y="3" width="18" height="18" rx="4"/&gt; &lt;path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/&gt; &lt;/svg&gt;
    Create src/frontend/screens/Game/GamePage/components/protonRating.ts exporting `export const protonTierToStars = (level: string | null | undefined): number | null => {...}`. Normalize with `level?.trim().toLowerCase()`; switch mapping platinum/gold/silver/bronze/borked to 5/4/3/2/1; default (including pending/native/empty/undefined) returns null. Add a doc comment styled like appleRating.ts (explain ProtonDB tier vocabulary -> MUI star value; null means "no compatibility data" so the caller shows the i18n fallback).
    Create __tests__/protonRating.test.ts covering each of the five tiers (assert exact star value), plus 'pending' -> null and an unknown string -> null and undefined -> null.
  </action>
  <verify>
    <automated>pnpm test src/frontend/screens/Game/GamePage/components/__tests__/protonRating.test.ts</automated>
  </verify>
  <done>protonRating.test.ts passes for all five tiers + null cases; crossover_icon.svg exists with stroke="currentColor".</done>
</task>

<task type="auto">
  <name>Task 3: Rewrite AppleWikiInfo into three OS rows; delete crossoverRating; add locale key</name>
  <files>src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx, src/frontend/screens/Game/GamePage/components/crossoverRating.ts, src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts, public/locales/en/gamepage.json</files>
  <action>
    Rewrite AppleWikiInfo.tsx. Keep `useTranslation('gamepage')`, `useContext(GameContext)` destructuring `{ wikiInfo, is }`, `gameInfo.runner`, the `if (!wikiInfo) return null` and `if (is.native) return null` guards, `createNewWindow`, and each anchor's `role="button"` / `className="iconWithText"` / `title={t('info.clickToOpen','Click to open')}`.
    Imports: drop `formatCrossoverRating`; replace `import CodeweaversLogo from 'frontend/assets/codeweavers_icon.svg?react'` with `import CrossoverIcon from 'frontend/assets/crossover_icon.svg?react'`; add `import { protonTierToStars } from './protonRating'`; keep `WineBar`, `Rating`, `ratingTier`.
    Locals: `const codeweavers = wikiInfo.codeweavers`; `const applegamingwiki = wikiInfo.applegamingwiki`; `const steamInfo = wikiInfo.steamInfo`. Remove the `crossoverRatingCountLabel` line.
    Flags: `showProton = is.linux && gameInfo.runner === 'steam' && !!steamInfo?.compatibilityLevel`; `showCrossover = is.mac && codeweavers?.macRating != null`; `showWine = !!applegamingwiki && !showProton`.
    Fragment order Crossover, Proton, Wine:
    - CROSSOVER (showCrossover): `onClickCrossover` UNCHANGED (codeweavers.com via codeweavers.slug fallback to the search URL). Icon `<CrossoverIcon style={{ width: '24px', height: '24px' }} />`. `<b>{t('info.crossover-rating','Crossover emulation')}:</b>` then `<Rating value={codeweavers.macRating} precision={0.5} max={5} readOnly size="small" />`. No count label, no no-data branch.
    - PROTON (showProton): onClick opens `https://www.protondb.com/app/${gameInfo.app_name}` via createNewWindow (steam app_name IS the SteamID). Icon `<WineBar />`. `<b>{t('info.proton-rating','Proton emulation')}:</b>` then `const stars = protonTierToStars(steamInfo.compatibilityLevel)`; render `stars !== null ? <Rating value={stars} max={5} readOnly size="small" /> : t('info.no-compatibility-data','No compatibility data available')`.
    - WINE (showWine): keep `onClickWine` EXACTLY as today (is.mac -> AppleGamingWiki /w/index.php?search=...; else WineHQ AppDB objectManager.php...sHavingText=...). Icon `<WineBar />`. `<b>{t('info.wine-rating','Wine emulation')}:</b>` then `{ratingTier(applegamingwiki.wineRating).label}`.
    Delete src/frontend/screens/Game/GamePage/components/crossoverRating.ts and its __tests__/crossoverRating.test.ts (formatCrossoverRating is unreferenced after this rewrite).
    public/locales/en/gamepage.json: inside the `info` object, add `"proton-rating": "Proton emulation"` between `"path"` and `"protondb-compatibility-info"` (preserves alphabetical key order). Keep crossover-rating and wine-rating values. Valid JSON.
    Do NOT touch CompatibilityInfo.tsx. Do NOT change onClickCrossover. Do NOT reintroduce a rating-count label.
  </action>
  <verify>
    <automated>test ! -f src/frontend/screens/Game/GamePage/components/crossoverRating.ts && grep -rn "crossoverRating\|formatCrossoverRating" src/ ; test $? -ne 0</automated>
  </verify>
  <done>AppleWikiInfo renders Crossover/Proton/Wine rows behind show* flags; crossoverRating.ts + test deleted; no source references crossoverRating/formatCrossoverRating; gamepage.json has proton-rating and stays valid JSON.</done>
</task>

<task type="auto">
  <name>Task 4: Full verification</name>
  <files>(no new files — verification only)</files>
  <action>
    Run the project verification gates. Confirm zero tsc errors, both target test suites green, and eslint clean on the touched source files. Note (do NOT fix): the pre-existing spike/crossover-compat-lookup.mjs eslint crash from task 260710-nwb is a known failure — restrict lint to the files this plan touched so it does not mask real errors.
  </action>
  <verify>
    <automated>pnpm codecheck && pnpm test src/backend/wiki_game_info/codeweavers && pnpm test src/frontend/screens/Game/GamePage/components && pnpm lint src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx src/frontend/screens/Game/GamePage/components/protonRating.ts src/backend/wiki_game_info/codeweavers/utils.ts</automated>
  </verify>
  <done>pnpm codecheck reports 0 errors; codeweavers + protonRating suites pass; no import of deleted crossoverRating remains; eslint clean on touched files (known spike .mjs crash excluded).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CodeWeavers HTML -> parser | Untrusted external HTML/JSON-LD is parsed for per-OS ratings |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rjm-01 | Tampering | extractVideoGameJsonLd JSON.parse | mitigate | Existing try/catch + MAX_CONTENT_LENGTH bound retained verbatim; Number.isFinite guards on ratingValue reject non-numeric injection |
| T-rjm-02 | Injection | protondb.com URL from gameInfo.app_name | accept | app_name for steam runner is a numeric SteamID from the local library; no new package/network trust boundary introduced |
</threat_model>

<verification>
- `pnpm codecheck` — 0 errors
- `pnpm test src/backend/wiki_game_info/codeweavers` — passes
- `pnpm test src/frontend/screens/Game/GamePage/components` — protonRating passes, crossoverRating suite gone
- `grep -rn "crossoverRating\|formatCrossoverRating" src/` — no matches
- `pnpm lint` on touched files — clean (known spike .mjs crash excluded)
</verification>

<success_criteria>
- CodeweaversInfo carries macRating/linuxRating; parser reads per-OS Review nodes; mac=5/linux=1 fixture yields macRating 5.
- staleCrossoverData refetches old-shaped (undefined macRating) caches.
- GamePage shows Crossover (mac, macRating), Proton (Steam-on-Linux), Wine (otherwise) rows with correct icons and labels.
- crossoverRating.ts + test deleted, no dangling imports; proton-rating locale key added.
- All verification gates green.
</success_criteria>

<output>
Create `.planning/quick/260710-rjm-rework-gamepage-emulation-compat-rows-pe/260710-rjm-SUMMARY.md` when done.
</output>
