---
status: diagnosed
trigger: "store-search-art-cropped: Each Store Search row shows the game's art without significant cropping (UAT 47 test 7, gap G-47-7)"
created: 2026-11-18T00:00:00Z
updated: 2026-11-18T00:00:00Z
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: diagnosed
---

## Current Focus

hypothesis: CONFIRMED (with the lead hypothesis REFUTED). The crop is caused by a landscape thumbnail asset (~2.6:1) rendered into a fixed PORTRAIT 60x80 box (`aspect-ratio: 3 / 4`) with `object-fit: cover`. The box rule dates from Phase 20 and was never touched by Phase 47; the provider switch did NOT change the asset's aspect ratio.
test: measured real pixel dimensions of every ITAD asset variant and of the old CheapShark thumb; computed the cover-crop visible fraction for each against the 60x80 box.
expecting: n/a (done)
next_action: return ROOT CAUSE FOUND to caller (goal: find_root_cause_only, no fix applied)

reasoning_checkpoint:
  hypothesis: "The row thumb shows only ~28% of the image width because a 2.64:1 landscape banner (itad.ts thumbOf prefers banner145) is rendered into a 60px-wide, aspect-ratio 3/4 (60x80) box with object-fit: cover, which scales the image to the box height and discards ~72% of its width."
  confirming_evidence:
    - "thumbOf() in src/backend/storeSearch/itad.ts:303-306 returns banner145 ?? banner300 ?? boxart; banner145 measured 145x55 (2.64:1) for both fixture games (Portal, Portal 2)."
    - ".storeSearchRow__thumb in src/frontend/screens/StoreSearch/index.css:131-138 is width 60px, aspect-ratio 3/4, object-fit cover. Cover math: scale = max(60/145, 80/55) = 1.45, scaled image 211x80, visible 60/211 = 28.4% of the width."
    - "The old provider's thumb was equally landscape: live CheapShark API returned capsule_231x87.jpg (measured 231x87, 2.66:1) which crops to 28.2% visible. Old and new crop are the same to within 0.2 percentage points."
  falsification_test: "If the visible fraction for the old and new thumbs differed materially, or if the CSS box were landscape, the hypothesis would be wrong. Neither holds: ratios 2.66 vs 2.64, box is 3:4."
  fix_rationale: "Not applied (diagnose-only). The fix must remove one of the two contributing conditions: make the box landscape to match the asset (robust, covers banner145/banner300), or prefer the portrait boxart (2:3 into 3:4 crops only 11% of the height) and handle the 2 of 20 sampled games that have banners but no boxart."
  blind_spots: "Not observed live in the running app (no screenshot taken); the diagnosis rests on measured asset dimensions plus the CSS box math, which is deterministic for object-fit: cover. I did not verify whether the user also saw cropping before Phase 47 (Phase 20 verification has no visual check of the thumb); the geometry says it was cropped identically."
  candidate_causes:
    - "code (CSS): portrait 3:4 box + object-fit cover applied to landscape art -- CONFIRMED"
    - "data (mapper): thumbOf() prefers banner145, a landscape banner, over portrait boxart -- CONFIRMED as a contributing condition"
    - "data (provider): ITAD changed the aspect ratio vs CheapShark -- REFUTED (2.66:1 vs 2.64:1)"
    - "environment: HiDPI/zoom or CachedImage imagecache:// transform altering the image -- REFUTED (CachedImage passes className straight to <img>, no resizing; box size is fixed in CSS px)"
  and_gate: "Yes. Two conditions must hold together: (1) the mapper selects a landscape asset AND (2) the CSS box is portrait with cover. Removing either removes the heavy crop. Both are recorded as the root cause."

## Symptoms

expected: Each Store Search row shows the game's art without significant cropping.
actual: User reported: "gameart in search is cropped (significantly)"
errors: None reported
reproduction: Test 7 in UAT. macOS, `pnpm tauri:dev`, Store Search, search 'xcom' or 'portal' -- row thumbnails are heavily cropped.
started: Discovered during UAT of phase 47 (2026-11-18), after the provider switch from CheapShark to IsThereAnyDeal. Geometry shows the crop pre-dates Phase 47.

## Eliminated

- hypothesis: ITAD supplies a different aspect ratio than CheapShark did, and the new ratio fed into CSS sized for the old thumbnail causes the crop (the caller's leading hypothesis).
  evidence: Live CheapShark API (2026-11-18) returns thumb capsule_231x87.jpg, measured 231x87 = 2.66:1 landscape. ITAD banner145 measured 145x55 = 2.64:1 landscape. Same orientation and ratio within 1%. The CSS box was never sized for a different shape: it was portrait 3:4 from the start (Phase 20 UI-SPEC) and fit neither provider's thumb.
  timestamp: 2026-11-18

- hypothesis: Phase 47 changed the thumb CSS or the CachedImage wrapper.
  evidence: `git log` on StoreSearch/index.css shows only db4921c02 (Phase 20-05, 2026-07-14, introduces the rule), c3283ad70 (20-06), 3e47ef383 and ba1c6b36d (Phase 47). The two Phase 47 commits contain no added/removed line mentioning thumb, aspect or object-fit. `.storeSearchRow__thumb` is referenced only by index.css and StoreSearchRow/index.tsx; CachedImage forwards className to the <img> and does no resizing.
  timestamp: 2026-11-18

- hypothesis: Image is distorted or downscaled by the imagecache:// path.
  evidence: CachedImage/index.tsx only swaps the src to an imagecache:// URL (and falls back to the raw URL on error); it never sets width/height. Sizing is purely the CSS box.
  timestamp: 2026-11-18

## Evidence

- timestamp: 2026-11-18
  checked: src/backend/storeSearch/itad.ts lines 98-102 and 303-306 (ItadSearchItem type and thumbOf)
  found: thumbOf returns `a?.banner145 ?? a?.banner300 ?? a?.boxart ?? ''`. Order is banner145 first, boxart last. itad.test.ts:162-166 locks this order (row with banner145 -> 'https://a/145.jpg'; row with only boxart -> 'https://a/box.jpg').
  implication: The row image field (StoreSearchResult.thumb) is a landscape banner whenever one exists, which is nearly always.

- timestamp: 2026-11-18
  checked: src/backend/storeSearch/__tests__/fixtures/itad/search-portal.json (real sweep response, 20 items)
  found: asset presence: 15 items have banner145+banner300+boxart, 2 have banner145+banner300 (no boxart), 3 have no assets at all (e.g. Portal Knights, `assets: {}`). Fixture URLs are real assets.isthereanydeal.com paths.
  implication: banner145 is present for 17/20; a boxart-first mapping would still need a banner fallback for 2/20, and 3/20 hit the fallback SVG.

- timestamp: 2026-11-18
  checked: Downloaded the real ITAD assets for Portal (018d937f-1749-...) and Portal 2 (018d937f-21e1-...) from assets.isthereanydeal.com and measured with sips
  found: banner145 145x55 (2.64:1); banner300 300x140 (2.14:1); banner400 400x187 (2.14:1); banner600 600x344 (1.74:1); boxart 300x450 (2:3 = 0.67:1). Identical across both games.
  implication: Every banner is landscape; only boxart is portrait.

- timestamp: 2026-11-18
  checked: src/frontend/screens/StoreSearch/index.css lines 131-138 (.storeSearchRow__thumb)
  found: `width: 60px; aspect-ratio: 3 / 4; object-fit: cover; flex-shrink: 0; border-radius: var(--space-3xs);` => fixed 60x80 portrait box.
  implication: object-fit: cover scales the image to fill the 80px height and clips the overflowing width.

- timestamp: 2026-11-18
  checked: Cover-crop math for each asset into the 60x80 box (python scratch calc)
  found: CheapShark capsule_231x87 -> 28.2% of width visible; ITAD banner145 -> 28.4%; banner300 -> 35.0%; banner400 -> 35.1%; boxart (300x450) -> 100% width, 88.9% height visible (11% vertical crop only).
  implication: Heavy crop (~72% of the image lost) for any banner; only boxart would meet "without significant cropping" in this box.

- timestamp: 2026-11-18
  checked: Live CheapShark API `games?title=portal` (needs a descriptive User-Agent), then downloaded the returned thumb
  found: thumb = shared.fastly.steamstatic.com/.../capsule_231x87.jpg, measured 231x87 (2.66:1).
  implication: The old provider's thumb was the same landscape shape, so the crop is not a regression from the provider switch; it is a latent Phase 20 defect.

- timestamp: 2026-11-18
  checked: .planning/milestones/v0.6-phases/20-aggregated-store-search-cheapshark/20-UI-SPEC.md:168-169, 20-05-PLAN.md:119, and git show db4921c02
  found: Phase 20 UI-SPEC specified "Thumb -- CheapShark's thumb URL via CachedImage, width: 60px, aspect-ratio: 3/4, object-fit: cover, fallback to the same gamelib_card.svg used by DiscountCard". gamelib_card.svg is 600x900 portrait; DiscountCard's image is also 3/4 cover. The 3:4 choice follows the portrait fallback/Deals-card convention, not the landscape asset. 20-VERIFICATION.md has no visual check of thumb appearance.
  implication: The portrait box was specced from a convention, never validated against CheapShark's landscape capsule, so the crop shipped unnoticed. Phase 47 UI-SPEC has no thumbnail size/aspect entry (grep for thumb/aspect/crop/60px found nothing) and inherited the Phase 20 rule.

- timestamp: 2026-11-18
  checked: src/frontend/components/UI/CachedImage/index.tsx
  found: Forwards className to <img>, no sizing. Adds a `usingFallback` class when showing a fallback, documented for "fit-to-tile instead of crop-to-fill".
  implication: A `.storeSearchRow__thumb.usingFallback` rule is the available hook if the box becomes landscape and the 2:3 fallback SVG should not be cropped.

## Resolution

root_cause: Two conditions together. (1) src/backend/storeSearch/itad.ts thumbOf() (lines 303-306) selects banner145 (145x55, 2.64:1 landscape) as StoreSearchResult.thumb, falling back to banner300 (2.14:1) and only then portrait boxart. (2) src/frontend/screens/StoreSearch/index.css .storeSearchRow__thumb (lines 131-138) renders it in a fixed portrait 60x80 box (`aspect-ratio: 3 / 4; object-fit: cover`), so cover scales the banner to the 80px height and shows only ~28% of its width (~72% cropped). The box rule is from Phase 20 (db4921c02, written for CheapShark's own 231x87 landscape capsule, which cropped the same 28%) and was never touched by Phase 47. The provider switch did not change the aspect ratio, so the lead hypothesis is refuted; it is a pre-existing spec/CSS mismatch that UAT 47 surfaced.
fix: (not applied; diagnose-only)
verification: (not applicable; diagnose-only)
files_changed: []
