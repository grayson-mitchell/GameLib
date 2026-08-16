# Quick Task 260816-qcn: Steam platform-signal precedence rule and serialised merge - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Task Boundary

Close todo `.planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md`.

Two independent backend writers populate `is_mac_native` / `is_windows_native` /
`is_linux_native` in the SAME `steamMetadataStore` entry, sourced from two different Steam
APIs, with no precedence rule and no reconciliation:

- **`src/backend/storeManagers/steam/games.ts`** (~648-656 compute, ~706-731 write) — per-game,
  driven by `checkBottleEligibility()` -> `ensurePlatformsCaptured()`. Sourced from the public
  **`appdetails` store API** (`is_mac_native = !!data.platforms?.mac`).
- **`src/backend/storeManagers/steam/platformCapture.ts`** — `mergePlatformCapture` (~151-175),
  bulk, added by Phase 34.15 (D-01/D-02). Sourced from CM PICS `appinfo.common.oslist`, which
  that file's own header documents as MEDIUM confidence (third-party PICS dumps, not an
  authoritative Valve source).

Today whichever ran most recently wins, purely by call ordering. This was the root mechanism
behind Phase 34.15's CR-01 BLOCKER (symptom fixed in `77f094bfd`; cause still present).

Additionally, a concurrent read-modify-write was observed live during the 34.15 D-16 UAT gate
(finding F-2): on Electron a single `origin=mount` fired TWO concurrent `refresh()` calls and
the second re-scoped all 378 apps because it could not see the first's writes. Benign only
because both computed identical values from the same PICS response.

</domain>

<decisions>
## Implementation Decisions

### Precedence model — LOCKED: freshest write wins

Neither `appdetails` nor PICS `oslist` is declared authoritative. The rule is timestamp-based,
not source-ranked.

Add two OPTIONAL fields to `SteamMetadataCacheEntry` in
`src/backend/storeManagers/steam/electronStores.ts`:

```ts
platformsSource?: 'appdetails' | 'pics'
platformsCapturedAt?: number   // epoch ms
```

Both writers stamp BOTH fields on every platform write. Before writing, each writer compares
its own capture time against `existing.platformsCapturedAt` and DECLINES to overwrite the three
platform booleans when the existing capture is STRICTLY NEWER. Ordering must be decided by the
timestamp comparison, never by which call happened to run last.

Rejected alternatives (do not re-litigate): "appdetails always wins" and "PICS always wins".
The user considered both and chose freshest-write-wins deliberately.

### Honesty requirement on the comments — LOCKED

Freshest-write-wins makes the ordering EXPLICIT and AUDITABLE and makes a silently-lost write
impossible. It does NOT reconcile a genuine source disagreement — when the two sources disagree
about an app, the surviving answer still depends on which sync ran most recently; what changes
is that the outcome is now inspectable after the fact (`platformsSource` + `platformsCapturedAt`
record who wrote last and when).

Code comments MUST state this limitation plainly. Do NOT write comments implying the two-writer
conflict is resolved, reconciled, or closed.

### Serialisation — LOCKED: in scope

`mergePlatformCapture`'s read-modify-write must be serialised so a concurrent refresh cannot
lose a write. The observed double-refresh is Electron-only and dies with Phase 35's Electron
cutover, but the interleave hazard is runtime-independent and outlives it.

### Legacy entries — LOCKED: read boundary, not a migration

`MigrationSystem` is DEAD CODE under Tauri (`applyMigrations()` runs only in Electron's
`whenReady()`; a new `Migration` is a silent no-op). Existing cache entries have no
`platformsCapturedAt`. Handle the absent-timestamp case at the READ boundary inside the
precedence comparison — an entry with no `platformsCapturedAt` is treated as indefinitely old
and is writable by either source. Do NOT add a `Migration`.

</decisions>

<constraints>
## Hard Constraints (violating any of these fails the task)

1. **Carry-forward fields must survive BOTH writers.** `CacheStore.set()`
   (`backend/cache.ts:108`) REPLACES the entire stored value — there is no merge method. These
   fields must survive every write path: `art_cover`, `art_square`, `extra`, `is_delisted`,
   `mac_arch`, `mac_arch_verified`, `mac_arch_source`, `forcedWindowsViaBottle`.
2. **Three-valued platform contract is preserved.** `undefined` = never captured, `false` =
   confirmed absent, `true` = present. Never manufacture an all-false capture.
3. **`parseOslistPlatforms` null semantics unchanged.** An absent / empty / whitespace-only /
   all-unrecognised `oslist` still writes NOTHING.
4. **`depotSignalCaptured` is DO-NOT-TOUCH.** It is imported verbatim by design (34.15 D-04) so
   that "what the bulk job repairs" and "what the install form calls unresolved" are the same
   set by construction. `hasSteamWindowsDepot` and its three saboteurs are likewise
   DO-NOT-TOUCH.
5. **`captureOwnedAppPlatforms` MUST still never throw** under any input (34.15 D-03 fail-soft).
   Any new guard or serialisation primitive must live INSIDE that contract — including any
   synchronous throw from a new lock/queue helper.

</constraints>

<testing>
## Required Test Coverage

Unit tests must cover both directions, not just one:

- PICS declines to clobber a STRICTLY NEWER `appdetails` capture.
- `appdetails` declines to clobber a STRICTLY NEWER PICS capture.
- Each source WINS when it is the newer one (both directions).
- An entry with NO `platformsCapturedAt` (legacy / pre-existing cache) is writable by either
  source.
- Every carry-forward field from constraint 1 survives both write paths.
- Serialisation: two concurrent `mergePlatformCapture` calls for the same appId do not lose a
  write.
- `captureOwnedAppPlatforms` still returns (never throws) when the new guard/serialisation path
  encounters an error.

</testing>

<scope_exclusions>
## Out of Scope

`WR-03` and `WR-04`, listed at the bottom of the source todo, are OUT OF SCOPE and stay open:

- **WR-03** — `library.ts:757-766`: the "all four exit paths emit `steamSyncStatus`" guarantee
  resting on a never-throws contract rather than a `try/catch`.
- **WR-04** — `librarySyncIndicator.ts:70-77`: no visual feedback during a Steam-sync retry
  window when cached games are already present.

</scope_exclusions>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md`
  (source todo — move to `.planning/todos/completed/` on completion)
- `.planning/phases/34.15-steam-platform-signal-and-sync-integrity/34.15-REVIEW.md` (WR-02, the
  originating finding)
- `Skill("spike-findings-gamelib")` — Steam / Tauri implementation patterns

</canonical_refs>
