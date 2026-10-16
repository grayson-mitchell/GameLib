# Phase 43: Humble Keys screen — unified list replacing the three tabs - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning — **with one pre-planning spike, see D-43-11**

<domain>
## Phase Boundary

Replace the Humble Keys screen's three-tab structure (`Keys waiting` / `Giftable spares` /
`All keys`) with ONE unified list. The tab predicates stop being list-membership filters and
become PER-ROW state driving a `KEY` column.

Delivered surface, top to bottom:

1. **Title row** — `Humble Keys` + the existing refresh/last-synced control, plus a search box.
2. **Controls row** — a sort picker and a `Redeemable keys only` checkbox (see D-43-08 — this
   replaces the roadmap's `Hide redeemed keys` wording, polarity inverted).
3. **Column-header row** — `TYPE` / `GAME` / `KEY`.
4. **Rows** — three columns, `KEY` rendering one of five action scenarios.

Named `KEY` rather than Humble's "Keys and entitlements" because GameLib does not cover their
non-computer-game catalogue.

**Not in this phase:** facets, collections, filter chips, grouping modes, new sort dimensions
beyond those decided below, any change to sync/classification/ownership computation.

</domain>

<decisions>
## Implementation Decisions

### List membership — which keys become rows

- **D-43-01:** Generic-platform entries (`platform === 'generic'` — PDFs, ebooks, publisher-site
  codes) become **ordinary rows**, sorted with everything else. No special partition, no "Other"
  bucket, no sorted-last exception. Their `TYPE` renders the neutral "Other" via
  `keyTypePresentation.ts`'s `{ kind: 'unknown' }` branch — no logo, never a fabricated name,
  never the GameLib icon (D-42-03's trap, unchanged).
  *Supersedes the round-7 "Other" display partition in `groupKeys.ts`.*

- **D-43-02:** UNPICKED Choice-month pseudo-entries get a **fifth KEY scenario**: a full-width
  `Pick on Humble` deep link to Humble's Choice page. A silently-expiring pick deadline is the
  exact failure this screen exists to prevent (D-53), so text alone is not enough. The existing
  `!isUnpicked` store-glyph gate stays load-bearing — an UNPICKED row has no store key and must
  show no store glyph (pinned by the UNPICKED test in `HumbleKeyRow/__tests__/index.test.tsx`).

- **D-43-03:** UNREDEEMABLE ("Expired") keys render **no button** — state text in `KEY` only, the
  same shape as scenario 4's confident-match case. Terminal is terminal. Deliberately NOT folded
  into scenario 4: "you have it" and "you lost it" are different facts.

- **D-43-04:** **No counts anywhere.** D-52's per-tab counts (`Keys waiting (N)` /
  `Giftable spares (N)`) die with the tab bar and are not revived in the title row or the controls
  row. The list is the count. A number duplicating the list is a second source of truth that can
  drift.

### Sort

- **D-43-05:** **`Most recent` is NOT specified yet — de-risk first.** `HumbleKey`
  (`src/common/types/humble.ts:93-126`) carries no purchase/order date; verified field-by-field.
  `revealedAt`/`redeemedAt` live on `ClaimAnnotation` and exist only for keys already acted on, so
  they would sort most rows arbitrarily.

  **Run a one-off diagnostic on a populated order before specifying the sort.** Every adapter
  schema is `.passthrough()`, so a date WOULD survive if Humble sends one. The existing hook is
  `describeZeroKeyOrder`'s `fieldNames(rawOrder)` → logged as `order_fields=`
  (`src/backend/humble/classify.ts:603`) — but it only fires on the `tpkd_dict` absent/null/
  mistyped branch, which **has never fired live**. Reaching it on a populated order requires a
  deliberate temporary probe.

  Outcomes: if a date field exists → capture it and specify `Most recent` against it (costs a
  backend change plus a `HUMBLE_CLASSIFIER_VERSION` bump, currently 7). If absent → the sort picker
  ships with two evidenced options and the planner records why.

- **D-43-06:** **Default sort is `Expiring soonest`.** Carries D-53/D-56's intent forward and is
  the one ordering backed by real data on every row. Two shipped pure comparators already implement
  it: `viewFilters.ts`'s `compareWaiting` and `groupKeys.ts`'s `byExpiringSoonest` — the planner
  picks one and deletes the other rather than writing a third.

- **D-43-07:** **Nothing persists.** Search text, sort choice and the checkbox all reset on every
  mount. No `localStorage`, no lifted route state. The sketch flagged filter persistence as
  deliberately unresolved, and this screen is visited far less often than the library.

### Search and filter

- **D-43-08:** The checkbox is **`Redeemable keys only`**, not `Hide redeemed keys` — operator
  correction, 2026-09-09. **This deviates from the ROADMAP's wording deliberately.** The polarity
  inverts: checked = show only redeemable. The roadmap's label was inaccurate because it implied
  redeemed keys were the only thing being hidden, when expired keys belong in the same bucket.

  **Predicate is `WAITING_STATES.has(key.state)`** — the shipped, unit-tested constant at
  `viewFilters.ts:20` = `{UNPICKED, UNREVEALED, REVEALED}`, the exact complement of the two
  terminal states. Zero new predicate. UNPICKED is deliberately **in** (D-43-02's reasoning). The
  filter is **state-only** — it reads no ownership, platform or match-confidence field, so owned
  giftable spares and generic keys still appear when they are in a live state.

- **D-43-09:** **Checked by default.** The list opens on the actionable set — closest in spirit to
  the old Keys-waiting landing tab. Interacts with D-43-07: since nothing persists, the box is
  checked on every visit.

- **D-43-10:** **Search matches title only.** Not store name, not bundle origin. 42-04 deliberately
  dropped the `· {{origin}}` segment because 20 of 33 live keys carry the junk gift string
  "A very special gift just for you", which names no game; dragging it back into matching would
  produce confusing hits. `.humbleKeyRowTitle` is the row's single label, and it is what search
  matches.

### KEY column — the action scenarios

- **D-43-11:** **`gog_keyless` is BLOCKED on a pre-planning spike.** A keyless entitlement carries
  no code — Humble redeems straight to the linked GOG account — which is why Phase 42's GOG deep
  link has no reachable user (T-UIC-01) and why `gog_keyless` is deliberately absent from
  `REDEEM_URL_BUILDERS`.

  The operator asked whether an **in-app** path exists rather than sending the user out to a
  browser. Two candidates were found:

  | Candidate | Mechanism | Status |
  |---|---|---|
  | **A — reuse the reveal endpoint** | `POST /humbler/redeemkey` with `keytype=<machineName>&key=<gamekey>&keyindex=<n>` + session cookie (`adapter.ts:587-595`). Fully backend, one click, no browser at all. Humble's own web UI shows one Redeem button for both shapes, and `direct_redeem: true` rides on the same tpk shape the endpoint keys on (`fixtures/tpks.ts:551-557`). | **UNVERIFIED.** `RevealResponseSchema` expects a key value and may not parse a keyless response. Behaviour when the GOG↔Humble account link is absent is unknown. |
  | **B — Phase 40 embedded store browser** | `storeEmbedOpen(url, bounds, storeKey)` at `humblebundle.com/home/keys`. No domain allowlist in `storeEmbedSeam.ts`. The spike finding is decisive: *"One default cookie jar per PROCESS — every window and child shares it"*, so the embed inherits the Humble session the login webview established. Never leaves the window. | Machinery ships. Costs the `hide()`-before-modal dance (the embed composites **above** the main webview and the claim flow is a modal). |

  **Decision: probe candidate A as a spike BEFORE planning**, so the phase implements one path
  rather than branching on an unknown. Same "measure before specifying" shape as D-43-05.

  **The probe is destructive and single-shot.** The operator has exactly one live `gog_keyless`
  entitlement — the GOG game bought 2026-09-07. Redemption is irreversible (D-66 never-re-reveal).
  Plan the probe accordingly: it consumes the sample, and a success grants the game.

  **Fallback order if A fails:** B (embedded browser, `Claim on Humble`), then external browser.

  **Out of reach either way:** GameLib cannot link the GOG account itself. Phase 42 established the
  Galaxy OAuth token only reaches `api.gog.com`/`embed.gog.com`, not the storefront.

- **D-43-12:** Scenario 1's "not logged into the store" means **GameLib's connected account** —
  `steam.username` / `gog.username` / `epic.username` from `ContextProvider` (`types.ts:90-133`),
  already reachable, zero new plumbing. **This resolves ROADMAP open question 2.**

  **Stated honestly, because the planner must not overclaim it:** GameLib's login is NOT the store
  website's session. The Steam connection is a `steam-user` CM session with a refresh token; the
  redeem URL opens `store.steampowered.com/account/registerkey` in a separate browser context.
  The button therefore means *"connect this store to GameLib first"* — always true about GameLib's
  own state, and never a guarantee the redeem page will work. Do not word it as though it were.

  Rejected: reading the Phase 40 cookie jar to know the real store session. It is the login that
  actually decides success, but it makes a UI row depend on a probe with known Tauri seams
  (leading-dot blindness, `cookies_for_url()` drops, reentrant deadlock).

- **D-43-13:** For `uplay` / `battlenet` / `origin` / `origin_keyless` / `nintendo_direct` /
  `generic` / unrecognised — platforms with **no GameLib login concept and no deep link** —
  `KEY` renders **`Claim on [store]` with no login precondition**, routed to
  `HUMBLE_REDEEM_HELP_URL` through `getRedeemTarget`'s existing help branch. Scenario 1 never
  applies to them. The user keeps an action; GameLib does not claim to know a login state it
  cannot observe.

- **D-43-14:** Scenario 4's override pair stays, **mutually exclusive on the same row**. A fuzzy
  owned row shows `Not the same game`; once overridden, the same row shows
  `Undo — I do own this game` instead. Still keyed off the **override record existing**
  (`humbleGetOwnershipOverrides`), never off the cleared fuzzy/owned flags.

  Unifying the list **simplifies** WR-04 rather than complicating it: the whole awkwardness was
  that an overridden key recomputed to unowned and hopped to a different tab. Nothing moves now.
  The comment block explaining the tab-hop should be rewritten, not carried verbatim.

### Row composition

- **D-43-15:** **State badge and expiration both move into `KEY`.** `KEY` becomes the row's
  status-and-action cell — buttons when actionable, state + expiry text when not. `GAME` stays a
  clean title. This follows the roadmap's "other descriptive text moves into the KEY column"
  literally, and matches the scenarios where the no-button cases are already text.

- **D-43-16:** **`UrgencyBadge` stays adjacent to the title in `GAME`.** Urgency is about the game
  you might lose, and `GAME` is where the eye lands. Keeping it out of `KEY` stops it competing
  with the action button for attention — the opposite of its purpose. `UrgencyBadge` and
  `getUrgencyTier` are reused unchanged.

- **D-43-17:** **The D-22 read-only contract is rewritten as a KEY-column contract, not retired
  and not extended.** Its premise ("the row is read-only, interactivity is the exception") is dead
  — `KEY` is interactive in four of five scenarios. The invariant worth keeping is
  *"interactivity lives in ONE place and nowhere else"*.

  New contract to state on the component: **`TYPE` and `GAME` are strictly presentational** — no
  click handler, no button/link element, no `cursor: pointer`, no reveal/copy/expand affordance.
  **Every action lives in `KEY`** and is one of the enumerated scenarios. Same protection, aimed
  at where the risk now actually is. Do not keep a "read-only contract" with eight-plus exceptions;
  that describes nothing.

### Deleted-tab salvage

- **D-43-18:** **Collapse to one route; redirect the old three.** `/humble-keys` renders the
  unified list. `/humble-keys/waiting`, `/spares` and `/all` redirect to it rather than 404-ing —
  cheap insurance for a bookmark, a back-button history entry, or an in-app link. The
  `<Outlet/>`/child-route machinery and the index redirect go away.

  Rejected: keeping the paths as filter presets. It resurrects per-view state (the thing this phase
  removes) and collides with D-43-07.

- **D-43-19:** **The pinned "Expiring soon" section does NOT survive** (D-86/D-87/D-88/D-89 retire).
  D-43-06 already sorts exactly those keys to the top by default, so a pinned section is a second
  mechanism doing the same job — and it has no coherent meaning under `Alphabetical`.
  `UrgencyBadge` still marks them (D-43-16). `partitionWaitingByUrgency` loses its only caller.

- **D-43-20:** **Delete `HumbleKeyGroup` and `groupAndSortKeys`.** State is now a per-row concern
  rendered in `KEY`, and the "Other" bucket died with D-43-01. Dead code that survives a
  restructure is how the next reader gets misled.

  **Keep:** `STATE_LABEL_KEYS` (`stateLabels.ts` — the row's state text still needs it) and
  `GENERIC_KEY_PLATFORM` (see the landmine in Code Context — it must move before the delete).

- **D-43-21:** **Re-verify the store-icon geometry against the new row, then close both live-gate
  todos.** The restructure moves the icon into a real `TYPE` column, so the old measurements are
  moot — but the underlying risks (`fill: currentColor` inheritance across themes, alignment to
  the title line-box) apply identically to the new layout. Carry the live gate forward onto this
  phase's row; do not retire two unverified visual claims without measuring anything.

### Claude's Discretion

Not asked; the planner decides, guided by the constraints already recorded:

- **Empty states.** Three become one. The library-filtering sketch's finding applies: a zero-result
  state reached *by filtering* needs an inline recovery action, distinct from the genuinely-empty
  "you have no keys" state. With D-43-09 checking the box by default, a user with only terminal
  keys hits the filtered-empty state on first visit — that path must not read as "you have no keys".
- **Column-header row behaviour** — static labels, or clickable to sort. The roadmap specifies a
  separate sort picker, so headers are presumed static unless the planner finds a reason otherwise.
- **`TYPE` column rendering for no-logo platforms** — D-42-03's "ragged leading edge" warning now
  applies inside a real column: some rows get a logo, some get text only. Reserve the box or
  render the name; the caption must not shift horizontally between logo and no-logo rows.
- Exact copy for every new string, subject to the l10n constraints below.

### Folded Todos

- **`2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md`** (area `humble-keys-ui`,
  `severity: minor`, `ready: live-gate`) — "HumbleKeyRow store icon size, position, and alignment
  are code-level only — never verified against a live render." Folded per D-43-21: this phase's
  row restructure supersedes the geometry it describes, and inherits the obligation to measure.
- **`2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md`** (area
  `humble-keys-ui`, `severity: minor`, `ready: live-gate`) — "HumbleKeyRow store logo
  `fill: currentColor` is a code-level guarantee only — never verified against a live render."
  Folded per D-43-21. `index.css:265-272` documents why `color: var(--text-secondary)` is required
  and easy to lose; the new `TYPE` column changes the inheritance chain, so this must be re-checked
  rather than assumed to carry over.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phase decisions this phase builds on
- `.planning/phases/42-humble-key-platform-identity-evidenced-key-type-table-drivin/42-CONTEXT.md`
  — D-42-01 auto-settle→REDEEMED with provenance + Undo; D-42-02 exact-only (fuzzy never
  auto-settles); D-42-03 the key_type presentation contract and its explicit unknown branch;
  the standing repo constraints section; the UI-SPEC gate's substring false-fire, recorded.
  **Scenario 4 renders this phase's output — read it before touching ownership display.**
- `.planning/ROADMAP.md` §"Phase 43" — the phase goal, the five-scenario `KEY` column, and the
  three open questions (two now resolved here, see D-43-05 and D-43-12).

### Product spec
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — the 5-state lifecycle table and its transitions
  (§ lines 41-57), constraints C1/C2/C3/C6 (user-initiated reveal, never waste a key, no
  hands-free bulk redeem, auditable), and the out-of-scope note for one-click claim on non-Steam
  platforms (line 120).

### Pure modules this phase rewires (all unit-tested from the backend jest project)
- `src/common/humble/viewFilters.ts` — `WAITING_STATES` (D-43-08's predicate),
  `selectKeysWaiting`/`selectGiftableSpares` (become per-row state), `compareWaiting` (D-43-06),
  `partitionWaitingByUrgency` (loses its caller, D-43-19).
- `src/common/humble/groupKeys.ts` — `GENERIC_KEY_PLATFORM`, `GROUP_ORDER`, `groupAndSortKeys`,
  `byExpiringSoonest`. **Deleted by D-43-20 — but see the landmine below first.**
- `src/common/humble/keyTypePresentation.ts` — the `key_type` → presentation + redeem-target
  table. Drives `TYPE`. `REDEEM_URL_BUILDERS` is a closed set of two; `gog_keyless` is
  deliberately absent (T-UIC-01).
- `src/common/humble/urgencyBadge.ts` — `getUrgencyTier`, unchanged (D-43-16).
- `src/common/types/humble.ts` — `HumbleKey` (`:93-126`, **no date field**),
  `ClaimAnnotation` (`:230-242`, `redeemedSource`), `HumbleKeyState` (`:80-85`).

### Frontend surface being replaced
- `src/frontend/screens/Humble/Keys/index.tsx` — the route shell: D-20 guard, sync header,
  D-52 tab bar, `<Outlet/>`. Header survives; tab bar and Outlet do not.
- `src/frontend/screens/Humble/Keys/{Waiting,Spares,All}/index.tsx` — the three tabs. Their
  annotation/override/gift lifecycles must be merged into one list, not three times over.
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` — the row. Read the D-22
  contract block (`:119-136`) before rewriting it per D-43-17.
- `src/frontend/screens/Humble/Keys/index.css` — `.humbleKeyRow` is `display: flex` with
  fixed-basis action cells (`:187-212`), **not a grid**. See the layout landmine below.

### Backend touched only by the D-43-11 spike
- `src/backend/humble/adapter.ts:587-595` — the reveal POST. C5 isolation wall: every Humble HTTP
  call passes through this file, and `code` is a secret that must never reach a logger.
- `src/backend/humble/constants.ts:71` — `HUMBLE_REDEEM_PATH`; `:57` `HUMBLE_CLASSIFIER_VERSION`
  (currently 7 — a bump forces one-time reclassification of frozen orders).
- `src/backend/humble/classify.ts:582-610` — `describeZeroKeyOrder` / `fieldNames`, the D-43-05
  diagnostic hook.

### Spike and sketch findings (project-local skills)
- `.claude/skills/spike-findings-gamelib/references/tauri-embedded-store-browser.md` — the
  process-wide shared cookie jar, `add_child` geometry ownership, and the
  `hide()`-before-modal rule. Grounds D-43-11 candidate B.
- `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` — the
  Structural Reachability Review. **Mandatory reading before authoring D-43-21's live gate**;
  eight distinct contract-authoring defect classes are enumerated there.
- `.claude/skills/sketch-findings-gamelib/references/library-filtering.md` — zero-result recovery
  path, and the search-panel ordering this screen's controls row echoes in miniature.

### Gate configuration this phase must edit
- `meta/i18nGateScope.json:94-102` — enrolls the files being deleted.
- `meta/i18nGlossary.json` — store display names are do-not-translate proper nouns.
- `meta/hardcodedStringGate.ts` — `EXCLUDED_ATTRIBUTES` / `USER_FACING_ATTRIBUTES`
  (`aria-label` must stay an expression, never a literal).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`components/UI/SearchBar`** — controlled input with clear button, optional suggestions slot and
  a `loading` spinner state. Note it drives changes through a native `input` event listener rather
  than React `onChange`, deliberately, so the virtual keyboard works.
- **`components/UI/SelectField`** — MUI `Select` wrapper for the sort picker. **Trap:** GameLib's
  MUI theme is light and carries no `palette`, so every `Select` needs its own explicit colours or
  it renders wrong in the dark themes.
- **`components/UI/ToggleSwitch`** — checkbox primitive for `Redeemable keys only`, takes
  `htmlId`/`title`/`value`/`handleChange`.
- **`UrgencyBadge` + `getUrgencyTier`** — reused unchanged (D-43-16).
- **`keyTypePresentation.ts`** — already drives `TYPE`; the row's `resolvePlatformDisplay` and
  `resolveStoreLogo` helpers carry `never`-exhaustiveness guards that must survive the move.
- **`WAITING_STATES`** — becomes D-43-08's filter predicate with no new code.

### Established Patterns
- **Pure logic in `src/common/humble/`** — no React, no i18n, no I/O, unit-tested from the backend
  jest project. New sort/filter predicates belong there, not beside the component.
- **`never`-exhaustiveness over `default:`** — the row's existing switches fail `pnpm codecheck`
  when a case is added, rather than silently rendering nothing. Keep this for the five scenarios.
- **Annotation lifecycle** — `Waiting/index.tsx` and `All/index.tsx` both carry a component-lifetime
  `mountedRef` box and refresh on **both** the resolve and reject paths of every mutation (WR-02).
  Merging three tabs into one list means merging three of these; do it once, correctly.
- **New user-facing strings go in `public/locales/en/gamelib.json`, never `translation.json`** —
  the upstream-owned catalog fails CI on any write. `HumbleKeyRow` already holds both `t` and
  `tGamelib` bindings for this reason.
- **A `t()` default-argument rename is a silent no-op when the key already exists** — mint a NEW key
  for changed copy. This bites D-43-08 directly: `Redeemable keys only` must be a new key, not a
  changed default on an existing one.

### Integration Points
- **`ContextProvider`** — `humble.keys`, `humble.syncing/syncedAt/syncError`, and the per-store
  `username` fields D-43-12 reads. No new context surface needed.
- **Existing IPC, all reused unchanged:** `humbleGetClaimAnnotations`, `humbleGetOwnershipOverrides`,
  `humbleSetOwnershipOverride`, `humbleClearOwnershipOverride`, `humbleGetGiftedAt`,
  `humbleRecordGiftLinkOpened`, `humbleUndoRedeemed`, `humbleGetSyncState`, `humbleSync`.
- **`storeEmbedOpen`/`storeEmbedNavigate`** — only if D-43-11 falls back to candidate B.

### ⚠ Landmines — verified, and each one reddens CI or breaks a survivor

1. **Four files this phase deletes are enrolled in `meta/i18nGateScope.json`** — lines 94
   (`Keys/All/index.tsx`), 95 (`Keys/Spares/index.tsx`), 96 (`Keys/Waiting/index.tsx`), 98
   (`components/HumbleKeyGroup/index.tsx`). Deleting a scoped source file breaks the i18n gates in
   more than one direction. **The scope list must be edited in the same change as the deletion**,
   not afterwards.

2. **`GENERIC_KEY_PLATFORM` is exported from `groupKeys.ts`** and imported by
   `keyTypePresentation.ts` **and** `viewFilters.ts` — both survive D-43-20. Deleting `groupKeys.ts`
   strands them. **Move the constant to its own leaf module first**, then delete. This is exactly
   the WR-09 pattern that produced `stateLabels.ts` after a circular import — do not re-derive it
   the hard way.

3. **The row is flex, not grid** (`index.css:187-212`), with fixed-basis action cells chosen
   precisely because each `<li>` is its own flex container and content-sized cells stagger down the
   list. A column-header row that genuinely aligns wants Grid. **Known GameLib trap:** a 1px border
   on a fractional (`1fr`) grid track vanishes in WKWebView — and `.humbleKeyRow` carries
   `border-bottom: 1px solid`. Verify the row separator survives the conversion.

4. **`humbleKeys.rowCaption` in `translation.json` is already unused and deliberately undeleted** —
   `meta/i18nCatalogChurnGuard.ts` throws `UpstreamChurnError` on any changed path under
   `public/locales/` that is not a `gamelib.json`/`gamelib.mt.json` leaf. This phase will orphan
   more upstream keys (tab labels, per-tab empty states). **Leave every orphaned
   `translation.json` key in place.** Do not "tidy" them.

5. **`hardcodedStringGate`'s `key`/`defaultText` exemption fires on object shape alone** — nothing
   checks the pair ever reaches a `t()` call (pending todo `2026-09-07-t-exemption-fires-on-shape-alone`).
   This phase writes many new strings; a green gate here proves less than it appears to.

6. **Tests clobber the real Humble store.** `humble_library.json` was wiped to `{}` on 2026-09-07 by
   this defect. **Re-run a sync before any live gate**, and confirm the cache is populated before
   claiming a measurement.

7. **Backend jest auto-mocks i18next to echo keys** — a backend test asserting on user-facing copy
   sees the key, not the English string.

</code_context>

<specifics>
## Specific Ideas

- **"Bring it closer to Humble's own site"** is the stated design north star — the title/controls/
  header/row structure mirrors Humble's keys page. Where a decision here diverges from Humble
  (notably the `KEY` column name, D-43-08's checkbox wording), the divergence is deliberate and its
  reason is recorded.

- **The operator explicitly asked for an in-app path before accepting one that leaves the app**
  (D-43-11). Treat "opens an external browser" as a cost to be justified, not a default, anywhere
  else in this phase.

- **Copy accuracy is being actively policed.** `Hide redeemed keys` was rejected mid-discussion as
  inaccurate and replaced with `Redeemable keys only`. Apply the same standard to the five
  scenarios' button labels — a label that overstates what GameLib knows (see D-43-12's caveat about
  store login) is the specific failure mode to avoid.

</specifics>

<deferred>
## Deferred Ideas

- **Store / platform / state facets, collections, and filter chips** — the library-filtering
  sketch's full panel. This phase ships one search box, one sort picker and one checkbox, per the
  roadmap. Facets would answer "show me only my GOG keys" (the reason D-43-10 rejected searching
  store names), but they are a separate capability.
- **`Group by state` as a sort option** — preserves the All-tab view someone may rely on. Rejected
  here because the sort picker is scoped to two options.
- **Reading the Phase 40 cookie jar for true store-session state** (D-43-12's rejected option).
  Would make scenario 1 predictive rather than advisory. Blocked on the Tauri cookie seams being
  less fragile.
- **Redeem deep links for `origin` / `uplay` / `battlenet` / `nintendo_direct`** — still no
  evidenced URL and no key to test against (Phase 42 out-of-scope, unchanged).
- **Capturing a Humble order date** — in scope only if D-43-05's diagnostic finds one. If it does
  not, capturing a date GameLib synthesises itself (first-seen-at) is a possible future phase, but
  it would sort by "when GameLib noticed", not "when you bought", and must not be labelled
  `Most recent`.

### Reviewed Todos (not folded)

- `2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md`,
  `2026-08-26-winetricks-package-selection-is-temperamental...`,
  `2026-08-29-import-game-is-unlabelled-and-over-promoted...`,
  `2026-09-01-webview-amazonlogindata-is-permanently-null.md` — surfaced by the phase matcher on
  `area: ui` / `area: login` keyword overlap only. **None touch the Humble Keys screen.** Not folded.
- `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` (`ready: blocked`) — Humble
  keyring bootstrap prompts. Genuinely Humble, genuinely unrelated to this screen. Not folded.
- `2026-09-07-t-exemption-fires-on-shape-alone-never-a-real-call-site.md` — recorded as landmine 5
  above rather than folded; it is a gate defect, not a Phase 43 deliverable.

</deferred>

---

*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Context gathered: 2026-09-09*
