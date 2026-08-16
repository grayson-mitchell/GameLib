---
phase: quick-260816-qcn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/platformPrecedence.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/platformCapture.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts
  - src/backend/storeManagers/steam/__tests__/platformCapture.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md
  - .planning/todos/completed/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md
autonomous: true
requirements: [WR-02]

must_haves:
  truths:
    - "Whether a platform write lands is decided by a timestamp comparison, not by which writer ran last."
    - "A PICS (`oslist`) capture does NOT overwrite a strictly newer `appdetails` capture, and an `appdetails` capture does NOT overwrite a strictly newer PICS capture."
    - "Each source DOES win when it is the newer one — the rule is symmetric, neither source is ranked authoritative."
    - "A pre-existing cache entry with no `platformsCapturedAt` is writable by either source (legacy handled at the read boundary, no Migration added)."
    - "After any platform write, the entry records WHO wrote it (`platformsSource`) and WHEN (`platformsCapturedAt`), so a lost/overridden write is inspectable after the fact."
    - "Two concurrent bulk captures for the same appIds cannot lose a write: the second run observes the first run's writes before it scopes or merges."
    - "`captureOwnedAppPlatforms` still resolves (never throws/rejects) even when the new precedence or serialisation path errors."
    - "Every carry-forward field (`art_cover`, `art_square`, `extra`, `is_delisted`, `mac_arch`, `mac_arch_verified`, `mac_arch_source`, `forcedWindowsViaBottle`) survives BOTH writers, on both the accepted and the declined path."
    - "The three-valued platform contract is intact: no write manufactures an all-false or partial capture."
  artifacts:
    - path: "src/backend/storeManagers/steam/platformPrecedence.ts"
      provides: "The single shared freshest-write-wins decision function used by both platform writers"
      exports: ["PlatformSignalSource", "PlatformTriple", "PlatformWriteResolution", "resolvePlatformWrite"]
    - path: "src/backend/storeManagers/steam/electronStores.ts"
      provides: "`platformsSource` + `platformsCapturedAt` optional fields on SteamMetadataCacheEntry"
      contains: "platformsCapturedAt"
    - path: "src/backend/storeManagers/steam/platformCapture.ts"
      provides: "PICS writer honouring precedence + a serialised bulk critical section"
      contains: "resolvePlatformWrite"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "appdetails writer honouring precedence, with the effective triple used for the cache write AND the pushed GameInfo"
      contains: "resolvePlatformWrite"
    - path: "src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts"
      provides: "Both-directions precedence coverage + legacy-entry + non-vacuity saboteur"
      min_lines: 80
  key_links:
    - from: "src/backend/storeManagers/steam/platformCapture.ts"
      to: "resolvePlatformWrite (./platformPrecedence)"
      via: "import + call inside mergePlatformCapture"
      pattern: "resolvePlatformWrite"
    - from: "src/backend/storeManagers/steam/games.ts"
      to: "resolvePlatformWrite (./platformPrecedence)"
      via: "import + call before the steamMetadataStore.set in fetchMetadataIfNeeded"
      pattern: "resolvePlatformWrite"
    - from: "src/backend/storeManagers/steam/electronStores.ts"
      to: "SteamMetadataCacheEntry.platformsCapturedAt"
      via: "optional field both writers stamp"
      pattern: "platformsCapturedAt\\?: number"
    - from: "src/backend/storeManagers/steam/platformCapture.ts"
      to: "captureOwnedAppPlatforms critical section"
      via: "serialisation lock acquired INSIDE the existing try/catch"
      pattern: "withPlatformCaptureLock"
---

<objective>
Give the two Steam platform-signal writers (`appdetails` in `games.ts`, PICS `oslist` in
`platformCapture.ts`) an explicit, auditable **freshest-write-wins** precedence rule, and
serialise the bulk writer's read-modify-write so a concurrent refresh cannot lose a write.

Purpose: closes todo `2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md`
(Phase 34.15 review finding WR-02 — the root mechanism behind the CR-01 BLOCKER, whose
symptom was fixed in `77f094bfd` while the cause stayed live). Today the surviving platform
answer is decided purely by call ordering, and a concurrent double-`refresh()` was observed
live during the 34.15 D-16 UAT gate (finding F-2) re-scoping all 378 apps because it could
not see the first run's writes.

Output: a new dependency-free `platformPrecedence.ts` decision function shared by both
writers, two new optional cache fields recording who wrote the platform signal and when, a
serialised bulk critical section, and unit coverage in BOTH directions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260816-qcn-steam-platform-signal-precedence-rule-an/260816-qcn-CONTEXT.md
@.planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md

@src/backend/storeManagers/steam/platformCapture.ts
@src/backend/storeManagers/steam/electronStores.ts
@src/backend/storeManagers/steam/metadataCapture.ts
@src/backend/storeManagers/steam/__tests__/platformCapture.test.ts

Project skill: `Skill("spike-findings-gamelib")` — Steam/Tauri implementation patterns.

<locked_decisions>
These come from CONTEXT.md and are NOT open for re-litigation:

- **D-A (precedence model):** FRESHEST WRITE WINS, timestamp-based. Neither `appdetails`
  nor PICS `oslist` is authoritative. "appdetails always wins" and "PICS always wins" were
  both considered and REJECTED.
- **D-B (honesty):** freshest-write-wins makes ordering EXPLICIT and AUDITABLE and makes a
  silently-lost write impossible. It does NOT reconcile a genuine source disagreement — the
  surviving answer still depends on which sync ran most recently; what changes is that the
  outcome is now inspectable. Comments MUST say this plainly and MUST NOT imply the
  two-writer conflict is resolved/reconciled/closed.
- **D-C (serialisation):** in scope. `mergePlatformCapture`'s read-modify-write must be
  serialised. The observed double-refresh is Electron-only and dies with Phase 35, but the
  interleave hazard is runtime-independent.
- **D-D (legacy entries):** handled at the READ boundary inside the comparison — an entry
  with no `platformsCapturedAt` is treated as indefinitely old and is writable by either
  source. Do NOT add a `Migration` (`MigrationSystem` is dead code under Tauri).
- **Out of scope, stay open, do not touch:** WR-03 (`library.ts:757-766`) and WR-04
  (`librarySyncIndicator.ts:70-77`).
</locked_decisions>

<hard_constraints>
1. **Carry-forwards must survive BOTH writers.** `CacheStore.set()` (`backend/cache.ts:108`)
   replaces the whole stored value; there is no merge method. These must survive every write
   path: `art_cover`, `art_square`, `extra`, `is_delisted`, `mac_arch`, `mac_arch_verified`,
   `mac_arch_source`, `forcedWindowsViaBottle`.
2. **Three-valued platform contract preserved.** `undefined` = never captured, `false` =
   confirmed absent, `true` = present. Never manufacture an all-false or partial capture.
3. **`parseOslistPlatforms` null semantics unchanged.** Absent / empty / whitespace-only /
   all-unrecognised `oslist` still writes NOTHING.
4. **`depotSignalCaptured` is DO-NOT-TOUCH** (34.15 D-04, imported verbatim by design), as
   are `hasSteamWindowsDepot` and its three saboteurs.
5. **`captureOwnedAppPlatforms` MUST still never throw** under any input (34.15 D-03
   fail-soft). Any new guard or serialisation primitive must live INSIDE that contract,
   including any synchronous throw from a new lock helper.
</hard_constraints>

<interfaces>
<!-- Confirmed by reading the files. Use these directly; no exploration needed. -->

`src/backend/storeManagers/steam/platformCapture.ts` (current, confirmed):
```typescript
export interface CapturedPlatforms {
  is_windows_native: boolean
  is_mac_native: boolean
  is_linux_native: boolean
}
export function parseOslistPlatforms(oslist: unknown): CapturedPlatforms | null
export function mergePlatformCapture(appId: string, platforms: CapturedPlatforms): void
export interface PlatformCapturePicsClient { getProductInfo(apps, packages, inclTokens?): Promise<...> }
export interface PlatformCaptureSummary { scopedCount; capturedCount; skippedCount; failed }
export async function captureOwnedAppPlatforms(
  client: PlatformCapturePicsClient, appIds: number[]
): Promise<PlatformCaptureSummary>
```

`src/backend/storeManagers/steam/electronStores.ts` — `SteamMetadataCacheEntry` (confirmed):
`art_cover: string` / `art_square: string` / `extra: ExtraInfo` are REQUIRED; every other
field is optional: `is_mac_native?`, `is_linux_native?`, `is_windows_native?`,
`forcedWindowsViaBottle?`, `is_delisted?`, `platformsCaptured?`, `mac_arch?`,
`mac_arch_verified?`, `mac_arch_source?`.

`src/backend/storeManagers/steam/metadataCapture.ts` (DO-NOT-TOUCH, structural param):
```typescript
export function depotSignalCaptured(
  entry: { platformsCaptured?: boolean; is_windows_native?: boolean } | null | undefined
): boolean
```

`src/backend/cache.ts:108` — `public set(key, value)` writes `key` AND `__timestamp.${key}`
and fires TWO `notifyStoreChanged` calls per set. Whole-value replace, no merge. (This is
also why a declined write should early-return rather than rewrite an identical entry.)

`games.ts` write site, confirmed line numbers:
- 654-656: `const is_mac_native = !!data.platforms?.mac` / `is_linux_native` / `is_windows_native`
- 666-672: `existingMeta` read; `macArchVerified`; `mac_arch` derivation **gated on `is_mac_native`**
- 674-690: the `updated: GameInfo` literal (also carries `is_*_native` + `steamPlatformsCaptured: true`)
- 708-731: the `steamMetadataStore.set(this.appId, { ... })` — an ENUMERATED literal, NOT a
  `...existing` spread, so any new field must be explicitly enumerated or it is dropped.
- 734/737: `library.set(this.appId, updated)` then `sendFrontendMessage('pushGameToLibrary', updated)`

Test idiom (confirmed in `__tests__/games.test.ts`): `jest.mock('axios')`,
`jest.mock('../electronStores', ...)` with `steamMetadataStore: { get: jest.fn(), set: jest.fn() }`,
`library.set(APP_ID, makeEntry())`, `new SteamGame(APP_ID).getGameInfo()`, `await flushAsync()`
(`setImmediate`), then read `(steamMetadataStore.set as jest.Mock).mock.calls[0]`.
`fixtureApiResponse` has `platforms: { windows: true, mac: true, linux: false }`.
Backend jest config sets `resetMocks: true`, so implementations are re-established per test.

**ts-jest here is TRANSPILE-ONLY: type errors do NOT fail tests.** Every new test must assert
runtime BEHAVIOUR, never rely on the type checker. `pnpm codecheck` (`tsc --noEmit`) is the
separate gate for types.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the two cache fields and the shared freshest-write-wins decision function</name>
  <files>
    src/backend/storeManagers/steam/electronStores.ts,
    src/backend/storeManagers/steam/platformPrecedence.ts,
    src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts
  </files>
  <behavior>
    `resolvePlatformWrite(existing, incoming, source, capturedAt)` returns the triple that
    must be persisted plus the provenance stamp, and whether the incoming write was accepted:
    - Existing has `platformsCapturedAt` STRICTLY GREATER than `capturedAt`, and all three of
      its platform booleans are defined -> DECLINE: return existing's triple, existing's
      `platformsSource`, existing's `platformsCapturedAt`, `accepted: false`.
    - Existing timestamp equal to `capturedAt` -> ACCEPT (ties go to the incoming writer; the
      rule is "strictly newer wins", stated once and applied by both writers).
    - Existing timestamp older -> ACCEPT.
    - Existing has NO `platformsCapturedAt` (legacy / pre-existing entry), or it is not a
      finite number -> ACCEPT (D-D: treated as indefinitely old).
    - Existing is `null`/`undefined`/`{}` -> ACCEPT.
    - Existing is strictly newer BUT one or more of its three booleans is `undefined` ->
      ACCEPT. Declining there would leave a partial/undefined capture standing, violating
      hard constraint 2; an entry that cannot supply a complete triple cannot win.
    - On ACCEPT the returned stamp is the incoming `source` + `capturedAt`.
    Symmetry is the point: the same function, called with `'pics'` or `'appdetails'`,
    produces the mirror-image outcome. Neither source is special-cased anywhere.
  </behavior>
  <action>
Per D-A/D-D.

**(a) `electronStores.ts`** — add two OPTIONAL fields to `SteamMetadataCacheEntry`, placed
next to `platformsCaptured`:
`platformsSource?: 'appdetails' | 'pics'` and `platformsCapturedAt?: number` (epoch ms).
Document them as the provenance stamp for the three platform booleans, written by both
writers on every accepted platform write. State plainly (D-B) that they record WHO wrote the
signal last and WHEN so the outcome is inspectable after the fact — and that they do NOT
reconcile a genuine `appdetails`-vs-PICS disagreement: when the two sources disagree the
surviving answer still depends on which sync ran most recently. Do NOT write a comment
implying the two-writer conflict is resolved or closed. Also note the existing
⚠ CARRY-FORWARD WARNING applies to these fields too (`.set()` replaces the whole entry).

**(b) New `src/backend/storeManagers/steam/platformPrecedence.ts`** — dependency-free, no
`electron-store` import, structural parameter types. Mirror `metadataCapture.ts`'s extraction
pattern and say so in the header (it is what lets the Backend jest project unit-test this
without pulling `electron-store` in). Export:
- `export type PlatformSignalSource = 'appdetails' | 'pics'`
- `export interface PlatformTriple { is_windows_native: boolean; is_mac_native: boolean; is_linux_native: boolean }`
  (deliberately a LOCAL structural twin of `platformCapture.ts`'s `CapturedPlatforms`, not an
  import of it — importing would make `platformCapture` -> `platformPrecedence` circular.)
- `export interface PlatformWriteResolution { platforms: PlatformTriple; platformsSource: PlatformSignalSource; platformsCapturedAt: number; accepted: boolean }`
- `export function resolvePlatformWrite(existing, incoming, source, capturedAt): PlatformWriteResolution`
  where `existing` is `{ is_windows_native?: boolean; is_mac_native?: boolean; is_linux_native?: boolean; platformsSource?: PlatformSignalSource; platformsCapturedAt?: number } | null | undefined`.

Implement exactly the `<behavior>` rules. Guard the timestamp read with
`typeof existing?.platformsCapturedAt === 'number' && Number.isFinite(...)` so a corrupted or
absent value degrades to "indefinitely old" rather than to `NaN` comparisons (the store is
untyped JSON on disk; a partial/garbage entry is a legitimate runtime shape). On DECLINE,
`platformsSource` falls back to the incoming `source` only if `existing.platformsSource` is
absent — an entry with a timestamp but no source is stamped honestly rather than left blank.

Module header must carry the D-B honesty statement in full, and must name the two writers
(`games.ts` `appdetails`, `platformCapture.ts` PICS `oslist`) plus WR-02 / CR-01 as the
provenance of the rule.

**(c) New `__tests__/platformPrecedence.test.ts`** — pure unit tests, no mocks needed
(mirror `flagsCensus.test.ts`'s no-mock idiom). Cover every bullet in `<behavior>`, in BOTH
directions explicitly:
- PICS declines a strictly-newer `appdetails` capture (result keeps appdetails' triple,
  `platformsSource: 'appdetails'`, the older timestamp, `accepted: false`).
- `appdetails` declines a strictly-newer PICS capture (mirror assertions).
- PICS wins when it is the newer one; `appdetails` wins when it is the newer one.
- Equal timestamps -> incoming accepted.
- No `platformsCapturedAt` -> accepted, for `'pics'` AND for `'appdetails'`.
- `platformsCapturedAt: NaN` / a string -> accepted.
- Strictly newer existing with `is_mac_native: undefined` -> accepted (constraint 2).
- Non-vacuity saboteur (repo idiom, see `platformCapture.test.ts`'s `treatsAbsentAsAvailable`
  and `wholesaleSet`): define a local `lastWriteAlwaysWins()` that ignores timestamps and
  returns the incoming triple unconditionally, and assert it DISAGREES with
  `resolvePlatformWrite` on the strictly-newer-existing case. That is the exact shipped
  behaviour this task replaces, so the test proves the new branch discriminates.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; npx jest src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts</automated>
  </verify>
  <done>
    `platformPrecedence.test.ts` passes with coverage of both directions, the legacy
    no-timestamp case, the partial-triple case, and a saboteur that disagrees on the
    strictly-newer case. `SteamMetadataCacheEntry` carries `platformsSource?` and
    `platformsCapturedAt?`. No `Migration` was added anywhere. Comments state the D-B
    limitation and never claim the two-writer conflict is resolved.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the PICS writer to the precedence rule and serialise the bulk critical section</name>
  <files>
    src/backend/storeManagers/steam/platformCapture.ts,
    src/backend/storeManagers/steam/__tests__/platformCapture.test.ts
  </files>
  <behavior>
    - `mergePlatformCapture` stamps `platformsSource: 'pics'` + `platformsCapturedAt` on every
      accepted write, alongside the existing three booleans + `platformsCaptured: true`.
    - `mergePlatformCapture` DECLINES (no `steamMetadataStore.set` call at all) when
      `resolvePlatformWrite` returns `accepted: false` — the entry already holds a strictly
      newer, complete triple, so a rewrite would only burn two `notifyStoreChanged` IPC
      messages to persist the values already there.
    - Every carry-forward field still survives an accepted merge (existing coverage stays green).
    - Two overlapping `captureOwnedAppPlatforms` calls run one-after-the-other: the second
      run's scoping filter observes the first run's writes, so with a store-backed mock the
      second call scopes to zero and `getProductInfo` is called exactly ONCE.
    - The lock never wedges: a section that throws still releases, and the next section runs.
    - `captureOwnedAppPlatforms` still resolves `failed: true` (never rejects) when the locked
      section throws.
  </behavior>
  <action>
Per D-C and hard constraint 5.

**(a) Precedence inside `mergePlatformCapture`.** Import `resolvePlatformWrite` from
`./platformPrecedence`. Keep the function synchronous and keep its signature
`(appId: string, platforms: CapturedPlatforms): void`. Read `existing` first (unchanged),
then call `resolvePlatformWrite(existing, platforms, 'pics', Date.now())`. If
`resolution.accepted === false`, RETURN WITHOUT CALLING `.set()`. Otherwise build `merged` as
today — `...existing` spread FIRST (that spread is what makes every carry-forward, including
fields added to `SteamMetadataCacheEntry` later, survive automatically), then the three
booleans from `resolution.platforms`, `platformsCaptured: true`, and the two new stamp fields
from `resolution`. Do not restructure the existing `as SteamMetadataCacheEntry` narrow cast or
its comment.

Extend the JSDoc: state that this writer now DECLINES rather than clobbers when the entry
carries a strictly newer capture, and carry the D-B honesty sentence — the ordering is now
explicit and auditable and a silently-lost write is impossible, but a genuine source
disagreement is NOT reconciled; which answer survives still depends on which sync ran last,
and `platformsSource`/`platformsCapturedAt` are what make that inspectable. Do not describe
WR-02 as closed.

**(b) Serialisation.** Add a module-local promise-chain mutex and export it for the test:
```
let platformCaptureChain: Promise<unknown> = Promise.resolve()
export async function withPlatformCaptureLock<T>(section: () => Promise<T>): Promise<T>
```
Chain `section` onto `platformCaptureChain` so it runs after the previous section settles
REGARDLESS of that section's outcome, and immediately re-point `platformCaptureChain` at a
swallowed-outcome continuation so a rejected section can never poison the chain for every
later caller. Return the un-swallowed promise to the caller so the caller still sees the
throw.

In `captureOwnedAppPlatforms`, wrap the WHOLE existing critical section — the
`depotSignalCaptured` scoping filter, the `getProductInfo` await, and the per-app
`mergePlatformCapture` loop — in `withPlatformCaptureLock`, and place that call INSIDE the
existing `try` (constraint 5 / 34.15-09 D-07 finding #2: the `try` was deliberately moved
above the filter step precisely so nothing in this function can reject into `library.ts`'s
Step 1.5 call site, which carries no try/catch of its own). Keep the mutable outer
`scopedCount` binding and its rationale; it must still be assignable from inside the locked
section and readable from the `catch`. The existing zero-scope short-circuit must keep
returning from inside the lock.

Document why the lock exists and what it does NOT do: it makes a bulk run's scope-then-write
atomic with respect to ANOTHER BULK RUN (the 34.15 D-16 UAT finding F-2 shape, where a second
concurrent `refresh()` re-scoped all 378 apps because it could not see the first's writes). It
deliberately does NOT exclude the `appdetails` writer in `games.ts` — that writer's own
read-modify-write is synchronous and therefore already atomic, and cross-writer ordering is
the precedence rule's job, not the lock's.

**(c) Tests in the existing `__tests__/platformCapture.test.ts`** (extend; do not rewrite —
all 25 existing tests must stay green, and they will, since no existing fixture carries
`platformsCapturedAt`):
- Accepted merge stamps `platformsSource: 'pics'` and a numeric `platformsCapturedAt`.
- Declined merge: `mockedGet` returns an entry with a strictly-future `platformsCapturedAt`,
  `platformsSource: 'appdetails'` and a complete triple -> `mockedSet` is NOT called.
- Accepted-over-older: existing has an OLDER `platformsCapturedAt` -> `.set` called, the three
  booleans are the PICS ones, `platformsSource` flips to `'pics'`, and every carry-forward
  (`art_cover`, `art_square`, `extra`, `is_delisted`, `mac_arch`, `mac_arch_verified`,
  `mac_arch_source`, `forcedWindowsViaBottle`) is still on the written value.
- Legacy entry (`platformsCaptured: true`, no `platformsCapturedAt`) -> `.set` called.
- Serialisation: in one test replace the `steamMetadataStore` mock implementations with a real
  in-memory `Map` (get/set backed by it) so writes are visible to later reads. Give
  `getProductInfo` a deferred promise you resolve manually. Fire
  `captureOwnedAppPlatforms(client, [1, 2])` TWICE without awaiting in between, resolve the
  deferred, `await Promise.all([...])`, and assert `getProductInfo` was called exactly once
  and the second summary reports `scopedCount: 0`. Add a comment recording that without the
  lock the second run scopes 2 and re-writes — that is the F-2 shape this proves impossible.
- Lock does not wedge: `await expect(withPlatformCaptureLock(async () => { throw new Error('x') })).rejects.toThrow()`
  followed by a second `withPlatformCaptureLock` section that resolves normally — proving a
  rejected section did not poison the chain.
- Fail-soft with the lock in place: keep the existing filter-throws test green, and add one
  asserting that a `captureOwnedAppPlatforms` call made immediately AFTER a failing one still
  resolves (no rejection, no wedge).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; npx jest src/backend/storeManagers/steam/__tests__/platformCapture.test.ts</automated>
  </verify>
  <done>
    All previously-existing platformCapture tests still pass, plus new coverage for: the
    'pics' stamp, a declined write making no `.set()` call, an accepted write preserving all
    eight carry-forwards, a legacy entry being writable, two concurrent captures issuing
    exactly ONE `getProductInfo` with the second scoping to zero, a throwing locked section
    not poisoning the chain, and `captureOwnedAppPlatforms` still never rejecting.
    `parseOslistPlatforms` and `depotSignalCaptured` are byte-unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire the appdetails writer, run the full gates, and close the todo</name>
  <files>
    src/backend/storeManagers/steam/games.ts,
    src/backend/storeManagers/steam/__tests__/games.test.ts,
    .planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md,
    .planning/todos/completed/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md
  </files>
  <behavior>
    - An `appdetails` fetch whose entry carries a strictly newer PICS capture persists the
      PICS triple, keeps `platformsSource: 'pics'` and the PICS timestamp, and pushes a
      `GameInfo` carrying that SAME triple — cache and frontend never disagree.
    - An `appdetails` fetch over an older PICS capture wins: the persisted triple is the
      appdetails one, stamped `platformsSource: 'appdetails'` with a fresh timestamp.
    - A legacy entry with no `platformsCapturedAt` is writable by `appdetails`.
    - `mac_arch_verified` / `mac_arch_source` / `forcedWindowsViaBottle` still survive both the
      accepted and the declined path (the enumerated-literal carry-forward obligation).
    - The existing DETAIL-01 / D-17 / self-heal / W7-durability tests stay green unchanged
      (no fixture carries `platformsCapturedAt`, so the effective triple equals the appdetails
      triple in every pre-existing test).
  </behavior>
  <action>
Per D-A/D-B and hard constraints 1 and 2.

**(a) `games.ts` `fetchMetadataIfNeeded`.** Import `resolvePlatformWrite` from
`./platformPrecedence`. Leave lines 654-656 computing the raw appdetails triple as-is. After
the `existingMeta` read (line 666), call
`resolvePlatformWrite(existingMeta, { is_windows_native, is_mac_native, is_linux_native }, 'appdetails', Date.now())`
and destructure the EFFECTIVE triple from `resolution.platforms`.

Use the EFFECTIVE triple — never the raw appdetails values — everywhere downstream in this
function:
- the `mac_arch` derivation gate at 668-672 (`is_mac_native`),
- the `mac_arch_source: 'minos'` branch inside the `set()` literal (~725),
- the `updated: GameInfo` literal's `is_mac_native` / `is_linux_native` / `is_windows_native`
  (679-681), which feeds `library.set()` and the `pushGameToLibrary` message,
- the three booleans inside the `steamMetadataStore.set()` literal (712-714).

That single-source rule is the point: a declined cache write that still pushed the appdetails
triple to the frontend would recreate CR-01's exact shape (a stale seed reaching the install
dialog's glyph row) with the polarity flipped. Add a comment saying so.

Add `platformsSource: resolution.platformsSource` and
`platformsCapturedAt: resolution.platformsCapturedAt` to the `set()` literal. This literal is
ENUMERATED, not a `...existing` spread, so both fields MUST be listed explicitly or a declined
write would erase the stamp it is honouring — the T-18-02-04 carry-forward trap the existing
comment block at 695-707 already documents at length. Extend that comment block to name the
two new fields as standing carry-forward obligations.

Keep `platformsCaptured: true` and `steamPlatformsCaptured: true` unconditional: after this
write the entry has a platform answer either way. Do not touch the delisted branch at 609
(it spreads `...existing`, so the stamp survives it for free) and do not touch
`markForcedWindowsViaBottle` / `clearForcedWindowsViaBottle` / `verifyMacArchGroundTruth`
(all spread `...existing`).

Carry the D-B honesty sentence into the comment here too, phrased for this writer.

**(b) Tests in `__tests__/games.test.ts`** — add ONE new `describe` block near the DETAIL-01
platform-capture tests (~line 483), following the file's established idiom exactly
(`(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)`, `library.set(APP_ID, makeEntry())`,
`(steamMetadataStore.get as jest.Mock).mockReturnValue(...)`, `new SteamGame(APP_ID).getGameInfo()`,
`await flushAsync()`, then read `(steamMetadataStore.set as jest.Mock).mock.calls[0]` and
`library.get(APP_ID)`). `fixtureApiResponse` gives `windows:true, mac:true, linux:false`, so
use a conflicting PICS fixture such as `{ is_windows_native: true, is_mac_native: false, is_linux_native: true }`
to make the two sources genuinely disagree. Cover:
- Declined: existing carries `platformsSource: 'pics'` + `platformsCapturedAt: Date.now() + 60_000`
  + the conflicting complete triple -> the written entry keeps the PICS triple, keeps
  `platformsSource: 'pics'` and that timestamp, AND `library.get(APP_ID)` plus the
  `pushGameToLibrary` payload carry the same PICS triple (assert both — the split-brain check
  is the whole point).
- Accepted: existing carries the same conflicting triple but `platformsCapturedAt: Date.now() - 60_000`
  -> the written entry carries the appdetails triple, `platformsSource: 'appdetails'`, and a
  `platformsCapturedAt` >= the older one.
- Legacy: existing has `platformsCaptured: true, is_windows_native: false` and NO
  `platformsCapturedAt` -> the appdetails triple is written and stamped.
- Carry-forward on the DECLINED path: existing also has `mac_arch: '64'`,
  `mac_arch_verified: true`, `mac_arch_source: 'macho'`, `forcedWindowsViaBottle: true` ->
  all four still present on the written value.

Remember ts-jest is transpile-only: assert runtime values, never types.

**(c) Full gates.** Run the whole suite and the type checker, then prettier over the touched
files.

**(d) Close the todo.** `git mv .planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md .planning/todos/completed/`
as the FINAL step. Do not edit WR-03 or WR-04 anywhere — they stay open by decision (the
todo's "Related, also open" section documents them and must survive the move intact).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; npx jest src/backend/storeManagers/steam/__tests__/games.test.ts &amp;&amp; npx jest &amp;&amp; pnpm codecheck &amp;&amp; npx prettier --check src/backend/storeManagers/steam/platformPrecedence.ts src/backend/storeManagers/steam/platformCapture.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/electronStores.ts src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts src/backend/storeManagers/steam/__tests__/platformCapture.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts &amp;&amp; test -f .planning/todos/completed/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md &amp;&amp; test ! -f .planning/todos/pending/2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md</automated>
  </verify>
  <done>
    Full jest suite green (no regression against the 34.15 baseline of 283 suites / 5898
    passed / 1 skipped, plus the new tests), `tsc --noEmit` reports zero errors, prettier
    clean on all touched files, and the source todo now lives in `.planning/todos/completed/`
    with its WR-03/WR-04 section unmodified.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM PICS -> backend | `appinfo.common.oslist` is MEDIUM-confidence, Valve-controlled, untyped wire data |
| Steam store API -> backend | `appdetails` `platforms` object, public unauthenticated endpoint, 403-throttled in bulk |
| on-disk `steam_metadata.json` -> backend | untyped JSON; partial, legacy and corrupted entry shapes are legitimate runtime inputs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qcn-01 | Tampering | `platformsCapturedAt` read in `resolvePlatformWrite` | mitigate | Guard with `typeof === 'number' && Number.isFinite()`; a corrupted or far-future-typed value degrades to "indefinitely old / writable", never to a `NaN` comparison that silently declines every future write (Task 1) |
| T-qcn-02 | Denial of Service | `withPlatformCaptureLock` chain in `platformCapture.ts` | mitigate | The chain is re-pointed at a swallowed-outcome continuation so one rejected section cannot permanently wedge every later bulk capture; explicitly tested (Task 2) |
| T-qcn-03 | Denial of Service | `captureOwnedAppPlatforms` never-throws contract (34.15 D-03) | mitigate | Lock acquisition lives INSIDE the existing `try`; `library.ts`'s Step 1.5 call site has no try/catch of its own, so a rejection there is an unhandled-rejection hole on the unscoped mount path. Regression-tested (Task 2) |
| T-qcn-04 | Information Disclosure | new log/comment surface | accept | No new logging of user identity, tokens or SteamID64; the two new fields are a source enum and an epoch ms integer |
| T-qcn-05 | Tampering | carry-forward loss on the enumerated `games.ts` `set()` literal | mitigate | Both new fields explicitly enumerated; a declined-path carry-forward test asserts `mac_arch`/`mac_arch_verified`/`mac_arch_source`/`forcedWindowsViaBottle` survive (Task 3) |
| T-qcn-SC | Tampering | npm/pip/cargo installs | n/a | NO package installs in this plan — no dependency is added, removed or upgraded. Nothing to audit |
</threat_model>

<verification>
- `npx jest` — full suite green.
- `pnpm codecheck` — `tsc --noEmit`, zero errors.
- `grep -n "resolvePlatformWrite" src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/platformCapture.ts` — both writers call the shared function; neither implements its own comparison.
- `grep -c "" src/backend/storeManagers/steam/platformPrecedence.ts` — the new module exists.
- `git diff --stat src/backend/storeManagers/steam/metadataCapture.ts src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts` — EMPTY. `depotSignalCaptured` and `hasSteamWindowsDepot` are DO-NOT-TOUCH (hard constraint 4).
- `git diff --stat src/backend/storeManagers/steam/library.ts src/frontend/.../librarySyncIndicator.ts` — EMPTY. WR-03 and WR-04 stay open (scope exclusion).
- `grep -rn "new Migration\|applyMigrations" src/backend/storeManagers/steam/` — no new migration (D-D).
- No user-facing strings added, so the standing localisation requirement is N/A for this task.
</verification>

<success_criteria>
- Both platform writers decide by timestamp, via one shared function; "which call ran last" no longer determines the outcome.
- Precedence is symmetric and proven in BOTH directions by unit tests, plus the legacy no-timestamp case and the partial-triple safety case.
- Every accepted write stamps `platformsSource` + `platformsCapturedAt`; every declined write preserves the existing stamp rather than erasing it.
- Two concurrent bulk captures issue exactly one `getProductInfo`; the second observes the first's writes.
- `captureOwnedAppPlatforms` still never rejects, including when the new lock/precedence path errors.
- All eight carry-forward fields survive both writers on both the accepted and the declined path.
- Comments state, plainly and without hedging, that this makes the ordering explicit and auditable but does NOT reconcile a genuine source disagreement.
- Full jest suite green, `tsc --noEmit` clean, todo moved to `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/260816-qcn-steam-platform-signal-precedence-rule-an/260816-qcn-SUMMARY.md` when done.
</output>
