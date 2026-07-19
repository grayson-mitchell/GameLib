# Phase 12: Ownership Dedup - Research

**Researched:** 2026-07-06
**Domain:** In-process cross-referencing of a locally-cached Humble key inventory against a locally-cached Steam owned-games list; fuzzy string matching with a false-positive guard; Electron IPC/store extension of an existing Phase 10/11 codebase.
**Confidence:** HIGH (architecture, data model, integration points — all directly observed in the existing codebase) / MEDIUM (fuzzy-matching algorithm specifics — synthesized from general domain knowledge, not sourced from an authoritative Humble/GameLib-specific reference; flagged in Assumptions Log)

## Summary

Phase 12 adds **zero new I/O** to the Humble feature: it is a pure computation over two caches that already exist on disk — `humbleLibraryStore` (Phase 11's per-order `HumbleKey[]` rows) and `steamLibraryStore` (the Steam store manager's persisted `GameInfo[]`, keyed by `app_name` = stringified Steam AppID). The critical, previously-undocumented finding is that **`steam_app_id` is confirmed present in the live Humble order-detail response** (verified in Phase 10's live validation gate, `10-VALIDATION.md`) but **is not currently captured anywhere in the codebase** — `classify.ts` never reads it, `HumbleKey` has no field for it, and the zod schema only tracks its *presence* (a boolean, in `validation.ts`) for the Phase 10 gate report. Phase 12 must (1) add `steamAppId` extraction to `classify.ts`, (2) extend `HumbleKey` with `steamAppId?`, `ownedElsewhere`, and `matchConfidence`, and (3) force a **one-time backfill** of already-cached orders — including D-24's frozen/terminal ones, which are otherwise never re-fetched — by reusing the exact `HUMBLE_CLASSIFIER_VERSION` mechanism Phase 11 already built for this precise problem (a classifier semantics change that must reach frozen cache rows).

Matching is two-tier per D-44/D-45: an AppID match is final and exact when `steamAppId` is present (Steam-type keys only); every other key (no AppID — either non-Steam platforms per D-45, or a Steam key predating AppID capture) falls through to a normalized-title similarity check at an 85%+ threshold. The single highest-risk design decision is **which similarity algorithm computes that 85%**: the community-norm algorithm named in this project's own prior research (`FEATURES.md`, `fuzzywuzzy token_set_ratio`) is *structurally* the mechanism that causes the exact DLC false-positive this phase must prevent, because token-set-style algorithms are deliberately subset-tolerant. This research recommends a **length-sensitive** algorithm (normalized Levenshtein ratio) instead, plus an explicit DLC/edition-keyword guard as defense in depth, and flags this as the one specification gap in this phase that most needs a second look during planning/execution (unit tests using the project's own documented false-positive examples are the cheapest verification).

Recompute triggers (D-47) hook into two existing, well-isolated integration points with no new coupling: the end of Humble's `sync()` (library.ts) and the existing generic `refreshLibrary` IPC handler in `main.ts` (gated to `library === 'steam' || 'all'`) — the latter keeps `steam/library.ts` completely unaware that Humble exists, matching this project's established one-way-dependency architecture (`ARCHITECTURE.md`'s stated goal for `dedup.ts`).

**Primary recommendation:** Add a new pure module `src/backend/humble/dedup.ts` (no I/O, unit-testable, mirrors `classify.ts`'s existing module discipline) that computes `{ ownedElsewhere, matchConfidence }` per key from two inputs (`HumbleKey[]`, Steam `GameInfo[]`) with no cache/store access of its own; have `library.ts` own reading the caches, writing the mutated rows back into `humbleLibraryStore`, and re-pushing `humbleKeysUpdated`. Use a hand-written normalized-Levenshtein-based similarity (built on the tiny, zero-dependency `fastest-levenshtein` package, already slopcheck-verified `[OK]` in this session) rather than reusing `fuse.js` (already a project dependency, but purpose-built for haystack search, not symmetric pairwise title comparison, and shares the same subset-tolerance risk as token-set algorithms).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Numbering continues from Phase 11 (D-01..D-34) to keep v0.3 decision IDs unambiguous.

**Steam-entry annotation (HDEDUP-02 collapse)**
- **D-35:** The Humble-origin annotation lives on the **Steam game's details page only** (no library tile badge). Copy is **origin only**: "Includes a key from Humble Bundle: {bundle/order name}" — no purchase date. Bundle name comes from the order data already cached in Phase 11.
- **D-36:** The redeemed key **stays visible on the Humble Keys page** as a normal REDEEMED row — it is part of the key inventory ("never lose a key"). "Collapse" means only that a matched key never becomes a separate library-like entry; the details annotation is the Steam-side trace.
- **D-37:** A REDEEMED Steam key with **no confirmed ownership match** (redeemed on another account, delisted, missing `steam_app_id`) renders as a normal REDEEMED row — no annotation, no mismatch flag, no guessing. The collapse fires only on a confirmed match.

**Owned badge on the keys page (HDEDUP-01 visibility)**
- **D-38:** Phase 12 adds an ownership badge to matching rows on the Phase 11 Humble Keys page — the visible proof that matching works before Phase 13's views exist. Phase 13 filters on the same underlying flag.
- **D-39:** The badge states the **fact only** ("Owned on Steam") — no §2.3 recommendation copy ("Claim this" / "giftable spare"); those arrive with Phase 13's views. The badge is also **presentation-only**: the D-21 layout (state groups, expiring-soonest first) is untouched — no dimming, no re-sorting.
- **D-40:** The details-page annotation is **redeemed-only**. No "you have an unclaimed Humble key" hint on Steam entries — unclaimed-key surfacing is Phase 15's store-overlay job (HSTORE-01).

**Match confidence & overrides**
- **D-41:** Fuzzy matches are **visually distinguishable** from exact matches: exact AppID match → "Owned on Steam"; fuzzy-name match → "Likely owned on Steam". The exact-vs-fuzzy provenance is persisted with the match result so Phase 14's C2 hard block can treat fuzzy matches more gently (a false-positive fuzzy match must not permanently block claiming a genuinely-needed key).
- **D-42:** A **"Not the same game" override exists on fuzzy-matched rows only** — it clears the match and is persisted (keyed by `machine_name`). Exact AppID matches are trusted: no override, no manual "mark as owned".
- **D-43:** Overrides **survive disconnect** — they join the D-04 wipe exemption alongside the REVEALED flags and future audit log. A user correction must not silently regress (and re-block Phase 14 claims) after a reconnect.
- **D-44:** When a key **has** `steam_app_id`, the AppID verdict is **final** — owned or not owned, no fuzzy second-guessing. The fuzzy-name path runs ONLY when `steam_app_id` is missing. Predictability over recall: fuzzy false-positives are the dangerous error class here.

**Match scope & recompute**
- **D-45:** **All key platforms** (Steam, GOG, Epic, Ubisoft, …) are matched against Steam ownership — a GOG key for a Steam-owned game IS a spare (spec F3: cross-reference every key). Non-Steam keys have no `steam_app_id`, so they go through the fuzzy path with the "Likely owned" treatment (D-41) and override affordance (D-42).
- **D-46:** "The library" for Phase 12 = the **full Steam owned-apps list** (installed or not), as held by the Steam store manager. Matching against Epic/GOG/Amazon libraries is a deferred enhancement — see Deferred Ideas.
- **D-47:** Ownership matching recomputes **after every Humble sync AND whenever the Steam library refreshes** (new purchase or a redeemed key changes ownership). It is an in-memory pass over cached data — D-24 frozen terminal orders are included in the recompute without any re-fetch, and no Humble requests are ever issued by dedup.
- **D-48:** If the Steam account is disconnected or its session is stale, existing `owned_elsewhere` flags are **kept at last-known values** until a successful recompute against real Steam data. Never zero out flags on missing/stale Steam data — flipping owned→unowned would strip Phase 14's C2 protection and invite key waste.

### Claude's Discretion

- Fuzzy-matching algorithm/library choice and title normalization strategy (edition suffixes, trademark symbols, punctuation) — the 85%+ threshold and the DLC-must-not-match-base-game guard are locked by HDEDUP-01/success criterion 3; how to achieve them is open.
- Where match results/overrides are stored (`electron-store` shapes following `electronStores.ts` conventions) and whether `owned_elsewhere` is persisted per key or recomputed on load — as long as D-48's keep-last-known behavior holds.
- IPC channel names (`humble:*`), badge styling (semantic tokens), i18n keys (consumed namespace per Phase 10 WR-08), override affordance placement/copy, details-page annotation component placement.
- Whether Phase 11's cached `HumbleKey` rows need a schema migration / one-time backfill re-fetch to capture `steam_app_id` for already-cached (including D-24 frozen) orders — a one-time backfill is acceptable and does not violate D-24's spirit (recurring cost is what it forbids). Researcher should confirm what the cache actually holds.
- UNPICKED Choice-month pseudo-entries (D-27) presumably cannot be ownership-matched (no concrete game identity); confirm and exclude them cleanly.

### Deferred Ideas (OUT OF SCOPE)

- **Ownership matching against Epic/GOG/Amazon libraries** — spec F3's full "unified library" reading. Phase 12 is Steam-only per the roadmap; cross-runner name matching is a future enhancement (all fuzzy, higher false-positive surface — revisit after the Steam matcher is proven).
- **Mismatch hint** ("redeemed, but not found in your Steam library") on unmatched REDEEMED rows — consciously rejected for Phase 12 (D-37) to avoid false alarms on delisted/region-locked titles; could return later if demand appears.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HDEDUP-01 | Every key is cross-referenced against the Steam library (AppID-first via `steam_app_id`, 85%+ fuzzy-name fallback) to set `owned_elsewhere` | AppID field extraction gap identified (Standard Stack); backfill mechanism (Architecture Patterns, Pattern 2); fuzzy algorithm recommendation + DLC guard (Architecture Patterns, Pattern 3; Common Pitfalls); recompute triggers (Architecture Patterns, Pattern 4) |
| HDEDUP-02 | A Humble Steam key already redeemed into Steam collapses onto the existing Steam library entry (annotated with its Humble origin) instead of appearing as a duplicate | GamePage annotation integration point (Architecture Patterns, Pattern 5); existing `humble.keys` frontend context slice reuse (Don't Hand-Roll; Code Examples) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `steam_app_id` extraction from raw tpk | API/Backend (`classify.ts`) | — | Classification already extracts every other tpk field here; this is a pure data-shape addition to an existing pure function, not new I/O |
| AppID/fuzzy ownership computation | API/Backend (`dedup.ts`, new) | — | Pure computation over two already-cached datasets; no network, no Electron API surface needed |
| Match-result persistence (`ownedElsewhere`, `matchConfidence`, `steamAppId`) | API/Backend (`electron-store`, main process) | — | Must survive app restart (D-48 keep-last-known) and Steam session hiccups; only the main process can read/write `electron-store` |
| Override persistence (`humble:not-the-same-game`) | API/Backend (`electron-store`, main process) | — | Must survive disconnect (D-43), mirrors `humbleRevealedStore` exactly |
| Recompute trigger on Humble sync | API/Backend (`humble/library.ts`) | — | Already the sync orchestrator; natural place to call the dedup pass after all orders commit |
| Recompute trigger on Steam refresh | API/Backend (`main.ts`, composition root) | — | `steam/library.ts` must stay Humble-unaware (existing one-way dependency direction); the generic `refreshLibrary` IPC handler already dispatches per-runner refreshes and is the correct seam |
| Owned badge on Keys page | Frontend/Client (React) | — | Pure presentational read of `HumbleKey.ownedElsewhere`/`matchConfidence`, already delivered to the renderer via the existing `humble.keys` context slice |
| Steam details-page annotation | Frontend/Client (React) | — | Derived lookup against the same `humble.keys` context array (`state === 'REDEEMED' && steamAppId === gameInfo.app_name`) — no new IPC channel required |
| "Not the same game" override action | Frontend/Client (React) → API/Backend (IPC) | — | User-initiated write; frontend fires an IPC call, backend persists to the override store and re-emits `humbleKeysUpdated` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastest-levenshtein` | 1.0.16 `[ASSUMED — discovered via WebSearch, not Context7/official docs]` | Raw Levenshtein edit-distance primitive for the fuzzy-name fallback | Zero dependencies, correctly handles Unicode surrogate pairs (a hand-rolled DP implementation commonly mishandles these — the exact class of "deceptively simple but has edge cases" problem this project's own guidance says not to hand-roll), fastest of the benchmarked JS Levenshtein implementations. `npm view` confirms version `1.0.16`, published 2022-08-02 `[VERIFIED: npm registry]` (age is not a red flag here — the algorithm is stable/complete, not actively developed because it needs nothing further). slopcheck verdict: `[OK]`, zero postinstall script `[VERIFIED: npm registry]`. |

### Supporting (already installed — zero new runtime dependencies beyond the one above)

| Library | Already Present | Role in Ownership Dedup |
|---------|-----------------|----------------------|
| `electron-store` (via project's `CacheStore`/`TypeCheckedStoreBackend` wrappers) | Yes (^8.2.0) | Persists per-key ownership fields (mutated onto existing `humbleLibraryStore` rows) and the new override store |
| `zod` | Yes | Extend `OrderDetailTpkSchema` in `adapter.ts` with an explicit (optional, passthrough-already-tolerant) `steam_app_id` field for self-documentation — not functionally required since `classify.ts` already reads tpk fields via an untyped `Record<string, unknown>` cast, but keeps the schema honest about what the adapter has confirmed exists |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fastest-levenshtein` + hand-written normalized-ratio wrapper | `fuse.js` (already a project dependency, used in `src/frontend/screens/Library/index.tsx` for in-library search) | Fuse is designed to search a query against a haystack list (approximate substring matching with a tunable threshold/distance), not to score two known, complete titles against each other. Its default scoring — like token-set algorithms — tends to reward one string containing the other, which is precisely the DLC false-positive risk this phase must avoid. Reusable in principle with careful tuning (`ignoreLocation: true`, symmetric double-search), but the semantics are a worse fit than a direct length-sensitive edit-distance ratio. |
| `fastest-levenshtein` | `fuzzball` (JS port of Python's `fuzzywuzzy`, offering `token_set_ratio`/`token_sort_ratio`) | This is the literal community-norm algorithm named in this project's own prior research (`FEATURES.md` Q2) — but `token_set_ratio` is explicitly named in the same research as the mechanism that lets a DLC title match its base game at any threshold, because it is subset-tolerant by design. Rejected for the *primary* similarity score; the normalization step (below) does still borrow "token sort" ideas at the word level for robustness to reordering, without adopting subset-tolerant scoring. Not independently verified as still-maintained in this session — flagged as a rejected candidate, not slopcheck-verified. |
| Hand-written Levenshtein DP (no dependency at all) | N/A | Rejected per this project's own "Don't Hand-Roll" guidance: naive implementations commonly iterate by UTF-16 code unit rather than by grapheme/code point, silently mis-scoring titles containing astral-plane Unicode (rare in game titles, but a solved problem a well-tested micro-library removes for near-zero cost). |

**Installation:**
```bash
pnpm add fastest-levenshtein
```

**Version verification:**
```bash
npm view fastest-levenshtein version   # 1.0.16 (published 2022-08-02) — confirmed this session
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `fastest-levenshtein` | npm | ~4 yrs (published 2022-08-02, v1.0.16) | High (widely referenced as the fastest benchmarked JS Levenshtein implementation) | `github.com/ka-weihe/fastest-levenshtein` | `[OK]` (verified this session via `slopcheck install`) | Approved — tag `[ASSUMED]` per package-name-provenance rule (discovered via WebSearch, not Context7/official docs) despite the clean `[OK]` verdict; gate behind a `checkpoint:human-verify` per the planner's standard treatment of `[ASSUMED]` packages |

**Packages removed due to slopcheck `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** none

**Note on verification method:** `slopcheck install <pkg>` in this environment performs a *real* `npm install` against the project (not a dry-run check) — it temporarily added `fastest-levenshtein` to `package.json`/`pnpm-lock.yaml` and ran a real `npm install`, which was reverted (`git checkout -- package.json` + `pnpm install`) immediately after recording the `[OK]` verdict and confirming no postinstall script. The planner/executor should be aware of this side effect if re-running slopcheck against additional candidate packages during planning — verify `git status` is clean afterward.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │  Humble sync completes        │
                    │  (library.ts: runSync())       │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐        ┌──────────────────────────────┐
                    │  Steam library refresh completes│──────▶│  main.ts: refreshLibrary IPC   │
                    │  (steam/library.ts: refresh())  │        │  handler (gated: steam | all)  │
                    └───────────────┬───────────────┘        └───────────────┬──────────────┘
                                    │                                         │
                                    └─────────────────┬───────────────────────┘
                                                       ▼
                                    ┌──────────────────────────────────────┐
                                    │  humble/dedup.ts (NEW, pure function)  │
                                    │  recomputeOwnership(keys, steamGames)  │
                                    │                                         │
                                    │  for each HumbleKey (skip UNPICKED):   │
                                    │   ┌─ steamAppId present? ──────┐        │
                                    │   │  YES → exact match only     │        │
                                    │   │        (D-44, no fallback)  │        │
                                    │   │  NO  → normalized-title      │       │
                                    │   │        fuzzy match, 85%+     │       │
                                    │   │        + DLC-keyword guard   │       │
                                    │   └──────────────────────────────┘       │
                                    │  → apply persisted override (D-42)      │
                                    │  → { ownedElsewhere, matchConfidence }   │
                                    └───────────────────┬────────────────────┘
                                                         │
                     inputs read by caller (library.ts):  │  outputs written by caller
      humbleLibraryStore.entries() ──────────────────────┤  humbleLibraryStore.set(gamekey, mutatedEntry)
      steamLibraryStore.get('games', [])─────────────────┤  sendFrontendMessage('humbleKeysUpdated', keys)
      humbleOwnershipOverrideStore (D-42/43) ─────────────┘
                                                         │
                                    ┌────────────────────▼────────────────────┐
                                    │  Frontend: humble.keys context (existing) │
                                    └─────────┬──────────────────────┬─────────┘
                                              │                      │
                             ┌────────────────▼───────┐   ┌──────────▼─────────────────┐
                             │ Humble Keys page (P11)   │   │ Steam GamePage "info" tab   │
                             │ + owned badge (D-38/41)  │   │ + Humble-origin annotation  │
                             │ + override affordance     │   │ (D-35, redeemed-only, D-40) │
                             │   (D-42, fuzzy rows only) │   │ derived: find REDEEMED key   │
                             └───────────────────────────┘   │ where steamAppId === app_name│
                                                              └─────────────────────────────┘
```

### Recommended Project Structure

```
src/backend/humble/
├── adapter.ts            # (extend) OrderDetailTpkSchema gains steam_app_id
├── classify.ts           # (extend) classifyOrder captures steamAppId onto HumbleKey
├── dedup.ts              # NEW — pure ownership-matching module (mirrors classify.ts discipline)
├── library.ts            # (extend) calls dedup after sync; exposes recomputeOwnership() for the Steam-refresh hook
├── electronStores.ts     # (extend) humbleOwnershipOverrideStore (D-42/43 — never cleared on disconnect)
├── constants.ts           # (extend) HUMBLE_CLASSIFIER_VERSION bump (backfill trigger) + fuzzy threshold constant
└── ipc_handler.ts        # (extend) humbleSetOwnershipOverride / humbleClearOwnershipOverride handlers

src/common/types/
└── humble.ts              # (extend) HumbleKey gains steamAppId?, ownedElsewhere, matchConfidence

src/frontend/screens/Humble/Keys/components/HumbleKeyRow/
└── index.tsx               # (extend) owned badge (D-38/39/41) + override affordance (D-42, fuzzy-only)

src/frontend/screens/Game/GamePage/components/
└── HumbleOriginInfo.tsx    # NEW — mirrors PlatformSupport.tsx's `gameInfo`-prop pattern; mounted in the "info" TabPanel
```

### Pattern 1: `steam_app_id` capture is a pure field-extraction addition to an existing pure function

**What:** `classify.ts`'s `classifyOrder` already reads every other tpk field (`redeemed_key_val`, `key_type`, `human_name`, expiration candidates) via an untyped `Record<string, unknown>` cast. `steam_app_id` is confirmed present in the live API for Steam-type keys (Phase 10's `validation.ts` already checks its *presence* as a boolean for the live-gate report — see `steamAppIdPresent` in `common/types/humble.ts`) but the actual value has never been threaded through to `HumbleKey`.

**When to use:** Every tpk with `platform === 'steam'` (the already-derived `key_type` label).

**Example (extends the existing loop in `classify.ts`):**
```typescript
// Source: src/backend/humble/classify.ts (existing loop, ~line 291-306) + steamAppIdPresent
// precedent in src/backend/humble/validation.ts (~line 80-84)
const platform = tpk.key_type as string
const rawAppId = tpk.steam_app_id
// Real payload carries this as either a string or a number depending on order
// vintage (validation.ts's presence check tolerates both via `in` operator,
// not a type check) — normalize to a string to match GameInfo.app_name's type.
const steamAppId =
  platform === 'steam' &&
  (typeof rawAppId === 'string' || typeof rawAppId === 'number')
    ? String(rawAppId)
    : undefined

keys.push({
  gamekey,
  machineName,
  state,
  title,
  platform,
  expiration,
  origin: orderLabel,
  steamAppId,          // NEW
  ownedElsewhere: false,   // NEW — default; dedup.ts overwrites after this pass
  matchConfidence: 'none'  // NEW — default; dedup.ts overwrites after this pass
})
```

### Pattern 2: Backfilling already-cached orders reuses the existing classifier-version mechanism verbatim

**What:** `library.ts` already has a mechanism for exactly this problem — Phase 11's live-UAT round 6 fix (`HUMBLE_CLASSIFIER_VERSION` / `reclassifyAll`) exists because D-24's frozen-terminal-order skip means a classification bug fix can never reach already-cached, fully-terminal (REDEEMED/UNREDEEMABLE) rows without an explicit one-time full re-fetch. Capturing `steamAppId` for already-cached orders is the identical problem shape: every REDEEMED key sitting in the cache today has no `steamAppId`, and REDEEMED rows are by definition terminal (frozen, never re-fetched).

**When to use:** Bump `HUMBLE_CLASSIFIER_VERSION` (currently `2`) to `3` as part of this phase's changes. `library.ts`'s existing `runSync()` logic (`storedClassifierVersion !== HUMBLE_CLASSIFIER_VERSION` → `reclassifyAll` → re-fetch and re-classify every gamekey, bypassing the frozen skip once, then stamp the new version only after a clean pass) requires **zero new code** — it already does exactly what this backfill needs.

**Example:**
```typescript
// Source: src/backend/humble/constants.ts (existing constant, extend the comment)
// 3 = Phase 12: steam_app_id capture added to classifyOrder — every cached
// order (including D-24 frozen/terminal ones) must be re-fetched once to
// backfill this field; a version bump is the existing, zero-new-code
// mechanism for exactly this.
export const HUMBLE_CLASSIFIER_VERSION = 3
```
No other change to `library.ts` is required for the backfill itself — only the constant bump. Confirm in planning: this does perform one real Humble API round-trip per gamekey (not a violation of D-47's "dedup issues zero Humble requests" — the re-fetch is the *sync* mechanism's job, already rate-limit-disciplined via `HUMBLE_SYNC_CONCURRENCY`; the *dedup pass itself*, which runs after sync, still touches no network).

### Pattern 3: Fuzzy-match algorithm — normalized Levenshtein ratio + explicit DLC-keyword guard, NOT token-set matching

**What:** A two-stage process applied only when `steamAppId` is absent (D-44):
1. Normalize both titles (lowercase, strip `™®©`, strip punctuation, strip a fixed list of edition/suffix tokens, collapse whitespace).
2. Compute `1 - (levenshteinDistance(a, b) / max(a.length, b.length))` as the similarity score. Accept only if `score >= 0.85` **and** the DLC-keyword guard does not veto.

**Why NOT token-set matching:** This project's own prior research (`FEATURES.md` Q2) names `fuzzywuzzy token_set_ratio`/`token_sort_ratio` as the community-standard approach, and in the same breath documents the exact failure this phase must prevent: `token_set_ratio` scores a string highly when it is a **subset** of another (that's its entire design purpose — matching "the tokens of A all appear somewhere in B" regardless of B's extra tokens). A DLC title is definitionally the base title plus extra tokens ("Vampire Survivors" ⊂ "Vampire Survivors: Operation Tides of the Foscari DLC") — token-set algorithms score this pairing highly *by construction*, which is precisely the false positive `PITFALLS.md` and `FEATURES.md` both warn about, at any threshold. A **length-sensitive** algorithm (plain Levenshtein ratio, not token-based) naturally penalizes this pairing because the strings differ substantially in total length — this is a materially safer default for this specific use case than the "community norm," even though the community norm is more commonly cited for general Humble-ownership tooling.

**When to use:** Any non-Steam-platform key (D-45) or a Steam-platform key with no `steam_app_id` (older/edge-case orders), compared against every title in `steamLibraryStore.get('games', [])`.

**Example:**
```typescript
// Source: src/backend/humble/dedup.ts (NEW — synthesized this session, no
// authoritative reference; unit-test against the exact false-positive/negative
// examples already documented in .planning/research/PITFALLS.md Pitfall 2)
import { distance } from 'fastest-levenshtein'

const EDITION_SUFFIXES = [
  'game of the year edition', 'goty edition', 'goty',
  'definitive edition', 'enhanced edition', 'remastered',
  'anniversary edition', 'complete edition', 'ultimate edition',
  'deluxe edition', 'standard edition', 'collection'
]

const DLC_KEYWORDS = [
  'dlc', 'season pass', 'expansion', 'soundtrack', 'artbook',
  'art book', 'content pack', 'bonus content', 'upgrade pack'
]

function normalizeTitle(title: string): string {
  let t = title.toLowerCase().replace(/[™®©]/g, '')
  for (const suffix of EDITION_SUFFIXES) {
    t = t.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '')
  }
  return t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const FUZZY_MATCH_THRESHOLD = 0.85 // locked by HDEDUP-01 success criterion 3

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (na.length === 0 || nb.length === 0) return 0
  const maxLen = Math.max(na.length, nb.length)
  return 1 - distance(na, nb) / maxLen
}

/**
 * Defense-in-depth guard, in addition to the length-sensitive algorithm above:
 * if the raw (pre-normalization) longer title contains a DLC/expansion
 * keyword that the shorter title does not, never treat this as a match
 * regardless of the computed score — protects short base-game titles
 * (e.g. a 3-word base game + a 1-word "DLC" suffix could still occasionally
 * clear 85% on length-sensitive scoring for very short titles).
 */
export function isDlcFalsePositiveRisk(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerLower = longer.toLowerCase()
  const shorterLower = shorter.toLowerCase()
  return DLC_KEYWORDS.some(
    (kw) => longerLower.includes(kw) && !shorterLower.includes(kw)
  )
}

export function fuzzyMatch(humbleTitle: string, steamTitle: string): boolean {
  if (isDlcFalsePositiveRisk(humbleTitle, steamTitle)) return false
  return titleSimilarity(humbleTitle, steamTitle) >= FUZZY_MATCH_THRESHOLD
}
```

**Test fixtures to reuse verbatim (already documented in this project's own research, not invented for this phase):**
- Should match: `"Assault Android Cactus+"` vs `"Assault Android Cactus"`; `"FRAMED Collection"` vs `"Framed Collection"`; `"Into the Breach"` vs `"Into The Breach (Steam)"`.
- Should NOT match: `"Game X: Season Pass"` vs `"Game X"` (DLC); `"Batman"` vs `"Batman: Arkham Knight"` (substring, not real match).

### Pattern 4: Cross-platform matching is intentional, not a bug — a documented tension with prior research

**What:** This project's own `PITFALLS.md` (written before Phase 12's `CONTEXT.md` discussion) lists as a false-positive risk: *"A non-Steam key for 'Borderlands 3' matching against the owned Steam 'Borderlands 3' — the key is for Epic; the guard correctly fires but for the wrong platform if platform is not checked first."* **D-45 explicitly supersedes this concern**: cross-platform matching against Steam ownership is the intended behavior (spec F3: "cross-reference every key" against the unified library) — a GOG/Epic/Ubisoft key for a game already owned on Steam genuinely IS a giftable spare, and the "Likely owned" fuzzy-confidence label (D-41) plus the "Not the same game" override (D-42) are the designed safety valves for exactly this scenario, not a signal that platform-gating was missing.

**When to use:** Do not add a platform guard that blocks fuzzy matching for non-Steam-type keys — that would violate D-45/HDEDUP-01. The only platform-relevant behavior is: `steamAppId` is only ever populated for `platform === 'steam'` tpks (Humble's API does not attach a Steam AppID to a GOG/Epic key), so every non-Steam-platform key always falls through to the fuzzy path by construction — no explicit branch is needed.

### Pattern 5: GamePage annotation reuses the existing `humble.keys` frontend context — no new IPC channel

**What:** `GlobalState.tsx`'s `humble` context slice already receives the full `HumbleKey[]` array via the existing `humbleKeysUpdated` push (Phase 11) and re-fetches it via `humbleGetKeys` on mount. Once `HumbleKey` gains `steamAppId`, the Steam game-details annotation (D-35) is a pure client-side derived lookup — no new backend query is required.

**When to use:** New `HumbleOriginInfo` component, mounted in `GamePage`'s existing "info" `TabPanel` (alongside `PlatformSupport`/`DownloadSizeInfo`/`InstalledInfo`/`CloudSavesSync`, which already follow the identical `{ gameInfo: GameInfo }` prop pattern), gated on `gameInfo.runner === 'steam'`.

**Example:**
```tsx
// Source: src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx
// (existing sibling component, same "info" TabPanel, same gameInfo prop shape)
// mounted at src/frontend/screens/Game/GamePage/index.tsx:563 alongside
// PlatformSupport/DownloadSizeInfo/InstalledInfo/CloudSavesSync
import { useTranslation } from 'react-i18next'
import { useGlobalState } from 'frontend/state/GlobalState' // or ContextProvider hook, per project convention
import { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

// D-35/D-36/D-37/D-40: redeemed-only, confirmed-match-only, origin-only copy,
// no purchase date, no mismatch flag on unmatched REDEEMED rows.
const HumbleOriginInfo = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamepage') // matches PlatformSupport's namespace
  const { humble } = useContext(ContextProvider)

  const matchedKey = humble.keys.find(
    (k) => k.state === 'REDEEMED' && k.steamAppId === gameInfo.app_name
  )

  if (gameInfo.runner !== 'steam' || !matchedKey) return null

  return (
    <div className="humbleOriginInfo">
      {t('info.humbleOrigin', 'Includes a key from Humble Bundle: {{origin}}', {
        origin: matchedKey.origin
      })}
    </div>
  )
}

export default HumbleOriginInfo
```

### Anti-Patterns to Avoid

- **Mutating `classify.ts` to also compute ownership:** `classify.ts`'s own docstring is explicit — "No I/O, no logging, no store import" — it is a pure per-tpk classifier, unit-tested without mocking `electron-store`. Ownership computation needs the Steam library cache (a store read) and the override store (another store read); keep it in a separate `dedup.ts` module, called by `library.ts` (which already owns all store I/O for this domain), not inlined into the classifier.
- **Computing `owned_elsewhere` as a 5-state peer:** §2.3 of the spec (and D-38/D-39) are explicit that this is an orthogonal overlay, never a 6th state. Do not add it to the `HumbleKeyState` union, do not let it influence `classifyTpk`'s precedence logic, and do not let it affect `allTerminal` (the D-24 freeze computation) — a fuzzy-matched-then-overridden key is still exactly as REDEEMED/UNREVEALED/etc. as before.
- **Skipping the persistence question by recomputing 100% fresh on every load:** D-48 requires *keeping* stale values when Steam data is temporarily unavailable — a "recompute from scratch on every app boot, discard whatever was there before" design cannot satisfy this without also persisting the prior values somewhere, so it collapses to the same persistence requirement anyway. Persist directly onto the cached `HumbleKey` rows in `humbleLibraryStore`.
- **Gating the fuzzy path on platform:** see Pattern 4 — do not reintroduce a Steam-only platform guard that `PITFALLS.md` (written before this phase's decisions) suggested; D-45 explicitly wants cross-platform fuzzy matching.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Levenshtein edit distance | A hand-written DP table (the naive version is easy to get subtly wrong on Unicode surrogate pairs, and re-solving a solved algorithm has no value here) | `fastest-levenshtein` (`distance()` primitive only — write the normalization/threshold/DLC-guard logic yourself, since that part IS project-specific) | Zero dependencies, benchmarked fastest of the JS implementations, correctly handles UTF-16 edge cases a naive loop commonly misses |
| Delivering the ownership annotation to the Steam GamePage | A new IPC channel + backend query keyed by AppID | The existing `humble.keys` frontend context array (already pushed via `humbleKeysUpdated`) — filter client-side | `GlobalState.tsx` already receives the full key list reactively; adding a second data path duplicates state and risks a staleness bug (two sources of truth for "is this key matched") |
| Backfilling already-cached rows with the new `steamAppId` field | A bespoke one-off migration script/flag | The existing `HUMBLE_CLASSIFIER_VERSION` bump mechanism in `library.ts` | This exact problem (a classifier semantics change that must reach D-24-frozen cache rows) was already solved in Phase 11 round 6 — reusing it means zero new code paths to test |

**Key insight:** Every piece of "new" infrastructure this phase seems to need (a backfill mechanism, a way to persist derived per-key state, a way to deliver it to the GamePage) already has an exact-fit precedent already shipped in Phase 10/11. The only genuinely novel code in this phase is the ~40-line `dedup.ts` matching function itself and its accompanying normalization/DLC-guard logic.

## Common Pitfalls

### Pitfall 1: Token-set-style fuzzy matching silently defeats its own DLC guard

**What goes wrong:** Implementing "fuzzywuzzy-style" fuzzy matching (the approach named in this project's own prior research as the community norm) with `token_set_ratio`/`token_sort_ratio` at 85% still lets DLC titles match their base game, because these algorithms are subset-tolerant by design — raising the threshold from 70% to 85% does not fix the underlying mechanism, it only requires the DLC title to be a *slightly larger* fraction of shared tokens, which most real DLC titles still clear (a DLC named "Base Game: Some Expansion Name" shares 100% of the base game's tokens).
**Why it happens:** Token-set algorithms compute similarity based on the *intersection* of tokens, which by construction rewards containment relationships — exactly what a base-game/DLC pair is.
**How to avoid:** Use a length-sensitive algorithm (Levenshtein ratio, not token-based) as the primary score, per Pattern 3, plus the explicit DLC-keyword guard as defense in depth.
**Warning signs:** A unit test asserting `"Game X: Season Pass"` must NOT match `"Game X"` fails when using any token-set-family library at any threshold below ~99%.

### Pitfall 2: Frozen (D-24) cache rows never see the new `steamAppId` field without a forced backfill

**What goes wrong:** Every REDEEMED key currently sitting in `humbleLibraryStore` is, by definition, `allTerminal` (D-24) and therefore skipped on every future sync (`partitionGamekeys` routes it to `frozenGamekeys`, never re-fetched). If `classify.ts` is extended to capture `steamAppId` but no backfill mechanism runs, every already-redeemed Steam key silently has `steamAppId: undefined` forever — HDEDUP-02's entire collapse behavior (which depends on `steamAppId` matching `gameInfo.app_name`) would never fire for any pre-Phase-12 account, and the phase's Success Criterion 2 would appear to fail for all existing users despite correct new code.
**Why it happens:** This is the exact same trap Phase 11's own live-UAT round 6 discovered and fixed (a classifier fix that can never reach frozen rows) — it is easy to forget the same trap applies to *any* future classifier change, not just the one it was originally built for.
**How to avoid:** Bump `HUMBLE_CLASSIFIER_VERSION` (Pattern 2). Verify with an integration test: seed `humbleLibraryStore` with a pre-Phase-12-shaped cache entry (no `steamAppId` field, `classifierVersion` unset or `2`), run `sync()`, and assert every key was re-fetched and re-classified with `steamAppId` populated.
**Warning signs:** A live/staged account with pre-existing REDEEMED keys shows no "Owned on Steam" badge and no GamePage annotation after this phase ships, even though a brand-new sync (from a freshly-connected account) works correctly.

### Pitfall 3: Overwriting `ownedElsewhere` unconditionally on every recompute silently violates D-48

**What goes wrong:** A naive `recomputeOwnership()` that always writes fresh values — including when `steamLibraryStore.get('games', [])` returns `[]` because Steam is disconnected or its CM session is stale — would flip every previously-owned key back to `owned_elsewhere: false`, stripping Phase 14's C2 hard-block protection exactly when it matters least conveniently (mid-session Steam hiccup).
**Why it happens:** "Recompute" reads naturally as "always overwrite," and an empty Steam library list is not distinguishable from "genuinely owns nothing" without an explicit connectivity check.
**How to avoid:** Gate the recompute's *write* side on Steam actually being connected (e.g., `SteamUser.isLoggedIn()`) before running the pass at all; a disconnected/stale Steam session should make the recompute call a complete no-op, leaving every existing `ownedElsewhere`/`matchConfidence` value on cached `HumbleKey` rows untouched.
**Warning signs:** Toggling Steam's session to a simulated-expired state and calling the recompute trigger flips previously-`true` `ownedElsewhere` flags to `false` in a test.

### Pitfall 4: Overrides not exempted from the disconnect wipe regress a user's correction

**What goes wrong:** If the new override store is added as just another `CacheStore` without also adding it to the disconnect-survival exemption list, a user who corrected a false-positive fuzzy match ("Not the same game") would see that correction silently disappear on their next Humble reconnect — the match would re-fire and (per D-43's stated concern) could re-block a genuinely-needed key claim in Phase 14.
**Why it happens:** `HumbleUser.disconnect()` (in `user.ts`) explicitly clears `humbleLibraryStore` and `humbleSyncStore` but deliberately does NOT touch `humbleRevealedStore` (D-04/D-30) — a new store added without the same care defaults to being swept up by a careless "clear everything Humble-related" refactor, or simply forgotten because the exemption is opt-in, not opt-out.
**How to avoid:** Add `humbleOwnershipOverrideStore` (or similarly named) in `electronStores.ts` immediately next to `humbleRevealedStore` with an explicit comment cross-referencing D-43, and confirm in `user.ts`'s `disconnect()` that it is not among the stores cleared.
**Warning signs:** A test that sets an override, calls `disconnect()`, and then asserts the override still reads back correctly fails.

### Pitfall 5: Re-pushing `humbleKeysUpdated` after the dedup mutation is easy to forget

**What goes wrong:** If the dedup pass mutates `humbleLibraryStore`'s cached rows but the caller (`library.ts` or the `refreshLibrary`-triggered recompute) does not also call `sendFrontendMessage('humbleKeysUpdated', getKeys())` afterward, the renderer's `humble.keys` context array (and therefore the Keys-page badge and the GamePage annotation) would only reflect the *stale* pre-dedup state until the next unrelated event happens to re-push it (e.g. the next full sync).
**Why it happens:** `library.ts`'s existing sync flow already calls `sendFrontendMessage('humbleKeysUpdated', getKeys())` progressively per committed order (D-26) — it is easy to assume this single call already covers the post-dedup state, when the dedup pass, if it runs as a distinct final step after all orders commit, needs its own explicit push.
**How to avoid:** Ensure the dedup pass's caller re-pushes `humbleKeysUpdated` once after the full recompute completes (both from the end-of-sync path and from the Steam-refresh-triggered path in `main.ts`).
**Warning signs:** The Keys page shows correct state groups but the "Owned on Steam" badge only appears after a manual app restart or an unrelated re-sync, not immediately after the Steam library that made the match possible finished refreshing.

## Code Examples

### Extended `HumbleKey` type

```typescript
// Source: src/common/types/humble.ts (existing interface, extend in place)
export interface HumbleKey {
  gamekey: string
  machineName: string
  state: HumbleKeyState
  title: string
  platform: string
  expiration: string | null
  origin: string
  /**
   * Phase 12 (HDEDUP-01): Steam AppID as carried directly by the Humble
   * order-detail API for platform==='steam' tpks (confirmed present in the
   * live payload — Phase 10's validation.ts already checks its presence
   * as a boolean). Absent for non-Steam-platform keys and for pre-Phase-12
   * cached rows until the one-time backfill (HUMBLE_CLASSIFIER_VERSION bump)
   * re-fetches them.
   */
  steamAppId?: string
  /**
   * Overlay flag, orthogonal to `state` (spec §2.3) — NEVER influences
   * classification precedence and is NEVER read by classify.ts. Set by
   * dedup.ts, persisted directly onto this cached row.
   */
  ownedElsewhere: boolean
  /**
   * D-41: provenance of the ownedElsewhere verdict, so the UI can render
   * "Owned on Steam" (exact) vs "Likely owned on Steam" (fuzzy), and so
   * Phase 14's C2 guard can treat a fuzzy false positive more gently than
   * an exact match. 'none' when ownedElsewhere is false or not yet computed.
   */
  matchConfidence: 'exact' | 'fuzzy' | 'none'
}
```

### Override store (mirrors `humbleRevealedStore` exactly)

```typescript
// Source: src/backend/humble/electronStores.ts (existing pattern, add alongside)
// D-42/D-43: keyed by machine_name, exactly like humbleRevealedStore. NEVER
// cleared by HumbleUser.disconnect() — a user's "Not the same game"
// correction must survive a disconnect/reconnect cycle (D-43 extends the
// exact D-04/D-30 exemption that already protects humbleRevealedStore).
const humbleOwnershipOverrideStore = new CacheStore<
  { overriddenAt: number },
  string
>('humble_ownership_override', null)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Playnite's `HumbleKeysLibrary` imports every Humble key as a separate library entry, with no dedup against owned platforms | GameLib collapses a matched REDEEMED Steam key onto its existing Steam library entry, annotated with Humble origin | This phase (HDEDUP-02) | Materially better UX than any surveyed existing Humble integration tool — this project's own prior research (`FEATURES.md` Q2) explicitly notes this is "a genuine gap in the ecosystem," not a solved problem being re-implemented |
| Community-norm 70% `token_set_ratio` threshold for Humble ownership fuzzy matching | 85%+ threshold with a length-sensitive (non-token-set) algorithm and an explicit DLC-keyword guard | Locked in this project's v0.3 decisions (`STATE.md`: "Fuzzy-name fallback at 85%+ threshold (not community-norm 70%)") and refined in this research (algorithm family, not just threshold) | Both the threshold AND the underlying algorithm family diverge from what most community Humble tools do — this is a deliberate, documented improvement, not an oversight |

**Deprecated/outdated:** N/A — this phase introduces new functionality rather than replacing an existing one.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fastest-levenshtein` is the right primitive to build the normalized similarity ratio on, rather than a token-based library or a fully hand-rolled implementation | Standard Stack, Architecture Pattern 3 | If a future finding shows token-based matching (with a much stricter guard) actually produces fewer false negatives without reintroducing the DLC risk, the algorithm choice — not just the threshold — would need revisiting. Low risk: the recommendation is conservative (biased toward fewer false positives, which is the locked priority per D-44/HDEDUP-01 success criterion 3) |
| A2 | The specific edition-suffix list and DLC-keyword list in Pattern 3's code example are complete enough for real-world Humble/Steam title variance | Architecture Pattern 3, Code Examples | An incomplete suffix/keyword list could let a real title variant slip through as a false positive or false negative that the unit-test fixtures (drawn from this project's own prior research) don't happen to cover. Low-medium risk: `matchConfidence: 'fuzzy'` + the D-42 override are the designed safety valve for exactly this residual risk, so a wrong verdict is user-correctable and Phase 14's C2 guard treats fuzzy matches more gently |
| A3 | Gating the recompute's write side on `SteamUser.isLoggedIn()` is a sufficient and correct proxy for "Steam data is fresh enough to trust" (D-48) | Common Pitfalls (Pitfall 3) | If `isLoggedIn()` can return true while `steamLibraryStore` is still empty/stale for some other reason (e.g., mid-first-sync), the recompute could still incorrectly zero out flags in a narrow window. Medium risk: should be confirmed/hardened during planning — an additional `steamLibraryStore.get('games', []).length > 0` check as a second gate is cheap insurance |
| A4 | `steam_app_id` is always attached only to `key_type === 'steam'` tpks, never to other platforms' tpks under a different field name | Architecture Pattern 4 | If Humble's undocumented API occasionally attaches a Steam AppID to a non-Steam-labeled tpk (bundle cross-listing edge case), a small number of non-Steam keys could bypass the fuzzy path unexpectedly. Low risk given `key_type` is already the established platform label throughout Phase 11's code; no evidence contradicts this assumption, but it is unverified against a live capture of a non-Steam order specifically |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Should the DLC-keyword guard also fire when the SHORTER title is the one containing a DLC keyword (reverse direction)?**
   - What we know: Pattern 3's guard checks only "does the longer title contain a DLC keyword the shorter one lacks" — this covers the documented risk (base game ⊂ DLC title).
   - What's unclear: whether any real title pattern has the reverse shape (a DLC-keyword-bearing title that is *shorter* than its base-game counterpart) — seems unlikely given how DLC titles are conventionally named ("Base Game: Content Name"), but not exhaustively verified.
   - Recommendation: Keep the guard as directional (longer-contains-keyword) unless a counter-example surfaces during planning/testing; document the assumption in the unit test suite so a future title-pattern discovery is easy to add.

2. **What should `matchConfidence` be for a key matched via the AppID path that the user later overrides — does D-42's "no override on exact matches" mean the IPC handler must reject an override attempt on an exact-match row, or should the frontend simply never render the affordance?**
   - What we know: D-42 says the override "exists on fuzzy-matched rows only."
   - What's unclear: whether this is purely a UI-rendering constraint (affordance never shown for exact matches) or whether the backend IPC handler should also defensively reject an override call against a `matchConfidence: 'exact'` key (defense against a stale/malicious renderer call).
   - Recommendation: Implement both — frontend never renders the affordance for exact matches (primary UX contract), AND the backend handler validates `matchConfidence === 'fuzzy'` before persisting an override (defense in depth, consistent with this codebase's general pattern of never trusting renderer-only gating for state-changing actions).

## Environment Availability

Skipped — this phase adds no new external tool, service, or runtime dependency. All required primitives (Steam library cache, Humble key cache, the one new npm package `fastest-levenshtein`) are either already present in the repository or a standard `pnpm add` away; no CLI, database, or OS-level service needs to be probed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (project-wide, existing `jest.config.js`) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest src/backend/humble --silent` |
| Full suite command | `pnpm test:ci` (`jest --runInBand --silent`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HDEDUP-01 | AppID match is exact/final when `steamAppId` present | unit | `npx jest src/backend/humble/__tests__/dedup.test.ts -t "appid"` | ❌ Wave 0 |
| HDEDUP-01 | Fuzzy match at 85%+ threshold on normalized titles, using this project's own documented true-positive fixtures | unit | `npx jest src/backend/humble/__tests__/dedup.test.ts -t "fuzzy match"` | ❌ Wave 0 |
| HDEDUP-01 | DLC titles do NOT false-positive match base game (success criterion 3) | unit | `npx jest src/backend/humble/__tests__/dedup.test.ts -t "dlc"` | ❌ Wave 0 |
| HDEDUP-01 | UNPICKED pseudo-entries are excluded from dedup entirely | unit | `npx jest src/backend/humble/__tests__/dedup.test.ts -t "unpicked"` | ❌ Wave 0 |
| HDEDUP-01 | Recompute keeps last-known values when Steam is disconnected/stale (D-48) | unit | `npx jest src/backend/humble/__tests__/dedup.test.ts -t "keep-last-known"` | ❌ Wave 0 |
| HDEDUP-01 | Override (D-42) persists and survives disconnect (D-43) | unit | `npx jest src/backend/humble/__tests__/electronStores.test.ts -t "override"` | ❌ Wave 0 |
| HDEDUP-01 | Backfill: pre-Phase-12 cached rows get `steamAppId` after a version-bumped sync | integration | `npx jest src/backend/humble/__tests__/library.test.ts -t "classifier version"` | ✅ (extend existing `library.test.ts`, which already tests the `reclassifyAll` mechanism per Phase 11) |
| HDEDUP-02 | A confirmed-matched REDEEMED key renders the Steam-side annotation; an unmatched REDEEMED key renders a normal row with no annotation/mismatch flag (D-37) | unit (component) | `npx jest src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/backend/humble --silent`
- **Per wave merge:** `pnpm test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/backend/humble/__tests__/dedup.test.ts` — covers HDEDUP-01 (AppID/fuzzy/DLC-guard/UNPICKED-exclusion/keep-last-known)
- [ ] `src/backend/humble/__tests__/fixtures/steamGames.ts` — a small `GameInfo[]` fixture set including the documented DLC/edition-variant test titles from `PITFALLS.md`
- [ ] `src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx` — covers HDEDUP-02
- [ ] Extend `src/backend/humble/__tests__/electronStores.test.ts` (or create if it does not yet exist) — covers the new override store's disconnect-survival

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase issues no new authenticated requests (D-47: zero Humble network calls; Steam calls are Phase 2/10's existing authenticated client, unchanged) |
| V3 Session Management | no | No new session surface |
| V4 Access Control | no | Single-user local desktop app; no multi-tenant boundary |
| V5 Input Validation | yes | Title strings from the Humble API (untrusted, already zod-passthrough-tolerant per `adapter.ts`) are only ever used as **inputs to string comparison** (normalization + Levenshtein distance) — never interpolated into a shell command, file path, SQL, or regex constructed from untrusted data. The one regex construction in Pattern 3 (`new RegExp(`\\b${suffix}\\b`, 'g')`) uses a **fixed, hardcoded** suffix list, never user/API-controlled input — confirm this stays true during implementation (do not let the DLC-keyword or edition-suffix lists become dynamically extensible from any untrusted source) |
| V6 Cryptography | no | No new secret material; the override store and ownership fields are non-sensitive derived data (a boolean + a confidence label), unlike the session cookie (C4, already covered by Phase 10) |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ReDoS via a suffix/keyword regex if the list were ever made dynamic/user-extensible | Denial of Service | Keep `EDITION_SUFFIXES`/`DLC_KEYWORDS` as fixed, hardcoded, developer-controlled constants (per V5 note above) — never accept them from a config file, IPC payload, or the Humble API response itself |
| Stale ownership data misleading Phase 14's C2 guard (a false `ownedElsewhere: false` after a Steam hiccup) | Tampering (of decision-relevant state, not of data confidentiality) | D-48's keep-last-known behavior (Pitfall 3) — this is the security-relevant control for this phase, framed in product terms rather than classic ASVS categories: an incorrect ownership computation has a *product-safety* consequence (wasted Humble key / Steam rate-limit exposure per C2/C3 in the parent spec), not a confidentiality/integrity-of-secrets consequence |
| Renderer trusting its own gating for the override affordance (a compromised/buggy renderer calling the override IPC on an exact-match row) | Tampering | Backend `humbleSetOwnershipOverride` handler validates `matchConfidence === 'fuzzy'` server-side before persisting (Open Question 2) — never trust renderer-only enforcement of D-42's "fuzzy rows only" rule for a state-changing IPC call, consistent with this codebase's existing discipline (e.g., `humbleCheckHealth`'s cooldown enforcement lives in the backend, not just a disabled frontend button, per Phase 11's `HUMBLE-...` cooldown lesson) |

## Sources

### Primary (HIGH confidence — direct codebase inspection this session)
- `src/common/types/humble.ts` — current `HumbleKey`/`HumbleOrderCacheEntry`/`HumbleValidationReport` shapes; confirmed no `steamAppId`/`ownedElsewhere` fields exist yet
- `src/backend/humble/classify.ts` — confirmed pure-function discipline, confirmed `steam_app_id` is NOT currently extracted anywhere in the classification loop
- `src/backend/humble/adapter.ts` — confirmed `OrderDetailTpkSchema` is `.passthrough()` (steam_app_id already reachable, just untyped/unused)
- `src/backend/humble/validation.ts` — confirmed `steam_app_id` presence check exists (Phase 10 live-gate), confirming the field IS present in live payloads for Steam-type keys
- `src/backend/humble/library.ts` — confirmed `HUMBLE_CLASSIFIER_VERSION`/`reclassifyAll` mechanism, confirmed sync flow and `humbleKeysUpdated` push points
- `src/backend/humble/electronStores.ts` — confirmed `humbleRevealedStore`'s disconnect-survival precedent (D-04/D-30) to mirror for the new override store
- `src/backend/humble/user.ts` (`disconnect()`, ~line 471) — confirmed exactly which stores are cleared vs. exempted on disconnect
- `src/backend/storeManagers/steam/library.ts` / `electronStores.ts` — confirmed `steamLibraryStore.get('games', [])` shape (`GameInfo[]`, `app_name` = stringified AppID) and confirmed it is importable standalone without the full `SteamLibraryManager`
- `src/backend/main.ts` (~line 959) — confirmed the generic `refreshLibrary` IPC handler as the single dispatch point for any runner's `refresh()`, including Steam
- `src/frontend/state/GlobalState.tsx` / `ContextProvider.tsx` — confirmed the existing `humble.keys` context slice already delivers the full `HumbleKey[]` array to the renderer reactively
- `src/frontend/screens/Game/GamePage/index.tsx` + `components/PlatformSupport.tsx` — confirmed the "info" TabPanel pattern for `gameInfo`-prop components
- `package.json` / `pnpm-lock.yaml` — confirmed `fuse.js@6.6.2` already installed (used only in Library search, not reused for dedup — see Alternatives Considered)
- `npm view fastest-levenshtein version` / slopcheck `install` run — confirmed `1.0.16`, published 2022-08-02, `[OK]` verdict, no postinstall script

### Secondary (MEDIUM confidence — this project's own prior research, cross-referenced against the codebase)
- `.planning/research/HUMBLE-SPEC-SOURCE.md` §2.3/§2.4, F3 — ownership overlay orthogonality, `steam_app_id` field semantics
- `.planning/research/ARCHITECTURE.md` — `dedup.ts`'s intended non-coupling to `SteamLibraryManager` internals; confirmed and extended in this research
- `.planning/research/FEATURES.md` Q2 — confirms `steam_app_id` presence in the live API (per FailSpy source review) and names `token_set_ratio`/70% as the community norm this research deliberately diverges from
- `.planning/research/PITFALLS.md` Pitfall 2 — the exact false-positive/false-negative title examples reused as this phase's test fixtures; also the source of the cross-platform-matching tension resolved by D-45 (Pattern 4)
- `.planning/research/STACK.md` Risk 4 — `steam_app_id` availability confidence assessment (MEDIUM at the time, since upgraded to confirmed-present via Phase 10's live gate)
- `.planning/phases/11-library-sync-5-state-key-model/11-RESEARCH.md` — background on the classifier-version mechanism's original purpose

### Tertiary (LOW confidence — WebSearch, flagged per package-provenance rule)
- WebSearch result summarizing `fastest-levenshtein`'s npm page and benchmark claims — package name/choice tagged `[ASSUMED]` throughout this document per the package-name-provenance rule, despite the clean slopcheck verdict

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — the one new package (`fastest-levenshtein`) is `[ASSUMED]` per provenance rules despite a clean `[OK]` slopcheck verdict; every other "stack" element is zero-new-dependency reuse of already-verified project code (HIGH)
- Architecture: HIGH — every integration point (backfill mechanism, recompute trigger points, frontend context reuse, GamePage mounting pattern) was directly observed in the existing codebase, not inferred
- Pitfalls: HIGH for the backfill/persistence/disconnect-survival pitfalls (directly derived from reading the actual disconnect/sync code); MEDIUM for the fuzzy-matching-algorithm pitfall (synthesized reasoning about token-set vs. length-sensitive algorithms, not verified against a GameLib-specific authoritative source)

**Research date:** 2026-07-06
**Valid until:** 30 days (stable, no external API surface for this phase — the only decay risk is if Phase 13/14 planning reveals the fuzzy-matching algorithm choice needs revisiting, which is already flagged as Assumption A1/A2 and Open Question 1)
