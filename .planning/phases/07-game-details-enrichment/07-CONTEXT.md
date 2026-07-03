# Phase 7: Game Details Enrichment - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich the game details page (`src/frontend/screens/Game/GamePage`) with two
deliverables:

1. **Supported platforms (DETAIL-01)** — the details page shows which platforms
   a game supports (Windows / macOS / Linux).
2. **AppleGamingWiki compatibility overlay (DETAIL-02)** — on macOS, a
   Mac-supported game shows an AppleGamingWiki compatibility rating **overlaid
   on the game art**. Only on macOS, and only for games with a Mac platform
   listing.

**Requirements are locked by ROADMAP.md** — this discussion captured HOW to
implement, not WHAT to build.

Out of scope: DETAIL-03 (Linux/ProtonDB compatibility overlay) is explicitly
deferred to post-v1.1. Do not build Linux compat UI in this phase.

</domain>

<decisions>
## Implementation Decisions

### Platform display (DETAIL-01)
- **D-01:** **Visual = OS icons only** — small Windows / Apple / Linux glyphs
  (Steam-store style), not text labels. MUI icons are already available in the
  codebase.
- **D-02:** **Placement = inside the "Install info" tab** (the `info` TabPanel
  in `GamePage/index.tsx`, alongside `DownloadSizeInfo` / `InstalledInfo` /
  `CloudSavesSync`). NOT in the title/metadata row.
- **D-03:** **Scope = all runners**, not Steam-only. Read platform support from
  the generic `GameInfo` fields (`is_mac_native`, `is_linux_native`, plus the
  Windows baseline) so Epic/GOG/Amazon/Steam all render the indicator
  consistently.
- **D-04:** **Steam must populate the platform fields.** `fetchMetadataIfNeeded`
  (`steam/games.ts:174`) currently ignores the appdetails `platforms:{windows,
  mac,linux}` field. It must capture that field and map it onto
  `GameInfo.is_mac_native` / `is_linux_native` (and record Windows support) so
  the shared indicator has data for Steam games. This is the single source of
  truth that DETAIL-02's Mac gate also relies on (see D-11).

### AppleGamingWiki overlay — placement & style (DETAIL-02)
- **D-05:** **Overlay sits on the cover square (portrait art)** — `art_square`
  / `library_600x900`, the portrait cover rendered near the title — not on the
  large blurred `art_background` hero image. Reads like a rating sticker on the
  box art.
- **D-06:** **Form = corner pill/badge** (small rounded pill in a corner of the
  cover art), not a full ribbon/banner strip.
- **D-07:** **Color-coded by rating tier.** Map AppleGamingWiki rating tiers
  (e.g. Perfect / Playable / Runs / Borderline / Unplayable) to a
  green→amber→red scale using **semantic color tokens from `_colors.scss`** —
  no hard-coded hex. Confirm the actual crossoverRating value vocabulary during
  research before finalizing the tier→color map.

### Overlay vs existing Extra-info tab row (DETAIL-02)
- **D-08:** **Keep both surfaces.** The existing `AppleWikiInfo.tsx` text row in
  the "Extra info" tab stays; the new art overlay is added *in addition*. The
  overlay gives glanceability; the tab row keeps the detailed clickable link.
- **D-09:** **Overlay is clickable** — it opens the same CrossOver /
  codeweavers.com compatibility page the tab row uses (via `createNewWindow`,
  mirroring `AppleWikiInfo.tsx`'s existing `crossoverLink` behavior).

### Rating semantics & gating (DETAIL-02)
- **D-10:** **Rating source is user-configurable via a GLOBAL setting**
  (default = **CrossOver rating**, alternative = **Wine rating**). This is a
  new small settings toggle for this phase (app-wide, one place — e.g. an
  Appearance/Advanced settings section, NOT per-game). AppleGamingWiki already
  returns BOTH `crossoverRating` and `wineRating` from a single fetch
  (`applegamingwiki/utils.ts`), so no extra network work is needed to support
  the toggle.
- **D-11:** The setting drives **BOTH** the new art overlay AND the existing
  Extra-info tab row (`AppleWikiInfo.tsx`), so the two surfaces never disagree.
  `AppleWikiInfo.tsx` currently hard-uses `crossoverRating` — it must read the
  setting too.
- **D-12:** **Unrated → show a neutral "Unrated" pill.** When a Mac-supported
  game has no AppleGamingWiki rating (not in the wiki, or the selected rating
  field is empty), still show the overlay pill labeled "Unrated" (neutral
  color). Note: this DIVERGES from the current `AppleWikiInfo.tsx` behavior,
  which returns `null` when `crossoverRating` is empty. The overlay must not
  hide on empty for Mac games. (Tab-row behavior on empty is Claude's
  discretion — see below.)
- **D-13:** **Overlay gate = derived from DETAIL-01 platform data.** Show the
  overlay only when `process.platform === 'darwin'` AND the game's captured
  platform data says Mac is supported (`is_mac_native === true` / the D-04
  mac flag). Do NOT gate purely on wiki-data presence. DETAIL-01's platform
  capture is the single source of truth for "is this a Mac game."

### Claude's Discretion
- Exact crossoverRating value vocabulary and the tier→semantic-color mapping
  (D-07) — confirm actual values from AppleGamingWiki during research.
- Exact settings location/label for the rating-source toggle (D-10) — planner
  picks the fitting existing Settings section and persistence store.
- How the global rating-source setting is plumbed to the frontend components
  (existing settings/config store pattern).
- Whether the Extra-info tab row (`AppleWikiInfo.tsx`) shows an "Unrated" state
  or keeps returning `null` on empty — only the ART OVERLAY is required to show
  "Unrated" (D-12). Keep the two visually coherent.
- Precise icon set / component for the OS platform icons (D-01) — reuse
  existing MUI icons or an established pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs or ADRs — requirements (DETAIL-01, DETAIL-02) are fully
captured in the decisions above and in ROADMAP.md Phase 7. The relevant source
files are listed under Integration Points below; downstream agents should read
those before modifying behavior.

- `.planning/ROADMAP.md` §"Phase 7: Game Details Enrichment" — goal + success
  criteria (the locked requirement source).
- `.planning/REQUIREMENTS.md` — DETAIL-01, DETAIL-02 (and DETAIL-03 deferred).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/wiki_game_info/wiki_game_info.ts` — already fetches
  AppleGamingWiki data. Line ~38 calls `getInfoFromAppleGamingWiki(title)`
  gated on `isMac`. Works for Steam games via title (no runner gate on the
  apple fetch). **No new fetch infrastructure needed for DETAIL-02.**
- `src/backend/wiki_game_info/applegamingwiki/utils.ts` — returns
  `{ crossoverRating, wineRating, crossoverLink }`. Both ratings already
  available from one call → supports the D-10 toggle for free.
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` — existing
  Extra-info tab row that renders `crossoverRating` as a clickable CrossOver /
  codeweavers.com link. D-08 keeps it; D-09 mirrors its click behavior in the
  overlay; D-11 makes it respect the new rating-source setting.
- `src/frontend/screens/Game/GamePage/index.tsx` — the details page.
  `wikiInfo` state (line ~90) is fetched via
  `window.api.getWikiGameInfo(title, appName, runner)` (line ~266). Art is
  rendered around line ~400 (`art_background || art_cover`) and the portrait
  `art_square` near the title (~line 439). The `info` TabPanel is where the
  platform indicator lands (D-02); the `extra` TabPanel hosts `AppleWikiInfo`.
- `GameInfo.is_mac_native` / `is_linux_native` (`src/common/types.ts:213-214`)
  — existing generic platform slots the DETAIL-01 indicator reads (D-03).

### Established Patterns
- **Steam metadata is lazy-fetched** in `fetchMetadataIfNeeded`
  (`steam/games.ts:174`) from the public appdetails API, cached in
  `steamMetadataStore`, and pushed to the frontend via
  `sendFrontendMessage('pushGameToLibrary', ...)`. D-04's platform capture
  slots into this exact flow (parse `data.platforms`, set the GameInfo flags,
  persist + push).
- **Runner-agnostic details UI:** the GamePage already renders wiki info and
  tabs for all runners; DETAIL-01 (D-03) follows suit rather than Steam-gating.
- **CSS uses semantic tokens** from `_colors.scss` / `_spacing.scss` — no
  hard-coded hex/px. Applies to the overlay pill colors (D-07) and layout.
- **External links via `createNewWindow`** (see `AppleWikiInfo.tsx`) — the
  clickable overlay (D-09) reuses this.

### Integration Points
- `src/backend/storeManagers/steam/games.ts` (`fetchMetadataIfNeeded`, ~L174)
  — capture appdetails `platforms` → `is_mac_native`/`is_linux_native` (D-04).
- `src/frontend/screens/Game/GamePage/index.tsx` — add OS-icon platform
  indicator to the `info` TabPanel (D-01/D-02); add the art overlay pill on the
  portrait cover (D-05/D-06); gate it on darwin + mac (D-13).
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` — make it
  respect the rating-source setting (D-11).
- Settings surface (Claude's discretion location) — add the global
  crossover-vs-wine rating-source toggle, default crossover (D-10).
- `src/common/types.ts` — platform flags already exist; check whether an
  explicit Windows-support flag is needed or Windows is the baseline default.

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants a **user-selectable rating source** (crossover vs wine)
  as a **global setting defaulting to crossover** — this is a deliberate,
  requested addition to the phase, not just a display choice (D-10/D-11).
- User wants the overlay to always be present for Mac games — an **"Unrated"
  pill** rather than a hidden overlay when data is missing (D-12).
- Platform display should be **icons, tucked in the Install-info tab** — kept
  understated rather than prominent near the title.

</specifics>

<deferred>
## Deferred Ideas

- **DETAIL-03 — Linux / ProtonDB compatibility overlay.** Explicitly deferred to
  post-v1.1 (recorded in REQUIREMENTS.md and STATE.md deferred items). Not this
  phase. Note: ProtonDB data is already wired for Steam via quick task
  `260630-ud4` (steamID = appName), so a future DETAIL-03 has a data source
  ready.

None else — discussion stayed within phase scope.

</deferred>

---

*Phase: 7-game-details-enrichment*
*Context gathered: 2026-07-03*
