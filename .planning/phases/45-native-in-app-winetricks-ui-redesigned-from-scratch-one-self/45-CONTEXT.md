# Phase 45: Native in-app Winetricks UI redesigned from scratch - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

One native, per-game Winetricks surface that a user who has never heard of a "verb" or a
"wineprefix" can use unaided. It **replaces both** the Phase 44 browse panel
(`src/frontend/components/UI/Winetricks/` and its `WinetricksBrowse/` tree) **and** the
`Open Winetricks GUI` escape hatch (`Winetricks.run`, the `-q --gui` code path, and the
`callTool('winetricks')` route into it).

Three roadmap findings are **in scope**, not separate todos: (a) winetricks output is
**classified** (progress, environment warnings, real errors) instead of echoed as a stderr
firehose; (b) the `-q --gui` contradiction is resolved by **removing** the hatch; (c) the set of
verbs that get an install affordance is **settled by derivation**, not a hand list.

**Carried forward, not rebuilt:** `src/common/winetricks/verbs.ts` and
`src/common/winetricks/deriveRowState.ts` as pure seams; the 13 frozen `winetricksBrowse` keys
in `public/locales/en/gamelib.json` where they still apply; the token lesson from Phase 44's nine
contrast defects. **Discarded:** the grouped-browse-with-search IA, the per-row Install button,
the raw-stderr progress panel, the modal `ProgressDialog` as this surface's host.

**Process constraint (roadmap):** this CONTEXT.md exists so that `/gsd-ui-phase 45` has a
decision record to design against. `44-UI-SPEC.md` is **history**, not a contract, for this
phase. Note `discuss-phase`'s `check_spec` glob matches a `*-UI-SPEC.md`; none exists for 45 yet,
and when one is written it must not be mistaken for a requirements SPEC.

**Not in scope:** CrossOver bottles, a game-page shortcut, a launch-failure prompt, appending to a
running queue, Winecfg / Run EXE moving into the new tab, Windows.

</domain>

<decisions>
## Implementation Decisions

### Surface and placement

- **D-01:** The surface is a **new `Winetricks` tab in the per-game Settings tab strip, beside
  `Wine`** (`Wine | Winetricks | Other | Advanced | …` in
  `src/frontend/screens/Settings/sections/GamesSettings/index.tsx`). Not a modal, not a dedicated
  route. Operator's reasoning, verbatim in spirit: "there is enough complexity in the screen to
  warrant its own tab", and it reads like opening the Winetricks app. Modal and route were offered
  and rejected.
- **D-02:** **Single column inside the tab's one scroll container, with a sticky bottom action
  bar.** The bar reads `N selected · Apply` at rest and carries run progress while a queue is in
  flight. A two-pane catalog/basket layout was rejected (collapses below ~900px). There is **one**
  scroll container; Phase 44's nested-scroll trap (P-7) must not come back.
- **D-03:** **Visibility mirrors today's Tools-card gate exactly**: shown only for a real installed
  game (not Game Defaults), not on Windows, with a runner, and not when a CrossOver bottle is
  selected (the Wine tab hides `<Tools />` under `!isCrossover`). Nobody gains or loses the tool.
  The Tools card loses its `Winetricks` button; `Winecfg` and `Run EXE` stay where they are.
- **D-04:** `src/frontend/components/UI/Winetricks/index.tsx` (the `ProgressDialog` host) and
  `WinetricksBrowse/` are **replaced**, not adapted. The `remountSafety` and
  `winetricksInstallMouseRace` tests encode findings that still apply (see Established Patterns)
  and should be **ported** to the new components, not deleted.

### Novice-first information architecture

- **D-05:** **Three tiers, top to bottom:** (1) `Suggested for this game`, open; (2) a handful of
  **hand-named, plain-language task groups** (working names: `Runtimes & frameworks`,
  `DirectX & graphics`, `Fonts`, `Media & codecs`, `Wine settings`); (3) `Everything else`,
  collapsed, holding the long tail with search. Upstream's five raw category headers
  (`DLLS 328` etc.) are gone. The renamed-five-categories and flat-search-only alternatives were
  rejected.
- **D-06:** **`Suggested for this game` is never empty.** Sources, in display order:
  game-specific known-fixes verbs (`readKnownFixes` / `getKnownFixes`, the same data
  `launcher.ts` already auto-installs at launch), verbs derived from PCGamingWiki
  `direct3DVersions` (e.g. `9` → `d3dx9`), then the **curated 8** (`CURATED_WINETRICKS_VERBS`)
  under a `Commonly needed` heading with one line explaining why. When no per-game signal exists —
  most games — the group shows the curated 8 alone. A two-group split and an empty-when-unknown
  group were rejected.
- **D-07:** **Task-group membership is a hand-maintained map in `src/common/winetricks/verbs.ts`**
  (the same discipline as the curated constant: not data-derived, unit-tested against the
  committed parser fixture so drift is CI-visible). A verb in a task group **also** appears in
  `Everything else`; groups are shortcut views, not a partition. Exact group names and membership
  are the UI-SPEC's and planner's call within D-05's working set.
- **D-08:** **Family-level descriptions, keyed by verb prefix**, roughly **12–15 strings**:
  `vcrun*`, `dotnet*`, `d3dx*`/`d3dcompiler*`, `dxvk*`, fonts (`corefonts`, `tahoma`, …),
  `xact`/`xinput`, `physx`, `vb*run`, media/codecs (`wmp*`, `quartz`, `mf`), and the kept settings
  verbs. Every row in `Suggested` and the task groups shows its family sentence; `Everything else`
  rows show the upstream `title`. Rows also show `publisher · year` where the script provides
  them. Per-verb descriptions (~1,900 fills) and upstream-only text were rejected.
  — **Reversibility:** costly — every description string is 48 hand-filled locale entries;
  changing the keying scheme later re-bills the whole fill.
- **D-09:** **Hidden entirely:** the `apps` category (57), the `benchmarks` category (8),
  `annihilate`, and the interactive tool launchers upstream files under `settings` (`winecfg`,
  `regedit`, `taskmgr`, `explorer`, `uninstaller`, `winecmd`, `shell`, `folder`, …). **Kept:** the
  install-shaped settings verbs (`fontsmooth=*`, `videomemorysize=*`, `csmt=*`, `vd=*`, …) under
  their own task group. Rationale: the tab exists to make a game run; a bottle-wiper one search
  away from a novice is the failure mode. Keep-all-with-badges and components-only were rejected.

### Batch select-then-apply

- **D-10:** **A real checkbox selects an available row. An installed row has no checkbox**: its
  slot renders a check icon plus the text `Installed`, and the row is not selectable. A tick
  therefore means exactly one thing — *will be installed when you press Apply* — never a status
  badge. This is the explicit refusal to copy upstream's overloaded checkbox (roadmap finding 1).
  Pre-ticked-and-locked installed rows and glyph-less tap-to-toggle rows were rejected.
- **D-11:** **Apply runs a GameLib-driven queue: `Winetricks.install` once per verb, in selection
  order** — the pattern `installFixes()` in `src/backend/launcher.ts` already uses. Each verb
  keeps its own `installing-winetricks-component` start/end events and its own `progressOfWinetricks`
  stream, so per-row progress and error attribution come from the existing seam. A single
  `winetricks -q a b c` invocation was rejected (attribution would depend on parsing
  `Executing w_do_call` lines). Accepted cost: winetricks' own startup per verb.
  — **Reversibility:** costly — the queue must live **in the backend** because of D-18 (the tab
  unmounts mid-run); moving it later means re-cutting the IPC surface.
- **D-12:** **A failure does not stop the queue.** Verb 2 of 5 failing leaves verbs 3–5 running;
  the failed row shows `Install failed` with `Retry`, the others reach `Installed`, and the sticky
  bar ends with a summary of the shape `4 installed · 1 failed`. Stop-at-first and
  dependency-aware stopping were rejected.
- **D-13:** **Selection is locked while a run is in flight.** Checkboxes disable, the bar shows
  progress, and a `Cancel remaining` control drops the not-yet-started verbs; the in-flight verb
  finishes. Appending to a running queue was rejected (no backend queue exists today; see
  Deferred).

### Progress, warnings, and the escape hatch

- **D-14:** **Per-row phase word plus the sticky bar; the raw log behind a disclosure.** The
  running row shows a short phase derived from classified output — `Downloading 42%` (from curl
  progress lines), `Installing…`, `Done`; the bar reads `Installing 2 of 5 · <family title>`.
  The classified log stays available under `Show details`, collapsed by default. **Nothing is red
  unless a real error occurred.** Bar-only (no log anywhere) and always-visible-log were rejected.
- **D-15:** **Output classification happens in the backend**, at the seam that today sends every
  stderr line to both `logError` and `appendMessage` (`src/backend/tools/index.ts` `runWithArgs`,
  the `child.stderr.on('data')` handler). Classes the frontend must be able to distinguish:
  curl progress (→ percentage, never logged at ERROR), wine `fixme:`/`err:` noise (→ details log
  only, not red), winetricks' own warnings (→ environment banner, D-16), real failures (→ row
  `Install failed` + red in details). The measured 846 `[ERROR]` lines per session, 40% of them
  noise, is the number this decision exists to remove.
- **D-16:** **One persistent, non-red environment banner at the top of the tab** whenever the
  backend has reported an environment warning for this bottle: the unavoidable macOS GPTK
  "wine 7.7 is unsupported upstream" notice gets copy saying it is expected and harmless; missing
  dependencies (`cabextract`, `7z`, `unzip`, `curl`, `zenity` per `checkDependencies`) say what to
  install. It never auto-dismisses and is never styled as an error. Details-only and per-run
  dismissible notices were rejected.
- **D-17:** **The `Open Winetricks GUI` hatch is removed outright**: the button, `Winetricks.run`,
  the `['-q', '--gui']` invocation, the `callTool({tool:'winetricks'})` route in
  `src/backend/tools/ipc_handler.ts` / `runnerMiscFlowRegistration.ts`, and the `guiOpen` state.
  The 5-second self-dismissing-warning defect dies with it. **The hand-written 8-verb
  `NEEDS_GUI_WINETRICKS_VERBS` list is retired** in favour of a set **derived from the verbs that
  call `w_download_manual`** in the pinned script (`20260125-next`, sha256 `f35c2973…`), asserted
  by a test against that script so the catalog can never render a checkbox for one. All six such
  verbs (`foobar2000 utorrent 3dmark03 3dmark06 stalker_pripyat_bench unigine_heaven`) are in
  categories D-09 hides anyway; `fontxplorer` and `ubisoftconnect` are `apps` and hidden too.
  **Live arm owed:** confirm `gdiplus_winxp` (`media="manual_download"` but ordinary
  `w_download`, in the visible `dlls` category) installs unattended under `-q`.
  — **Reversibility:** costly — re-adding a hatch later re-inherits the `-q --gui` warning defect
  and the "dropping `-q` makes installs prompt" trade-off the roadmap documents.
- **D-18:** **A run outlives navigation.** Switching tabs or leaving Settings mid-run neither
  warns nor cancels; the backend queue continues, and on return the tab rebuilds row states from
  the live install events plus a fresh `winetricksListInstalled` read. The game page's existing
  `label.winetricks` ("Installing Winetricks Packages") status is reused so progress is visible
  elsewhere. Warn-before-leaving and cancel-on-leave were rejected.

### Metadata, localisation, and verification (planner-facing consequences of the above)

- **D-19:** D-08 and D-17 need per-verb fields `list-all` does not emit (`publisher`, `year`,
  `media`, `conflicts`, `homepage`, and the `w_download_manual` signal). The researcher decides
  whether to parse `w_metadata` blocks from the already-downloaded script at
  `~/Library/Application Support/GameLib/tools/winetricks` (no wine invocation) or extend
  `winetricksListParse.ts`; the constraint is **no additional wine invocation on tab open** beyond
  today's `list-all`.
- **D-20:** **New strings go in `public/locales/en/gamelib.json`, never `translation.json`.** The
  48-locale fill is a **dedicated task inside this phase**, hand-filled (`machine-fill-gamelib` is
  dead under the gateway key), gated on `lintTranslations` and `gamelibCatalogParity` going green —
  same stance as Phase 44 D-08/D-10. Of the 13 frozen `winetricksBrowse` keys, reuse those that
  still apply (`installedTag`, `installFailedTag`, `retry`, `cachedTag`, `curatedGroup`,
  `searchPlaceholder`, `zeroResultHeading`, `clearSearch`, `resultsHeading_*`, `emptyHeading`,
  `emptyBody`); `needsGuiTag` and `installingRow` lose their surface. `translation.json`'s
  `winetricks.openGUI` loses its only consumer. **Removing a key touches 47 `translation.json`
  dirs vs 49 `gamelib.json` dirs and `_one` plural forms are load-bearing** — grep every
  consumer first and plan the removal explicitly.
- **D-21:** **Verification = component tests + one live gate, and the live gate spot-checks one
  light and one dark theme** (roadmap: defect 1 was light-only at 1.15:1, defect 5 dark-only).
  The live gate must observe: a real multi-verb Apply on a real bottle running to completion with
  the tab staying mounted through every start/finish transition; one induced failure continuing
  the queue (D-12); the environment banner visible on macOS GPTK (D-16); the `gdiplus_winxp` arm
  (D-17). Tokens: **no `--navbar-*` or `--text-hover` consumption on this surface**; use
  `--accent` / `--success` / `--danger` aliases, never raw `--status-*`, and every custom property
  carries a fallback chain.
- **D-22:** **Phase 44 bookkeeping.** `ROADMAP.md:5351` already reads
  `⛔ SUPERSEDED BY PHASE 45 (2026-09-18)`. Whatever remains in `STATE.md`, `44-LIVE-GATE.md`
  (`status: in-progress`) and `44-VALIDATION.md` (`status: draft`) is closed by **hand-edit only**
  — never via `gsd-sdk state.*` / `roadmap.*` / `phase.complete` / `query commit`, which
  previously truncated ~99,000 chars of STATE.md. Phase 44's unresolved contrast defect and its
  unreached D-24 cells die with the screen.

### Claude's Discretion

- Where the search field sits within `Everything else` (and whether it also filters the task
  groups), the ≥2-character threshold, and ordering inside `Everything else` (Phase 44 D-14's
  parser order is the default).
- The exact task-group names and membership map (within D-05/D-07), and the exact family-prefix
  table (within D-08).
- The backend queue's IPC shape (one `winetricksInstallMany`-style invoke carrying the ordered
  list, versus the frontend driving sequential sends), subject to D-11's backend-resident
  constraint and D-18.
- `Cancel remaining` semantics for the in-flight verb (finish vs kill) — default is finish.
- How `conflicts` metadata (e.g. `vcrun2019` vs `vcrun2022`) is surfaced at Apply time, if at all
  in this phase.
- File/module layout under the new tab, and how the pure seams in `src/common/winetricks/` are
  extended (`deriveRowState` gains `selected`/`queued` inputs; `needsGui` becomes derived).

### Folded Todos

None. No pending todo mentions winetricks; the three findings in scope come from the roadmap
entry itself.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition and design brief
- `.planning/ROADMAP.md` §"Phase 45" (line 5449) — goal, the upstream UI inventory, the five
  inventory findings, the three folded findings (a)(b)(c), carry-forward/discard lists, and the
  Phase 44 bookkeeping constraint. **The parsed `goal` field truncates at the first newline;
  read the file.**
- `.planning/ROADMAP.md` §"Phase 44" (line 5351) — already stamped superseded by 45.

### Phase 44 artifacts — history, read in scope
- `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-CONTEXT.md` —
  prior decisions. **Still binding:** never build the list on `SearchBar`'s `.autoComplete`
  overlay; the component mount is never gated by `installing` or a revalidation flag;
  `callOrDeclare` + `WINETRICKS_DECLINED_GUARD` still gate the whole surface; no virtualisation
  without a measured number (D-07); the locale-fill stance (D-08/D-10). **Superseded:** its IA,
  per-row Install, zenity hatch retained, D-11/D-12/D-13 row semantics.
- `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-UI-SPEC.md` —
  **not a contract for 45.** Read only §Interaction Contract items 1, 4, 5 (overlay, keyboard
  disclosure, mousedown capture) and the Color section's token rules, which still hold.
- `.planning/phases/44-in-app-winetricks-browse-ui-replacing-the-search-only-panel/44-LIVE-GATE.md` —
  the nine contrast defects and their single root cause; the light-only / dark-only split that
  drives D-21's two-theme spot-check.

### Code this phase replaces, edits, or extends
- `src/frontend/components/UI/Winetricks/index.tsx` — the `ProgressDialog` host being retired;
  its state split (`hasInstalledData` / `isRevalidatingInstalled` / `loadingAvailable`), the
  `WINETRICKS_DECLINED_GUARD`, and the progress/installing listeners document the seam the new
  tab inherits.
- `src/frontend/components/UI/Winetricks/WinetricksBrowse/` — retired; port
  `__tests__/remountSafety.test.tsx` and `__tests__/winetricksInstallMouseRace.test.tsx`.
- `src/frontend/screens/Settings/sections/GamesSettings/index.tsx` — the tab strip (D-01) and the
  Wine tab body that renders `<Tools />`.
- `src/frontend/screens/Settings/components/Tools/index.tsx` — the gate D-03 mirrors
  (`isDefault || isWindows || !runner`) and the button that goes away.
- `src/backend/tools/index.ts` — `Winetricks.runWithArgs` (stderr → `logError`+`appendMessage`,
  the 1 s `progressOfWinetricks` flush, `sendDone`), `Winetricks.run` (`-q --gui`, deleted),
  `Winetricks.install` (single-flight on `installingComponent`), `listAvailable` (`list-all` with
  `LANG=C`), `listInstalled` (`winetricks.log`), `checkDependencies`.
- `src/backend/tools/winetricksListParse.ts` and `__tests__/winetricksListParse.test.ts` — the
  parser and committed fixture D-07's and D-17's tests assert against.
- `src/backend/tools/ipc_handler.ts`, `src/backend/sidecar/runnerMiscFlowRegistration.ts`,
  `src/backend/sidecar/wineToolsFlowRegistration.ts` — the `callTool('winetricks')` route (deleted)
  and the winetricks invoke/send channels the queue extends.
- `src/common/winetricks/verbs.ts`, `src/common/winetricks/deriveRowState.ts` — carried forward;
  home of the task-group map and the derived no-install set.
- `src/backend/knownFixes.ts`, `src/backend/launcher.ts` (`installFixes`) — the per-game
  known-fixes source for D-06 and the sequential-install pattern D-11 copies.
- `src/backend/wiki_game_info/pcgamingwiki/utils.ts`, `src/common/types.ts` (`PCGamingWikiInfo.direct3DVersions`) —
  the second D-06 signal.
- `src/preload/api/misc.ts` (`getKnownFixes`, `getWikiGameInfo`) — frontend access to both.
- `src/frontend/components/UI/ProgressDialog/index.tsx` — the ` err`/` warn` substring
  classifier D-15 replaces.

### Localisation
- `public/locales/en/gamelib.json` — `winetricksBrowse.*` (13 frozen keys) and `winetricks.*`;
  target for all new strings.
- `public/locales/en/translation.json` — `winetricks.openGUI` (consumer removed by D-17),
  `label.winetricks` (reused by D-18).
- `meta/lintTranslations.ts`, `meta/__tests__/lintTranslations.test.ts` — the gate D-20 must
  turn green.

### Project skills (auto-load)
- `.claude/skills/gamelib-conventions/SKILL.md` — todo frontmatter, fake-HOME, UAT item shape,
  the `<verify>` prettier rule.
- `.claude/skills/sketch-findings-gamelib/SKILL.md` — the filter-panel / `FilterFacetGroup`
  disclosure pattern and multi-theme survival rules the new groups should copy, not import.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Winetricks.install` + `installing-winetricks-component` / `progressOfWinetricks` events** —
  the per-verb unit the D-11 queue sequences; already single-flight and already survives the
  frontend unmounting.
- **`installFixes()` in `launcher.ts`** — a working sequential `for … await Winetricks.install`
  loop; the queue is this loop with per-verb outcome reporting.
- **`readKnownFixes` / `getKnownFixes`, `getWikiGameInfo`** — both D-06 signals exist as IPC
  today; no new data source is needed.
- **`FilterFacetGroup` + `Dropdown`** — the disclosure primitive and header treatment to **copy**
  into tab-scoped groups (Phase 44 D-05's scoping warning stands: do not de-scope
  `.NavShell__tier2Portal` styles).
- **MUI `Tabs`/`Tab` + `TabPanel`** in `GamesSettings/index.tsx` — the tab mechanism D-01 slots
  into; the unscoped-`.MuiTabs-root` leak is a known trap.
- **`deriveRowState` / `attributeProgressEvent` / `clearVerbError`** — pure, tested; extend rather
  than replace.

### Established Patterns
- **Mousedown-capture + `suppressNextClick`** on every clickable row control (the `35-25` finding).
- **Real `<button aria-expanded>`** for disclosure, never `<div onClick>`.
- **Token-survival fallback chains**; `--success`/`--danger` aliases, never raw `--status-*`;
  no `--navbar-*`/`--text-hover` on a non-navbar surface; `--border-color` is invisible in 10 of
  13 themes — use `--accent` for controls.
- **`callOrDeclare` + `WINETRICKS_DECLINED_GUARD`** gates the whole surface under D-03's deferral.
- **New locale strings in `gamelib.json`; a sorted-JSON key insert that sorts last changes the
  previous line's trailing comma** (diff reads `2 1`, not `1 0`).
- **Sidecar send-kind channels fail silently** — `winetricksInstall` is send-kind; the queue's
  completion must be observable via the invoke/event path, not assumed.

### Integration Points
- `GamesSettings/index.tsx` tab strip — new `<Tab value="winetricks">` under `showWineTab &&
  !isCrossover`, plus its `TabPanel`.
- `Tools/index.tsx` — remove the Winetricks button and the `<Winetricks …/>` mount.
- `tools/index.ts` `runWithArgs` stderr handler — the one place classification (D-15) can be
  introduced without changing the frontend event contract's shape beyond adding a `kind`.
- Backend queue state must be readable on tab mount (D-18): a "what is installing now and what is
  queued" query, or an event replay, is required alongside `winetricksListInstalled`.
- Game page `MainButton.tsx` `label.winetricks` status — reused, not duplicated.

</code_context>

<specifics>
## Specific Ideas

- The operator's mental model is **"opening the Winetricks app, but under a tab"** — a
  self-contained screen, not a widget at the bottom of Wine settings.
- The selected layout mockup: `Suggested for this game` open at the top, task groups as
  collapsible rows beneath, `Everything else (N)` collapsed, and a pinned bar reading
  `2 selected   [ Apply ]`.
- Row shape: `☐ <family or title>   <publisher · year>` with the family sentence beneath; an
  installed row shows `✔ <title>   Installed` with **no** checkbox.
- The upstream column set (Package / Title / Publisher / Year / Media / Status) is the reference
  for what metadata exists; the redesign shows publisher and year, hides media, and replaces
  Status with the checkbox-slot treatment.

</specifics>

<deferred>
## Deferred Ideas

- **Appending to a running queue** (ticks during a run join the tail) — rejected for this phase;
  needs a queue with a `queued` row state and a `Cancel` that understands it.
- **A game-page shortcut into the tab** and **a launch-failure prompt linking to it** — both
  offered as entry points and not chosen; the second needs a launch-outcome hook.
- **CrossOver bottles** and **always-visible-with-explanation** — rejected visibility options;
  revisit only with a tested CrossOver path.
- **Dependency-aware stop on failure** using `conflicts`/`w_call` metadata — rejected; upstream
  metadata is unreliable in both directions.
- **Winecfg / Run EXE moving into the new tab** — not discussed; stays on the Tools card.
- **Per-verb descriptions beyond the family level** — rejected on localisation cost; revisit if a
  specific family sentence proves misleading for one verb.

### Reviewed Todos (not folded)

`todo.match-phase 45` returned 16 matches, all on generic keywords (`library`, `code`, `found`,
`macos`) — Windows code-signing, blank-render packaging, library tile size, library sorting, login
sheet corner wedge, four Phase 49 sign-in follow-ups, SteamSyncNotice false failure, F-9 RPC
timeout, `audit-uat` body scalars, Epic in-embed sign-in, orphaned library-top-section keys,
Windows shortcuts stub, native LZMA decision, Amazon expiry strings. None concern Winetricks; none
folded.

</deferred>

---

*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Context gathered: 2026-10-10*
