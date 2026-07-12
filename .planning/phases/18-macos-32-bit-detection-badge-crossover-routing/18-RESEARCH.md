# Phase 18: macOS 32-bit detection, badge & CrossOver routing - Research

**Researched:** 2026-07-12 (REFRESH — supersedes the 2026-07-12 original after the Plan 18-01 empirical pivot)
**Domain:** Steam store-API `appdetails` HTML-requirements parsing (existing `axios` pattern), macOS Mach-O binary inspection (unchanged from original research), Electron/React badge UI (unchanged), extending existing Phase 17 bottle-routing logic
**Confidence:** HIGH for the min-OS heuristic's real-world payload shapes (validated live against 14 real Steam titles in this session, including all four committed 18-01 fixtures' actual `mac_requirements` strings) and HIGH for everything carried forward from the original research (Mach-O mechanics, badge UI, routing integration — all independently re-confirmed against current source, unchanged)

<why_this_refresh_exists>
## Why This Is a Refresh, Not New Research

Plan 18-01's human-run PICS `getProductInfo` dump (real captures against a **confirmed 32-bit** title, Age of Wonders III/226840, and a **confirmed 64-bit** title, Dota 2/570) proved **Steam PICS appinfo carries no field distinguishing 32-bit from 64-bit macOS builds** — `config.launch[N].config.osarch` is absent on every macOS launch entry, for both games. This invalidates the original RESEARCH.md's entire pre-install detection strategy (`osarch` via `getProductInfo`, its Pattern 1/2, Pitfalls 1/2, Assumption A1). See `18-CONTEXT.md`'s `<execution_update>` block and `18-01-SUMMARY.md` for the full evidence trail.

**This document replaces the original 18-RESEARCH.md in full.** It:
1. Researches the new pre-install source — Steam store-API `mac_requirements` minimum-OS heuristic ("direction B").
2. Carries forward, re-verified against current source, everything that still stands: the post-install Mach-O ground-truth check (Plan 18-03), the badge (Plan 18-04), and the `isBottleEligible()` routing integration.
3. Contains **no** `osarch`/`parseOsArchHint`/`getProductInfo`-as-arch-source guidance — that approach is retired.

**Pattern/Pitfall numbering below is deliberately preserved from the original document where Plans 18-03/18-04 cite it by number** (`Pattern 4`, `Pattern 5`, `Pitfall 4`, `Open Question #1`, and specific Anti-Pattern phrases) — those plans' `<read_first>` pointers must continue to resolve correctly against this refreshed file.
</why_this_refresh_exists>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (original — largely superseded by the Execution Update below; kept for traceability)

**Arch data source — DEAD, do not implement.**
~~Read architecture from PICS appinfo via `steam-user` `getProductInfo`... Field path: `apps[appid].appinfo.config.launch[N].config.osarch`~~ — **invalidated by Plan 18-01's empirical dump.** See Execution Update.

**The false-flag trap (LOCKED — still drives the whole design, source changed)**
- Steam's manual `osarch` developer-set metadata is unreliable — this is *why* PICS was abandoned, not just a caveat about it. The successor heuristic (store-API min-OS) has its own, different false-flag risk (a low min-OS does NOT prove 32-bit) and the same governing rule applies: **never assert 32-bit from a heuristic that only proves a floor.**
- Documented false-positive titles under the old rule: A Hat in Time, Metro: Last Light, BattleBlock Theater (flagged 32-bit by Steam's own `osarch` convention but run fine). A Hat in Time is now also a *direction-B* edge case: real min-OS is 10.11.6 (≤10.14 bucket → `'unknown'`), so the new heuristic correctly does NOT assert 32 for it either — see Pattern 1.

**Hybrid detection rule — pre-install branch SUPERSEDED, post-install branch UNCHANGED.**
Pre-install (was PICS-only; now store-API-only, see Execution Update Pattern 1):
- min-OS ≥ 10.15 (Catalina) → `mac_arch: '64'` (confident).
- min-OS ≤ 10.14, or unparseable/absent → `mac_arch: 'unknown'` + soft hint.
- **Never `'32'` pre-install.**

Post-install ground truth (UNCHANGED — Plan 18-03 stands as-is):
- After a native macOS install, inspect the installed Mach-O header (`lipo -archs` / `file`) on the `.app` binary.
  - i386-only → re-route to bottle (Windows depot); warn; cache result.
  - x86_64 / arm64 present → confirmed native; cache result.

**Routing integration (LOCKED — unchanged)**
- Plug into the existing `isBottleEligible()` (`src/backend/storeManagers/steam/games.ts:451`) / D-11 path — 32-bit-confirmed becomes another reason `isBottleEligible()` returns true on macOS. Routes the game's Windows depot under CrossOver, NOT the 32-bit mac binary.
- Non-macOS hosts: unchanged.
- **Pre-install now NEVER yields `'32'`, so this OR-branch only ever fires from the post-install Mach-O verdict — the branch itself is unchanged code.**

**`oslist` parsing (LOCKED, but now MOOT)** — was PICS-specific; direction B doesn't read `oslist` at all. No action needed.

**UI (LOCKED — unchanged, Plan 18-04 stands)**
- OS logo beside the game logo in the left panel; a "32" mark on 32-bit mac builds.
- The "32" treatment is escalated to an actionable warning ONLY when the host OS is macOS.

### Execution Update (2026-07-12) — the operative design, supersedes conflicting text above

**Pre-install source = Steam store-API `mac_requirements` minimum-OS heuristic**, read from the exact same `appdetails` response the codebase already fetches for `is_mac_native` (`games.ts:274`, `STEAM_STORE_API` at `games.ts:38`) — **no new network call, no `steam-user`/PICS involvement at all** for this signal (see Pattern 1/2 below; this is a research finding beyond what CONTEXT.md specified — the original `ensureMacArchHint()` design assumed a *separate* fetch was needed, which turns out to be unnecessary).

- min-OS ≥ 10.15 (Catalina) ⟹ `mac_arch: '64'` (CONFIDENT).
- min-OS ≤ 10.14, or unparseable/absent ⟹ `mac_arch: 'unknown'` + SOFT hint. **NEVER assert `'32'` pre-install.**
- Store-API OS strings are inconsistent HTML — validated live in this session against 14 real titles (Pattern 1 below has the full corpus and the parsing algorithm).

**Cache source enum:** `mac_arch_source: 'osarch' | 'macho'` (18-01, type-only, never written at runtime) → **`'minos' | 'macho'`**. No data migration needed — 18-01 only added the TS type; nothing has ever been persisted to `steamMetadataStore` with `mac_arch_source: 'osarch'` (18-02 never executed).

**Post-install ground truth (Plan 18-03) — UNCHANGED, re-verified against current source in this session, still the only path that ever asserts `'32'`.**

**Badge (Plan 18-04) — UNCHANGED, re-verified against current source in this session.**

### Claude's Discretion
- Exact placement of the new min-OS parser functions (this research recommends `games.ts`, colocated with the existing sibling `parseSteamStorageRequirement` — see Pattern 1's rationale; the original PICS-based design put its parser in `library.ts`, which no longer applies).
- Whether to gate min-OS computation on `is_mac_native === true` (this research recommends yes — see Pitfall 2).
- Badge component location, icon assets, and styling — unchanged from original, still discretionary.
- Caching key/shape for the resolved arch verdict — unchanged, `steamMetadataStore` per-appId entry.

### Deferred Ideas (OUT OF SCOPE)
- Generalizing the OS/arch badge to GOG/Epic mac builds — out of scope for V1.
- Linux 32-bit multilib surfacing — Proton/Steam handle it; not this phase.
- V2 (documented, not this phase): definitive pre-install detection via mac-depot Mach-O magic peek (steam-user depot manifest + partial chunk download) — heavy, owned-games-only, not worth V1 cost over the min-OS heuristic + Mach-O backstop combination.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md, unmodified) | Research Support (updated for direction B) |
|----|-------------|------------------|
| MAC32-01 | A Steam game's macOS build architecture is read from PICS appinfo... *(text predates the pivot — the operative source is now the store-API min-OS heuristic, same requirement intent: produce a pre-install arch signal on `GameInfo`, never asserting 32-bit from a missing/weak signal)* | Pattern 1 (`parseSteamMacMinOSVersion`/`macArchFromMinOS`, marquee), Pattern 2 (inline hook — no new async call needed), Pitfall 1 (HTML format variety), Pitfall 2 (`is_mac_native`/`mac_requirements` divergence), Pitfall 3 (never assert 32 from a floor-only signal), Code Examples, Validation Architecture row 1 |
| MAC32-02 | On macOS, a game whose mac build is confirmed 32-bit is bottle-eligible... extends `isBottleEligible()`/D-11. | Pattern 3 (`isBottleEligible()` extension — unchanged code, now fed only by Mach-O verdicts pre-`'32'`), Validation Architecture row 2-3 |
| MAC32-03 | After a native macOS install of a game with unknown/64-bit signal, GameLib inspects the installed Mach-O binary as ground truth; i386-only is re-routed and cached. | Pattern 4 (Mach-O invocation, UNCHANGED), Pattern 5 (binary location, UNCHANGED), Pitfall 4 (`lipo` availability, UNCHANGED), Pitfall 5 (post-hoc correction state gap — RESOLVED via CONTEXT D-6/Plan 18-03 Task 3), Open Question 1 (RESOLVED), Validation Architecture row 4-5 |
| MAC32-04 | The left-panel game view shows an OS logo beside the game logo with a "32" mark on 32-bit macOS builds; escalated to actionable warning only on a macOS host. | Architecture Diagram (UI section, UNCHANGED), Recommended Project Structure (`MacArchBadge.tsx`, UNCHANGED), Validation Architecture row 6-7 |
</phase_requirements>

## Summary

Plan 18-01's real appinfo captures proved Steam PICS appinfo has no mac-arch signal at all — the entire pre-install half of the original design is unimplementable. This refresh researches the replacement: the Steam store-API `mac_requirements.minimum` field, an HTML blob already fetched by the codebase's existing `appdetails` call (`games.ts:223`, the same call that derives `is_mac_native` from `platforms.mac`). **This is not a new network dependency — it's a new field read off a response GameLib already has in hand.** The engineering surface shrinks relative to the original design: no `steam-user`/PICS involvement, no new `ensureMacArchHint()` async method, no new await-before-`isBottleEligible()` wiring (the existing `ensurePlatformsCaptured()` → `fetchMetadataIfNeeded()` chain already runs before every `isBottleEligible()` consultation, and this refresh's Pattern 2 slots the min-OS derivation directly inside that existing call).

The core research problem — and the reason this can't be a one-line regex — is that `mac_requirements.minimum` HTML is **wildly inconsistent** across the catalog. This session live-fetched and cross-checked 14 real titles' actual `mac_requirements` strings (see Pattern 1's corpus table) and found at least five distinct structural shapes: the canonical `<li><strong>OS:</strong> value<br></li>` bullet, a label-and-value co-located inside one `<strong>` tag (Terraria: `<strong>OS: OSX 10.9.5 - 10.11.6</strong>`), completely tagless run-on prose with no delimiter at all (Portal: `OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM, NVIDIA...`), a version *range* rather than a single figure, and — for a real, non-trivial fraction of the catalog — `mac_requirements: []` (an empty array, not an object at all: Elder Scrolls III: Morrowind GOTY and PAYDAY 2 both return this). A parser that isn't robust to all five shapes will either throw, silently misclassify, or (worst case) leak an unrelated numeric spec (RAM/GHz figures) into the version comparison and produce a false "Catalina-or-newer" verdict for an old 32-bit game. Pattern 1 below gives a segment-isolation-then-minimum-version-extraction algorithm validated against the full 14-title corpus, including every edge shape found.

A second, previously-undocumented real-world finding from this session's live verification: **`platforms.mac` (which drives `is_mac_native`) and `mac_requirements` presence can diverge for the same title.** Half-Life 2 (220) and A Hat in Time (253230) — both in the 18-01 fixture set — currently report `platforms.mac: false` in the *live* store API, even though `mac_requirements.minimum` is still populated and PICS appinfo (the 18-01 fixtures) still carries a `macos` launch entry for both. Steam's store listing has apparently been updated to no longer market a mac version for these older titles, while the underlying depot/requirements data lingers. This matters for scoping the new parser's call site — see Pitfall 2.

**Primary recommendation:** Add `parseSteamMacMinOSVersion()` and `macArchFromMinOS()` as pure functions in `games.ts` (colocated with the existing `parseSteamStorageRequirement`, which already establishes the "parse a `*_requirements.minimum` HTML blob with a bounded regex, never eval/render it" convention this phase should mirror exactly — T-06-02 precedent). Derive `mac_arch` **inline inside the existing `fetchMetadataIfNeeded()`** method, right next to where `is_mac_native` is already derived (`games.ts:274`), gated so it never overwrites a Mach-O-verified (`mac_arch_verified: true`) entry. No new async call, no new `SteamUser`/PICS import in `games.ts`. Everything else — `isBottleEligible()`'s OR-branch, the Mach-O ground-truth check, and the badge — is unchanged from the original research and re-verified against current source in this session.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parse `mac_requirements.minimum` min-OS hint | API / Backend (Electron main) | — | Reuses the existing `axios`-based `appdetails` fetch already in `games.ts`; no renderer or CM-client involvement (CHANGED from original: no longer requires the authenticated `steam-user` CM client at all) |
| Cache the resolved arch verdict | Database / Storage (electron-store) | Backend (in-memory `library` Map) | Unchanged — same `steamMetadataStore` / in-memory `library` dual-cache pattern as `is_mac_native` |
| Mach-O ground-truth inspection (`lipo`/`file`) | Backend (Electron main, `child_process`) | — | Unchanged from original research |
| Bottle-routing decision (`isBottleEligible()`) | Backend (Electron main) | — | Unchanged — same single source of truth |
| OS/arch badge render | Frontend (React, renderer process) | — | Unchanged — pure presentational |
| Host-OS actionability gate | Frontend (React) | — | Unchanged |

## Standard Stack

### Core

No new packages — and the dependency footprint is actually **smaller** than the original (dead) design, which would have been this phase's first-ever runtime use of `steam-user`'s `getProductInfo`. Direction B needs nothing beyond what `games.ts` already imports.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `axios` | 1.13.5 [VERIFIED: package.json] | Fetch `appdetails` (already happening; this phase reads one more field off the same response) | Already the exact call site (`games.ts:223`) that derives `is_mac_native`; `data.mac_requirements` sits alongside `data.platforms` and `data.pc_requirements` in the same JSON payload — confirmed live in this session (see Pattern 1 corpus) |
| Node built-in `RegExp`/string methods | built-in | Bounded HTML-substring extraction for the min-OS heuristic | Mirrors the exact `parseSteamStorageRequirement` convention already in `games.ts:73-91` (bounded regex, never eval/render — T-06-02) |
| Node `child_process` (`spawnSync`/`execFileSync`) | built-in | Mach-O `lipo -archs` / `file` invocation — UNCHANGED from original research | Zero-dependency; codebase already uses this pattern 3x in `library.ts` |

**Not needed for this phase (dropped from the original design):** `steam-user`, `@types/steam-user`. Both remain installed for the rest of the codebase (Steam CM auth, `getOwnedApps()`), but MAC32-01 no longer touches either.

**Installation:** none — nothing new to install.

**Version verification:**
```bash
$ npm view axios version
1.13.5
```
Matches the version already pinned in `package.json` (`^1.13.5`) and already present in `node_modules/`.

### Supporting Libraries (no new installs required)

| Library | Already Present | Role in this phase |
|---------|-----------------|----------------------|
| `axios` | Yes (`games.ts:1`) | The single `appdetails` GET already made by `fetchMetadataIfNeeded` — no second call |
| `graceful-fs` (`existsSync`, `readdirSync`) | Yes (`library.ts`) | Locate the installed `.app` bundle for the Mach-O check (unchanged) |
| `child_process` (`execFileSync`) | Yes (`library.ts`) | Run `lipo -archs`/`file` (unchanged) |
| `electron-store` (via `CacheStore`/`TypeCheckedStoreBackend`) | Yes (`electronStores.ts`) | Persist `mac_arch` on `SteamMetadataCacheEntry` (unchanged, `mac_arch_source` enum value changes) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Store-API `mac_requirements` min-OS heuristic | PICS `osarch` (original design) | **Rejected — empirically proven not to exist as a signal** (Plan 18-01 real captures). Not a tradeoff decision, a dead end. |
| Store-API `mac_requirements` min-OS heuristic | Steamworks Web API `GetAppList`/other public endpoints | No other public Steam endpoint exposes architecture or OS-version requirements at all; `appdetails` is the only source with any bitness-adjacent signal, and only indirectly (a min-OS floor, not a direct arch field) |
| Regex/substring HTML parsing | An HTML parser library (e.g. `cheerio`) | Rejected — the codebase's own precedent (`parseSteamStorageRequirement`) already establishes bounded-regex-on-a-known-narrow-HTML-fragment as sufficient and safer (no new dependency, no DOM construction of untrusted content); a full HTML parser is overkill for a single bulleted field and would be the first HTML-parsing dependency in the module |
| `lipo -archs` | `file <binary>` (parse text output) | Unchanged from original research — `lipo` primary, `file` fallback |

## Package Legitimacy Audit

No external packages are installed by this phase. `axios`, `child_process` (built-in), and `electron-store` are already direct dependencies used elsewhere in the Steam store manager. The Package Legitimacy Gate is not applicable — skipping per its own scope.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ PRE-INSTALL (direction B — reuses the EXISTING appdetails fetch,     │
│              no new network call, no steam-user/PICS involvement)    │
│                                                                        │
│  install()/launch()/uninstall() [games.ts]                           │
│        │                                                              │
│        ▼                                                              │
│  ensurePlatformsCaptured()  ◄── EXISTING, UNCHANGED — awaits          │
│        │                        fetchMetadataIfNeeded() before        │
│        │                        isBottleEligible() is consulted       │
│        ▼                                                              │
│  fetchMetadataIfNeeded()  [games.ts:207]  ◄── EXISTING method,        │
│        │                    EXTENDED (not replaced) with the          │
│        │                    mac_arch derivation below                 │
│        ▼                                                              │
│  axios.get(STEAM_STORE_API?appids=...)  ◄── EXISTING call, line 223  │
│        │  data.platforms.mac      → is_mac_native (EXISTING, :274)   │
│        │  data.mac_requirements.minimum → macArchFromMinOS()  ◄── NEW │
│        ▼                                                              │
│  parseSteamMacMinOSVersion(minHtml)  ◄── NEW pure function, games.ts │
│        │  isolates the "OS:" segment across 5 observed HTML shapes   │
│        │  extracts the LOWEST X.Y(.Z) version token found            │
│        │  falls back to a named-codename map if no digit found       │
│        │  returns null when nothing extractable                      │
│        ▼                                                              │
│  macArchFromMinOS(minHtml) → '64' | 'unknown'  ◄── NEW, NEVER '32'   │
│        │  ≥10.15 (Catalina)   → '64' (confident)                     │
│        │  ≤10.14/unparseable  → 'unknown' (soft hint)                │
│        ▼                                                              │
│  steamMetadataStore.set(appId, { ...meta, mac_arch, mac_arch_source: │
│    'minos' })  ◄── SKIPPED entirely if mac_arch_verified===true       │
│        │            (a Mach-O ground truth NEVER regresses)           │
│        ▼                                                              │
│  isBottleEligible()  [games.ts:451]  ◄── UNCHANGED CODE — the         │
│        │                  mac_arch==='32' OR-branch now simply        │
│        │                  never fires pre-install (min-OS heuristic   │
│        │                  never asserts '32'); it fires ONLY from a   │
│        │                  cached post-install Mach-O verdict          │
│        ▼                                                              │
│  '64'/'unknown' → native install proceeds normally (unless a prior    │
│  Mach-O correction already cached '32' — then bottle, as before)      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ POST-INSTALL (ground truth, filesystem-only, macOS native path only) │
│ UNCHANGED FROM ORIGINAL RESEARCH — Plan 18-03 stands as-is            │
│                                                                        │
│  pollInstallOnce() [library.ts:687, result.state==='installed']      │
│        │  (native source only — bottle-sourced installs are Windows  │
│        │   depots, never Mach-O; skip when source==='bottle')        │
│        ▼                                                              │
│  verifyMacArchGroundTruth(appId, installPath, source)  ◄── Plan 18-03│
│        │  skip if mac_arch already '32' (nothing to correct)         │
│        │  skip if not macOS host                                     │
│        ▼                                                              │
│  locateMachOBinary(installPath)  ◄── Plan 18-03 (Pattern 5)          │
│        │  scan installPath for *.app, read launch executable,        │
│        │  or fall back to Contents/MacOS/<first file>                │
│        ▼                                                              │
│  execFileSync('lipo', ['-archs', binaryPath])  ◄── argv-form, no shell│
│        │  "i386" only            → mac_arch = '32' (CORRECTION)      │
│        │  "x86_64"/"arm64" present → mac_arch = '64' (confirmed)     │
│        ▼                                                              │
│  steamMetadataStore.set(appId, { ...meta, mac_arch: verdict,         │
│    mac_arch_source: 'macho', mac_arch_verified: true })               │
│        │                                                              │
│        ▼ (only when verdict flipped to '32')                         │
│  Open Question #1 (RESOLVED, CONTEXT D-6 / Plan 18-03 Task 3):       │
│  prompt user → forceUninstall() → bottle re-install                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ UI (renderer process) — UNCHANGED FROM ORIGINAL RESEARCH,             │
│ Plan 18-04 stands as-is                                               │
│                                                                        │
│  GameInfo.mac_arch pushed via sendFrontendMessage('pushGameToLibrary')│
│        │                                                              │
│        ▼                                                              │
│  GamePage's .mainInfo panel (index.tsx:487-496)                      │
│        │  <GamePicture .../>  +  <div className="store-icon">        │
│        ▼                                                              │
│  <MacArchBadge gameInfo={gameInfo} isMac={isMac} /> rendered as a     │
│  sibling of .store-icon, gated on gameInfo.mac_arch === '32'          │
│        │  escalate to actionable/warning styling only when isMac      │
│        │  (host OS === darwin) — informational otherwise              │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/backend/storeManagers/steam/
├── games.ts          # CHANGED FROM ORIGINAL: parseSteamMacMinOSVersion() +
│                       #   macArchFromMinOS() live HERE (colocated with the
│                       #   sibling parseSteamStorageRequirement, both parse
│                       #   *_requirements.minimum HTML off the same appdetails
│                       #   response). Derivation is INLINE inside the existing
│                       #   fetchMetadataIfNeeded() — no new ensureMacArchHint()
│                       #   method, no new steam-user import. isBottleEligible()
│                       #   extension (mac_arch==='32' OR-branch) is UNCHANGED
│                       #   CODE — already correct, just now fed differently.
├── library.ts         # UNCHANGED FROM ORIGINAL RESEARCH: machOArchsOf(),
│                       #   verdictFromArchs(), locateMachOBinary(),
│                       #   verifyMacArchGroundTruth(); pollInstallOnce() hook.
│                       #   (Plan 18-03 — no PICS/osarch parser ever belonged
│                       #   here even in the original design's Wave-0 sense;
│                       #   this file's mac-arch surface was always Mach-O-only.)
├── electronStores.ts  # SteamMetadataCacheEntry.mac_arch_source:
│                       #   'osarch' | 'macho'  →  'minos' | 'macho'
│                       #   (type-only change; no runtime data to migrate)
└── __tests__/
    ├── games.test.ts        # EXTEND: new describe('parseSteamMacMinOSVersion')
    │                         #   / describe('macArchFromMinOS') block placed
    │                         #   next to the existing describe('parseSteam
    │                         #   StorageRequirement') at line 1327 (same file,
    │                         #   same convention — no new macArch.test.ts file
    │                         #   needed, unlike the original PICS design which
    │                         #   recommended a dedicated file for osarch fixtures)
    │                         # EXTEND: existing describe('SteamGame.fetchMeta
    │                         #   dataIfNeeded...') and isBottleEligible/bottle
    │                         #   routing describes (lines 561/630/856) with a
    │                         #   mac_arch case — UNCHANGED test target, just
    │                         #   fed via mac_requirements fixtures instead of
    │                         #   PICS fixtures
    └── library.test.ts      # UNCHANGED — Mach-O + verifyMacArchGroundTruth
                              #   tests belong here per Plan 18-03, untouched
                              #   by this refresh

src/common/types.ts
    # UNCHANGED — GameInfo.mac_arch?: '32' | '64' | 'unknown' already added
    # by 18-01; no further change needed.

src/frontend/screens/Game/GamePage/components/
├── MacArchBadge.tsx   # UNCHANGED FROM ORIGINAL — Plan 18-04
└── index.tsx           # UNCHANGED

src/frontend/screens/Game/GamePage/
├── index.tsx           # UNCHANGED
└── index.css            # UNCHANGED
```

### Pattern 1: `parseSteamMacMinOSVersion` / `macArchFromMinOS` — the new marquee pattern

**What:** A bounded-regex parser for `appdetails.mac_requirements.minimum` HTML, mirroring the exact convention already established by `parseSteamStorageRequirement` (`games.ts:73-91`) for `pc_requirements.minimum` — extract a narrow numeric fact from a known-shaped HTML fragment without eval'ing or rendering it (T-06-02 precedent).

**The real-world format corpus (live-fetched and verified in this research session):**

| AppID | Title | `mac_requirements.minimum` (excerpt) | Extracted min version | Bucket |
|-------|-------|----------------------------|------------------------|--------|
| 226840 | Age of Wonders III [18-01 fixture: **confirmed 32-bit**] | `<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>` | 10.9.3 | `unknown` (correct — real title IS 32-bit, and the design never asserts 32 pre-install, so this stays a soft hint, not a false-negative) |
| 570 | Dota 2 [18-01 fixture: **confirmed 64-bit**] | `<li><strong>OS:</strong> macOS 10.15 or newer<br></li>` | 10.15 | `64` (correct, confident) |
| 220 | Half-Life 2 [18-01 fixture: no `osarch`] | `<li><strong>OS:</strong> Leopard 10.5.8, Snow Leopard 10.6.3, or higher<br></li>` | 10.5.8 (lowest of two alternatives) | `unknown` |
| 253230 | A Hat in Time [18-01 fixture: **documented false-flag**, real 64-bit] | `<li><strong>OS:</strong> MAC OS X 10.11.6 or higher<br></li>` | 10.11.6 | `unknown` (correct — a naive "assert 32 when uncertain" rule would have mis-routed this real 64-bit game, exactly the false-flag trap CONTEXT.md forbids) |
| 400 | Portal | `<strong>Minimum: </strong>OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM, NVIDIA...` (no interior tags at all — **tagless run-on prose**) | 10.5.8 | `unknown` |
| 620 | Portal 2 | `<li><strong>OS:</strong> MAC OS X 10.6.7 or higher<br></li>` | 10.6.7 | `unknown` |
| 105600 | Terraria | `<li><strong>OS: OSX 10.9.5 - 10.11.6</strong> <br></li>` (**label + value co-located inside one `<strong>`, range format**) | 10.9.5 | `unknown` |
| 8930 | Sid Meier's Civilization V | `<li><strong>OS:</strong> 10.12 (Sierra)<br>...` | 10.12 | `unknown` |
| 70 | Half-Life | `Minimum: OS X  Snow Leopard 10.6.3, 1GB RAM,...` (tagless, extra whitespace) | 10.6.3 | `unknown` |
| 236090 | Dust: An Elysian Tail | `<li><strong>OS:</strong> Snow Leopard 10.6.8, 32/64-bit<br>...` | 10.6.8 (the literal "32"/"64" in "32/64-bit" is NOT a version token — no dot — regex correctly ignores it) | `unknown` |
| 291550 | Brawlhalla | `<li><strong>OS:</strong> 10.7<br></li>` | 10.7 | `unknown` |
| 275850 | No Man's Sky | `<li><strong>OS:</strong> macOS Monterey 12.3<br></li>` | 12.3 (major 12 > 10 → confident regardless of minor) | `64` |
| 224760 | FEZ | `OS: Snow Leopard 10.6.8, Lion strongly recommended, 32/64-bit<br />` (tagless, uses self-closing `<br />`) | 10.6.8 | `unknown` |
| 22320 | Elder Scrolls III: Morrowind GOTY | `mac_requirements: []` (**empty array, not an object**) | — no OS field exists at all | `unknown` |
| 218620 | PAYDAY 2 | `mac_requirements: []` | — | `unknown` |

**Example implementation:**
```typescript
// Source: mirrors games.ts:73-91 parseSteamStorageRequirement's bounded-regex
// convention exactly (same file, same HTML-fragment-parsing discipline, T-06-02).
// Version corpus above [VERIFIED: live store.steampowered.com/api/appdetails
// fetch, this research session, 2026-07-12] for all 14 titles listed.

interface MacOsVersion {
  major: number
  minor: number
}

/**
 * Named macOS release codenames → major.minor, used ONLY as a fallback when
 * the isolated OS segment has no digit-based version at all. Not observed as
 * necessary in the 14-title live corpus above (every real sample had a digit
 * somewhere in the OS segment) — kept for forward compatibility with future
 * store copy that might drop numbers entirely (e.g. "macOS Sequoia" with no
 * digit). [ASSUMED — public Apple macOS release-version history, not
 * Steam-specific; well-established, low-risk fallback branch]
 */
const MACOS_CODENAME_VERSION: Record<string, MacOsVersion> = {
  sequoia: { major: 15, minor: 0 },
  sonoma: { major: 14, minor: 0 },
  ventura: { major: 13, minor: 0 },
  monterey: { major: 12, minor: 0 },
  'big sur': { major: 11, minor: 0 },
  catalina: { major: 10, minor: 15 },
  mojave: { major: 10, minor: 14 },
  'high sierra': { major: 10, minor: 13 },
  sierra: { major: 10, minor: 12 },
  'el capitan': { major: 10, minor: 11 },
  yosemite: { major: 10, minor: 10 },
  mavericks: { major: 10, minor: 9 },
  'mountain lion': { major: 10, minor: 8 },
  lion: { major: 10, minor: 7 },
  'snow leopard': { major: 10, minor: 6 },
  leopard: { major: 10, minor: 5 }
}

function extractVersionTokens(text: string): MacOsVersion[] {
  // Matches "10.15", "10.9.3", "12.3" — deliberately requires a literal dot,
  // so bare numbers like "32" (from "32/64-bit") or "1" (from "1GB RAM")
  // never false-match (verified against the Dust: An Elysian Tail /
  // "32/64-bit" corpus entry above).
  const matches = [...text.matchAll(/\b(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?\b/g)]
  return matches.map((m) => ({ major: Number(m[1]), minor: Number(m[2]) }))
}

/**
 * Parses the Steam appdetails `mac_requirements.minimum` HTML/text blob and
 * returns the LOWEST macOS version evidenced in it — i.e. the true minimum
 * requirement, even when the string lists multiple named releases as
 * alternatives ("Leopard 10.5.8, Snow Leopard 10.6.3, or higher" means
 * "10.5.8 or higher", not "10.6.3 or higher").
 *
 * Returns null when nothing extractable — callers MUST treat null as
 * 'unknown', mirroring parseSteamStorageRequirement's undefined-on-no-match
 * convention. The HTML is never eval'd or rendered (T-06-02).
 */
export function parseSteamMacMinOSVersion(
  htmlOrText: string | undefined
): MacOsVersion | null {
  if (!htmlOrText || typeof htmlOrText !== 'string') return null

  // Isolate the "OS" segment. Handles all 5 observed shapes:
  //  a) '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
  //  b) '<strong>OS: OSX 10.9.5 - 10.11.6</strong>' (label+value co-located)
  //  c) 'OS: Snow Leopard 10.6.8, ...<br />' (no <li>/<ul> wrapper)
  //  d) 'OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM,...'
  //     (fully tagless — no delimiter after the OS clause at all)
  //  e) 'mac_requirements: []' — caller never invokes this fn (guarded by
  //     optional chaining at the call site: data?.mac_requirements?.minimum)
  const labelMatch = htmlOrText.match(/OS\s*X?\s*:?\s*([^<]*)/i)
  if (!labelMatch) return null

  let segment = labelMatch[1]
  // Bound the tagless case (d): stop at the next competing spec keyword so
  // a Processor/Memory figure never bleeds into the version extraction.
  const stopIdx = segment.search(
    /\b(processor|cpu|memory|ram|graphics|gpu|storage|network|additional)\b/i
  )
  if (stopIdx > -1) segment = segment.slice(0, stopIdx)

  const versions = extractVersionTokens(segment)
  if (versions.length > 0) {
    return versions.reduce((min, v) =>
      v.major < min.major || (v.major === min.major && v.minor < min.minor)
        ? v
        : min
    )
  }

  const lowerSegment = segment.toLowerCase()
  for (const [name, version] of Object.entries(MACOS_CODENAME_VERSION)) {
    if (lowerSegment.includes(name)) return version
  }

  return null
}

/**
 * MAC32-01 (direction B): the pre-install arch signal. NEVER returns '32' —
 * a low min-OS proves nothing about bitness (A Hat in Time: min-OS 10.11.6,
 * genuinely 64-bit — see corpus above). Catalina's 32-bit removal only
 * proves a FLOOR: min-OS >= 10.15 implies the binary MUST be 64-bit (Apple
 * physically cannot run i386 on 10.15+), but min-OS < 10.15 implies nothing
 * either way.
 */
export function macArchFromMinOS(
  minHtml: string | undefined
): '64' | 'unknown' {
  const v = parseSteamMacMinOSVersion(minHtml)
  if (!v) return 'unknown'
  const isCatalinaOrNewer = v.major > 10 || (v.major === 10 && v.minor >= 15)
  return isCatalinaOrNewer ? '64' : 'unknown'
}
```

**Fixture-validation plan:** Write `games.test.ts` unit tests using the LITERAL real `mac_requirements.minimum` strings captured live in this session (the corpus table above) as fixtures — not synthetic guesses. This mirrors the existing `describe('parseSteamStorageRequirement', ...)` block's own convention (`games.test.ts:1327`) of testing against realistic HTML shapes. At minimum, cover: (1) all four 18-01 fixture titles' real strings (226840/570/220/253230 — cross-checking against their known real-world bitness), (2) the tagless-prose shape (Portal/Half-Life), (3) the label-inside-`<strong>` range shape (Terraria), (4) the empty-array shape (`mac_requirements: []`, Morrowind/PAYDAY 2 — must resolve to `'unknown'`, not throw), (5) a ≥10.15 confident case (Dota 2 or No Man's Sky).

### Pattern 2: Inline derivation inside the existing `fetchMetadataIfNeeded` — no new async call

**What:** Unlike the dead PICS design (which needed a brand-new `ensureMacArchHint()` method and a new awaited call site before every `isBottleEligible()` consultation, because PICS required a separate authenticated-client round trip), direction B's data is **already present** in the response `fetchMetadataIfNeeded()` fetches for `is_mac_native`. The derivation is a few extra lines inside the existing method — no new call site, no new race condition to reason about, because `ensurePlatformsCaptured()` (`games.ts:479`, unchanged) already awaits `fetchMetadataIfNeeded()` before every `install()`/`launch()`/`uninstall()` reaches `isBottleEligible()`.

**When to use:** Any signal derivable from the same `appdetails` response `is_mac_native`/`is_linux_native` already reads.

**Example:**
```typescript
// Source: extends games.ts:271-304 (existing fetchMetadataIfNeeded body,
// where is_mac_native/is_linux_native are already derived from `data`).
// DETAIL-01: capture native platform support from appdetails.
const is_mac_native = !!data.platforms?.mac
const is_linux_native = !!data.platforms?.linux

// MAC32-01 (direction B): derive the pre-install arch hint from the SAME
// response — no separate network/PICS call. Gated two ways:
//  1. Never overwrite a Mach-O-verified entry (post-install ground truth
//     always wins — a cheap heuristic must not regress a confirmed fact).
//  2. Only compute when is_mac_native is true — see Pitfall 2 for why a
//     false is_mac_native already routes correctly via the pre-existing
//     OR-branch, making this signal moot (and its HTML often stale/absent
//     for the same reason) when there's no current mac depot.
const existingMeta = steamMetadataStore.get(this.appId)
const mac_arch: GameInfo['mac_arch'] =
  existingMeta?.mac_arch_verified === true
    ? existingMeta.mac_arch
    : is_mac_native
      ? macArchFromMinOS(data.mac_requirements?.minimum)
      : existingMeta?.mac_arch

const updated: GameInfo = {
  ...current,
  // ...existing fields unchanged...
  is_mac_native,
  is_linux_native,
  mac_arch
}

steamMetadataStore.set(this.appId, {
  // ...existing fields unchanged...
  is_mac_native,
  is_linux_native,
  mac_arch,
  ...(existingMeta?.mac_arch_verified !== true && is_mac_native
    ? { mac_arch_source: 'minos' as const }
    : {})
})
```

**Open Question #2 (from the original research) is now MOOT, not just resolved:** the original document asked whether `ensureMacArchHint()` should be awaited synchronously like `ensurePlatformsCaptured()`. Under direction B there is no separate method to await — the derivation rides inside the call `ensurePlatformsCaptured()` already awaits. No new wiring, no new race to introduce.

### Pattern 3: `isBottleEligible()` extension — UNCHANGED CODE

**What:** Same OR-branch as the original research recommended. The code itself needs no change from what the original research already specified — it just now receives its `'32'` value from a different provenance (Mach-O only, never the pre-install heuristic).

**Example:**
```typescript
// Source: extends games.ts:451-455 (existing isBottleEligible()) — UNCHANGED
// from the original research's Pattern 3.
private isBottleEligible(): boolean {
  if (!isMac) return false
  const meta = steamMetadataStore.get(this.appId)
  // MAC32-02: mac_arch==='32' can now ONLY arrive via the post-install
  // Mach-O ground-truth check (Plan 18-03) — the pre-install min-OS
  // heuristic (Pattern 1/2 above) never asserts '32'. The branch itself is
  // unchanged; only its upstream source changed.
  if (meta?.mac_arch === '32') return true
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}
```

### Pattern 4: Mach-O ground-truth check (argv-form, no shell — matches codebase convention)

**UNCHANGED FROM ORIGINAL RESEARCH.** Re-verified against current `library.ts` (lines 1071-1146, `windowsRunningAppId`/`linuxFallbackRunningAppId` argv-form convention) and `Plan 18-03`'s Task 1/2 in this session — no changes needed. Reproduced here verbatim so Plan 18-03's `<read_first>` pointer to "18-RESEARCH.md Pattern 4" continues to resolve.

**What:** Reuse the exact `execFileSync` invocation style already used for `linuxFallbackRunningAppId()`: argv array (never string-interpolated shell command), `encoding: 'utf8'`, bounded `timeout`, wrapped in try/catch returning a safe default.

**Example:**
```typescript
// Source: pattern from library.ts:1135-1146 (existing linuxFallbackRunningAppId).
// lipo -archs output format verified via WebSearch (Apple lipo(1) man page,
// ss64.com/mac/lipo.html) — space-separated arch list. [CITED]
function machOArchsOf(binaryPath: string): string[] {
  try {
    const output = execFileSync('lipo', ['-archs', binaryPath], {
      encoding: 'utf8',
      timeout: 5000
    })
    return output.trim().split(/\s+/).filter(Boolean)
  } catch (err) {
    try {
      const output = execFileSync('file', [binaryPath], {
        encoding: 'utf8',
        timeout: 5000
      })
      const archs: string[] = []
      if (/\bx86_64\b/.test(output)) archs.push('x86_64')
      if (/\barm64\b/.test(output)) archs.push('arm64')
      if (/\bi386\b/.test(output)) archs.push('i386')
      return archs
    } catch {
      return [] // neither tool available/succeeded — inconclusive, NOT 32-bit
    }
  }
}

function verdictFromArchs(archs: string[]): '32' | '64' | null {
  if (archs.length === 0) return null // inconclusive — do not overwrite existing hint
  const has64 = archs.includes('x86_64') || archs.includes('arm64')
  const has32 = archs.includes('i386')
  if (has64) return '64'
  if (has32) return '32'
  return null
}
```

### Pattern 5: Locating the installed Mach-O binary

**UNCHANGED FROM ORIGINAL RESEARCH.** Re-verified against current `library.ts` in this session. Reproduced here so Plan 18-03's `<read_first>` pointer to "18-RESEARCH.md Pattern 5" continues to resolve.

**What:** `installPath` from `buildInstalledMap()`/`readAcfState()` is `join(steamappsDir, 'common', installdir)` — the game's root folder, NOT the executable.

**Example:**
```typescript
// Source: pattern extends buildInstalledMap()'s installPath construction
// (library.ts:472) with a scan step. .app bundle discovery is a documented
// macOS convention [ASSUMED — not Valve-guaranteed for every title].
function locateMachOBinary(
  installPath: string,
  launchExecutable?: string
): string | null {
  if (launchExecutable) {
    const candidate = join(installPath, launchExecutable)
    if (existsSync(candidate)) return candidate
  }
  try {
    const entries = readdirSync(installPath)
    const appBundle = entries.find((e) => e.endsWith('.app'))
    if (!appBundle) return null
    const macOsDir = join(installPath, appBundle, 'Contents', 'MacOS')
    if (!existsSync(macOsDir)) return null
    const bins = readdirSync(macOsDir)
    return bins.length ? join(macOsDir, bins[0]) : null
  } catch {
    return null
  }
}
```

### Anti-Patterns to Avoid

- **Treating a low min-OS as evidence of 32-bit:** This is direction B's version of the original false-flag trap. `macArchFromMinOS` must NEVER return `'32'`. A Hat in Time (min-OS 10.11.6, real 64-bit) is the concrete counter-example in the live corpus (Pattern 1).
- **Treating `mac_requirements: []` (or an unparseable string) as `'64'`:** Absence of evidence for a high min-OS is not evidence of a low one either — always fall through to `'unknown'`.
- **Letting the pre-install heuristic overwrite a `mac_arch_verified: true` (Mach-O) entry:** Pattern 2's gate exists specifically to prevent a cheap re-fetch of `appdetails` (e.g. on next app launch, if `fetchMetadataIfNeeded` ever re-runs for any reason) from regressing a confirmed post-install `'32'` verdict back to `'unknown'`/`'64'`.
- **Reintroducing PICS/`steam-user`/`osarch`/`getProductInfo` for arch detection:** Retired by the Plan 18-01 empirical finding. Do not import `SteamUser`/`getClient` into `games.ts` for this purpose.
- **Calling `lipo`/`file` with a shell string instead of argv array:** Unchanged from original research — the codebase's own convention exists specifically to avoid shell injection via attacker-influenced paths.
- **Running the Mach-O check on every `launch()` call:** Unchanged — cache via `mac_arch_verified: true`.
- **Conflating the bottle-sourced install path with the native one for the Mach-O check:** Unchanged — gate `verifyMacArchGroundTruth` on `source === 'native'` only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing HTML-formatted Steam requirements text | A general HTML/DOM parser | Bounded regex on a known-narrow fragment, mirroring `parseSteamStorageRequirement`'s existing convention | The codebase has already solved "extract one figure from `*_requirements.minimum` HTML" once (`pc_requirements` → storage size); a second full HTML parser dependency for the same class of problem would be inconsistent and unjustified — the regex-with-bounded-segment approach validated against 14 real titles (Pattern 1) is sufficient |
| Universal-binary architecture inspection | Manually reading Mach-O fat-header bytes | `lipo -archs` (or `file` fallback) | Unchanged from original research |
| Bottle-eligibility routing | A new parallel routing mechanism for 32-bit games | Extend the existing `isBottleEligible()` single source of truth | Unchanged from original research — Pattern 3's code is untouched |
| macOS release-version comparison | Hand-rolled Apple version-history knowledge scattered inline | A single `MACOS_CODENAME_VERSION` lookup table plus numeric-tuple comparison, colocated with the parser | Keeps the "what counts as Catalina-or-newer" logic in one place, testable in isolation, and easy to extend if Apple ships a macOS 16/17/etc. that still needs to compare `>= 10.15` correctly (the `major > 10` branch already covers all future major versions without a table update) |

**Key insight:** Direction B's engineering surface is smaller than the original PICS design's, not larger — one new pure-function pair, zero new async wiring, zero new imports, and the two capabilities that DO carry real complexity (Mach-O inspection, the post-install recovery state machine) were already fully researched and already stand unchanged.

## Common Pitfalls

### Pitfall 1: `mac_requirements.minimum` HTML shape varies across at least 5 distinct structures

**What goes wrong:** A parser written against only the "canonical" `<li><strong>OS:</strong> value<br></li>` shape will fail silently (return null/undefined) or, worse, mis-extract on Portal/Half-Life's completely tagless run-on prose and Terraria's label-inside-`<strong>` range format.

**Why it happens:** Steam's store page copy has been hand-authored per-title over more than a decade; there is no canonical schema, and older titles (Portal, Half-Life, Terraria) predate whatever template later titles (Dota 2, No Man's Sky) use.

**How to avoid:** Use Pattern 1's segment-isolation algorithm (capture to next `<` OR next competing spec keyword, whichever comes first) and validate against the full 14-title live corpus in Pattern 1, not just the four 18-01 fixture titles.

**Warning signs:** A known-64-bit title (e.g. No Man's Sky, min-OS 12.3) resolves to `'unknown'` instead of `'64'` in tests — usually means the segment-isolation regex failed to find the OS label in a title with an unfamiliar HTML shape.

### Pitfall 2: `is_mac_native` (from `platforms.mac`) and `mac_requirements` presence can diverge for the same title

**What goes wrong:** Assuming `mac_requirements.minimum` is only ever populated when `platforms.mac` is true, and therefore skipping the `is_mac_native` gate in Pattern 2 as "redundant." Half-Life 2 (220) and A Hat in Time (253230) — both 18-01 fixture titles — currently report `platforms.mac: false` in the live store API while `mac_requirements.minimum` remains fully populated (verified live in this session). Steam's store listing evidently stopped marketing a mac version for these older titles while the underlying requirements text (and, per the 18-01 PICS fixtures, the depot/launch-entry data) lingers.

**Why it happens:** `platforms.mac` and `mac_requirements` are two independently-maintained fields on the same store listing; there's no guaranteed consistency invariant between them, especially for a title whose store presentation has been edited since its original mac release.

**How to avoid:** Gate the `macArchFromMinOS` computation on `is_mac_native === true` (Pattern 2). When `is_mac_native` is false, the pre-existing `isBottleEligible()` OR-branch (`platformsCaptured===true && is_mac_native===false`) already routes the game to the bottle for an entirely different, already-correct reason — computing a min-OS verdict for it would be dead weight that nothing reads (Pattern 3's `mac_arch==='32'` branch is irrelevant when the *other* branch already returns true).

**Warning signs:** A test asserts `mac_arch` gets set for a title with `platforms.mac: false` and finds it doesn't — this is expected behavior under the recommended gate, not a bug.

### Pitfall 3: The min-OS heuristic proves a floor, not a ceiling — never assert `'32'` from it

**What goes wrong:** Treating "min-OS is old/low/unparseable" as equivalent to "probably 32-bit" and asserting `mac_arch: '32'` pre-install. A Hat in Time (min-OS 10.11.6, in the "unknown" bucket) is a real, documented 64-bit game — asserting 32 for it would misroute a working native install into CrossOver emulation, recreating exactly the false-flag failure mode the original `osarch` design was rejected for.

**Why it happens:** It's tempting to treat the two-bucket design (`'64'`-confident vs. everything-else) as symmetric, when it's deliberately asymmetric: Catalina's 32-bit removal gives a one-directional proof (new-enough min-OS ⟹ must be 64-bit) with no converse (old min-OS ⟹ nothing provable).

**How to avoid:** `macArchFromMinOS`'s return type is literally `'64' | 'unknown'` — there is no code path that can produce `'32'` from this function. Only Mach-O (Pattern 4, post-install) may ever set `'32'`. Enforce this at the type level, not just by convention.

**Warning signs:** A code review or test finds any `mac_arch = '32'` assignment upstream of a Mach-O check — that's the bug, full stop.

### Pitfall 4: `lipo` is not guaranteed present on every end-user Mac

**UNCHANGED FROM ORIGINAL RESEARCH.** Preserved verbatim so Plan 18-03's `<read_first>` pointer to "Pitfall 4" continues to resolve.

**What goes wrong:** `lipo` ships with Xcode Command Line Tools, which most developer machines have but a typical *end user's* Mac may not (GameLib's actual install target). If `lipo` is missing and the `file` fallback is not implemented, `verifyMacArchGroundTruth` silently becomes a no-op forever on that machine.

**Why it happens:** Reasonable assumption drift — researchers/planners tend to test on dev machines where Xcode CLT is already installed.

**How to avoid:** Implement the `file`-based fallback (Pattern 4) — `file` is part of the base macOS install (BSD userland), not Xcode CLT, and is present on every Mac without exception. Treat "neither tool succeeded" as inconclusive (`return null`, do not overwrite the pre-install hint), never as a positive 32-bit or 64-bit verdict.

**Warning signs:** `verifyMacArchGroundTruth` throws or silently no-ops in CI/sandboxed environments without Xcode CLT — write unit tests against mocked `execFileSync` so this is caught without needing real Xcode CLT in CI.

### Pitfall 5: Post-install correction has no natural "undo the native install" mechanic — RESOLVED

**RESOLVED** since the original research via CONTEXT.md decision D-6 and `Plan 18-03` Task 3: on a Mach-O flip to `'32'`, GameLib prompts the user (`showDialogBoxModalAuto`), and on confirm calls `forceUninstall()` then re-installs through the bottle. Not silent. Preserved here (renumbered identically to the original document) purely for continuity — no remaining open design gap.

## Code Examples

### Reading the same appdetails response already fetched (no new call)
```typescript
// Source: src/backend/storeManagers/steam/games.ts:223-228 (existing, verified
// current in this session)
const resp = await axios.get(`${STEAM_STORE_API}?appids=${this.appId}`, {
  timeout: METADATA_FETCH_TIMEOUT_MS
})
const entry = resp.data?.[this.appId]
const data = entry?.data
// data.platforms.mac        → existing is_mac_native source
// data.mac_requirements.minimum → NEW mac_arch source (this phase)
```

### Real live-fetched confirmation of the field's presence/absence pattern
```json
// Source: live GET store.steampowered.com/api/appdetails?appids=22320
// [VERIFIED: Steam store API, fetched this research session, 2026-07-12]
// Confirms mac_requirements is an EMPTY ARRAY (not an object, not absent)
// when a title has no mac requirements text at all — a real shape the
// parser's optional-chaining call site (data?.mac_requirements?.minimum)
// must handle without throwing.
{
  "name": "The Elder Scrolls III: Morrowind® Game of the Year Edition",
  "mac_requirements": []
}
```

## State of the Art

| Old Approach (original research, DEAD) | Current Approach (this refresh) | When Changed | Impact |
|--------------|------------------|---------------|--------|
| PICS `osarch` via `steam-user.getProductInfo()`, first-ever runtime use of that method in the codebase | Store-API `mac_requirements` min-OS heuristic, reusing the existing `appdetails` `axios` call | 2026-07-12, after Plan 18-01's real-capture pivot | No new network dependency, no new `steam-user` runtime usage, no new async call site — smaller diff than originally planned |
| `is_mac_native` boolean only (unaffected either way) | `is_mac_native` + `mac_arch` (bitness-adjacent hint) as two orthogonal signals, now both sourced from the same single `appdetails` fetch | This phase | `isBottleEligible()` still gains its independent `mac_arch==='32'` OR-branch (unchanged code); the *only* thing that changed is what feeds it pre-install |

**Deprecated/outdated:** The original document's Pattern 1 (`parseOsArchHint`), Pattern 2 (`ensureMacArchHint`), Pitfall 1 (`@types/steam-user` typing trap), Pitfall 2 (`enablePicsCache` gating), and Assumption A1 (`osarch` field-path corroboration) are all retired — none of that code should be written. `library.ts`'s Mach-O functions and `GamePage`'s badge are unaffected and remain current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The segment-isolation-then-minimum-version-extraction algorithm (Pattern 1) generalizes correctly beyond the 14 titles live-verified in this session to the full Steam mac catalog (thousands of titles) | Pattern 1 | [MEDIUM] A title with a 6th unforeseen HTML shape could resolve to `'unknown'` when it should be `'64'` (a missed-optimization, not a false-32 misroute — the design's asymmetric safety net means the worst case is a soft-hint badge on a game that's actually fine, not an incorrect CrossOver route) |
| A2 | On macOS, Steam installs a `<Name>.app` bundle directly under `installdir`, and `Launch.executable` for the mac entry points at (or near) `Contents/MacOS/<binary>` | Pattern 5 | UNCHANGED from original research (renumbered A2). If a title deviates, `locateMachOBinary` returns `null` and the ground-truth check silently no-ops for that title — not a crash, a missed correction |
| A3 | `lipo`/`file` output format (space-separated arch list / free-text sentence) is stable | Pattern 4 | UNCHANGED from original research (renumbered A3). Degrades gracefully to inconclusive per `verdictFromArchs`'s "no tool succeeded → don't overwrite" rule |
| A4 | The named-codename fallback map (`MACOS_CODENAME_VERSION`) is accurate Apple release history | Pattern 1 | [LOW] Public, well-documented Apple version history; this is a fallback branch never hit in the 14-title live corpus (every real sample had an explicit digit-based version), so an error here has no observed real-world trigger yet |
| A5 | Gating `mac_arch` computation on `is_mac_native === true` is correct (vs. computing unconditionally) | Pitfall 2, Pattern 2 | [LOW] If wrong, some legacy-delisted-mac titles (Half-Life 2 / A Hat in Time pattern) would simply never get a `mac_arch` value set — but those titles already route correctly via the pre-existing `is_mac_native===false` OR-branch regardless, so the practical impact of gating incorrectly is near-zero either way |

## Open Questions

1. **RESOLVED (CONTEXT.md D-6 / Plan 18-03 Task 3).** What happens to an already-downloaded native i386-only install after the post-install correction flips `mac_arch` to `'32'`? — User is prompted; on confirm, `forceUninstall()` + bottle re-install. Preserved here, unnumbered-changed, so Plan 18-03's `<read_first>` pointer to "Open Question #1" continues to resolve.

2. **MOOT (direction B eliminates the question).** The original document's Open Question #2 asked whether a new `ensureMacArchHint()` should be awaited synchronously. Direction B has no such method — Pattern 2 folds the derivation into the existing, already-awaited `fetchMetadataIfNeeded()`.

3. **RESOLVED, and the trigger for this entire refresh.** The original document's Open Question #3 asked for the exact `osarch` payload shape. Plan 18-01's real dump answered it: the field doesn't carry the needed signal at all, which is why this refresh exists.

No new open questions from this refresh — Pattern 1's corpus (14 live-fetched real titles spanning every observed HTML shape) is judged sufficient to lock the parser without a further pre-work dump, unlike the original PICS design which explicitly required one before implementation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Steam store `appdetails` API (public, unauthenticated) | MAC32-01 (min-OS heuristic) | ✓ (already required by existing DETAIL-01 `is_mac_native` code, unchanged) | — | If the fetch fails, `fetchMetadataIfNeeded`'s existing try/catch (`games.ts`) already logs and returns silently — `mac_arch` simply stays unset, `isBottleEligible()` falls back to the unaffected `is_mac_native` OR-branch (safe: never over-routes) |
| `lipo` (Xcode Command Line Tools) | MAC32-03 (Mach-O ground truth) | Not verifiable from this (non-macOS) research environment | — | `file` (BSD base install, always present on macOS) — unchanged from original research |
| `file` (BSD userland) | MAC32-03 fallback | Not verifiable from this environment | — | None further — inconclusive result retains the pre-install hint |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `lipo` → `file` (unchanged from original research).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest 29.3.2 [VERIFIED: package.json] |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "parseSteamMacMinOSVersion"` |
| Full suite command | `pnpm test` (equivalently `npx jest`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAC32-01 | `parseSteamMacMinOSVersion`/`macArchFromMinOS` correctly classify the 14-title live corpus (Pattern 1) — including the empty-array case (`mac_requirements: []` → `'unknown'`, no throw), the tagless-prose shape, the range shape, and confirming a ≥10.15 title resolves `'64'` while a <10.15 title (even a real 64-bit one, A Hat in Time) resolves `'unknown'`, never `'32'` | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "macArchFromMinOS"` | ❌ Wave 0 — extend existing file, colocated with `describe('parseSteamStorageRequirement')` at line 1327 |
| MAC32-01 | `fetchMetadataIfNeeded` persists `mac_arch`/`mac_arch_source: 'minos'` to `steamMetadataStore` only when `is_mac_native` is true and `mac_arch_verified` is not already true; never overwrites a verified Mach-O entry | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "fetchMetadataIfNeeded"` | ❌ Wave 0 — extend existing `describe('SteamGame.fetchMetadataIfNeeded...')` block |
| MAC32-02 | `isBottleEligible()` returns `true` when `mac_arch==='32'` regardless of `is_mac_native`/`platformsCaptured` state; existing D-11 tests (`is_mac_native===false` path) still pass unchanged (regression guard) — CODE UNCHANGED from original research, only the seeding fixture changes | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "isBottleEligible"` | ❌ Wave 0 — extend existing `describe('SteamGame.isNative()...')` block (`games.test.ts:561`) |
| MAC32-02 | `install()`/`launch()`/`uninstall()` route through the bottle when `mac_arch==='32'` | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "bottle routing"` | ✅ existing `describe` blocks at `games.test.ts:630`/`856` — extend with a `mac_arch: '32'` case |
| MAC32-03 | `machOArchsOf`/`verdictFromArchs`/`locateMachOBinary`/`verifyMacArchGroundTruth` — UNCHANGED test plan from original research, Plan 18-03 already specifies the exact test cases in its own `<acceptance_criteria>` | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "machOArchs"` and `-t "verifyMacArchGroundTruth"` | ❌ Wave 0 (Plan 18-03, unaffected by this refresh) |
| MAC32-04 | `MacArchBadge` render-gating and host-OS styling — UNCHANGED test plan from original research, Plan 18-04 already specifies the exact test cases | unit (RTL) | `npx jest src/frontend/screens/Game/GamePage/components/__tests__/MacArchBadge.test.tsx` | ❌ Wave 0 (Plan 18-04, unaffected by this refresh) |
| MAC32-04 | Manual/visual: badge renders beside the game logo in the actual GamePage left panel | manual-only | — | N/A (Plan 18-04 Task 3, unaffected) |

### Sampling Rate

- **Per task commit:** `npx jest src/backend/storeManagers/steam/__tests__/<touched-file>.test.ts` (targeted, <30s)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green (`pnpm test` exit 0) + `tsc`/`eslint` clean, before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `describe('parseSteamMacMinOSVersion')`/`describe('macArchFromMinOS')` in `games.test.ts` — covers MAC32-01, seeded with the real live-fetched corpus in Pattern 1 (no synthetic fixtures needed — the 14 real strings are ready to paste in as test literals)
- [ ] Extend `describe('SteamGame.fetchMetadataIfNeeded — is_delisted detection (CONSOLE-01 Gap B)')` (or a sibling describe) in `games.test.ts` — covers the inline `mac_arch` derivation + the never-overwrite-verified gate
- [ ] Extend the existing `isBottleEligible`/bottle-routing describes in `games.test.ts` — covers MAC32-02 (unchanged code, new seeding)
- [ ] Plan 18-03/18-04's own Wave 0 gaps (Mach-O tests in `library.test.ts`, `MacArchBadge.test.tsx`) are UNAFFECTED by this refresh — those plans stand as written

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase no longer touches the authenticated `steam-user` session at all (a further reduction vs. the original design, which at least read from it) |
| V3 Session Management | No | No new session state |
| V4 Access Control | No | No new access-control surface |
| V5 Input Validation | Yes | `mac_requirements.minimum` HTML is regex-scanned only, never eval'd/rendered to the DOM (T-06-02 precedent, unchanged principle from `parseSteamStorageRequirement`). `installPath`/binary paths passed to `execFileSync` must stay argv-form (unchanged from original research) |
| V6 Cryptography | No | No new cryptographic surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via a crafted `installdir`/install path flowing into `lipo`/`file` | Tampering | UNCHANGED from original research — argv-form `execFileSync`, never `exec()` |
| Malicious/oversized `mac_requirements.minimum` HTML causing pathological regex backtracking (ReDoS) | Denial of Service | The regexes in Pattern 1 (`\b(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?\b`, `OS\s*X?\s*:?\s*([^<]*)`) are bounded — no nested quantifiers, no catastrophic-backtracking shapes; `[^<]*` is a simple negated-character-class scan, linear time. Lower risk than the retired PICS design's arbitrary-depth JSON traversal |
| Non-numeric/injected `appId` reaching the `appdetails`/`steam://` URL construction | Tampering | Unchanged — the existing `/^\d+$/` guard (`buildSteamProtocolUrl`, T-03-01) already covers every call site this phase touches; no new appId-consuming code path is introduced |

## Sources

### Primary (HIGH confidence)
- Direct repo inspection: `src/backend/storeManagers/steam/{games,library,electronStores}.ts` — read in full, current as of this session
- Live Steam store API fetch: `store.steampowered.com/api/appdetails?appids={id}` for all four 18-01 fixture AppIDs (226840, 570, 220, 253230) plus 10 additional real titles (400, 620, 105600, 8930, 70, 236090, 291550, 275850, 224760, 22320, 218620) — fetched and cross-verified live in this research session, 2026-07-12
- `.planning/phases/18-.../18-CONTEXT.md` (`<execution_update>` block), `18-01-SUMMARY.md`, `18-03-PLAN.md`, `18-04-PLAN.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/notes/steam-mac-arch-detection-decisions.md` — all read in full for this refresh
- `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-{32bit,64bit,no-osarch,false-flag}.json` — the committed 18-01 evidence, cross-referenced against their live `appdetails` counterparts in this session

### Secondary (MEDIUM confidence)
- [Apple lipo(1) man page mirror](https://keith.github.io/xcode-man-pages/lipo.1.html) and [ss64.com/mac/lipo.html](https://ss64.com/mac/lipo.html) — unchanged from original research, `-archs` output format
- Original research's already-cited sources for the (now-retired) PICS approach, carried forward only where still relevant to Mach-O/badge/routing (not re-cited for the dead `osarch` claims)

### Tertiary (LOW confidence)
- `MACOS_CODENAME_VERSION` fallback map — public, well-known Apple release history; not independently re-verified against Apple's own site in this session (training-knowledge-level confidence), but this is a fallback branch never triggered by the 14-title live corpus

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; the one relevant version (`axios`) confirmed by direct filesystem + `npm view`
- Min-OS heuristic payload shape / parser correctness: HIGH — validated live against 14 real titles in this session (a stronger evidence base than the original document's MEDIUM-confidence, never-executed PICS pre-work dump requirement)
- Architecture / integration points: HIGH — every hook point (`fetchMetadataIfNeeded`, `isBottleEligible`, `ensurePlatformsCaptured`) verified by reading current source in this session
- Mach-O ground-truth mechanics, badge UI: HIGH — unchanged from original research, re-verified against current source (Plan 18-03/18-04 already exist and are internally consistent with this document)
- Pitfalls: HIGH — Pitfall 2 (`is_mac_native`/`mac_requirements` divergence) is a genuinely new empirical finding from this session's live fetches, not carried from the original document

**Research date:** 2026-07-12 (refresh)
**Valid until:** 30 days (stable — the Steam store API's HTML requirements format and Mach-O tooling both move slowly; re-verify sooner only if `mac_requirements.minimum`'s HTML template changes catalog-wide)
