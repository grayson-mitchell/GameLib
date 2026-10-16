# Phase 22: Steam Game Families (multiple bottle configurations) — Specification

**Created:** 2026-07-17
**Ambiguity score:** 0.17 (gate: ≤ 0.20)
**Requirements:** 9 locked

## Goal

A macOS user can group Steam games into named "families," each backed by its own dedicated CrossOver bottle (its own Windows Steam client, its own one-time Steam login, and its own Wine/CrossOver version) — instead of every macOS Steam game sharing the single Phase 17 bottle. The existing bottle becomes the pre-selected "Default" family; games only leave Default when they need a different configuration.

## Background

Phase 17 gave macOS a **single** dedicated Steam CrossOver bottle (`DEFAULT_STEAM_BOTTLE_NAME = 'GameLibSteam'`). Every bottle-eligible macOS Steam game (Windows-only, or confirmed-32-bit per Phase 18) shares it. The single-bottle assumption is baked in across:

- **State/config:** `SteamBottleConfig` (`common/types/steam.ts`) is a flat single record; `steamBottleConfigStore` holds one bottle. No game→bottle mapping exists.
- **Bottle primitives** (`steam/bottle.ts`): every function defaults to the one stored bottle via `steamBottleConfigStore.get('bottleName') ?? DEFAULT_STEAM_BOTTLE_NAME`. They already *accept* a `bottleName` argument — the seam exists — but nothing passes more than the default.
- **Routing** (`steam/games.ts`): `getSettings`/`install`/`launch`/`uninstall` resolve the single bottle implicitly.
- **Poller** (`steam/library.ts`): `resolveBottleSteamappsDir()` scans the one bottle's steamapps.
- **Frontend:** the guided setup (`SteamBottleSetup.tsx`), `steamBottleStatus` IPC, and the install bypass (`GamePage/index.tsx:672`) are all single-bottle. There is no family-management UI and no per-game bottle choice.

This phase breaks that single-bottle assumption end-to-end. It is the **pragmatic fallback** to the user's preferred long-term architecture (a Proton-style native-Steam bridge — captured as `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`), which is gated on a hard, unavailable dependency.

## Requirements

1. **Multi-family data model**: State supports N bottles plus a game→family assignment map.
   - Current: `SteamBottleConfig` is a single flat record; no appId→bottle mapping exists
   - Target: a bottle collection (keyed by bottle name) + a persistent `appId → familyName` assignment store; every routing/poller call resolves a game's family before acting
   - Acceptance: with two families defined and one game assigned to each, the stored model records both bottles and both assignments; a routing call for each game resolves to the correct bottle name

2. **Zero-loss migration of the existing bottle**: Current single-bottle users keep everything.
   - Current: one `GameLibSteam` bottle with installed games and a Steam login
   - Target: on upgrade, that bottle becomes the "Default" family (pre-selected), with its games still installed and its Steam login preserved — no re-login, no reinstall, no re-provision
   - Acceptance: a user with the Phase 17 bottle sees a "Default" family after upgrade; its games report installed and launch without re-provisioning or re-authenticating

3. **Install-time family picker (Default pre-selected)**: Assignment is opt-in per game.
   - Current: Steam install bypasses any modal (`GamePage/index.tsx:672`) and goes straight to the single bottle
   - Target: installing a bottle-eligible macOS game shows a family picker pre-selected to "Default", with a "New family…" option; accepting Default is one click; other families are chosen only when needed
   - Acceptance: installing a bottle-eligible macOS game shows the picker defaulted to Default; selecting family B installs into B; native-macOS and all Linux/Windows Steam games show no picker

4. **Family lifecycle management (Settings)**: Create, configure, rename, delete.
   - Current: no family-management UI exists
   - Target: a Settings surface to create a family (editable auto-name), set its Wine/CrossOver version, rename it, and delete it
   - Acceptance: from Settings a user can create a new family, change its Wine version, rename it, and delete it; each action persists across restart

5. **Destructive, guarded delete**: Deleting a family is confirm-gated and cannot orphan the last one.
   - Current: n/a (single bottle, no delete)
   - Target: deleting a family shows a confirmation naming the games/login that will be lost, then removes the CrossOver bottle directory and clears those games' assignment + installed state; the last remaining family cannot be deleted
   - Acceptance: delete shows a confirm dialog listing affected games; on confirm the bottle dir is removed and assignments cleared; attempting to delete the only remaining family is blocked with a message

6. **Per-family one-time login via guided setup**: Each family provisions independently.
   - Current: one guided-setup flow for the single bottle
   - Target: each family has its own provision + one-time Steam login through the guided flow; a family is created via CrossOver `cxbottle` with its own Windows Steam client
   - Acceptance: creating and provisioning a second family runs its own guided setup and Steam login, producing a distinct bottle with its own `steam.exe`; the Default family's login is unaffected

7. **Not-ready / deleted family routing**: Actions never silently hit the wrong family.
   - Current: install/launch/uninstall assume the one provisioned bottle
   - Target: Install/Play on a game whose family bottle is not provisioned routes to guided setup **for that family**; a game whose assigned family was deleted prompts the user to re-pick a family
   - Acceptance: clicking Play on a game in an unprovisioned family opens that family's guided setup (not another family's); a game whose family was deleted prompts re-pick rather than failing silently

8. **Cross-family install-state reconciliation**: The library reflects games in any family.
   - Current: the ACF poller scans only the single bottle's steamapps (`resolveBottleSteamappsDir()`)
   - Target: install-state reconciliation and the ACF poller scan the relevant family per game (across all families), using each family's own bottle steamapps root
   - Acceptance: a game installed in family B shows as installed in the library; a game installed in Default still shows installed; both resolve to their own bottle's ACF

9. **Family naming and count rules**: Auto-named, renameable, sanitized, unique, unbounded.
   - Current: single hardcoded `GameLibSteam` name
   - Target: the migrated bottle is the "Default" family; new families receive an editable auto-generated name; names must pass `sanitizeBottleName` (no path separator, `..`, NUL, or empty) and be unique; no hard cap on count
   - Acceptance: a new family is created with a working auto-name and no user typing required; a name containing `/`, `\`, `..`, NUL, empty, or duplicating an existing family is rejected; two families with distinct names coexist

## Boundaries

**In scope:**
- N CrossOver bottles ("families") plus a persistent game→family assignment map
- "Default" family = the migrated existing Phase 17 bottle (zero-loss)
- Install-time family picker (pre-selected Default, with "New family…") for bottle-eligible macOS games
- Family management UI in Settings: create, rename, set per-family Wine/CrossOver version, delete
- Per-family guided setup + one-time Steam login
- Per-family ACF poller / install-state reconciliation across all families
- Routing (install/launch/uninstall/getSettings) resolves the per-game family bottle

**Out of scope:**
- The native-Steam bridge / Proton-style architecture (one native client, cheap per-game prefixes) — the user's *preferred* path, but gated on a hard dependency; captured as `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`
- GPTK / `toolkit` (and plain Wine) as a Steam engine — families are CrossOver-only; the existing GPTK-Steam mismatch is a separate bug (`.planning/todos/pending/steam-bottle-gptk-engine-produces-broken-bottle.md`)
- Moving an installed game between families in-app — reinstall to move (no file-copy/move helper); prefix isolation makes it a re-download anyway
- Concurrent play across families on ONE Steam account — Steam permits only one active gameplay session per account; not solvable here (needs distinct accounts per family)
- Sharing a single Steam login/auth across families — prefix isolation + D-04 (bottled auth is opaque); each family logs in once, independently
- Sharing already-downloaded game files across families — each family re-downloads into its own bottle
- Non-macOS: Linux and Windows Steam paths stay on native `steam://`, unchanged

## Constraints

- **macOS only.** All behavior sits behind the existing `isMac` gate; Linux/Windows Steam is untouched.
- **CrossOver required.** Families are built on CrossOver's `cxbottle` lifecycle (create/delete/`cxbottle.conf`); GPTK/`toolkit` is not a working Steam engine. Non-CrossOver engines must not be offered or accepted for a family.
- **One-time login per family (accepted).** Each family has its own Windows Steam client with independent auth; the first use requires credentials + Steam Guard once, then remembers. There is no supported way to share auth across families.
- **One active family per Steam account.** Steam allows only one active gameplay session per account; launching in a second family on the same account kicks the first. Concurrent play requires distinct Steam accounts per family.
- **Zero-loss migration is mandatory** — the existing bottle, its games, and its login must survive as "Default" with no re-provision.
- **Reuse Phase 17 primitives** — `steam/bottle.ts` functions already accept a `bottleName`; thread real family identity through rather than adding a parallel mechanism.
- **Name safety** — reuse the existing `sanitizeBottleName` guard (T-17-01); enforce uniqueness.
- **Delete safety** — destructive delete is confirm-gated and blocked for the last remaining family.

## Acceptance Criteria

- [ ] A user can create a second family with a distinct CrossOver bottle and its own one-time Steam login
- [ ] Existing single-bottle users see their bottle as "Default" after upgrade, with games still installed and login preserved, and no re-provision (zero-loss migration)
- [ ] The install picker appears for a bottle-eligible macOS game, pre-selected to Default, with a "New family" option; native-macOS and Linux/Windows games never show it
- [ ] Installing a game into family B installs into B's bottle steamapps; the game launches from B; uninstall removes it from B
- [ ] Library install-state reconciliation scans all families — a game installed in any family shows as installed
- [ ] Deleting a family shows a confirm dialog naming affected games, removes the CrossOver bottle directory, and clears those assignments; deleting the last remaining family is blocked
- [ ] Install/Play on a game whose family bottle isn't provisioned routes to guided setup for that family; a game whose family was deleted prompts re-pick
- [ ] A new family gets a working editable auto-name with no required typing; names with a path separator / `..` / NUL / empty / duplicate are rejected
- [ ] Non-CrossOver engines (GPTK/`toolkit`, plain Wine) are not offered or accepted when configuring a family

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Named families = CrossOver bottles + assignment; Default pre-selected |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Bridge seeded-out, GPTK todo'd-out, move/concurrency out     |
| Constraint Clarity | 0.82  | 0.65 | ✓      | macOS-only, CrossOver-only, one-time-login-per-family accepted |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 9 pass/fail criteria                                         |
| **Ambiguity**      | 0.17  | ≤0.20| ✓      |                                                              |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective       | Question summary                          | Decision locked                                                      |
|-------|-------------------|-------------------------------------------|---------------------------------------------------------------------|
| 1     | Researcher/Simplifier | Assignment / mgmt scope / move semantics | (initially prompt-on-install; revised R4), full lifecycle mgmt, move = reinstall (out) |
| 2     | Boundary/Failure  | Migration / delete / missing-bottle       | Zero-loss migration; destroy-prefix delete confirm-gated; not-ready → guided setup |
| 3     | Boundary Keeper   | Eligibility scope                         | Only bottle-eligible macOS games get families; native/Linux/Windows unchanged |
| —     | Exploration       | GPTK vs CrossOver / bridge / login        | CrossOver-only (GPTK bug todo'd); native-bridge deferred (seed); one-time login accepted |
| 4     | Seed Closer       | Assignment reconcile + naming/count       | Default-family-unless-chosen (opt-in); "Default" + editable auto-names, unbounded, sanitized-unique |

---

*Phase: 22-multiple-steam-bottles*
*Spec created: 2026-07-17*
*Next step: /gsd-discuss-phase 22 — implementation decisions (data-model shape, migration mechanics, UI placement, IPC surface)*
