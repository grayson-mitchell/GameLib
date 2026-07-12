# Phase 18: macOS 32-bit detection, badge & CrossOver routing - Context

**Gathered:** 2026-07-12
**Status:** Needs re-plan (18-02) — see ⚠️ Execution Update below
**Source:** Explore Express Path (`.planning/notes/steam-mac-arch-detection-decisions.md`, `/gsd-explore` 2026-07-12)

> ⚠️ **EXECUTION UPDATE (2026-07-12) — reversed a LOCKED decision.** The 18-01 checkpoint dumped real PICS appinfo and proved **Steam appinfo carries no mac 32/64-bit signal** (`osarch` absent on every macOS entry, even for a confirmed 32-bit game). This invalidates the "Arch data source (LOCKED)" decision and the pre-install half of the "Hybrid detection rule". The pre-install source is now the Steam **store-API `mac_requirements` min-OS heuristic**. See the **Execution Update** section (below `<decisions>`) for the superseding rules; it takes precedence over the original LOCKED text where they conflict. 18-02 must be re-planned; 18-03 (Mach-O) and 18-04 (badge) stand.

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

### Post-install i386 recovery (LOCKED — resolves RESEARCH Open Question #1)
- When the post-install Mach-O check (MAC32-03) flips a *natively-installed* game to `mac_arch === '32'` (Steam left `osarch` blank, binary is actually i386-only), GameLib **prompts the user** with a dialog explaining the native copy cannot run, and on confirm runs `forceUninstall()` + re-installs through the bottle. Not silent — user-consented (one extra redownload only for the rare Steam-mistagged game).
- **Cache shape (forward-compat, LOCKED):** persist the verdict as `appId → { arch: '32' | '64' | 'unknown', source: 'osarch' | 'macho' }`. The `source: 'macho'` entries are the Steam-corrected ground-truth facts a later phase can export for a community override list — see the Phase 19 crowd-sourcing consideration in ROADMAP.md. Storing `source` now avoids reshaping `steamMetadataStore` later. Building the export/contribution flow is OUT of scope for this phase.

### Claude's Discretion
- Exact GameInfo field name/shape for the arch signal (mirror `is_mac_native` neighbor at `src/common/types.ts:220`; likely a `mac_arch: '32' | '64' | 'unknown'` or similar) and where it is persisted (`steamMetadataStore` alongside `is_mac_native`).
- Whether the Mach-O check runs at install-completion vs first-launch, and the exact `lipo`/`file` invocation and parsing.
- Badge component location, icon assets, and styling (subject to any UI-SPEC generated for this phase).
- Caching key/shape for the resolved arch verdict.
</decisions>

<execution_update>
## Execution Update (2026-07-12) — supersedes conflicting LOCKED decisions

**Trigger:** Plan 18-01's human-run appinfo dump (checkpoint MAC32-01 pre-work). Real captures of a **confirmed 32-bit** mac game (Age of Wonders III, appId `226840`) and a **confirmed 64-bit** game (Dota 2, `570`), plus 5 more titles.

### Finding (empirical, reproducible)
Steam PICS appinfo has **no field distinguishing a 32-bit macOS build from a 64-bit one**:
- `config.launch[N].config.osarch` is **absent on every macOS launch entry** — for BOTH the confirmed 32-bit and 64-bit games. `osarch="64"` appears ONLY on windows/linux entries.
- Mac depot `config` is identical (`{"oslist":"macos"}`) for 32- and 64-bit games. No `common.sysreqs.mac`. No other arch-bearing key.
- `oslist` uses current `"macos"` (no legacy `"osx"` observed in-sample). Absent = missing key (never empty string).
- Evidence fixtures committed: `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-{32bit,64bit,no-osarch,false-flag}.json`.

⇒ The "Arch data source (LOCKED)" decision (read `osarch` from PICS) and the **pre-install** branch of the "Hybrid detection rule" are **not implementable** — every mac game resolves to `unknown` pre-install under the old rule. The osarch parser that 18-02 was meant to build is dropped.

### New design (direction B — user-approved 2026-07-12), supersedes the above

**Pre-install source = Steam store-API `mac_requirements` minimum-OS (NOT `osarch`, NOT `platforms.mac`).**
- `appdetails?appids={id}` → `data.mac_requirements.minimum` (HTML). Parse the `OS:` line's macOS version.
- **min-OS ≥ 10.15 (Catalina) ⟹ `mac_arch: '64'` (CONFIDENT)** — Catalina removed 32-bit support, so a game requiring it must be 64-bit. Skip the badge warning; native path.
- **min-OS ≤ 10.14, or unparseable/absent ⟹ `mac_arch: 'unknown'` + SOFT "may be 32-bit, verify after install" hint.** **NEVER assert `'32'` pre-install** — a 64-bit game (A Hat in Time, min-OS 10.11.6) lives in this bucket, so asserting 32 here re-creates the false-flag over-routing the design forbids.
- Store-API OS strings are inconsistent HTML (`"10.9.3 (Mavericks)"`, `"MAC OS X 10.11.6 or higher"`, `"Leopard 10.5.8, Snow Leopard 10.6.3, or higher"`) and ~2/7 sampled titles had no parseable OS line ⇒ robust extraction + fallback-to-`unknown` required. Validate the parser against the four committed evidence fixtures' real titles.

**Post-install ground truth = Mach-O check (MAC32-03 / Plan 18-03) — UNCHANGED and now the ONLY definitive detector.** It is the sole path that ever asserts `mac_arch: '32'`, and it powers the CrossOver/Wine routing (GameLib detects i386-only and re-routes instead of failing like Steam). The i386 recovery flow and routing integration decisions below stand.

**Cache `source` enum:** the LOCKED cache shape used `source: 'osarch' | 'macho'`. `'osarch'` is dead — replace the pre-install source tag with `'minos'` (store-API): `source: 'minos' | 'macho'`. `'macho'` entries remain the crowd-source-exportable ground truth.

**Badge (MAC32-04 / Plan 18-04) — intent UNCHANGED**, tiers: confident `'64'` → normal; `'unknown'`/suspect → soft hint; confirmed `'32'` (post-install, macOS host) → actionable warning.

### Deferred to V2 (documented, not this phase)
Definitive **pre-install** detection by peeking the mac depot binary's Mach-O magic via `steam-user` (depot manifest GID → partial chunk download → read `0xFEEDFACE`/`0xFEEDFACF`/`0xCAFEBABE` fat header). Reliable but heavy (depot decryption keys, chunk download, fat-binary parse) and **owned-games-only**. Its only gain over 18-03 is warning before the full download completes — not worth V1 cost.

### Carry-forward from 18-01 (already built, compiles)
- `mac_arch: '32' | '64' | 'unknown'` + `mac_arch_verified` / `mac_arch_source` provenance on `GameInfo` and `SteamMetadataCacheEntry` (`src/common/types.ts`, `electronStores.ts`). Reuse — do not redefine.
- `scripts/steam-appinfo-dump.cjs` — one-off dev harness (kept for reference; not in the app bundle).
</execution_update>

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
