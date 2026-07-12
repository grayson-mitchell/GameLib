# Phase 18: macOS 32-bit detection, badge & CrossOver routing - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning
**Source:** Explore Express Path (`.planning/notes/steam-mac-arch-detection-decisions.md`, `/gsd-explore` 2026-07-12)

<domain>
## Phase Boundary

Detect a Steam game's **macOS build architecture** (32-bit vs 64-bit) so that 32-bit-only Mac builds — which cannot run on modern macOS (Apple dropped 32-bit in Catalina 10.15, 2019) — route to the CrossOver/Wine bottle instead of a native install that would silently fail, and surface the game's OS/arch as a badge beside the game logo in the left panel.

This phase reuses, and extends, the Phase 17 macOS bottle-routing machinery. It does NOT build new bottle/Wine infrastructure — 32-bit simply becomes an additional reason a mac game is bottle-eligible.

**In scope:** Steam only. Arch detection (PICS + Mach-O), routing extension, left-panel OS/arch badge.
**Out of scope (V1):** non-Steam stores (GOG/Epic mac arch) — the arch signal is Steam-specific. Linux/Windows 32-bit (run fine natively / handled by Proton).
</domain>

<decisions>
## Implementation Decisions

### Arch data source (LOCKED)
- Read architecture from **PICS appinfo** via `steam-user` `getProductInfo([appid], [])` — the CM protocol client already connected for `getOwnedApps()`. NOT the public Web API.
- Field path: `apps[appid].appinfo.config.launch[N].config.osarch` (values `"32"` / `"64"` / absent), with sibling `config.oslist` identifying the OS.
- The public Web API `appdetails` endpoint only returns `platforms.mac` as a boolean — no architecture. It is insufficient as the arch source (this is why `is_mac_native` is only a boolean today).

### The false-flag trap (LOCKED — drives the whole design)
- Steam treats any mac launch entry NOT explicitly flagged `osarch "64"` as 32-bit. `osarch` is **manual, developer-set** metadata and is a **launch-config filter, not a binary probe** — a game can ship a 64-bit mac binary with no `osarch` tag.
- Documented false-positives: A Hat in Time, Metro: Last Light, BattleBlock Theater are flagged 32-bit but run fine.
- ⇒ **A missing/blank `osarch` is `unknown`, NEVER assumed 32-bit.** Over-routing on a missing tag would push good 64-bit games into emulation.

### Hybrid detection rule (LOCKED)
Pre-install (cheap, PICS only):
- `osarch == "32"` → badge "32" + bottle-eligible; never native-install.
- `osarch == "64"` → native path.
- `osarch` missing/blank → treat as unknown → native path (tentative).

Post-install ground truth (correctness backstop):
- After a native macOS install (unknown/64 case), inspect the installed Mach-O header (`lipo -archs` / `file`) on the `.app` binary.
  - i386-only → re-route to bottle (Windows depot); warn; cache result.
  - x86_64 / arm64 present → confirmed native; cache result.

### Routing integration (LOCKED)
- Plug into the existing `isBottleEligible()` (`src/backend/storeManagers/steam/games.ts:451`) / D-11 path — 32-bit-confirmed becomes another reason `isBottleEligible()` returns true on macOS. Routes the game's Windows depot under CrossOver, NOT the 32-bit mac binary (nothing on modern macOS can run that).
- Non-macOS hosts: unchanged (Linux keeps Proton delegation; Windows unaffected).

### `oslist` parsing (LOCKED)
- Match BOTH `"macos"` and legacy `"osx"` in `oslist`. Windows/Linux use `"windows"`/`"linux"`.

### UI (LOCKED)
- OS logo beside the game logo in the left panel; a "32" mark on 32-bit mac builds.
- The "32" treatment is escalated to an actionable warning ONLY when the host OS is macOS. On Windows/Linux hosts it is informational (or omit) — a "mac 32" warning is not actionable there.

### Claude's Discretion
- Exact GameInfo field name/shape for the arch signal (mirror `is_mac_native` neighbor at `src/common/types.ts:220`; likely a `mac_arch: '32' | '64' | 'unknown'` or similar) and where it is persisted (`steamMetadataStore` alongside `is_mac_native`).
- Whether the Mach-O check runs at install-completion vs first-launch, and the exact `lipo`/`file` invocation and parsing.
- Badge component location, icon assets, and styling (subject to any UI-SPEC generated for this phase).
- Caching key/shape for the resolved arch verdict.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & research (this phase)
- `.planning/notes/steam-mac-arch-detection-decisions.md` — full design, research findings, false-flag trap, field paths, build gotchas.
- `.planning/todos/pending/steam-getproductinfo-appinfo-dump.md` — REQUIRED pre-work: runtime `getProductInfo` dump on a known 32-bit mac AppID to lock parser casing/nesting before writing the parser.

### Existing code to extend (source of truth)
- `src/backend/storeManagers/steam/games.ts:451` — `isBottleEligible()` / `isNative()` D-11 routing (the integration point).
- `src/backend/storeManagers/steam/games.ts:274` — where `is_mac_native` is currently derived from appdetails `platforms.mac`.
- `src/common/types.ts:220` — `is_mac_native` / `is_linux_native` on `GameInfo` (add the arch signal near here).
- `src/backend/storeManagers/steam/library.ts` — Steam library; `getProductInfo`/`getOwnedApps` usage and `steamMetadataStore` persistence.
- `src/backend/storeManagers/steam/electronStores.ts` — `steamMetadataStore` shape (persist arch verdict here).

### Prior phase (dependency)
- `.planning/phases/17-*/17-CONTEXT.md` — Phase 17 D-01..D-11 bottle-routing decisions this phase builds on.
</canonical_refs>

<specifics>
## Specific Ideas

- Example false-positive titles to guard against in tests: A Hat in Time, Metro: Last Light, BattleBlock Theater (have mac builds, flagged 32-bit by Steam's rule, actually run).
- The pre-work dump should sample three cases: a known 32-bit-only mac title, a known 64-bit mac title, and an old title with NO `osarch` — to capture the missing-key shape (absent key vs empty string) for the parser and its tests.
</specifics>

<deferred>
## Deferred Ideas

- Generalizing the OS/arch badge to GOG/Epic mac builds (non-Steam arch signals) — out of scope for V1; the badge could later be store-agnostic.
- Linux 32-bit multilib surfacing — Proton/Steam handle it; not this phase.
</deferred>

---

*Phase: 18-macos-32-bit-detection-badge-crossover-routing*
*Context gathered: 2026-07-12 via Explore Express Path*
