# Phase 44: In-app Winetricks browse UI replacing the search-only panel - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Winetricks panel's type-to-reveal search with a browse-first categorised UI inside
the existing MUI `Dialog`, keeping the zenity `--gui` button as an escape hatch.

**This phase is rendering, not plumbing.** The data layer already landed: `quick-260915-ajd`
rewired `listAvailable()` to a single `winetricks list-all` invocation parsed by
`src/backend/tools/winetricksListParse.ts`, returning `{verb, title, category, cached}` for all
567 verbs (previously 370, verb-only); `quick-260915-ajd-fu` widened the filter to match title as
well as verb. No IPC surface changes, no new backend capability.

</domain>

<spec_lock>
## Design contract (locked via 44-UI-SPEC.md)

**`44-UI-SPEC.md` is approved (gsd-ui-checker, iteration 2, 2026-09-15) and is the binding visual
and interaction contract.** Downstream agents MUST read it before planning or implementing. Its
content is NOT duplicated here — it locks the spacing scale, typography, colour tokens, the full
copy/key table, layout, 5 list-level and 7 row-level states, and a 5-point Interaction Contract.

**It is a UI-SPEC, not a requirements SPEC.** No `/gsd-spec-phase` was run; `Requirements: TBD` in
ROADMAP.md is accurate and requirement IDs still need minting at plan time.

**Where this CONTEXT.md overrides it, CONTEXT.md wins.** Two overrides and one consequence, all
recorded in `<decisions>` below:

1. **D-06 removes the 240px per-category inner scroll** the UI-SPEC's Layout section specifies.
   This resolves the spec's own unresolved P-7 (three nested scroll containers).
2. **D-09 cuts the 5 `winetricksBrowse.category.*` keys**, so category headers render the parser's
   own strings. Consequence: the header reads `DLLS`, not the spec's drawn `DLLS & LIBRARIES`.
3. **D-13 reverses the spec on installed rows in search results** — the spec is silent; today's
   code actively hides them; this phase shows them with the Installed badge.

**Two constraint vocabularies the spec uses are defined nowhere in the repo.** `44-UI-SPEC.md`
cites `C-1`..`C-6` and "decision #3/#4" as if they were upstream artifacts. They are not — no
CONTEXT.md existed when it was written, and the only other `C-1`..`C-6` in `.planning/` are the
unrelated probe channels of `quick-260915-lhm`. Reconstructed from the spec's own usage, so the
planner is not chasing a dead reference:

| ref | meaning, as used by the spec |
|---|---|
| `C-1` | the browse list must not unmount on install — **both** gates, start and completion |
| `C-2` | Install must never be actionable with no committed selection |
| `C-3` | colour is never the only signal; every state pairs colour with icon or text |
| `C-4` | the 8 unattended-incapable verbs never show an Install button, in any state |
| `C-5` | not referenced anywhere in the spec body — treat as absent |
| `C-6` | do not touch the dialog shell (`ProgressDialog`, `scroll="paper"`, `max-width`) |
| decision #3 | the curated list is hand-maintained, not data-derived |
| decision #4 | an installed row stays visible and marked, not necessarily actionable |

</spec_lock>

<decisions>
## Implementation Decisions

### Curated "Commonly needed" group

- **D-01:** Ship **~8 verbs, not the spec's provisional 12**. Working set: `vcrun2019`,
  `vcrun2013`, `vcrun2010`, `dotnet48`, `d3dx9`, `xact`, `corefonts`, `physx`. Rationale: 12 rows
  makes the open-by-default group a scroll region of its own, defeating "the easy path is right
  there". The older `vcrun`s and `dotnet6` drop to their category — one extra click for a rarer
  need. Hand-maintained exported constant (decision #3), not data-derived: a `cached`- or
  `installed`-derived group is empty on a fresh bottle, which is exactly when it is needed most.
- **D-02:** A curated verb **also appears in its own category**. Curated is a shortcut view, not a
  partition. Category counts therefore stay honest against the parse and are trivially verifiable.
- **D-03:** Curated verbs missing from the parsed set **skip silently in the UI**, AND a unit test
  over the committed parser fixture asserts every curated verb resolves. The UI degrades for
  users; CI reports the drift. A permanently-dead disabled row in the highest-traffic group was
  rejected — it is the failure mode the spec's Needs-GUI treatment avoids elsewhere.
- **D-04:** Category expand/collapse state **resets on every dialog open** to the spec's Default
  state (curated open, five categories collapsed). No new persistence surface. The spec's
  within-session rule (clearing search restores prior expand state) is unaffected.

### Category group component and scrolling

- **D-05:** Build a **new panel-scoped group** (e.g. `.WinetricksBrowse__group`) on the same
  `Dropdown` primitive that `FilterFacetGroup` itself wraps. Copy its header treatment and its
  CR-01/CR-03 token-survival fallback chains. **Do NOT de-scope `FilterFacetGroup`** from
  `.NavShell__tier2Portal` — de-scoping a deliberately-scoped stylesheet makes every rule in it
  live app-wide and turns the Games filter panel into a regression surface for a Winetricks
  change. This repo has already paid twice for cross-context CSS leak (`Dropdown` styling its
  panel's contents; unscoped `.MuiTabs-root`). Accepted cost: caret/badge CSS in two places.
  `FilterFacetRow` is not reusable here regardless — it is a `role="checkbox"` toggle, not an
  install-action row.
- **D-06:** **Drop the per-category 240px inner scroll.** OVERRIDES `44-UI-SPEC.md` Layout.
  An expanded category grows to its natural height and the 50vh/420px browse region is the only
  inner scroll — two containers instead of three, and no scroll-within-a-scroll wheel trap. This
  is the resolution of the spec's own flagged-and-unresolved P-7.
- **D-07:** **Render all rows, no virtualisation.** 328 rows in the largest category is within
  what WKWebView handles; no windowing library exists in `package.json` and adding one for an
  unmeasured problem is speculative, interacts badly with the mousedown-capture install pattern,
  and breaks find-in-page. If it janks on a real bottle that is a measured follow-up with a
  number attached.

### Localisation

- **D-08:** The 48-locale fill is a **dedicated task inside Phase 44**, gated on `lintTranslations`
  going green and `gamelibCatalogParity` passing — not a follow-on. The `gamelib` namespace IS
  gated: `quick-260915-t13` measured 17 unfilled keys producing **816 findings across 2 failing
  tests**. English-only is not a silent option here the way it was for the 84 ungated
  `translation.json` `humbleKeys.*` keys still open in todo `816`. The phase cannot be called done
  with CI red, so deferring the fill only moves the red somewhere easier to forget.
- **D-09:** **Trim to 11 new keys** by dropping the 5 `winetricksBrowse.category.*` keys →
  **11 × 48 = 528 strings**, not 768. Category headers render the parser's own category values
  (`apps`, `benchmarks`, `dlls`, `fonts`, `settings`) uppercased via CSS — winetricks' own
  vocabulary, which the zenity GUI the operator praised also shows untranslated. **Consequence:
  the header reads `DLLS`, not the spec's drawn `DLLS & LIBRARIES`.** Every remaining key is real
  UI copy and stays; cutting the Errored/Retry copy was explicitly rejected because the old panel's
  total absence of a failure affordance is one of the things this phase fixes.
- **D-10:** **Re-measure `pnpm machine-fill-gamelib` once, then hand-fill.** `t13` measured the
  108-char `sk-ant-` key in `~/.gamelib.env` returning `HTTP 401` today, and the script's own D-08
  says it deliberately will not bulk-run all 48 locales — but a key can be rotated, and one
  command is cheaper than assuming. If it still 401s, hand-fill using `t13`'s pre-flight validator
  (locale-set check, placeholder parity both directions, glossary survival via the repo's own
  boundary regexes, no empty values) **run before any file is touched**. Hand-filling is
  sanctioned and precedented twice (`260908-iq8`, `260915-t13`).

### Installed components

- **D-11:** **Retire** the bottom `installedWrapper` "Installed components: a, b, c" summary
  (`Winetricks/index.tsx:199-221`) — not kept, not merged, and not replaced by a count. Per-row
  badges surface the same fact in place with category and cached context the flat list never had.
- **D-12:** No reinstall affordance on an installed row — badge only, per the spec. Note that
  `winetricksInstall(verb)` is technically re-invocable; the decision is product, not capability.
- **D-13:** **Installed components appear in search results**, badged. This REVERSES shipped
  behaviour: `WinetricksSearch/index.tsx:42` currently does
  `filtered.filter((c) => !installed?.includes(c.verb))`, so searching for something already
  installed returns nothing and reads as "not available" — a false negative this phase removes.
- **D-14:** **Parser order within a group**, no sort. `winetricks list-all`'s own emission order,
  which the parser already preserves with first-occurrence dedup. Nothing to get wrong, no
  divergence from the zenity GUI, and no locale/collation exposure on the title column.

### Scope, todos, and what this phase claims

- **D-15:** **Close** `2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`
  (major, `ready: live-gate`) — **but only after D-16**. Operator decision, made against the
  recommendation to narrow-and-keep-open; recorded here with the reasoning that motivated the
  concern so the closure note can be written honestly. Both halves are properties of `SearchBar`'s
  `.autoComplete` focus-conditional overlay, which Winetricks stops rendering into entirely
  (Interaction Contract §1), so neither is reachable on this surface after the phase.
- **D-16:** **Before closing, fold Half A into**
  `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`. Half B's
  defect survives for `LibrarySearchBar` and that todo already covers it; **Half A — "typing needs
  repeated attempts before it filters usably", never investigated on any surface — has no other
  home** and would evaporate on close. Carry the operator's verbatim account across, and make the
  closure note point at where it went.
- **D-17:** Fold `2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md`
  into scope — this IS C-1's second half and the phase closes it or fails.
- **D-18:** Prove D-17 **by test, not by assertion**: a component test that drives an install
  **start** and an install **completion** (the `onInstallingChange` → `listInstalled()` →
  `setLoadingInstalled(true)` path) and asserts the same row nodes stay mounted throughout. Then
  **revert the fix and confirm the test turns red.** Both triggers, not just `installing` —
  `35-25` closed only half precisely because only half was tested.
- **D-19:** **Port** `WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` to the new
  Row component rather than deleting it with `WinetricksSearch/`. It encodes the `35-25` finding
  (mousedown capture + `suppressNextClick` so keyboard activation still works), and the spec keeps
  that technique on the new Row's buttons.
- **D-20:** **Remove the orphaned `translation.json` `winetricks.*` keys** (`search`,
  `no-components`, `installed`, `nothingYet`, `installing`). Operator decision, against the
  recommendation to leave them. **Two obligations attached:** (a) grep `src/` for each key before
  removal — `winetricks.installing` in particular may have a surviving consumer; (b) this touches
  **47 locale dirs, not 49** — `br` and `sl` have no `translation.json` at all. `winetricks.install`,
  `winetricks.openGUI` and `winetricks.loading-available` are REUSED by the spec and must survive.

### Verification

- **D-21:** **Component tests plus one live gate.** Jest/RTL covers what is cheap to drive (row
  states, search → flat list, zero-result, curated resolution, both remount triggers). The live run
  covers what tests structurally cannot. Tests-only was rejected because every prior defect on this
  exact surface — mouse-dead Install, the remount race, the hover highlight — was invisible to the
  suite and only appeared under a real pointer in a real WKWebView.
- **D-22:** The live gate must measure exactly two things, both selected deliberately:
  1. **A real mouse-click install runs to completion with the list staying mounted** through both
     the install-start and install-completion transitions. This is the phase's central claim.
  2. **The Installed badge appears in place** on that same row afterwards, with no list reflow and
     no scroll jump — proving the `listInstalled()` refetch renders as a state change, not a
     remount.
- **D-23:** **Needs-GUI routing and pointer-driven browse/search were NOT selected for the live
  gate.** They rest on component tests. Recorded explicitly so no later document claims live
  coverage this phase does not have.
- **D-24:** Theme checking is **the existing undefined-custom-property gate plus a spot-check in
  one dark and one light theme**. The gate is the mechanism for token survival; the spot-check
  catches what it cannot see — this repo has shipped a 1.46:1 pairing that every gate passed.

### Claude's Discretion

No area was answered "you decide". Left to the planner within the above: file/module layout under
`WinetricksBrowse/`, how the curated constant is exported and imported, the exact shape of the
per-row action-slot component, and how the pre-flight locale validator from `t13` is re-used or
re-derived.

### Folded Todos

- **`2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md`**
  (ui, minor, `ready: code`) — the outer `!loadingInstalled` gate at `Winetricks/index.tsx:156`
  refires on install *completion*, remounting the whole `installWrapper`. Today the harm is masked
  because the inner `!installing` gate has already hidden the list; it arms the moment this phase
  removes the inner gate. Closed by D-17/D-18.
- **`2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`** (ui, major,
  `ready: live-gate`) — closed by D-15, but only after Half A is folded into the 2026-08-30 todo
  per D-16.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Binding contract for this phase
- `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-UI-SPEC.md` —
  approved design contract: spacing, typography, colour tokens, copy/key table, layout, 5
  list-level + 7 row-level states, 5-point Interaction Contract, and its own "Open Items for the
  Planner". Read in full. Overridden only by D-06, D-09 and D-13 above.
- `.planning/ROADMAP.md` §"Phase 44" (line 5176) — goal, expanded scope, and the three scope
  fences. Note its own warning: `roadmap.get-phase` truncates `goal` at the first newline, so the
  expanded scope and fences are invisible to tooling that reads the parsed field.

### Preconditions already shipped (do not re-plan)
- `.planning/quick/260915-ajd-change-listavailable-to-return-verb-titl/260915-ajd-SUMMARY.md` —
  `listAvailable()` → `{verb, title, category, cached}` across 567 verbs via `list-all`.
- `src/backend/tools/winetricksListParse.ts` — the parser, its category derivation
  (`===== <category> =====` headers, `prefix` block skipped), and the `cached` flag's origin.
  Its comments document traps the planner should not re-litigate (verb-shape charset, header
  ordering, the `prefix` trap).
- `src/backend/tools/__tests__/winetricksListParse.test.ts` — the committed fixture D-03's curated
  verb test should assert against.
- `src/common/types.ts:826` — `WinetricksComponent`.

### Code this phase replaces or edits
- `src/frontend/components/UI/Winetricks/index.tsx` — both gates (`:156` outer, `:158` inner),
  `listInstalled()` at `:37-38`, `onInstallingChange` at `:97-103`, `WINETRICKS_DECLINED_GUARD` at
  `:91` (unchanged by this phase), `installedWrapper` at `:199-221` (retired by D-11).
- `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx` — retired. `:42` is the
  installed-filter D-13 reverses; `:52-79` is the mouse-race comment and pattern D-19 ports.
- `src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx` —
  ported, not deleted (D-19).

### Patterns to copy, not to edit
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss` — the CR-01/CR-03
  token-survival fallback chains (`--navbar-inactive` → `--navbar-accent`, `--text-hover` →
  `--accent`, `--navbar-active` → `var(--navbar-active, var(--accent-overlay, var(--accent)))`)
  and its `.NavShell__tier2Portal` scoping. Copy the chains; leave the file alone (D-05).
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx` — header/caret/badge
  treatment and the `role="checkbox"` button pattern proving keyboard operability.
- `src/frontend/components/UI/Dropdown/index.scss` — `.dropdown.expanded { max-height: 50vh;
  overflow-y: auto }`, the disclosure primitive D-05 builds on.

### Localisation
- `.planning/quick/260915-t13-fill-17-humblekeys-across-48-locales/260915-t13-SUMMARY.md` — the
  measured precedent: which gate fires, the 401 on the machine-fill key, and the pre-flight
  validator D-10 reuses.
- `.planning/todos/pending/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md` —
  what the gate does and does not see, and why D-08 refuses the English-only path.
- `public/locales/en/gamelib.json` — target file for the new `winetricksBrowse` top-level key.
  `winetricks` exists in **both** `gamelib.json` and `translation.json` with different contents;
  the new sibling key exists to avoid that ambiguity.
- `meta/lintTranslations.ts`, `meta/__tests__/lintTranslations.test.ts`,
  `meta/i18nCatalogPresenceBaseline.json` — the gate D-08 must turn green.

### Todos in the blast radius
- `.planning/todos/pending/2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md`
- `.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`
- `.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`

### Project skills (auto-load during implementation)
- `.claude/skills/sketch-findings-gamelib/SKILL.md` — the library-filtering analog the UI-SPEC's
  hybrid-panel and zero-result decisions were carried from.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`SearchBar`** (`src/frontend/components/UI/SearchBar/`) — reuse for **input chrome only**.
  Pass no `suggestionsListItems`, so `.autoComplete` never renders. Its 34px control height is an
  operator-sanctioned exception (`260911-umj`); do not "fix" it to 36px.
- **`Dropdown`** — the disclosure primitive both `FilterFacetGroup` and D-05's new group sit on.
- **`ProgressDialog`** / MUI `Dialog` — unchanged (C-6). Its `hideProgress` expression at
  `Winetricks/index.tsx:232-234` currently reads `loadingInstalled`; the planner must check what
  that expression should become once the gates are gone.
- **`winetricksInstall` / `handleWinetricksInstalling` / `handleProgressOfWinetricks`** — the
  existing IPC surface, unchanged. Installs are serialised one at a time; there is no batch API,
  which is what makes the spec's "Installing (elsewhere)" disabled state necessary.

### Established Patterns
- **Mousedown-capture install intent** with a `suppressNextClick` ref so keyboard activation via
  `click` still works (`WinetricksSearch/index.tsx:79-104`). Port to every clickable row button.
- **Real `<button aria-expanded>` for disclosure**, never `<div onClick>` — this codebase has
  already paid for the `<li onClick>` version of that mistake.
- **`callOrDeclare` + `WINETRICKS_DECLINED_GUARD`** — the D-03 deferral path. Unchanged; it still
  gates the whole surface ahead of anything this phase builds.
- **Token-survival fallback chains** — never consume a custom property bare if some theme block
  does not define it; an undefined custom property with no fallback drops the ENTIRE declaration
  at computed-value time, silently, in whichever theme lacks it.
- **`--status-*` are raw constants with no light-theme override; `--success`/`--danger` are the
  theme-adaptive aliases.** Text and icon colour must read the aliases.

### Integration Points
- `Winetricks/index.tsx` is the only mount point; the new `WinetricksBrowse/` renders inside
  `installWrapper` in place of the `actions` block.
- `listInstalled()`'s `setLoadingInstalled(true)` is the post-install refetch. After D-17 it must
  drive a stale-while-revalidate render, not a gate.
- Locale catalogs: `public/locales/<locale>/gamelib.json` — **49 dirs, all with `gamelib.json`**;
  only **47** have `translation.json` (`br` and `sl` do not).

</code_context>

<specifics>
## Specific Ideas

- The operator's motivating comparison is winetricks' own **zenity GUI categorised checklist** —
  "markedly better than our own panel". That is the shape being rebuilt in-app, which is also why
  D-09 (untranslated category headers) and D-14 (parser order) deliberately stay close to what
  zenity shows rather than diverging for polish.
- The zenity `--gui` button is **retained deliberately, not removed** — it is both the escape
  hatch and the routing target for the 8 unattended-incapable verbs.

</specifics>

<deferred>
## Deferred Ideas

- **Fixing `.autoComplete`'s focus-conditional overlay for `LibrarySearchBar`** — the same
  primitive defect, a different surface. Tracked by
  `.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`,
  which also inherits Half A per D-16. Not this phase.
- **Row virtualisation** — revisited only if a real bottle produces a measured jank number (D-07).
- **Persisted category expand state across dialog opens** — rejected for now (D-04); would need a
  UI-state store this panel does not have.
- **A standing "N components installed" count** — considered and rejected with the flat summary
  (D-11); revisit only if a user reports losing the census.
- **Batch install (select several, install once)** — no such IPC surface exists; the backend
  serialises to one install at a time. Would be its own phase.

### Reviewed Todos (not folded)
- `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md` — same
  `SearchBar` primitive, but the Library surface. Out of scope; it *receives* Half A per D-16
  rather than being closed here.
- `2026-08-29-import-game-is-unlabelled-and-over-promoted…` and the two code-signing todos
  (`2026-09-04` macOS, `2026-09-14` Windows) matched the phase query on generic keywords only.
  Unrelated to Winetricks.

</deferred>

---

*Phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel*
*Context gathered: 2026-09-15*
