# Phase 42: Humble key platform identity — Pattern Map

**Mapped:** 2026-09-07
**Files analyzed:** 5 (1 new, 4 modified) + 1 reference-only (StoreLogos)
**Analogs found:** 5 / 5 (new file has 4 co-tier analogs; each modified file's analog is itself,
already read in full for the exact edit points)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/common/humble/keyTypePresentation.ts` (new — exact name TBD by planner) | utility (pure lookup table) | transform | `src/common/humble/groupKeys.ts`, `viewFilters.ts`, `urgencyBadge.ts`, `expirationDisplay.ts` | exact (same tier, same file, four-way consistent convention) |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | component | request-response (props → render) | itself (D-22 read-only contract file) | exact — this is the file being edited, not an analog |
| `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` | component | event-driven (wizard steps + external URL dispatch) | itself | exact |
| `src/backend/humble/library.ts` | service | CRUD (cache recompute) | itself | exact |
| `src/backend/humble/electronStores.ts` | store/config | CRUD (electron-store record shape) | itself, with `humbleLocalRedeemedStore`'s sibling stores as within-file precedent for schema evolution | exact |

## Pattern Assignments

### `src/common/humble/keyTypePresentation.ts` (new: utility, transform)

**Analogs:** `src/common/humble/viewFilters.ts`, `groupKeys.ts`, `urgencyBadge.ts`, `expirationDisplay.ts` — all four already exist side-by-side in `src/common/humble/` and share one convention exactly. Read in full (all four are ≤106 lines).

**Shared module-docblock convention** (near-identical opener in all four; quoting `groupKeys.ts:1-16` and `viewFilters.ts:1-11`):

```typescript
// groupKeys.ts:1-16
import { HumbleKey, HumbleKeyState } from '../types/humble'

/**
 * Pure display-level grouping for the Humble Keys screen (D-21 + live-UAT
 * round 7). Kept in common/ (no React, no i18n, no I/O) so it is
 * unit-testable from the backend jest project — the frontend screen only
 * maps the returned groups to components.
 * ...
 */

// viewFilters.ts:1-11
import { HumbleKey, HumbleKeyState } from '../types/humble'
import { GENERIC_KEY_PLATFORM } from './groupKeys'
import { getUrgencyTier } from './urgencyBadge'

/**
 * Pure view-membership + sort helpers for the Keys-waiting and Giftable-
 * spares tabs (D-53/D-54/D-55/D-56, Phase 13). Kept in common/ (no React, no
 * i18n, no I/O) so it is unit-testable from the backend jest project — the
 * frontend tabs only map the returned flat arrays to `HumbleKeyRow`s. Same
 * tier/convention as `groupKeys.ts` and `expirationDisplay.ts`.
 */
```

The new file's docblock must state the same three things every existing sibling states, in this
order: (1) what it is pure over, (2) the "Kept in common/ (no React, no i18n, no I/O) so it is
unit-testable from the backend jest project" sentence verbatim in spirit, (3) which frontend
consumer maps its output to a rendered thing. Cite `D-42-03` the same way these cite their
originating decisions.

**Export shape convention** — every one of the four exports plain named `const`s / `function`s and
plain discriminated-union `type`s, never a class, never a default export:

```typescript
// urgencyBadge.ts:15, 23-26 — discriminated-union output type, one field says which case:
export type UrgencyTier = 'danger' | 'warning' | null
export type UrgencyCountdownParts =
  | { kind: 'hours'; value: number }
  | { kind: 'days'; value: number }
  | { kind: 'none' }

// expirationDisplay.ts:14-18 — same shape, 'blank' is the no-render case:
export type HumbleExpirationDisplay =
  | { kind: 'date'; iso: string }
  | { kind: 'no-expiration' }
  | { kind: 'no-deadline' }
  | { kind: 'blank' }
```

The new table should follow this discriminated-union convention for the "no logo" case rather than
`logo: null`-as-a-magic-value, e.g. `{ logo: 'none' } | { logo: SvgImport }` or equivalent — matching
how `expirationDisplay.ts` uses `{ kind: 'blank' }` rather than `null` for its no-render case, and
how `urgencyBadge.ts` mirrors it ("mirrors `expirationDisplay.ts`'s `{ kind: 'blank' }` no-render
convention", `urgencyBadge.ts:21`). This directly serves D-42-03's "explicit unknown branch, never
a default" requirement — a `logo: 'none'` case is a value the caller must explicitly switch on, not
a fallthrough.

**Constants-location convention** — module-level `const`, uppercase-snake, with a decision-ID
comment directly above (`groupKeys.ts:18-19`, `viewFilters.ts:13-21`):

```typescript
// groupKeys.ts:18-19
/** The `key_type`/platform value that routes an entry to the Other group. */
export const GENERIC_KEY_PLATFORM = 'generic'

// viewFilters.ts:13-21
// D-53: the "claim this" set — Keys waiting includes UNPICKED Choice-month
// pseudo-entries ...
export const WAITING_STATES: Set<HumbleKeyState> = new Set([
  'UNPICKED',
  'UNREVEALED',
  'REVEALED'
])
```

The new table's per-key_type map should be a single exported `const` (object literal or `Map`),
not scattered `if`/`switch` branches, and each row/case needs its own D-42-03-citing comment for
the `steam`/`gog`/`epic`+`epic_keyless` (has logo) vs.
`origin`/`origin_keyless`/`uplay`/`battlenet`/`nintendo_direct` (no logo, proper name) vs.
`generic`/unrecognised (no logo, neutral "Other") tiers — mirroring how `viewFilters.ts:36-58` and
`groupKeys.ts:9-16` narrate *why* each partition line exists, not just what it does.

**Decision citation convention** — every rule in these four files cites its originating `D-NN` (or
`WR-NN`) inline, e.g. `groupKeys.ts:9`, `viewFilters.ts:13,36,70,79`, `urgencyBadge.ts:28,41,60`.
The new table must cite `D-42-03` at its module docblock and at the explicit-unknown-branch case
specifically (that is the one D-42-03 calls out by name as "the trap").

**Where the tests live and how they're named** — NOT under `src/common/humble/__tests__/` (that
directory does not exist: `find src/common/humble -iname "*.test.ts"` returns nothing). All four
existing `common/humble/*.ts` files are tested from **`src/backend/humble/__tests__/`**, one
`.test.ts` per source file, same base name:

```
src/backend/humble/__tests__/viewFilters.test.ts
src/backend/humble/__tests__/groupKeys.test.ts
src/backend/humble/__tests__/urgencyBadge.test.ts
src/backend/humble/__tests__/expirationDisplay.test.ts
```

Each test file states explicitly *why* it sits in the wrong-looking directory
(`groupKeys.test.ts:1-6`):

```typescript
/**
 * Unit tests for the pure grouping/sorting helper used by the Humble Keys
 * screen (D-21 + live-UAT round 7 generic->Other partition). The helper lives
 * in common/humble/groupKeys.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  GENERIC_KEY_PLATFORM,
  GROUP_ORDER,
  groupAndSortKeys
} from 'common/humble/groupKeys'
```

**This is a real fork in the repo the planner must not miss:** a separate `src/common` jest project
*does* exist (`src/common/jest.config.js`, `displayName: 'Common'`, `roots: ['<rootDir>/src/common']`,
created Phase 29 for `src/common/types/__tests__/storePolicy.test.ts`). It would be the "obviously
correct" place to put a new `src/common/humble/__tests__/` suite. **Do not use it for this file** —
every existing `common/humble/*.ts` sibling is tested from `src/backend/humble/__tests__/`, and that
test file's own docblock states the reason (jest project roots, not file location, decided it). New
test file must be `src/backend/humble/__tests__/<newFileBaseName>.test.ts`, importing from
`common/humble/<newFileBaseName>` via the `common/` path alias exactly as `groupKeys.test.ts` does.

**How to run just these suites:**

```bash
npx jest --selectProjects Backend src/backend/humble/__tests__/groupKeys.test.ts
# or, for the whole humble backend slice:
npx jest --selectProjects Backend src/backend/humble
```

(Per project memory, `--selectProjects` is case-sensitive and can fail open — use the exact
`displayName` from `src/backend/jest.config.js`, which is `'Backend'`, and verify the suite is
actually selected, not just that the command exits 0.)

---

### `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (component, request-response)

**Imports block** (`index.tsx:1-9`):

```typescript
import { useTranslation } from 'react-i18next'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey } from 'common/types/humble'
import { getExpirationDisplay } from 'common/humble/expirationDisplay'
import { UrgencyTier } from 'common/humble/urgencyBadge'
import { STATE_LABEL_KEYS } from '../../stateLabels'
import UrgencyBadge from '../UrgencyBadge'
```

This is the pattern the new table import must follow: `import { ... } from 'common/humble/<newFile>'`
alongside the existing `getExpirationDisplay`/`UrgencyTier` imports from siblings in the same
directory — same alias style, same grouping (external libs, then `common/`, then local relative).

**D-22 read-only contract block** (`index.tsx:42-57`, quoted in full — this is the comment the
planner must NOT silently violate):

```typescript
// D-22: strictly read-only, with THREE sanctioned exceptions. No click
// handler, no button/link element, no cursor:pointer, no reveal/copy/expand
// affordance beyond these — Phase 14 owns the claim UX via the wizard it
// mounts elsewhere, not general interactivity added here. Exception 1: the
// D-42 "Not the same game" override (fuzzy-matched rows only), paired with
// its WR-04 (D-71, 14-REVIEW) undo-override counterpart (`undoOverride`
// prop — rendered wherever the OVERRIDDEN key now appears, i.e.
// Keys-waiting, keyed off the override record existing). Exception 2: the
// optional `giftAction` prop (Giftable Spares tab only, Phase 13).
// Exception 3: the optional `claimAction` prop (Keys-waiting tab only,
// D-67, Phase 14) — opens the claim wizard via the caller-supplied
// onClaim/onFinish/onUndoRedeem handlers. Every other interaction remains
// forbidden. Do not "improve" this row further into a generally-interactive
// element.
```

Phase 42's store indicator is presentational only (per phase CONTEXT.md: "The store indicator is
presentational and does not need a new exception") — it must render inline in the existing caption
span, adding no click handler, no button, no new prop that carries a callback. If a future
interactive affordance is ever added here, THIS comment block is where the fourth exception gets
enumerated — do not add interactivity elsewhere in the file without updating it.

**Dual `t`/`tGamelib` i18n binding** (`index.tsx:66-69`):

```typescript
const { t } = useTranslation()
// 260823-op3: fork-added strings live in the fork-owned `gamelib`
// namespace (D-06 split-brain) — `translation.json` is upstream-owned and
// the i18n churn guard fails CI on any write to it.
const { t: tGamelib } = useTranslation('gamelib')
```

`tGamelib` is declared but the row caption at line 230 currently calls plain `t(...)`. New
translation keys this phase mints (e.g. the "Other" neutral-name string, any new caption copy) must
go through `tGamelib` and be added to `public/locales/en/gamelib.json`, never `translation.json` —
per repo-standing constraint and CONTEXT.md's explicit reminder.

**The exact caption to replace** (`index.tsx:228-235`):

```typescript
{!isUnpicked && (
  <span className="humbleKeyRowCaption">
    {t('humbleKeys.rowCaption', '{{platform}} · {{origin}}', {
      platform: humbleKey.platform,
      origin: humbleKey.origin
    })}
  </span>
)}
```

`humbleKey.platform` here is the raw lowercase `key_type` string (see `classify.ts:440` below) —
this is exactly the "steam · …" defect D-42-03 names. The rewritten block must call the new table
to resolve `humbleKey.platform` to `{ name, logo }`, render the logo via `StoreLogos`'-sibling-style
SVG import (see StoreLogos section below) only when the table returns a logo case, and always keep
`origin` in the caption — D-42-03 only changes how `platform` renders, not the `{{origin}}` half.

---

### `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` (component, event-driven)

**Imports block** (`index.tsx:1-11`):

```typescript
import './index.css'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { faCopy, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey, RevealOutcome } from 'common/types/humble'
import { RedeemKeyOutcome } from 'common/types/steam'
import { redeemOutcomeCopy } from 'frontend/components/UI/RedeemSteamKeyDialog/copy'
import ContextProvider from 'frontend/state/ContextProvider'
```

**The static help-URL constant and its rationale comment this phase must revise/subsume**
(`index.tsx:13-18`):

```typescript
// D-68/T-14-09: a single, static, generic redemption-help destination for
// EVERY non-Steam platform. No authoritative Humble key_type -> URL table
// exists (RESEARCH Open Q3) — fabricating a per-platform deep-link risks
// sending the user's real secret to a wrong/broken page. Never interpolate
// any per-key value into this string.
const NON_STEAM_REDEEM_HELP_URL = 'https://support.humblebundle.com/hc/en-us'
```

Phase 42's whole premise ("the table subsumes that fork") makes the "No authoritative ... table
exists" clause of this comment false going forward for `gog`. When the redeem fork is rewritten,
this comment must be corrected in place (not deleted wholesale — `NON_STEAM_REDEEM_HELP_URL`
remains the true fallback for `origin`/`uplay`/`battlenet`/`nintendo_direct`/`generic`/unrecognised,
per CONTEXT.md scope "Out"), citing `D-42-03`/scope-item-3 instead of "no table exists."

**`isSteam` — the boolean this file already branches on** (`index.tsx:70`):

```typescript
const isSteam = humbleKey.platform === 'steam'
```

Also consumed at `:78`, `:105`, `:411`, `:579`. The GOG-deep-link fork should follow the same
single-boolean-derived-once, reused-at-call-site convention rather than re-deriving
`humbleKey.platform === 'gog'` at every use — but since Phase 42 needs a *3-way* fork (Steam /
GOG-with-real-link / everything-else-help-URL) rather than this file's existing 2-way
Steam/not-Steam fork, prefer resolving through the new table's redeem-URL field (which already
encodes the fallback) over hand-rolling a new `isGog` boolean that duplicates the table's own logic.

**The exact fork to replace** (`index.tsx:641-669`):

```typescript
<div className="humbleClaimWizardActions">
  {isSteam ? (
    <button
      type="button"
      className="humbleClaimWizardActivationLink"
      onClick={() =>
        window.api.openExternalUrl(
          `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(
            revealedKey
          )}`
        )
      }
    >
      {t('humbleKeys.openSteam', 'Open Steam')}
      <FontAwesomeIcon icon={faExternalLinkAlt} />
    </button>
  ) : (
    <button
      type="button"
      className="humbleClaimWizardActivationLink"
      onClick={() =>
        window.api.openExternalUrl(NON_STEAM_REDEEM_HELP_URL)
      }
    >
      {t('humbleKeys.redeemOnPlatform', 'Redeem on {{platform}}', {
        platform: humbleKey.platform
      })}
      <FontAwesomeIcon icon={faExternalLinkAlt} />
    </button>
  )}
</div>
```

Per success criterion 1, the GOG branch must open
`` `https://www.gog.com/redeem/${encodeURIComponent(revealedKey)}` `` (mirroring the Steam branch's
`encodeURIComponent` usage exactly — Steam's is at `:648-650`) with prefilled code, while every
other non-Steam platform keeps routing to `NON_STEAM_REDEEM_HELP_URL` unchanged. Both buttons share
the `humbleClaimWizardActivationLink` className and the trailing `faExternalLinkAlt` icon — keep
that shared shell and only change the URL-resolution + label logic feeding it.

---

### `src/backend/humble/library.ts` (service, CRUD)

**D-48 keep-last-known block (`recomputeOwnership`'s branch, `library.ts:224-260`, quoted in
full — this is the "same reconciled overlay" the C2 guard reads that D-42-02 says the settle logic
must also read):**

```typescript
    // 14-08 gap closure (Fix 1 — UAT test 8 churn + T-14-03 C2 window):
    // classifyOrder always hard-resets ownedElsewhere:false/matchConfidence:
    // 'none' on every fresh classify (classify.ts has no Steam knowledge by
    // design). D-26 broadcasts humbleKeysUpdated after EVERY per-order
    // commit, but recomputeOwnership() below only runs once at sync END — so
    // committing classified.keys as-is would transiently reset an
    // already-owned key's overlay on every intermediate broadcast (the
    // fill-then-empty churn) AND let a mid-sync revealKey() call read a
    // transiently-false ownedElsewhere (the C2 bypass window). Fixed with a
    // merged two-branch strategy, gated on the shared getSteamGate() helper
    // (WR-01, 14-08 re-review) — the SAME gate recomputeOwnership() reads,
    // enforced structurally so the two sites can never drift:
    const steamGate = getSteamGate()
    const overlaidKeys: HumbleKey[] = steamGate.open
      ? // Branch A (gate PASSES): run the pure dedup recompute on the
        // freshly-classified keys BEFORE building the entry, for EVERY
        // order (including a brand-new never-cached one) — this fully
        // closes the T-14-03 window and eliminates the churn at its root.
        dedupRecomputeOwnership(
          classified.keys,
          steamGate.steamGames,
          (machineName) => humbleOwnershipOverrideStore.has(machineName)
        )
      : // Branch B (gate FAILS — Steam logged out, or logged in with an
        // empty cached library): carry forward each prior cached key's
        // ownedElsewhere/matchConfidence per-key, exactly like
        // revealedKeyValue is carried below (D-48 keep-last-known) — a
        // Steam hiccup mid-sync can never zero out a previously-computed
        // ownedElsewhere:true, so the C2 guard's data stays stale-but-safe.
        classified.keys.map((key) => {
          const priorKey = priorKeysByMachineName.get(key.machineName)
          return {
            ...key,
            ownedElsewhere: priorKey?.ownedElsewhere ?? key.ownedElsewhere,
            matchConfidence: priorKey?.matchConfidence ?? key.matchConfidence
          }
        })
```

`overlaidKeys` (Branch A output, or Branch B's carried-forward array) is the reconciled overlay
D-42-02 means by "read the same reconciled overlay the C2 guard reads, not a mid-recompute
intermediate." The auto-settle logic (exact-match, `state === 'REVEALED'` → REDEEMED) must consume
`overlaidKeys` at or after this point in the pipeline — never `classified.keys` directly (which is
always freshly hard-reset per the comment on line 225) and never a value read mid-way through
Branch A's `dedupRecomputeOwnership` call.

**`getClaimAnnotations` — D-77 gating this phase's provenance write re-checks against**
(`library.ts:711-734`, quoted in full):

```typescript
/**
 * Per-key row annotations for the guided claim flow's IPC surface
 * (`humbleGetClaimAnnotations`). Returns an entry for EVERY cached key —
 * even one with no timestamps at all — because the renderer needs
 * `keyindexResolved` to proactively show the Pitfall C disabled state for a
 * pre-Phase-14 cached row that has not yet been backfilled with a keyindex.
 * `revealedAt` is machineName-keyed (humbleRevealedStore) — an accepted
 * pre-existing limitation (Open Q4); `redeemedAt` is the WR-01-safe
 * composite-keyed local-redeemed timestamp. Never includes a key value.
 */
function getClaimAnnotations(): Record<string, ClaimAnnotation> {
  const result: Record<string, ClaimAnnotation> = {}
  for (const [gamekey, entry] of humbleLibraryStore.entries()) {
    for (const key of entry.keys) {
      const composite = compositeKey(gamekey, key.machineName)
      result[composite] = {
        revealedAt: humbleRevealedStore.get(key.machineName)?.revealedAt,
        redeemedAt: humbleLocalRedeemedStore.get(composite)?.redeemedAt,
        keyindexResolved: lookupKeyindex(gamekey, key.machineName) !== undefined
      }
    }
  }
  return result
}
```

`ClaimAnnotation` is defined at `src/common/types/humble.ts:230-234`:

```typescript
export interface ClaimAnnotation {
  revealedAt?: number
  redeemedAt?: number
  keyindexResolved: boolean
}
```

Today `redeemedAt` is read unconditionally from `humbleLocalRedeemedStore` regardless of *why* it
was written. Per D-42-01's constraint, once `humbleLocalRedeemedStore` records carry a
`source: 'user' | 'ownership-exact'` discriminator, whatever D-77 gating logic exists elsewhere
(consuming `redeemedAt` from this annotation to decide "only while `redeemedAt` reflects a
local-only mark") must be re-checked against records with `source: 'ownership-exact'` — CONTEXT.md
is explicit this is not assumed to still hold. `getClaimAnnotations` itself is the read-side of that
contract; grep the frontend (`Waiting/index.tsx`'s `claimAction.redeemedAt` consumer,
`HumbleKeyRow`'s undo affordance) for where `ClaimAnnotation.redeemedAt` gates behaviour before
widening the write side.

---

### `src/backend/humble/electronStores.ts` (store/config, CRUD)

**Current record shape for the store this phase extends** (`electronStores.ts:124-138`, quoted in
full — this is the exact type Phase 42 must extend additively):

```typescript
// Phase 14 guided claim flow (HCLAIM-04, D-77): marks a key as locally
// redeemed (the user confirmed "Mark as redeemed" in the wizard, ahead of any
// server confirmation). Keyed by a composite `gamekey:machineName` string
// constructed by the caller (library.ts, later plan) — same WR-01
// non-collision requirement as humbleAuditStore above. Like the other
// disconnect-exempt stores above, this store is NEVER cleared by
// HumbleUser.disconnect() (D-04 exemption) — a local redeem mark must
// survive a disconnect/reconnect cycle so it cannot silently regress and
// re-offer a key the user already redeemed. Kept as its own electron-store
// file on disk for the same isolation reason as the stores above — do not
// merge this into humbleLibraryStore.
const humbleLocalRedeemedStore = new CacheStore<{ redeemedAt: number }, string>(
  'humble_local_redeemed',
  null
)
```

**No sibling store in this file has evolved its schema yet** — every `CacheStore<...>` type
parameter in this file (`humbleRevealedStore: {revealedAt:number}`,
`humbleOwnershipOverrideStore`, `humbleGiftedAtStore: {giftedAt:number}`, `humbleAuditStore:
AuditRecord[]`, `humbleLocalRedeemedStore: {redeemedAt:number}`, `humbleNotifiedExpirationStore:
{expiration:string}`) is a first-cut shape with no prior additive migration in this file to model
against. The closest in-repo precedent for "add an optional field to an existing persisted record
type, additively" is `ClaimAnnotation` itself (`revealedAt?`/`redeemedAt?` are both optional,
`common/types/humble.ts:230-234`) — i.e. the established convention for widening a record without
breaking old entries is an **optional field** (`field?: T`), not a required field with a default,
so old on-disk JSON with no `source` key still parses as `{ redeemedAt: number }` and the reader
treats a missing `source` as the pre-Phase-42 default (`'user'`, since every existing entry was
written by the explicit "Mark as redeemed" action, never by an ownership settle).

**Required change:** the type parameter becomes
`CacheStore<{ redeemedAt: number; source?: 'user' | 'ownership-exact' }, string>`, matching the
`AuditRecord` interface's own convention of documenting **why** each field exists and what it must
never carry, directly above the type (`electronStores.ts:100-109`, `AuditRecord`, for the doc-style
to mirror):

```typescript
// D-76: identity + outcome record for the guided claim flow's audit trail.
// NEVER carries the raw key value (C4/D-76) — only what happened, to what
// title/platform, and when. Value is an append-only array per composite key.
export interface AuditRecord {
  event: string
  at: number
  outcome?: string
  title: string
  platform: string
}
```

If Phase 42 promotes the record shape to a named exported `interface` (recommended, since it will
now be read from two call sites — the explicit "Mark as redeemed" writer and the new auto-settle
writer — and both need the same type), follow this exact doc-then-interface pattern, citing
`D-42-01` for the provenance field's purpose.

**Registration list convention** — every store in the file is added to a single flat export at the
bottom (`electronStores.ts:162-172`); `humbleLocalRedeemedStore` is already registered there
(`:170`) — no new registration is needed for a schema-only change, only for a wholly new store.

---

## Shared Patterns

### `common/humble/` module conventions (applies to the new file)
**Source:** `src/common/humble/viewFilters.ts`, `groupKeys.ts`, `urgencyBadge.ts`,
`expirationDisplay.ts` (all four, cross-checked, zero disagreement between them)
**Apply to:** the new key-type presentation table
- No React, no i18n, no I/O — pure functions/consts only, `import { HumbleKey... } from '../types/humble'` as the only cross-module dependency type.
- Module docblock states purity + "unit-testable from the backend jest project" + names the frontend consumer.
- Discriminated-union return types with an explicit no-value case (`{ kind: 'none' }` / `{ kind: 'blank' }`), not `null`/`undefined` sentinels, for anything a caller must explicitly branch on — directly reusable for the "no logo" case.
- Every branch/constant carries an inline `D-NN` citation comment.

### D-22 read-only contract discipline (applies to HumbleKeyRow)
**Source:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:42-57`
**Apply to:** any edit inside `HumbleKeyRow`
- Presentational-only changes (the store logo/name) need no new exception.
- Any new interactive element does — the comment block must gain a fourth enumerated exception, not be silently bypassed.

### i18n namespace split (applies to HumbleKeyRow and HumbleClaimWizard)
**Source:** `HumbleKeyRow/index.tsx:63-69`; repo-standing constraint in `CLAUDE.md`
**Apply to:** any new user-facing string
- New/changed strings go through `tGamelib` (or the `gamelib` namespace) into `public/locales/en/gamelib.json`.
- Never write to `translation.json` — upstream-owned, CI fails any write to it.

### `encodeURIComponent(revealedKey)` deep-link construction (applies to the GOG fork)
**Source:** `HumbleClaimWizard/index.tsx:648-650` (Steam branch)
**Apply to:** the new GOG redeem-URL branch
- Same `encodeURIComponent` wrapping of the raw revealed key value before interpolation into the URL template — do not hand-roll a different escaping approach for GOG.

### Additive-only schema evolution on persisted stores (applies to electronStores.ts)
**Source:** `common/types/humble.ts:230-234` (`ClaimAnnotation`'s existing optional fields); `electronStores.ts:100-109` (`AuditRecord`'s doc style)
**Apply to:** `humbleLocalRedeemedStore`'s record type
- New field is optional (`source?: 'user' | 'ownership-exact'`), so existing on-disk JSON keeps parsing with the field simply absent.
- Missing `source` on read must be treated as `'user'` (every pre-Phase-42 entry was written by the explicit action).
- Document the field's purpose and constraint directly above the type, in the `AuditRecord` doc style.

## Reference-only: `StoreLogos` — study, do not extend

**Source:** `src/frontend/components/UI/StoreLogos/index.tsx` (full file, 29 lines):

```typescript
import { Runner } from 'common/types'
import EpicLogo from 'frontend/assets/epic-logo.svg?react'
import GOGLogo from 'frontend/assets/gog-logo.svg?react'
import GameLibIcon from 'frontend/assets/gamelib-icon.png'
import AmazonLogo from 'frontend/assets/amazon-logo.svg?react'
import ZoomLogo from 'frontend/assets/zoom-logo.svg?react'
import SteamLogo from 'frontend/assets/steam-logo.svg?react'

type Props = { runner: Runner; className?: string }

export default function StoreLogos({
  runner,
  className = 'store-icon'
}: Props) {
  switch (runner) {
    case 'legendary':
      return <EpicLogo className={className} />
    case 'gog':
      return <GOGLogo className={className} />
    case 'nile':
      return <AmazonLogo className={className} />
    case 'zoom':
      return <ZoomLogo className={className} />
    case 'steam':
      return <SteamLogo className={className} />
    default:
      return <img src={GameLibIcon} className={className} alt="GameLib" />
  }
}
```

**The importable-svg-as-component convention to reuse:** `import X from 'frontend/assets/x-logo.svg?react'`
(vite's `?react` suffix), then `<X className={className} />` — a plain className prop, no other
props. The new caption's `steam`/`gog`/`epic`/`epic_keyless` cases should import
`frontend/assets/steam-logo.svg?react`, `gog-logo.svg?react`, `epic-logo.svg?react` the same way,
directly in `HumbleKeyRow/index.tsx` (or wherever the caption's rendering component ends up) — NOT
by routing through `StoreLogos` and NOT by extending `Runner`.

**Confirmed by asset inventory** (`ls src/frontend/assets/*logo*`): logos exist for
`epic, gog, steam, amazon, zoom` (+ hardware/vendor logos unrelated to stores) — there is **no**
`uplay-logo.svg`, `battlenet-logo.svg`, `origin-logo.svg`, or `nintendo-logo.svg` in the repo. This
is concrete evidence, not just the CONTEXT.md's assertion: the "no logo, text only" branch for
those four key_types is not a shortcut, it is the only correct rendering — the assets do not exist
to fall back to.

**`Runner` type this phase must not touch** (`common/types` — not re-quoted here, confirmed via
`StoreLogos`'s own import): `legendary | gog | sideload | nile | zoom | steam`. Extending it to
carry `origin | uplay | battlenet | nintendo_direct | epic_keyless | origin_keyless` would be the
"regress that case into a fabricated URL" mistake CONTEXT.md names, applied to icons instead of
URLs. Map `key_type` string → presentation directly in the new `common/humble/` table; `Runner` is
scoped to GameLib's own installable-platform union and is a distinct concept from Humble's
redemption `key_type`.

## Existing tests that pin the current behaviour and WILL need updating

| Test | Location | What it currently pins | Why Phase 42 breaks it |
|---|---|---|---|
| `shows "Redeem on {{platform}}" and no "Open Steam" control for a non-Steam key (HCLAIM-05)` | `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx:406-426` | For `platform: 'gog'`, asserts `content).toContain('Redeem on gog')` (`:425`) and `not.toContain('Open Steam')` (`:424`) | Per success criterion 1, a GOG key must now open `https://www.gog.com/redeem/<code>` with a GOG-specific label/button, not the generic "Redeem on gog" help-URL copy. This test's `gog` fixture and its two assertions must change to expect the new GOG deep-link path; a *different* platform (e.g. `uplay` or `origin`) should be substituted here (or added alongside) to keep covering the still-generic-help-URL fallback branch. |
| `redeems a Steam key via the one-click activation link` (unnamed inline, contains the URL pin) | `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx:371-379` | `openSteam.props.onClick?.()` then `expect(mockApi.openExternalUrl).toHaveBeenCalledWith('https://store.steampowered.com/account/registerkey?key=ABCD-1234')` | Should NOT need to change — success criterion 2 requires Steam's row and redeem action stay unchanged. Confirm after the rewrite that this still passes unmodified; if it breaks, the Steam branch was touched when it should not have been. |

**No test currently pins the `HumbleKeyRow` caption text** (`'{{platform}} · {{origin}}'`/
"steam · …"). Searched exhaustively:
`find src/frontend/screens/Humble/Keys/components/HumbleKeyRow -iname "*.test.*"` returns nothing —
there is no dedicated `HumbleKeyRow` test file. The only test importing `HumbleKeyRow` at all is
`src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx` (imports it at `:22` to inspect
the *props passed to it*, via `findHumbleKeyRowProps`/`findAllHumbleKeyRowProps` helpers,
`:244-266` — it never renders the row's own DOM output or asserts on caption text). This means the
caption rewrite has **no existing regression pin to update**, but also **no existing coverage** —
planner should treat "add a caption-rendering test" as new coverage to write, not a pin to migrate,
most naturally as a new `HumbleKeyRow/__tests__/index.test.tsx` (there is none yet) or as assertions
added to the `HumbleClaimWizard`/`Waiting` suites if a dedicated row test is out of scope.

## Metadata

**Analog search scope:** `src/common/humble/`, `src/backend/humble/`, `src/frontend/screens/Humble/Keys/`, `src/frontend/components/UI/StoreLogos/`
**Files scanned:** 4 common/humble source files + 4 matching test files, `HumbleKeyRow/index.tsx`, `HumbleClaimWizard/index.tsx` (+its test file), `library.ts` (targeted sections), `electronStores.ts` (full), `StoreLogos/index.tsx` (full), `classify.ts` (targeted), `common/types/humble.ts` (targeted), jest configs (root + backend + common)
**Pattern extraction date:** 2026-09-07
