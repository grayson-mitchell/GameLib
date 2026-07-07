# Phase 13: Keys-Waiting + Giftable-Spares Views - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/common/humble/viewFilters.ts` (NEW) | utility | transform | `src/common/humble/groupKeys.ts` | exact |
| `src/common/humble/urgencyBadge.ts` (NEW) | utility | transform | `src/common/humble/expirationDisplay.ts` | exact |
| `src/frontend/screens/Humble/Keys/index.tsx` (MODIFIED → parent route/layout) | component | request-response (routing) | itself, pre-refactor (this exact file) + `src/frontend/App.tsx` Root's `<Outlet/>` shell | exact (self, restructured) |
| `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (NEW child route) | component | CRUD (read) | `src/frontend/screens/Humble/Keys/index.tsx` (pre-refactor render body) | role-match |
| `src/frontend/screens/Humble/Keys/Spares/index.tsx` (NEW child route) | component | CRUD (read) + event-driven (gift action) | `src/frontend/screens/Humble/Keys/index.tsx` (render body) + `GameCard/index.tsx` (dialog-gated action) | role-match |
| `src/frontend/screens/Humble/Keys/All/index.tsx` (NEW child route) | component | CRUD (read) | `src/frontend/screens/Humble/Keys/index.tsx` (render body, moved verbatim) | exact |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (MODIFIED — extend props) | component | transform (presentational) | itself (extend in place) | exact |
| `src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx` (NEW) | component | transform (presentational) | `HumbleKeyRow`'s inline state-badge `<span>` | role-match |
| `src/frontend/App.tsx` (MODIFIED — route table) | route/config | request-response (routing) | itself, `settings/:type` / `humble-keys` entries already in the table | exact |
| `src/backend/humble/electronStores.ts` (MODIFIED — add store) | config | CRUD | `humbleOwnershipOverrideStore` declaration in same file | exact |
| `src/backend/humble/user.ts` (MODIFIED — disconnect carve-out) | service | event-driven (lifecycle) | its own existing carve-out comment block (D-04/D-42/D-43) | exact |
| `src/backend/humble/ipc_handler.ts` (MODIFIED — new handler) | controller (IPC) | request-response | `humbleSetOwnershipOverride` handler in same file | exact |
| `src/backend/humble/library.ts` (MODIFIED — record/read gifted-at) | service | CRUD | `setOwnershipOverride`/`clearOwnershipOverride` in same file | exact |
| `src/common/types/ipc.ts` (MODIFIED — new IPC signature) | config (types) | request-response | `humbleSetOwnershipOverride` type entry in same file | exact |
| `src/backend/humble/__tests__/viewFilters.test.ts` + `urgencyBadge.test.ts` + gifted-at store test (NEW) | test | transform / CRUD | `groupKeys.test.ts`, `expirationDisplay.test.ts` (name unread but same style), `electronStores.test.ts` | exact |

## Pattern Assignments

### `src/common/humble/viewFilters.ts` (utility, transform)

**Analog:** `src/common/humble/groupKeys.ts` (full file read, 84 lines)

**Header/doc-comment pattern** (lines 1-16):
```typescript
import { HumbleKey, HumbleKeyState } from '../types/humble'

/**
 * Pure display-level grouping for the Humble Keys screen (D-21 + live-UAT
 * round 7). Kept in common/ (no React, no i18n, no I/O) so it is
 * unit-testable from the backend jest project — the frontend screen only
 * maps the returned groups to components.
 */
```
Reuse this exact framing for `viewFilters.ts`'s top comment (pure, no I/O, unit-tested from backend jest project, D-53/54/55/56 references instead of D-21).

**Comparator pattern** (lines 44-50, `byExpiringSoonest`):
```typescript
function byExpiringSoonest(a: HumbleKey, b: HumbleKey): number {
  if (a.expiration === null && b.expiration === null) return 0
  if (a.expiration === null) return 1
  if (b.expiration === null) return -1
  return new Date(a.expiration).getTime() - new Date(b.expiration).getTime()
}
```
D-56's `compareWaiting` (soonest-first, then alphabetical for undated) is a direct extension of this exact comparator shape — RESEARCH.md's Pattern 2 code example already drafts it; copy that draft verbatim as the implementation starting point:
```typescript
const WAITING_STATES = new Set(['UNPICKED', 'UNREVEALED', 'REVEALED'])

function compareWaiting(a: HumbleKey, b: HumbleKey): number {
  if (a.expiration !== null && b.expiration !== null) {
    return new Date(a.expiration).getTime() - new Date(b.expiration).getTime()
  }
  if (a.expiration !== null) return -1
  if (b.expiration !== null) return 1
  return a.title.localeCompare(b.title)
}

export function selectKeysWaiting(keys: HumbleKey[]): HumbleKey[] {
  return keys
    .filter((k) => !k.ownedElsewhere && WAITING_STATES.has(k.state))
    .sort(compareWaiting)
}

// D-54/D-55: owned-elsewhere AND UNREVEALED only.
export function selectGiftableSpares(keys: HumbleKey[]): HumbleKey[] {
  return keys.filter((k) => k.ownedElsewhere && k.state === 'UNREVEALED')
}
```

**Exported constant pattern** (lines 24-32, `GROUP_ORDER`): mirror the "named, exported, commented-with-decision-ID constant" convention for `WAITING_STATES` if it needs to be reused/tested independently.

**Main function signature pattern** (lines 62-84, `groupAndSortKeys`): same `(keys: HumbleKey[]) => ...` pure-function signature, single-pass filter+sort, no side effects, no React/i18n import.

---

### `src/common/humble/urgencyBadge.ts` (utility, transform)

**Analog:** `src/common/humble/expirationDisplay.ts` (full file read, 44 lines)

**Header/doc-comment pattern** (lines 1-13):
```typescript
import { HumbleKeyState } from '../types/humble'

/**
 * Pure per-state decision for what a Humble key row renders in its expiration
 * slot (live-UAT round 5 polish). Kept in common/ (no React, no i18n, no I/O)
 * so it is unit-testable from the backend jest project while the frontend row
 * component maps each kind to its translated string
 */
export type HumbleExpirationDisplay =
  | { kind: 'date'; iso: string }
  | { kind: 'no-expiration' }
  | { kind: 'no-deadline' }
  | { kind: 'blank' }
```
`urgencyBadge.ts` mirrors this exact discriminated-return-type + doc-comment shape for `UrgencyTier`. RESEARCH.md's Code Examples section already provides the full drafted implementation — use it directly:
```typescript
import { HumbleKeyState } from '../types/humble'

export type UrgencyTier = 'danger' | 'warning' | null

const BADGE_ELIGIBLE_STATES = new Set<HumbleKeyState>([
  'UNPICKED',
  'UNREVEALED',
  'REVEALED'
])

const MS_PER_DAY = 86_400_000

export function getUrgencyTier(
  state: HumbleKeyState,
  expiration: string | null,
  now: Date = new Date()
): UrgencyTier {
  if (!BADGE_ELIGIBLE_STATES.has(state) || expiration === null) {
    return null
  }
  const daysLeft = (new Date(expiration).getTime() - now.getTime()) / MS_PER_DAY
  if (daysLeft < 0) return null
  if (daysLeft <= 7) return 'danger'
  if (daysLeft <= 30) return 'warning'
  return null
}
```
**Note (UI-SPEC.md deviation):** the UI-SPEC rejects "weeks phrasing" and standardizes on `"{{N}} days left"` for the whole 2–30 day range, with a separate `"{{H}}h left"` branch under 24h. If the badge *copy* (not tier color) needs day/hour granularity beyond this tier function, add a second small pure helper (e.g. `getUrgencyCountdownParts`) in the same file, same style — do not fold hour-math into `getUrgencyTier` itself, which only decides the color tier.

**Precedent for state-based eligibility gating** (`expirationDisplay.ts` lines 30-44): the `if (state === 'REDEEMED') return {kind:'blank'}` early-return-per-state style is the same shape `BADGE_ELIGIBLE_STATES.has(state)` follows — keep state-gating as explicit named checks, not implicit fallthroughs.

---

### `src/frontend/screens/Humble/Keys/index.tsx` (component, request-response/routing) — becomes parent route

**Analog:** itself, pre-refactor (full file read, 210 lines) — this is a restructuring of existing code, not a new pattern to borrow from elsewhere.

**What moves out verbatim into `All/index.tsx`** (lines 187-207, the grouped-list render body):
```typescript
{hasKeys ? (
  <div className="humbleKeysGroupList">
    {GROUP_ORDER.map((group) => {
      const groupKeys = groups[group]
      if (!groupKeys?.length) {
        return null
      }
      return <HumbleKeyGroup key={group} group={group} keys={groupKeys} />
    })}
  </div>
) : (
  <div className="humbleKeysEmptyState">
    <h5>{t('humbleKeys.emptyTitle', 'No Humble keys yet')}</h5>
    <p>{t('humbleKeys.emptyBody', '...')}</p>
  </div>
)}
```
Move this block, plus the `groupAndSortKeys(keys)`/`hasKeys` computation (lines 100-102), into `All/index.tsx` untouched (Pitfall 4 in RESEARCH.md: do not alter spacing/order/collapse-defaults during the move).

**What stays in the parent `index.tsx`:**
- The D-20 route guard (lines 94-98): `if (!humble?.isLoggedIn) return <Navigate to={humbleLoginPath} replace />` — keep here so it gates ALL three child routes for free (per UI-SPEC.md "Sidebar entry / route guard... inherited by all three child routes automatically via the parent route").
- The sync-status header (lines 43-92, 120-185: cooldown state, progress listener, refresh button, banner) — UI-SPEC.md is explicit this renders **once** in the parent, above the tab bar, not duplicated per child (avoids triplicated `handleHumbleSyncProgress` wiring, per RESEARCH.md Open Question 2's resolution).
- Add: tab bar (`<NavLink>` × 3) + `<Outlet />` in place of the old direct grouped-list render.

**Tab bar NavLink pattern** — closest existing analog is `SidebarItem`'s NavLink usage (`src/frontend/components/UI/Sidebar/components/SidebarItem/index.tsx`, lines 57-68):
```typescript
<NavLink
  className={({ isActive }) =>
    classNames('Sidebar__item', className, {
      active: isActive || isActiveFallback
    })
  }
  to={url}
  onClick={onClick}
  data-tour={dataTour}
>
  {itemContent}
</NavLink>
```
Reuse the `className={({isActive}) => classNames(...)}` render-prop shape for each of the three new tab links (`to="waiting"`, `to="spares"`, `to="all"`, relative to the parent `humble-keys` path). Per UI-SPEC.md: active tab uses `var(--accent)`, inactive uses `var(--text-secondary)`; count badge (waiting/spares only, D-52) reuses `.humbleKeyGroupCount`'s exact chrome (see `HumbleKeyGroup` CSS below).

**Live counts (D-52):** compute `selectKeysWaiting(keys).length` / `selectGiftableSpares(keys).length` in the parent (same tier as the existing `groupAndSortKeys(keys)` call site) and pass as a prop or render directly in the tab label — do not push counts through context; they derive from data already in `humble.keys`.

---

### `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (component, CRUD/read) — NEW

**Analog:** the pre-refactor `Humble/Keys/index.tsx` render body (same file already fully read above) for the "read `humble.keys` from `ContextProvider`, render a list of `HumbleKeyRow`" shape; membership/sort logic from `selectKeysWaiting`.

**Core pattern:**
```typescript
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import HumbleKeyRow from '../components/HumbleKeyRow'

export default function HumbleKeysWaiting() {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)
  const keys = selectKeysWaiting(humble?.keys ?? [])

  return keys.length > 0 ? (
    <ul className="humbleKeysFlatList">
      {keys.map((key) => (
        <HumbleKeyRow key={`${key.gamekey}:${key.machineName}`} humbleKey={key} />
      ))}
    </ul>
  ) : (
    <div className="humbleKeysEmptyState">
      <h5>{t('humbleKeys.waitingEmptyTitle', "You're all caught up")}</h5>
      <p>{t('humbleKeys.waitingEmptyBody', 'No keys are waiting to be claimed. Check the All keys tab to see your full inventory.')}</p>
    </div>
  )
}
```
Note per D-56: this is **one flat list, no section headers** — do NOT reuse `HumbleKeyGroup`'s collapsible-section wrapper here; render `HumbleKeyRow` items directly in a single `<ul>`, unlike the All-keys tab.

**Header blurb (D-64):** a one-line `<p>` above the list — copy locked in UI-SPEC.md: `"Keys you don't own yet — claim them before they expire."`

---

### `src/frontend/screens/Humble/Keys/Spares/index.tsx` (component, CRUD/read + event-driven gift action) — NEW

**Analog 1 (list shape):** same as Waiting's analog above (`selectGiftableSpares` instead of `selectKeysWaiting`).

**Analog 2 (confirm-then-external-action):** `src/frontend/components/UI/Sidebar/components/QuitButton/index.tsx` (lines 17-30) and `src/frontend/helpers/library.ts` (lines 108-130) — both show the `showDialogModal({ title, message, buttons: [...] })` shape with a Cancel button (no-op `onClick`) and a confirm button that performs the actual side effect:
```typescript
showDialogModal({
  title: t('userselector.quit', 'Quit'),
  message: t('userselector.quitMessage', 'Are you sure you want to quit?'),
  buttons: [
    { text: t('userselector.quit', 'Quit'), onClick: handleQuit },
    { text: t('userselector.cancel', 'Cancel'), onClick: () => null }
  ]
})
```
**Adapt for D-58/UI-SPEC.md gift-confirm dialog** (exact copy is locked in `13-UI-SPEC.md`):
```typescript
showDialogModal({
  showDialog: true,
  title: t('humbleKeys.giftConfirmTitle', 'Gift this key?'),
  message: t(
    'humbleKeys.giftConfirmBody',
    "Anyone with this link can claim the key — once redeemed, it's gone for good. You'll finish gifting it on Humble's own site."
  ),
  buttons: [
    {
      text: t('button.cancel', 'Cancel'),
      onClick: () => showDialogModal({ showDialog: false })
    },
    {
      text: t('humbleKeys.giftConfirmAction', 'Open Humble'),
      onClick: () => {
        void window.api.humbleRecordGiftLinkOpened(humbleKey.machineName)
        window.api.openExternalUrl('https://www.humblebundle.com/home/keys')
        showDialogModal({ showDialog: false })
      }
    }
  ]
})
```
`showDialogModal`/`DialogModalOptions` come from `frontend/types.ts` (lines 155-163) and are pulled off `ContextProvider` (see `GameCard/index.tsx` line 111 destructure) — do not build a new dialog primitive (RESEARCH.md "Don't Hand-Roll" table).

**External-open call:** `window.api.openExternalUrl(url)` is an EXISTING IPC channel (`src/common/types/ipc.ts` line 71: `openExternalUrl: (url: string) => void`), already called the same way from `src/frontend/screens/Settings/components/NvidiaPrime.tsx` (`window.api.openExternalUrl(WIKI_URL)`) and `HeroicVersion/index.tsx`. **No new IPC channel is needed for the open itself** — only for recording the gifted-at timestamp (see backend section below).

**Header blurb (D-64):** locked copy `"You already own these games — keep the keys unrevealed and gift them instead."`

**Empty state (locked copy):** heading `"No giftable spares"`, body `"Keys show up here once they're confirmed owned elsewhere and haven't been revealed yet."`

**Mandatory safety valve (Pitfall 3):** every row here is still rendered via the shared `HumbleKeyRow` — the D-41 "Likely owned on Steam" badge + D-42 "Not the same game" override MUST still render (they already do, unconditionally, whenever `ownedElsewhere` is true — see `HumbleKeyRow` excerpt below). Do not fork or strip this.

---

### `src/frontend/screens/Humble/Keys/All/index.tsx` (component, CRUD/read) — NEW

**Analog:** the pre-refactor `Humble/Keys/index.tsx` grouped-list body verbatim (see excerpt under the parent `index.tsx` section above). Move `groupAndSortKeys(keys)` computation + the `GROUP_ORDER.map(...)` render + the (unchanged) empty state into this file exactly as they exist today. `GROUP_ORDER`/`groupAndSortKeys`/`HumbleKeyGroup` imports move with it. This view has NO header blurb (D-64 only applies to the two focused tabs) and is uncounted (D-52).

---

### `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (component, transform) — extend in place

**Analog:** itself (full file read, 94 lines) — extend, do not fork (Pitfall 3, UI-SPEC.md "Row extension").

**Current props + read-only doc-comment guard** (lines 1-17):
```typescript
type Props = {
  humbleKey: HumbleKey
}

// D-22: strictly read-only, with ONE sanctioned exception. ...
export default function HumbleKeyRow({ humbleKey }: Props) {
```
**Extend the Props type** with two new optional slots (per RESEARCH.md's "Recommended Project Structure" + UI-SPEC.md "Row extension"):
```typescript
type Props = {
  humbleKey: HumbleKey
  /** D-63: renders in all 3 tabs, computed by the caller via getUrgencyTier. */
  urgencyTier?: UrgencyTier
  /** D-60: Giftable Spares only — omitted (undefined) everywhere else. */
  giftAction?: { giftedAt: number | null; onGift: () => void }
}
```

**Existing owned-badge + D-42 override block to preserve verbatim** (lines 67-87):
```typescript
{humbleKey.ownedElsewhere && (
  <span className="humbleKeyOwnedBadge">
    {humbleKey.matchConfidence === 'exact'
      ? t('humbleKeys.ownedOnSteam', 'Owned on Steam')
      : t('humbleKeys.likelyOwnedOnSteam', 'Likely owned on Steam')}
    {humbleKey.matchConfidence === 'fuzzy' && (
      <button
        type="button"
        className="humbleKeyOwnedOverride"
        onClick={() => window.api.humbleSetOwnershipOverride(humbleKey.machineName)}
      >
        {t('humbleKeys.notTheSameGame', 'Not the same game')}
      </button>
    )}
  </span>
)}
```
This block must render byte-for-byte unchanged regardless of which tab renders the row (Pitfall 3's mandatory safety valve).

**Insertion point for the new urgency badge:** alongside the existing state badge (line 52-56 `<span className="humbleKeyStateBadge...">`), per UI-SPEC.md "same `.humbleKeyStateBadge`-family chrome... reads as a sibling, not a competing visual language" — render `<UrgencyBadge tier={urgencyTier} expiration={humbleKey.expiration} />` right after/beside the state badge span, only when `urgencyTier` prop is non-null.

**Insertion point for the gift action:** only when `giftAction` prop is provided (i.e. only from the Spares view) — render either the "Gift on Humble" button or, if `giftAction.giftedAt !== null`, the "Opened Humble gift page {{date}}" annotation instead (D-59/D-60). Keep this strictly additive — the existing D-22 read-only doc-comment at the top of the file should be updated to note the Spares-only exception (mirroring how the D-42 override is already documented as "the ONE sanctioned exception").

---

### `src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx` (component, transform) — NEW

**Analog:** `HumbleKeyRow`'s inline state-badge span (lines 52-56) for chrome, and `getExpirationDisplay`'s discriminated-kind → i18n mapping (lines 38-48) for the "map a pure-function result to translated text" shape:
```typescript
const display = getExpirationDisplay(humbleKey.state, humbleKey.expiration)
const expirationLabel =
  display.kind === 'date'
    ? t('humbleKeys.expiresOn', 'Expires {{date}}', { date: new Date(display.iso).toLocaleDateString() })
    : display.kind === 'no-deadline'
      ? t('humbleKeys.noDeadline', 'No pick deadline available')
      : ...
```
**Component shape:**
```typescript
type Props = { tier: UrgencyTier; expiration: string | null }

export default function UrgencyBadge({ tier, expiration }: Props) {
  const { t } = useTranslation()
  if (tier === null || expiration === null) return null
  // day/hour countdown math (own small helper, see urgencyBadge.ts note above)
  return (
    <span className={`humbleUrgencyBadge humbleUrgencyBadge--${tier}`}>
      {/* "{{N}} days left" / "{{H}}h left" per UI-SPEC.md copy contract */}
    </span>
  )
}
```
**CSS chrome to copy** — `src/frontend/screens/Humble/Keys/index.css` lines 198-225, the `.humbleKeyStateBadge` family:
```css
.humbleKeyStateBadge {
  padding: var(--space-3xs) var(--space-2xs);
  border-radius: var(--space-3xs);
  font-size: var(--text-sm);
  font-weight: var(--semibold);
  color: var(--neutral-01);
  white-space: nowrap;
}
.humbleKeyStateBadge--UNREDEEMABLE { background: var(--status-danger); }
```
`.humbleUrgencyBadge` should copy this exact block, with `--danger`/`--warning` modifier classes mapping to `var(--status-danger)` / `var(--status-warning)` (D-61, locked, already the site's tier→color convention — no new tokens).

---

### `src/frontend/App.tsx` (route/config, request-response) — extend route table

**Analog:** the existing flat `humble-keys` entry in the same file (lines 177-180) plus the general `createHashRouter([{ path: '/', element: <Root/>, children: [...] }])` shape (lines 128-198) and the `makeLazyFunc` helper (lines 119-126).

**Current entry to replace:**
```typescript
{
  path: 'humble-keys',
  lazy: makeLazyFunc(import('./screens/Humble/Keys'))
},
```
**New nested shape** (RESEARCH.md Pattern 1, already drafted against this exact file):
```typescript
{
  path: 'humble-keys',
  lazy: makeLazyFunc(import('./screens/Humble/Keys')), // parent: tab nav + <Outlet/>
  children: [
    { index: true, element: <Navigate to="waiting" replace /> }, // D-50
    { path: 'waiting', lazy: makeLazyFunc(import('./screens/Humble/Keys/Waiting')) },
    { path: 'spares', lazy: makeLazyFunc(import('./screens/Humble/Keys/Spares')) },
    { path: 'all', lazy: makeLazyFunc(import('./screens/Humble/Keys/All')) }
  ]
},
```
Note: this project's router is `createHashRouter`, not `createBrowserRouter` (RESEARCH.md's diagram text says "data router" generically but the actual call in this file, line 128, is `createHashRouter` — use the real import already present, do not switch router type). `Navigate` is already imported in this file's sibling usage (`path: '*'` entry, line 194-196) — reuse the same import.

---

### `src/backend/humble/electronStores.ts` (config, CRUD) — add `humbleGiftedAtStore`

**Analog:** `humbleOwnershipOverrideStore` declaration in the SAME file (lines 40-49, full file already read):
```typescript
// D-42/D-43: a user's "Not the same game" ownership-match correction, keyed
// by `machine_name`. Like humbleRevealedStore above, this store is NEVER
// cleared by HumbleUser.disconnect() — a correction must survive a
// disconnect/reconnect cycle so it cannot silently regress ...
// Kept as its own electron-store file on disk for the same isolation reason
// as humbleRevealedStore — do not merge this into humbleLibraryStore.
const humbleOwnershipOverrideStore = new CacheStore<
  { overriddenAt: number },
  string
>('humble_ownership_override', null)
```
**New store, same shape, same file, exported the same way:**
```typescript
// D-59 (reinterpreted per D-57 research resolution): records when a user
// confirmed the "Open Humble" gift action for a key, keyed by machineName.
// Guards against double-gifting the same spare. NEVER cleared by
// HumbleUser.disconnect() — same reasoning as humbleRevealedStore/
// humbleOwnershipOverrideStore above; do not add to user.ts's wipeSteps.
const humbleGiftedAtStore = new CacheStore<{ giftedAt: number }, string>(
  'humble_gifted_at',
  null
)
```
Add `humbleGiftedAtStore` to the file's final `export { ... }` block alongside the other four stores.

---

### `src/backend/humble/user.ts` (service, event-driven lifecycle) — extend disconnect carve-out

**Analog:** the file's own existing carve-out comment (lines 514-523, already fully read):
```typescript
// D-04/D-30/D-42/D-43: deliberately does NOT touch humbleRevealedStore
// or humbleOwnershipOverrideStore (or the future audit log). Both stores
// now exist (Phase 11/12) and MUST survive a disconnect/reconnect cycle
// ... Extend this policy for Phase 14's audit log the same way; never
// delete this exclusion.
```
**Action required:** update this exact comment block to also name `humbleGiftedAtStore` (three stores now excluded, not two) — do NOT add `humbleGiftedAtStore.clear()` to the `wipeSteps` array (lines 497-503). This is Pitfall 5 in RESEARCH.md verbatim — the highest-risk regression in this phase's backend surface.

---

### `src/backend/humble/ipc_handler.ts` (controller/IPC, request-response) — add handler

**Analog:** `humbleSetOwnershipOverride` handler in the SAME file (lines 39-54, already read):
```typescript
addHandler('humbleSetOwnershipOverride', async (e, machineName) => {
  const targetKey = HumbleLibrary.getKeys().find(
    (key) => key.machineName === machineName
  )
  if (!targetKey || targetKey.matchConfidence !== 'fuzzy') {
    logWarning(
      ['Rejected humbleSetOwnershipOverride for non-fuzzy machineName:', machineName],
      LogPrefix.Backend
    )
    return
  }
  HumbleLibrary.setOwnershipOverride(machineName)
})
```
**New handler, same server-side-validates-before-persisting shape:**
```typescript
// Phase 13 (D-59, reinterpreted per D-57 research resolution): records that
// the user confirmed opening Humble's gift page for a Giftable-Spares key.
// Server-side validates ownedElsewhere+UNREVEALED (the Spares membership
// rule, D-54/D-55) before persisting — mirrors humbleSetOwnershipOverride's
// "never trust renderer-only gating" precedent.
addHandler('humbleRecordGiftLinkOpened', async (e, machineName) => {
  const targetKey = HumbleLibrary.getKeys().find(
    (key) => key.machineName === machineName
  )
  if (!targetKey || !targetKey.ownedElsewhere || targetKey.state !== 'UNREVEALED') {
    logWarning(
      ['Rejected humbleRecordGiftLinkOpened for non-giftable machineName:', machineName],
      LogPrefix.Backend
    )
    return
  }
  HumbleLibrary.recordGiftLinkOpened(machineName)
})
```
C4 discipline (per RESEARCH.md Security Domain): log only the machineName (already an internal identifier, not a secret gift value) — never log a URL or any Humble-issued token; there is none in this phase's flow anyway.

---

### `src/backend/humble/library.ts` (service, CRUD) — add gifted-at read/write

**Analog:** `setOwnershipOverride`/`clearOwnershipOverride` in the SAME file (lines 338-350, already read):
```typescript
function setOwnershipOverride(machineName: string): void {
  humbleOwnershipOverrideStore.set(machineName, { overriddenAt: Date.now() })
  recomputeOwnership()
}
```
**New functions, same file, same style** (no recompute needed here — gifted-at doesn't affect classification/ownership, unlike the override):
```typescript
function recordGiftLinkOpened(machineName: string): void {
  humbleGiftedAtStore.set(machineName, { giftedAt: Date.now() })
}

function getGiftedAt(machineName: string): number | null {
  return humbleGiftedAtStore.get(machineName)?.giftedAt ?? null
}
```
Export both from the file's final `export { ... }` block (line ~638-639 area) alongside `setOwnershipOverride`/`clearOwnershipOverride`. `getKeys()` (lines 280-286) is the read-side analog for how `HumbleLibrary` exposes derived data to the IPC layer — `getGiftedAt` should be called from wherever the Spares view's row-level `giftedAt` is assembled (likely a small enrichment step alongside `getKeys()`, or a dedicated `humbleGetGiftedAt` IPC handler — planner's call based on whether `HumbleKey` gains a `giftedAt` field or the frontend queries per-row).

---

### `src/common/types/ipc.ts` (config/types, request-response) — add IPC signature

**Analog:** `humbleSetOwnershipOverride` type entry in the SAME file (line 282, already read):
```typescript
// Phase 12 (Plan 04, D-42): "Not the same game" override for a
// fuzzy-matched ownership row. Only ever meaningful for
// matchConfidence === 'fuzzy' keys — the backend validates this
// server-side (never trust renderer-only gating) and no-ops for an
// exact-match machineName.
humbleSetOwnershipOverride: (machineName: string) => Promise<void>
```
**New entry, same `AsyncIPCFunctions` interface, same doc-comment convention:**
```typescript
// Phase 13 (D-59, reinterpreted per D-57 research resolution — RESEARCH.md
// confirmed no passive gift-link field exists, so this records "opened
// Humble's gift page", not "copied a link"). Backend validates
// ownedElsewhere+UNREVEALED server-side before persisting.
humbleRecordGiftLinkOpened: (machineName: string) => Promise<void>
```
Insert directly after `humbleClearOwnershipOverride` (line 283) to keep the Humble block contiguous.

---

### Test files (test, transform/CRUD)

**Analogs:** `src/backend/humble/__tests__/groupKeys.test.ts` (partially read, lines 1-50) and `src/backend/humble/__tests__/electronStores.test.ts` (partially read, lines 1-50).

**`viewFilters.test.ts` — reuse `groupKeys.test.ts`'s exact fixture-builder pattern:**
```typescript
import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import { selectKeysWaiting, selectGiftableSpares } from 'common/humble/viewFilters'

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk',
    machineName: `mn-${Math.random().toString(36).slice(2)}`,
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}
```
Copy `makeKey` verbatim (already the exact fixture shape needed since `HumbleKey` is unchanged this phase) and write `describe('selectKeysWaiting', ...)` / `describe('selectGiftableSpares', ...)` blocks following the same `describe`/`test` nesting style seen in `groupKeys.test.ts` lines 30-50 (`describe('GROUP_ORDER', ...)`).

**`urgencyBadge.test.ts`** — no direct file was read (test file for `expirationDisplay.ts` was located but not opened this session; do not re-open speculatively — the pure-function signature already fully specified in `common/humble/urgencyBadge.ts`'s own doc/code above is sufficient to write table-driven tests: `[state, expiration, now] -> tier` cases for the 7-day/30-day boundaries, REDEEMED/UNREDEEMABLE never-badge cases, and negative-`daysLeft` (past) returning `null`.

**Gifted-at store persistence test** — reuse `electronStores.test.ts`'s exact structure (lines 1-50, already read):
```typescript
jest.mock('electron-store')

import {
  configStore,
  humbleLibraryStore,
  humbleSyncStore,
  humbleGiftedAtStore
} from '../electronStores'

describe('humbleGiftedAtStore', () => {
  beforeEach(() => {
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
    humbleGiftedAtStore.clear()
  })

  test('is created under the store name humble_gifted_at, keyed by machineName', () => {
    const machineName = 'sometitle_steam'
    humbleGiftedAtStore.set(machineName, { giftedAt: Date.now() })
    expect(humbleGiftedAtStore.has(machineName)).toBe(true)
  })

  test('D-59: a gifted-at timestamp survives a disconnect-style wipe of configStore/humbleLibraryStore/humbleSyncStore', () => {
    const machineName = 'anothertitle_steam'
    const giftedAt = Date.now()
    humbleGiftedAtStore.set(machineName, { giftedAt })

    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    expect(humbleGiftedAtStore.has(machineName)).toBe(true)
    expect(humbleGiftedAtStore.get(machineName)).toEqual({ giftedAt })
  })
})
```
This is a near-exact copy of `electronStores.test.ts`'s `humbleOwnershipOverrideStore` describe block (lines 23-50) with the store/field names swapped — same "runs against the REAL CacheStore + electron-store (redirected to a tmp cwd)" strategy noted in that file's own header comment (lines 6-11).

## Shared Patterns

### Pure predicate/comparator helpers over `HumbleKey[]`
**Source:** `src/common/humble/groupKeys.ts` (full file), `src/common/humble/expirationDisplay.ts` (full file)
**Apply to:** `viewFilters.ts`, `urgencyBadge.ts` — no React, no i18n, no I/O; unit-testable from the backend jest project (`jest.config.js` `projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']`).
```typescript
// Signature convention: (data, ...pure params) => derived value, zero side effects
export function selectX(keys: HumbleKey[]): HumbleKey[] { ... }
export function getY(state: HumbleKeyState, expiration: string | null, now: Date = new Date()): Tier { ... }
```

### Global confirmation dialog before an irreversible/external action
**Source:** `src/frontend/screens/Library/components/GameCard/index.tsx` (line 111, 319-329), `src/frontend/components/UI/Sidebar/components/QuitButton/index.tsx` (lines 17-30), `src/frontend/helpers/library.ts` (lines 108-130)
**Apply to:** `Spares/index.tsx`'s gift-confirm flow (D-58)
```typescript
showDialogModal({
  showDialog: true,
  title: t(...),
  message: t(...),
  buttons: [
    { text: t('button.cancel', 'Cancel'), onClick: () => showDialogModal({ showDialog: false }) },
    { text: t(...), onClick: () => { /* side effect */; showDialogModal({ showDialog: false }) } }
  ]
})
```

### Server-side re-validation before persisting a renderer-triggered write
**Source:** `src/backend/humble/ipc_handler.ts` lines 39-54 (`humbleSetOwnershipOverride`)
**Apply to:** the new `humbleRecordGiftLinkOpened` handler — never trust that the renderer only shows the gift button on eligible rows; re-check `ownedElsewhere && state === 'UNREVEALED'` server-side, `logWarning` + no-op on mismatch.

### Disconnect-survival store carve-out
**Source:** `src/backend/humble/user.ts` lines 496-523; `src/backend/humble/electronStores.ts` lines 40-49
**Apply to:** `humbleGiftedAtStore` — MUST be named in the carve-out comment block in `user.ts`, MUST NOT appear in the `wipeSteps` array. This is RESEARCH.md's Pitfall 5 and the single highest-risk regression path in this phase.

### Semantic-token-only color (Phase 7 tier→color convention)
**Source:** `src/frontend/screens/Humble/Keys/index.css` lines 198-225 (`.humbleKeyStateBadge` family)
**Apply to:** `UrgencyBadge`'s CSS — `--status-danger` (≤7 days) / `--status-warning` (≤30 days), no new tokens, no hex values (locked by `13-UI-SPEC.md`'s Color section).

### `window.api.openExternalUrl` for external navigation
**Source:** `src/common/types/ipc.ts` line 71; call sites in `NvidiaPrime.tsx`, `HeroicVersion/index.tsx`, `UploadedLogFilesList/index.tsx`
**Apply to:** the Spares "Gift on Humble" action's actual external-open call — this channel already exists; do not add a new one for the open itself, only for the gifted-at persistence side effect.

## No Analog Found

None — every file in scope has at least a role-match analog already in the codebase (this is a composition phase per RESEARCH.md's own framing: "Phase 13 is architecturally a composition phase, not a phase that introduces new infrastructure").

## Metadata

**Analog search scope:** `src/common/humble/`, `src/frontend/screens/Humble/Keys/`, `src/frontend/App.tsx`, `src/backend/humble/` (electronStores.ts, user.ts, ipc_handler.ts, library.ts), `src/common/types/` (humble.ts, ipc.ts), `src/frontend/types.ts`, `src/frontend/screens/Library/components/GameCard/`, `src/frontend/components/UI/Sidebar/components/{QuitButton,SidebarItem}/`, `src/frontend/helpers/library.ts`, `src/frontend/screens/Settings/index.tsx`, `src/backend/humble/__tests__/{groupKeys,electronStores}.test.ts`
**Files scanned:** ~22 read in full or targeted excerpt this session
**Pattern extraction date:** 2026-07-07
