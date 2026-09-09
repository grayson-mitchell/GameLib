# Phase 43: Humble Keys screen — unified list replacing the three tabs - Research

**Researched:** 2026-09-09
**Domain:** Frontend restructuring of an existing, well-tested screen (React/TypeScript, no new
libraries, no web research performed per task scope — this is entirely a question about code that
already exists in this repo)
**Confidence:** HIGH for everything cited to a file:line below; explicitly flagged LOW/UNVERIFIED
for the two open probes (D-43-05, D-43-11), which this document scopes but does not resolve.

## Summary

CONTEXT.md and UI-SPEC.md already settle the what, the visual contract, and almost all of the how.
This research does not re-derive them. Its value is concentrated in four areas the planner needs
that neither document supplies: (1) a `## Validation Architecture` section proving, scenario by
scenario, HOW each locked decision gets verified and at which level — pure unit, frontend
function-call component test, or live gate — because this repo's frontend jest project has no
jsdom and cannot measure pixels; (2) executable scoping for the two deliberately-unresolved probes
(D-43-05, D-43-11) without resolving them; (3) a proposed `REQ-43-*` set, since none exists yet;
and (4) the concrete ordering traps in deleting three tab files, one grouping module, and one of
two comparator functions while editing three gate-configuration files.

The single most important verified finding: **`groupKeys.ts`'s wholesale deletion (D-43-20)
already resolves D-43-06's "pick one comparator, delete the other" instruction as a side effect** —
`byExpiringSoonest` lives inside the file being deleted anyway, so `compareWaiting`
(`viewFilters.ts`) survives by construction, not by an independent choice the planner must make.
This matters because the two comparators have a real behavioural difference (tie-break order for
two undated keys) that a naive test could miss — see Validation Architecture §4 for the exact
differentiating assertion.

**Primary recommendation:** Sequence the two irreversible file operations first — move
`GENERIC_KEY_PLATFORM` to its own leaf module (before deleting `groupKeys.ts`) and edit
`meta/i18nGateScope.json` in the same commit as deleting the four scoped files — then build the
grid layout and KEY-column scenario logic, then the live-gate pass for column geometry last (it is
the only thing in this phase that cannot be unit-tested).

## Architectural Responsibility Map

This is a single-process Electron/Tauri desktop app, not a web app with browser/SSR/CDN tiers — the
standard tier table does not fit. Adapted tiers for this codebase:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| List membership predicates (`WAITING_STATES`, search-match, sort comparator) | **Common** (`src/common/humble/*.ts`) | — | Pure, no React/i18n/I/O, unit-tested from the **backend** jest project per this repo's established tier convention (`viewFilters.ts`'s own doc comment) — not the frontend project |
| KEY-column scenario selection + rendering, empty states, route redirects | **Renderer** (`src/frontend/screens/Humble/Keys/**`) | Common (reads pure helpers) | React component tree; consumes Common predicates, never re-implements them |
| Claim annotations, ownership overrides, gift-link recording, sync state | **Backend** (Electron main / Tauri sidecar, via `window.api.*` IPC) | — | Existing IPC surface, entirely reused unchanged this phase (no new channels) |
| `gog_keyless` reveal (D-43-11 candidate A) | **Backend** (`src/backend/humble/adapter.ts`) | — | HTTP call to Humble via the login-window cookie seam; `code`/`key` never crosses into Renderer or logs (C5) |
| Embedded store browser (D-43-11 candidate B, fallback only) | **Backend** (`storeEmbedFlowRegistration.ts`, Rust/Tauri child webview) | Renderer (slot geometry) | Existing Phase 40 machinery; shares the process-wide cookie jar |
| i18n string resolution, `aria-label` expressions | **Renderer** | — | `t()`/`tGamelib()` at render time; governed by `meta/hardcodedStringGate.ts` |
| Column geometry (grid tracks, row separator) | **Renderer (CSS)** | — | No server/build-time layout engine exists here; correctness is only observable at runtime in a real WKWebView |

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new npm packages, zero new dependencies of any
kind. Every component, hook and IPC channel used is already present in the repo (see Component
Inventory in `43-UI-SPEC.md`). The Package Legitimacy Gate is skipped per its own scope condition
("whenever this phase installs external packages").

## Standard Stack

Not applicable in the conventional sense — this phase makes zero new library choices. It reuses,
unchanged: React function components (no new state library), MUI `Select` (via the existing
`SelectField` wrapper), `react-i18next`, `react-router-dom` (`Navigate`/redirects), FontAwesome, and
CSS Modules/SCSS custom properties. `43-UI-SPEC.md`'s Design System table already documents these
with file citations; not repeated here.

## Architecture Patterns

### System Architecture Diagram

```
User input (search text / sort choice / checkbox)
        │
        ▼
┌───────────────────────────┐      humble.keys (ContextProvider, IPC-pushed)
│ Unified Keys screen (new) │◄─────────────────────────────────────────────┐
│ src/frontend/screens/     │                                              │
│ Humble/Keys/index.tsx     │                                              │
└─────────────┬─────────────┘                                              │
              │ 1. filter: WAITING_STATES.has(state)  (common/viewFilters) │
              │ 2. filter: title.includes(query)      (NEW pure predicate)│
              │ 3. sort:   compareWaiting              (common/viewFilters)│
              ▼                                                            │
     ┌──────────────────┐                                                  │
     │ per-row KEY       │  reads: state, ownedElsewhere, matchConfidence, │
     │ scenario selector │  keyindexResolved, override-record presence     │
     │ (new, in the row  │─────────────────────────────────────────────────┘
     │ or a helper)      │
     └────────┬──────────┘
              │ scenario 1..5 / 2a / 4a / 4b / 4c / UNREDEEMABLE
              ▼
     ┌──────────────────────────┐        window.api.humble* IPC calls
     │ HumbleKeyRow (rewritten) │───────► (annotations, overrides, gift,
     │ TYPE | GAME | KEY grid   │         undo-redeem — all pre-existing)
     └──────────────────────────┘
              │ D-43-11 candidate A only
              ▼
     POST /humbler/redeemkey (adapter.ts revealKey) ──► Humble ──► GOG account
```

### Recommended Project Structure

No new top-level folders. Files touched:

```
src/frontend/screens/Humble/Keys/
├── index.tsx                 # rewritten: owns filter/sort/search state, renders one <ul>
├── index.css                 # .humbleKeyRow flex→grid; new .humbleKeysColumnHeader,
│                              # .humbleKeyColumnCell, .humbleKeyActionRow rules
├── stateLabels.ts             # UNCHANGED (kept per D-43-20)
├── Waiting/, Spares/, All/    # DELETED (D-43-18) — redirect routes replace them
└── components/
    ├── HumbleKeyRow/index.tsx # rewritten per D-43-17's KEY-column contract
    ├── HumbleKeyGroup/        # DELETED (D-43-20)
    └── UrgencyBadge/          # UNCHANGED

src/common/humble/
├── viewFilters.ts             # WAITING_STATES kept; selectKeysWaiting/selectGiftableSpares
│                              # likely become internal or unused-for-list-membership (see
│                              # Open Questions); compareWaiting kept; partitionWaitingByUrgency
│                              # loses its only caller (D-43-19)
├── groupKeys.ts                # DELETED (D-43-20) — but GENERIC_KEY_PLATFORM must move OUT
│                              # first (see landmine 2 / sequencing risk below)
├── genericKeyPlatform.ts       # NEW leaf module (proposed name) — houses the relocated constant
└── keyTypePresentation.ts, urgencyBadge.ts  # UNCHANGED
```

### Pattern: pure predicate/comparator in `common/`, consumed by the renderer

**What:** Every list-membership, filter, and sort decision is a pure function in
`src/common/humble/*.ts` — no React, no i18n, no I/O — unit-tested from the **backend** jest
project (`src/backend/humble/__tests__/viewFilters.test.ts`, `groupKeys.test.ts` — note the test
files live under `src/backend/humble/__tests__/` even though the source is in `src/common/humble/`,
per this repo's established tier convention).

**When to use:** Every new predicate this phase needs (search-matches-title, "is this row in the
`Redeemable keys only` set") belongs here, not inline in the component.

**Example — the existing pattern to follow (verified, unmodified):**
```typescript
// Source: src/common/humble/viewFilters.ts:20-24
export const WAITING_STATES: Set<HumbleKeyState> = new Set([
  'UNPICKED',
  'UNREVEALED',
  'REVEALED'
])
```

### Anti-Patterns to Avoid

- **Writing a third sort comparator.** D-43-06 explicitly forbids this — `compareWaiting` already
  exists and is unit-tested. Reuse it; do not re-derive expiration-sort logic in the component.
- **Coupling the search predicate to `origin`/store name.** D-43-10 is explicit and cites a
  measured reason (20/33 live keys carry a junk gift string in `origin`). A predicate that
  `.toLowerCase()`s and searches the whole `HumbleKey` object rather than `displayTitle` alone
  would silently violate this.
- **Deleting `groupKeys.ts` before repointing `GENERIC_KEY_PLATFORM`'s two importers.** This is
  landmine 2 from CONTEXT.md, verified below (Execution Sequencing Risk).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expiration-soonest ordering | A third comparator | `compareWaiting` (`viewFilters.ts:26-32`) | Already unit-tested, already the exact semantics D-53/D-56 specify (dated-before-undated, alphabetical tiebreak) |
| State-based actionability filter | A new `isRedeemable(key)` helper | `WAITING_STATES.has(key.state)` (`viewFilters.ts:20`) | D-43-08 pins this as the exact, zero-new-code predicate |
| Urgency color/countdown logic | New date-math in the row | `getUrgencyTier`/`getUrgencyCountdownParts` (`urgencyBadge.ts`) | D-43-16 reuses unchanged; do not re-derive the 7/30-day thresholds |
| Store display name / logo / redeem URL | Ad-hoc `if (key_type === 'steam')` branches | `getKeyTypePresentation`/`getRedeemTarget` (`keyTypePresentation.ts`) | Phase 42 already centralized this; re-introducing per-branch logic is exactly the regression Phase 42 fixed |
| Grid column alignment across header + rows | Manually matching pixel values in two places | One shared `grid-template-columns` declared once (UI-SPEC's `.humbleKeysColumnHeader, .humbleKeyRow { ... }` combined selector) | The UI-SPEC already prescribes the combined-selector pattern precisely so the numbers can never drift apart |

**Key insight:** Nearly everything this phase needs already exists as a tested pure function or a
proven component. The actual new work is thin: a search predicate, a KEY-column scenario selector,
and a CSS layout conversion. Resist inventing parallel versions of any pure helper above.

## Common Pitfalls

### Pitfall 1: Deleting a scoped source file before editing its gate-scope entry
**What goes wrong:** `meta/i18nGateScope.json:94-98` enrolls the four files this phase deletes
(`Keys/All/index.tsx`, `Keys/Spares/index.tsx`, `Keys/Waiting/index.tsx`,
`HumbleKeyGroup/index.tsx`). Deleting the files without editing the scope list in the same change
reddens the i18n gate.
**Why it happens:** The deletion and the config edit are easy to treat as separate, sequential
plan tasks.
**How to avoid:** One plan task must do both atomically (delete the four files AND remove their
four lines from `i18nGateScope.json` in the same commit/task).
**Warning signs:** CI i18n gate failing immediately after a deletion-only commit.

### Pitfall 2: Stranding `GENERIC_KEY_PLATFORM`'s importers
**What goes wrong:** `GENERIC_KEY_PLATFORM` is exported from `groupKeys.ts` (`groupKeys.ts:19`)
and imported by both `keyTypePresentation.ts:1` and `viewFilters.ts:2` — both of which survive
D-43-20. Deleting `groupKeys.ts` first breaks both importers' builds.
**Why it happens:** `groupAndSortKeys`/`HumbleKeyGroup`/`GROUP_ORDER` are the obviously-dead
things; the one surviving export in the same file is easy to miss.
**How to avoid:** Move `GENERIC_KEY_PLATFORM` to a new leaf module first (e.g.
`src/common/humble/genericKeyPlatform.ts`), repoint the two importers, verify `pnpm codecheck`
passes, THEN delete `groupKeys.ts` (and `HumbleKeyGroup/`) in a separate, later step.
**Warning signs:** `pnpm codecheck`/`tsc` reporting a missing module immediately after the delete.

### Pitfall 3: Border-vanishing on a flex→grid conversion
**What goes wrong:** `.humbleKeyRow` currently has `border-bottom: 1px solid var(--divider, ...)`
(`index.css:187-212`, confirmed by UI-SPEC's independent re-verification against
`index.css` ~188-197). This repo has a documented WKWebView trap: a 1px border on a *fractional
(`1fr`) grid track* vanishes. The border must stay on the grid **container** (`.humbleKeyRow`
itself), never moved onto the `GAME` column specifically.
**Why it happens:** A flex→grid refactor naturally tempts moving styles "closer" to the content
they visually align with.
**How to avoid:** Keep the `border-bottom` declaration on `.humbleKeyRow` (the grid container),
unchanged in selector target, only changing `display: flex` to `display: grid` plus the new
`grid-template-columns`.
**Warning signs:** The row separator disappearing specifically in the packaged Tauri build (WKWebView)
while looking fine in a Chromium-based dev tool — this defect does not reproduce outside WKWebView.

### Pitfall 4: A test that passes against either shipped comparator proves nothing
**What goes wrong:** `compareWaiting` and `byExpiringSoonest` are both valid two-argument
comparators; naive tests ("dated key sorts before undated key") pass against both, so a test suite
could look green while the wrong comparator (or a copy-pasted mix of both) shipped.
**Why it happens:** The two comparators agree on the primary key (dated-before-undated) and differ
only on the tiebreak for two undated keys — an easy case to omit from a hastily-written test.
**How to avoid:** Include the specific differentiating case from Validation Architecture §4 below
(two undated keys, non-alphabetical input order) in the test suite.
**Warning signs:** A regression where undated keys appear in Humble-sync insertion order instead
of alphabetically (or vice versa) — silent, cosmetic, easy to miss in review.

### Pitfall 5: Testing pixel geometry as if this project has jsdom
**What goes wrong:** `src/frontend/jest.config.js` is explicit and deliberate: `testEnvironment`
is the Jest default (`'node'`), NOT `'jsdom'` — jsdom/`jest-environment-jsdom`/
`react-test-renderer` are not installed (verified: no `jest-environment-jsdom` in
`package.json`'s devDependencies; confirmed against the jest.config.js comment block itself,
lines 5-13). Component tests call function components directly and inspect the returned React
element graph (see `HumbleKeyRow/__tests__/index.test.tsx`'s pattern of walking `el.props.className`).
**Why it happens:** It is tempting to write a jsdom-style geometry assertion ("the column is
104px wide") that would pass locally against nothing and never actually run.
**How to avoid:** Anything about actual rendered width, wrapping behavior, or the WKWebView border
trap MUST be a live gate, not a unit/component test. State this plainly in the plan rather than
writing an assertion that always passes.
**Warning signs:** A "passing" test that asserts a CSS class name exists but never measures
anything about the resulting layout.

## Requirements (Proposed)

`.planning/REQUIREMENTS.md` has no `REQ-42-*` section either (Phase 42 shipped via numbered
"Observable Truths" in its VERIFICATION.md instead — its own convention, not the
`REQ-<phase>-<NN>` pattern this table follows). The closest live convention in
`REQUIREMENTS.md` is Phase 37/40/23's `- [ ] **REQ-<phase>-<NN>** (D-XX): <PASS/FAIL-scoreable
text>` shape, which this table follows. **The planner/operator should add these to
`REQUIREMENTS.md` and its Traceability table; this document does not write to it.**

| REQ ID | Source Decision | Requirement (PASS/FAIL-scoreable) | Verified By |
|---|---|---|---|
| REQ-43-01 | D-43-01 | A `platform === 'generic'` key renders as an ordinary row (no partition), `TYPE` shows the neutral "Other" text at the same column width as a logo row | Unit (common) + component |
| REQ-43-02 | D-43-02 | `state === 'UNPICKED'` renders the full-width "Pick on Humble" button; `!isUnpicked` gate still suppresses the store logo/text for UNPICKED rows | Component (extends existing UNPICKED pin) |
| REQ-43-03 | D-43-03 | `state === 'UNREDEEMABLE'` renders no button, state text only, same bare-text shape as scenario 4's no-button case | Component |
| REQ-43-04 | D-43-04 | No row count renders anywhere in the title row or controls row | Component (assert absence) |
| REQ-43-05 | D-43-06, D-43-20 | Default sort is `Expiring soonest`; exactly one of `compareWaiting`/`byExpiringSoonest` survives in the codebase (the other is deleted with `groupKeys.ts`); the survivor's undated-key tiebreak is alphabetical | Unit (differentiating case, §4 below) + source census (grep for the deleted name returns 0 hits outside git history) |
| REQ-43-06 | D-43-07 | Search text, sort choice, and checkbox all reset to their defaults on every fresh render/mount — nothing reads `localStorage` or route state | Component |
| REQ-43-07 | D-43-08 | The checkbox predicate is exactly `WAITING_STATES.has(key.state)` — toggling `ownedElsewhere`, `platform`, or `matchConfidence` alone never changes inclusion | Unit (field-independence parametrized test) |
| REQ-43-08 | D-43-09 | The checkbox's initial rendered value is checked (`true`) | Component |
| REQ-43-09 | D-43-10 | A query string matching only `origin` (not `title`) produces zero matches; a query matching `title` matches regardless of `origin` content | Unit (common, new predicate) |
| REQ-43-10 | D-43-12 | Scenario 1 triggers only when the platform has a GameLib login concept AND that store's `ContextProvider` username field is falsy | Unit/component (toggle username truthy/falsy) |
| REQ-43-11 | D-43-13 | For platforms in `{uplay, battlenet, origin, origin_keyless, nintendo_direct, generic, unrecognised}`, `KEY` never renders scenario 1, always renders the no-precondition "Claim on [store]" routed to `HUMBLE_REDEEM_HELP_URL` | Component |
| REQ-43-12 | D-43-14 | On the same row, "Not the same game" and "Undo — I do own this game" are mutually exclusive, keyed strictly on override-record presence, never on cleared fuzzy/owned flags | Component (adapts existing WR-04 pattern) |
| REQ-43-13 | D-43-15 | State badge and expiration/annotation text render inside the `KEY` cell, never in `GAME` | Component |
| REQ-43-14 | D-43-16 | `UrgencyBadge` renders adjacent to the title inside `GAME`, never inside `KEY` | Component |
| REQ-43-15 | D-43-17 | `TYPE` and `GAME` contain zero click handlers, zero `<button>`/`<a>` elements, and no `cursor: pointer` rule targets them | Component (structural: walk returned element tree for onClick/href props) + CSS census |
| REQ-43-16 | D-43-18 | `/humble-keys/waiting`, `/spares`, `/all` each redirect to `/humble-keys`; `/humble-keys` itself renders the unified list, not a 404 | Component/router test |
| REQ-43-17 | D-43-19 | No pinned "Expiring soon" section renders anywhere on the unified screen; `partitionWaitingByUrgency` has zero remaining call sites | Component + source census (grep) |
| REQ-43-18 | D-43-20 | `HumbleKeyGroup` and `groupAndSortKeys` no longer exist in the tree; `GENERIC_KEY_PLATFORM` and `STATE_LABEL_KEYS` still resolve from their (possibly new) module paths; `pnpm codecheck` passes | Build/typecheck + source census |
| REQ-43-19 | D-43-21 | The `TYPE` and `KEY` column widths are visually identical across the header row and every KEY-scenario row shape (full-width button / pair / bare text), and the row separator renders as a hairline in the packaged Tauri build | **Live gate only** — no unit/component substitute exists (Pitfall 5) |
| REQ-43-20 | UI-SPEC "Empty States" | A genuinely-empty library shows the non-recovery empty state; a non-empty library filtered to zero rows shows the distinct filtered-empty state with a working "Clear search and filters" action that resets checkbox to `false` (not its `true` default) | Component |
| REQ-43-21 | UI-SPEC "Search & Filter Contract" | Search and the checkbox combine with AND (a row must satisfy both to show) | Unit/component |
| REQ-43-22 | Landmine 1 (CONTEXT.md) | `meta/i18nGateScope.json` no longer lists any of the four deleted files | Source census (CI gate itself) |
| REQ-43-23 | UI-SPEC "aria-label note" | Every `aria-label` this phase adds/keeps is an expression, never a string literal | `meta/hardcodedStringGate.ts` (existing CI gate) |
| REQ-43-24 (CONDITIONAL) | D-43-11 | **Not shippable until the spike closes.** `gog_keyless` renders scenario 2/3 with the label+destination the spike's outcome selects (candidate A, B, or external-browser) | Blocked — see Two Open Probes below |

## Two Open Probes — Scoped, Not Resolved

### D-43-05 — the `Most recent` sort diagnostic

**What exists today:** `describeZeroKeyOrder` (`classify.ts:582-610`) calls the pure, already-safe
`fieldNames(rawOrder)` helper (`classify.ts:588-595` — field NAMES/paths only, capped at 15,
never a value) but **only on the branch where `tpkd_dict` is absent, `null`, or non-object**
(`classify.ts:603-615`+). Every live order to date has a normal `tpkd_dict`, so this branch has
never fired — it cannot answer "does a populated order carry a date field?" because it only ever
inspects orders shaped like the *problem this diagnostic was built for* (zero-key extraction
failures), not populated ones.

**Smallest probe:** Add a **temporary**, unconditional call to the same `fieldNames()` helper at a
point that runs for every order regardless of `tpkd_dict` shape — the natural site is inside
`classify.ts`'s (or `library.ts`'s) per-order loop, logging `fieldNames(rawOrder)` once per order
via the existing `logInfo`/`logWarning` sidecar logger, unconditionally, not gated on any
anomaly check. This reuses the existing redaction-safe helper verbatim; it does not need a new
one.

**How it is run:** Compile the probe in, trigger one real sync (`humbleSync` IPC, or the existing
refresh button in the running app), then read the sidecar log sink. Per this repo's own
`live-gate-contract-authoring.md` reference (mandatory reading, cited in CONTEXT.md): sidecar
`logInfo`/`logWarning` calls reach `~/Library/Logs/GameLib/gamelib.log`, **never** the tee'd
terminal transcript of a `tauri:dev` run — the probe's evidence-capture instruction must read the
log file, not the terminal.

**What settles the question:** A field name in the logged list that plausibly carries a
date/timestamp (e.g. something like `created`, `purchase_date`, `gamekey_created`, `order_date`)
answers "a date field exists." Its absence across a representative sample of the operator's real
orders answers "it does not," and the sort picker ships with two options (per UI-SPEC's
CONDITIONAL branch).

**How the probe is removed:** Revert the temporary unconditional log call in the same commit that
records the finding — the code returns to `describeZeroKeyOrder`'s original narrow gating. Do not
leave the unconditional log call in shipped code (it would log order structure on every sync
indefinitely, which is more logging than any existing design calls for).

**Cost if a field IS found:** Per CONTEXT.md, capturing it into `HumbleKey` is a backend schema
change plus a `HUMBLE_CLASSIFIER_VERSION` bump (currently 7, `constants.ts:57`) to force one-time
reclassification of already-cached orders — this is not a pure frontend addition and should be
scoped as its own task if the probe finds a field.

### D-43-11 — the `gog_keyless` in-app redeem spike (candidate A)

**Mechanism:** `revealKey()` (`adapter.ts`, function signature confirmed) POSTs to
`HUMBLE_REDEEM_PATH` with `keytype=<machineName>, key=<gamekey>, keyindex=<n>` (verified — note the
naming trap already documented in the adapter's own comment: the POST field literally named
`keytype` carries `params.machineName`, NOT the platform label) via the login-window cookie seam,
and parses the response against:
```typescript
// Source: src/backend/humble/adapter.ts:76-82 (verified)
const RevealResponseSchema = z
  .object({
    success: z.boolean().nullish(),
    key: z.string().nullish(),
    error_msg: z.string().nullish()
  })
  .passthrough()
```
**Schema-level finding (verified, narrows the "will it parse" question):** `key` is already
`.nullish()` and the schema uses `.passthrough()` — a response with `success: true` and **no**
`key` field, or `key: null`, will pass `safeParse` structurally. The real unknown is not
"does the schema reject it" but **what the caller does with a `null`/absent `key` for a normally
key-bearing flow** — i.e., whether downstream code (library.ts's post-reveal handling, not read in
this session — out of the scope this task authorized) treats a keyless success as a valid
terminal state or as an error. **This is UNVERIFIED and this document does not resolve it** — the
probe's job is to observe the actual response shape and status, not to guess the downstream
handling.

**Probe design (respecting the C5 isolation wall):**
1. Precondition: confirm exactly one live, unredeemed `gog_keyless` entitlement exists (CONTEXT.md
   states the operator has exactly one, from a GOG game bought 2026-09-07) and get explicit
   operator go-ahead — **this call is destructive and single-shot** (D-66 never-re-reveal; a
   success consumes the entitlement and grants the game).
2. Call `revealKey()` with that entitlement's `gamekey`/`machineName`/`keyindex` — all
   non-secret identifiers, safe to log by name (not by value, to stay consistent with existing
   discipline, though these three are not classified as secrets the way the revealed `key` is).
3. Log only: HTTP status, response byte-length, `parsed.success` (boolean), **presence** (not
   value) of `key` in the parsed body, and `error_msg`'s presence/length if any — mirroring
   `describeSchemaFailure`'s existing redaction discipline (status/length only). **Never log
   `parsed.data.key`'s value under any circumstance.**
4. After the call, trigger one more sync and inspect (structurally, not visually) whether
   `classify.ts` now reports this entitlement as REVEALED/REDEEMED — this answers "did the backend
   accept the call as a valid redemption" without ever reading or logging the secret.

**What the probe can settle:** Whether `POST /humbler/redeemkey` accepts a keyless entitlement at
all (schema_error vs rejected_by_server vs success), and whether classify.ts subsequently reflects
a state change.

**What the probe CANNOT settle (flag honestly):** "Behaviour when the GOG↔Humble account link is
absent" — the operator's one live sample is (implicitly) from an account where any such link
already has whatever status it has; there is no second, unlinked test account to probe the other
branch. This sub-question stays open after the probe runs and should be recorded as a residual
unknown, not silently dropped.

**Fallback order if candidate A fails or is schema-rejected:** Candidate B (Phase 40 embedded
browser, `storeEmbedOpen('https://humblebundle.com/home/keys', ...)` — machinery already ships,
no domain allowlist restricts it, and the process-wide shared cookie jar means the embed inherits
the session the login webview established), then external browser. UI-SPEC's three-column
"CONDITIONAL" table already has the exact label/destination for each fallback — the planner should
not re-derive these, only pick the column the probe's outcome selects.

## Execution Sequencing Risk

Ordering traps that a naive dependency graph would miss, verified against the actual files:

1. **`GENERIC_KEY_PLATFORM` relocation MUST precede `groupKeys.ts` deletion**, and **`groupKeys.ts`
   deletion is independent of and can run in parallel with** the tab-file deletions and the
   grid-CSS conversion — but it must land BEFORE any task that also imports from `groupKeys.ts`
   assumes the constant lives at its current path. Sequence: (a) create the new leaf module and
   move `GENERIC_KEY_PLATFORM` into it, (b) repoint `keyTypePresentation.ts` and `viewFilters.ts`'s
   imports, (c) verify `pnpm codecheck` green, (d) delete `groupKeys.ts` and `HumbleKeyGroup/` in
   a later step. Steps (a)-(c) must be one task or land before (d) in the plan's DAG — never after.

2. **The four-file deletion and the `i18nGateScope.json` edit must be the SAME task/commit**, not
   two plan tasks in sequence — a deletion-only commit followed by a scope-edit commit leaves a
   red CI window between them even if both land in the same PR, and if the plan is executed by
   separate agents/sessions with a commit between each task, that red window becomes a real
   failure state observable by CI on the intermediate commit.

3. **The flex→grid CSS conversion and the column-header row's introduction are inseparable** — the
   UI-SPEC's core invariant (identical column boundaries on header and every row) is only true if
   both share the literal same `grid-template-columns` declaration. Building the header row against
   the OLD flex row (or vice versa) produces two independently-eyeballed layouts that will not
   match — this is the exact failure mode the UI-SPEC's combined-selector CSS block exists to
   prevent. Do not split "build the header row" and "convert the row to grid" into two tasks that
   could land with different column widths.

4. **D-43-06's "planner picks one, deletes the other" instruction is already resolved by
   sequencing, not by a separate decision.** Since `byExpiringSoonest` lives inside `groupKeys.ts`
   (deleted per D-43-20 regardless of the sort decision), and `compareWaiting` lives inside
   `viewFilters.ts` (which survives — `WAITING_STATES` and the search/filter predicates all live
   there too), the deletion of `groupKeys.ts` for D-43-20's reasons automatically removes
   `byExpiringSoonest`. The planner does not need a separate "choose a comparator" task — it needs
   one task that (a) deletes `groupKeys.ts` per point 1 above, and (b) unit-tests that
   `compareWaiting`'s specific tie-break semantics (not just "sorts by expiration") are what the
   unified list exhibits, per Validation Architecture §4 below. Treat this as resolved-by-
   construction, but still worth a positive test, since a future edit could reintroduce a second
   comparator without anyone noticing the redundancy this phase just removed.

5. **The `partitionWaitingByUrgency` fate is under-specified by CONTEXT.md and should be closed
   explicitly, not left ambiguous.** D-43-19 says the pinned section "does not survive" and that
   the function "loses its only caller" — but does not explicitly say to delete the function
   itself (unlike D-43-20, which explicitly names `HumbleKeyGroup`/`groupAndSortKeys` for
   deletion). Leaving a zero-caller exported function in `viewFilters.ts` is dead code that
   "survives a restructure [and] is how the next reader gets misled" (CONTEXT.md's own words about
   landmine-style dead code, applied here to a case CONTEXT.md itself didn't close). Recommend the
   planner delete `partitionWaitingByUrgency` in the same task that removes its call site in
   `Waiting/index.tsx` (which is itself being deleted per D-43-18 anyway), and treat this as
   resolved by the same file deletion rather than a separate decision — but confirm no other
   caller exists first (verified in this research: grep found exactly one call site, in
   `Waiting/index.tsx:47-49`, which is deleted wholesale).

## Deleted-Tab Salvage — What Must Survive vs. What Must Change

**Must survive, re-pinned in new tests, not silently dropped:**
- The `UNPICKED` no-store-glyph gate (`!isUnpicked && PlatformLogo`) and its existing pin in
  `HumbleKeyRow/__tests__/index.test.tsx` ("renders no caption and no store logo at all for an
  UNPICKED pseudo-entry").
- "Does not leak the raw lowercase 'steam' token anywhere in the row" — an existing regression pin
  that must be re-asserted against whatever the row's new structure looks like.
- The `WR-02` mounted-ref + refresh-on-both-resolve-and-reject-paths discipline — currently
  duplicated across `Waiting/index.tsx` and `All/index.tsx` (both fetch `humbleGetClaimAnnotations`
  independently). Merging three tabs into one list means this pattern is implemented **once**, not
  copy-pasted a third time.
- D-58's every-time gift confirmation dialog (no "don't ask again"), D-59's double-gift guard via
  `giftedMap`, D-42's fuzzy-match override/undo pair, D-77's claim-flow Undo, D-42-01's
  settle-Undo — all pre-existing, all must continue to render exactly as today, just reached via
  one unified list's per-row scenario logic instead of three tabs' separately-supplied props.

**Must change (existing tests pin behaviour that must NOT survive):**
- `Waiting/__tests__/index.test.tsx` (not read in full this session, but its subject component
  renders the pinned "Expiring soon" section via `partitionWaitingByUrgency` — see
  `Waiting/index.tsx:47-49,`~260-270`) almost certainly asserts the pinned section's presence.
  D-43-19 retires this section entirely — a green test still asserting the pinned heading renders
  would be pinning behaviour this phase is explicitly required to remove. The planner must locate
  and rewrite/delete these specific assertions, not merely leave the whole file behind when
  `Waiting/index.tsx` is deleted (if any assertions were copied forward into a new unified-list
  test file without review, they would silently resurrect this requirement).
- `All/__tests__/index.test.tsx`'s assertions about `HumbleKeyGroup`/`GROUP_ORDER`/collapse
  defaults (`defaultExpanded` — UNREDEEMABLE and 'other' start collapsed) — this entire grouped
  presentation is deleted per D-43-20. These tests must be deleted, not adapted, since the
  behaviour they pin (collapsible section headers) does not exist in the unified list at all.
- `HumbleKeyRow`'s props contract (`claimAction`/`giftAction`/`undoOverride`/`settleAction` as four
  independent optional props) will almost certainly collapse into one scenario-driven prop or a
  discriminated union, since D-43-17 replaces the "read-only with N exceptions" framing with "every
  action lives in KEY, one of five scenarios." This is a full API change to the component even
  though many of the underlying behavioural assertions (listed above) must be preserved through it.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest, three relevant projects: `Backend` (`src/backend/jest.config.js`), `Frontend` (`src/frontend/jest.config.js`), `Common` has no dedicated project — pure `src/common/humble/*` modules are tested from the **Backend** project's `__tests__` folders (verified: `viewFilters.test.ts`/`groupKeys.test.ts` live under `src/backend/humble/__tests__/`, not under `src/common`) |
| Config file | `src/backend/jest.config.js`, `src/frontend/jest.config.js` (both `rootDir: '../..'`, invoked via the root `jest.config.js`'s `projects` array) |
| Quick run command | `npx jest --selectProjects Backend -t "<pattern>"` / `npx jest --selectProjects Frontend -t "<pattern>"` — **note the two documented jest gotchas in this repo's own memory: `--selectProjects` is case-sensitive and exits 0 with no tests run unless paired with `--passWithNoTests` is OMITTED (i.e., its absence is what causes a silent zero-test pass to look like success) — always check the reported test count, not just exit code; and `-t` is a regex, so a literal `(` in a pattern matches zero tests** |
| Full suite command | `npx jest --selectProjects Backend Frontend Common` (or `pnpm test` if that script exists — not verified this session; confirm before writing it into a plan) |
| Frontend DOM capability | **None.** `testEnvironment` is Jest's default `'node'`. No jsdom, no `jest-environment-jsdom`, no `react-test-renderer` installed (verified against `src/frontend/jest.config.js`'s own comment, lines 5-13). Component tests call the exported function component directly (`HumbleKeyRow({...props})`) and walk the returned React element object graph — this proves structure (which props were passed to which child element, which className strings are present, whether an `onClick` prop exists) but proves **nothing** about actual pixel geometry, wrapping, or paint. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-43-05 | Undated-key tiebreak differentiates the two comparators | unit | `npx jest --selectProjects Backend -t "compareWaiting"` | ❌ Wave 0 — new case needed in `viewFilters.test.ts` |
| REQ-43-07 | Redeemable-only predicate reads state only | unit | `npx jest --selectProjects Backend -t "Redeemable"` | ❌ Wave 0 |
| REQ-43-09 | Search matches title, not origin | unit | `npx jest --selectProjects Backend -t "search"` | ❌ Wave 0 — new predicate + test file needed |
| REQ-43-02, 03, 11, 12, 13, 14 | KEY-column scenario rendering | component (function-call) | `npx jest --selectProjects Frontend -t "HumbleKeyRow"` | Existing file needs substantial rewrite, not creation |
| REQ-43-16 | Route redirects | component | `npx jest --selectProjects Frontend -t "redirect"` | ❌ Wave 0 |
| REQ-43-17, 18 | Dead code fully removed | source census | `grep -rn "partitionWaitingByUrgency\|HumbleKeyGroup\|groupAndSortKeys" src/ --include="*.ts" --include="*.tsx"` (expect 0 hits outside git history) | N/A — shell census, not a jest file |
| REQ-43-19 | Column geometry, row separator | **live gate only** | N/A — manual, packaged Tauri build, screenshot/AX measurement | N/A by design |
| REQ-43-22 | i18n gate scope updated | CI gate | existing `meta/i18nGateScope.json`-driven check (name not verified this session — grep `meta/` for the gate script if the plan needs the exact command) | Existing |

### Sampling Rate

- **Per task commit:** `npx jest --selectProjects Backend --passWithNoTests -t "<scenario-specific pattern>"` scoped to whichever module the task touched
- **Per wave merge:** `npx jest --selectProjects Backend Frontend Common`
- **Phase gate:** Full suite green, `pnpm codecheck`/`tsc` green, `meta/i18nGateScope.json` reflects the deletions, AND the REQ-43-19 live gate run and recorded — before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New unit test cases in `src/backend/humble/__tests__/viewFilters.test.ts` for the
      undated-key tiebreak differentiator (REQ-43-05)
- [ ] New pure predicate module (proposed: extend `viewFilters.ts` or a new
      `src/common/humble/searchFilter.ts`) + its test file for title-only search (REQ-43-09)
- [ ] New leaf module `src/common/humble/genericKeyPlatform.ts` (or planner's preferred name) —
      no test strictly required (it is a constant), but its two importers' existing tests must
      still pass after the repoint
- [ ] Full rewrite of `HumbleKeyRow/__tests__/index.test.tsx` against the new KEY-column-scenario
      prop shape, re-pinning every "must survive" assertion enumerated above
- [ ] New test file for the unified list screen (function-call style, replacing
      `Waiting/__tests__/index.test.tsx` and `All/__tests__/index.test.tsx`, whose current
      assertions must be individually triaged per "Deleted-Tab Salvage" above, not bulk-deleted or
      bulk-copied)
- [ ] A live-gate contract for REQ-43-19, authored per this repo's own
      `live-gate-contract-authoring.md` Structural Reachability Review (all seven tests) BEFORE
      the gate's first live run — this reference is named mandatory reading in CONTEXT.md for
      exactly this reason, and the standing rule there is that **the plan author of the gate
      contract may never also run it**

## Security Domain

`workflow.security_enforcement` reads empty/absent in this repo's config, which defaults to
enabled. This phase's security surface is narrow:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth surface — `steam.username`/`gog.username`/`epic.username` reads are display-only (D-43-12 explicitly disclaims they represent a store session) |
| V3 Session Management | No | No change |
| V4 Access Control | No | No new privilege boundary |
| V5 Input Validation | Marginal | Search predicate is a client-side, non-persisted substring match over already-sanitized display strings — no injection surface |
| V6 Cryptography | No | No change |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret (`key`/`code`) reaching a log line | Information Disclosure | C5 isolation wall — already enforced in `adapter.ts`; the D-43-11 probe must not weaken this (see probe design above: log presence/length/status only, never the value) |
| Fabricated store URL built from an untrusted `key_type` string | Tampering | `REDEEM_URL_BUILDERS`'s closed two-entry set (`keyTypePresentation.ts`) — unchanged this phase, still the correct pattern for any new redeem-target logic |
| A `t()` default-argument rename silently reusing an existing key's translation | (not STRIDE, but a real repo-specific correctness threat) | Mint a NEW i18n key for any changed copy — UI-SPEC's Copywriting Contract already enumerates every new-vs-reused key explicitly |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Packaged Tauri build (WKWebView) | REQ-43-19 live gate | Operator-owned, not probeable from this research session | — | None — this specific requirement has no unit-test substitute (Pitfall 5) |
| Operator's live Humble account with one `gog_keyless` entitlement | D-43-11 probe | Operator-confirmed in CONTEXT.md (bought 2026-09-07) | — | None — single-shot, irreplaceable sample; if consumed by accident before the probe runs deliberately, D-43-11 cannot be probed again |
| A synced, non-empty Humble library | D-43-05 probe, general live testing | Unknown at research time — this repo's own memory notes `humble_library.json` was wiped to `{}` on 2026-09-07 by a test-clobbering defect (landmine 6, CONTEXT.md) | — | Re-run a sync before either probe or any live gate |

**Missing dependencies with no fallback:** the packaged Tauri build for the geometry live gate —
this is expected and by design (live gates exist precisely because no automated substitute exists
in this repo for browser-rendered layout).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact log-sink behavior described in `live-gate-contract-authoring.md` (sidecar logs reach `gamelib.log`, not the tee'd terminal) still holds unchanged since that reference was written | D-43-05 probe design | If logging plumbing changed, the probe's evidence-capture instruction would read the wrong sink and silently find nothing, misreading absence-of-evidence as evidence-of-absence |
| A2 | `pnpm test` or an equivalent single script exists to run all three jest projects together | Validation Architecture, Full suite command | If no such script exists, the plan should invoke `npx jest --selectProjects Backend Frontend Common` directly instead — low risk, cosmetic only |
| A3 | No `meta/*.ts` gate script beyond `i18nGateScope.json`'s consumer needs updating for this phase's file deletions (i.e., no OTHER gate config file also enrolls these four paths) | Common Pitfalls / Landmine 1 | If another gate config also references these paths, an additional CI red would surface post-deletion that this research did not catch — mitigated by CONTEXT.md's own landmine list, which was independently re-verified by the UI checker, but not exhaustively re-audited in this session beyond the files it names |

**All claims tagged `[ASSUMED]` inline above are the three rows in this table.** Every other
factual claim in this document was verified directly against repository source in this research
session (file:line citations given throughout) and is not merely inferred.

## Open Questions

1. **Do `selectKeysWaiting`/`selectGiftableSpares` (viewFilters.ts) still have a role after this
   phase, or does the unified list read `humble.keys` directly and apply `WAITING_STATES`/search/
   sort itself?**
   - What we know: CONTEXT.md's canonical refs say these two functions "become per-row state" —
     implying their *list-membership* role is retired even though the constants/logic they wrap
     (`WAITING_STATES`, the `ownedElsewhere`/`GENERIC_KEY_PLATFORM` exclusions) may still be
     useful in a different shape.
   - What's unclear: whether the planner should delete these two functions outright (since no
     tab needs "give me exactly the waiting set" or "give me exactly the giftable-spares set" as a
     standalone list anymore), keep them as-is for potential reuse, or refactor them into the new
     per-row scenario logic.
   - Recommendation: Treat as a planner decision informed by whether the new per-row scenario
     selector can cleanly reuse their filtering logic (e.g., "is this key a giftable spare" as a
     per-row boolean check, reusing `selectGiftableSpares`'s predicate without its `.filter()`
     wrapper) — this is an implementation-shape question, not a product decision, and does not
     need to go back to the operator.

2. **Where does the new title-only search predicate live, and is it a boolean predicate function
   or an array-filter helper?**
   - What we know: it must be pure, in `src/common/humble/`, unit-tested from the backend jest
     project, per the established tier convention.
   - What's unclear: naming/shape (e.g., `matchesSearchQuery(key, query): boolean` vs. a
     `filterBySearch(keys, query): HumbleKey[]` array helper) — both are equally valid given the
     existing precedent (`selectGiftableSpares` is array-in/array-out; `WAITING_STATES.has(...)`
     is a per-item predicate consumed inline).
   - Recommendation: Planner's discretion; either shape satisfies REQ-43-09/REQ-43-21 equally.

## State of the Art

Not applicable in the conventional sense (no external library/API version drift to track) — this
section would normally track ecosystem changes, but this phase's only "state of the art" question
is internal: the codebase's own prior pattern (three tabs, three independent annotation-fetch
lifecycles, `groupKeys.ts`'s partition-based grouping) is what is being replaced, and its
replacement pattern (one list, one merged lifecycle, per-row scenario dispatch) is fully specified
in CONTEXT.md/UI-SPEC.md. No deprecated-vs-current library table applies here.

## Concerns (non-binding)

None. This research did not find any locked decision in `43-CONTEXT.md` or the approved
`43-UI-SPEC.md` that appears wrong. The one substantive clarification this research surfaces —
that D-43-06's "pick one comparator" is resolved by D-43-20's file deletion rather than requiring
an independent choice — is recorded under Execution Sequencing Risk above as an aid to planning,
not as a disagreement with the decision itself.

## Sources

### Primary (HIGH confidence — direct repository verification, this session)

- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-CONTEXT.md` — full read
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-UI-SPEC.md` — full read
- `.planning/ROADMAP.md` lines 5089-5137 (Phase 43 section)
- `src/common/humble/viewFilters.ts`, `groupKeys.ts`, `keyTypePresentation.ts`, `urgencyBadge.ts` — full read
- `src/common/types/humble.ts` lines 75-135, 225-245 — `HumbleKey`, `ClaimAnnotation`, `HumbleKeyState`
- `src/frontend/screens/Humble/Keys/index.tsx`, `Waiting/index.tsx`, `Spares/index.tsx`,
  `All/index.tsx`, `components/HumbleKeyRow/index.tsx`, `components/HumbleKeyGroup/index.tsx`,
  `stateLabels.ts` — full read
- `src/backend/humble/classify.ts` lines 560-615 (`describeZeroKeyOrder`/`fieldNames`)
- `src/backend/humble/adapter.ts` lines 76-82, 560-610 (`RevealResponseSchema`, `revealKey`)
- `src/frontend/jest.config.js`, `src/backend/jest.config.js`, `src/common/jest.config.js` — full read
- `meta/i18nGateScope.json` lines 85-105, `meta/hardcodedStringGate.ts` lines 74-101 (`USER_FACING_ATTRIBUTES`/`EXCLUDED_ATTRIBUTES`)
- `.planning/phases/42-humble-key-platform-identity-evidenced-key-type-table-drivin/42-VERIFICATION.md` — for the REQ/verification convention
- `.planning/REQUIREMENTS.md` lines 1366-1420 (Phase 40's `REQ-40-*` convention), lines 176-189 (Phase 23.2's `REQ-23.2-*` convention), line 261 (Traceability table format)
- `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` — partial read (compressed by the tool; core seven-test structure and the "author may never also run the gate" rule captured)
- File existence checks: `find src/frontend/screens/Humble -iname "*.test.tsx"`, `find src/backend/humble/__tests__`, `grep -n "REQ-42"` (zero hits, confirming Phase 42 used a different convention)

### Secondary (MEDIUM confidence)

- None — this task's hard constraints explicitly excluded web research; every claim above traces
  to a repository artifact read directly in this session.

### Tertiary (LOW confidence / explicitly flagged unverified)

- Whether a `null`/absent `key` on a `RevealResponseSchema`-parsed keyless response is treated as
  success or error by downstream code — out of this session's read scope, flagged as the actual
  unknown the D-43-11 probe must observe, not assume
- Whether GOG↔Humble account-link-absent behavior can be probed at all given only one live sample
  — flagged as a residual unknown the probe cannot close

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new libraries this phase
- Architecture: HIGH — every pattern cited to file:line, cross-checked against both CONTEXT.md and
  independent source reads
- Pitfalls: HIGH — all five drawn from verified landmines in CONTEXT.md, independently re-confirmed
  against source in this session (not merely copied from CONTEXT.md's prose)
- Validation Architecture: HIGH for what is provable and how; the "live-gate only" calls (REQ-43-19)
  are a deliberate, evidence-based limitation, not a gap in this research
- Two open probes: scoped, not resolved, per hard constraint 2 — confidence in the SCOPING is HIGH;
  the probes' eventual OUTCOMES are, by design, unknown

**Research date:** 2026-09-09
**Valid until:** This is an internal-code-only research document with no external dependency
versions to go stale — valid until the underlying source files change. Re-verify file:line
citations if this phase is replanned more than a few commits after 2026-09-09.
