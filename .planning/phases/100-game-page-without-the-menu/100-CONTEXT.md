# Phase 100: Game page without the ⋮ menu - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the game page's ⋮ menu (`DotsMenu` + `GameSubMenu`) and give every item a home next to the
thing it changes, per sketch 012 (folds in 010 and 011):

- **Left card** — the game: store badge becomes a link ↗, "Edit details" pencil on the art band,
  Favourite heart beside the h1, outlined category chips + "+ Category" popover, quiet Hide toggle
  (+ hidden-state notice with Unhide).
- **Right panel → Install tab** — your copy: fact rows that carry their own actions (Location,
  Size, Version, Engine, Cloud saves, …), Library & integration switch rows, and a danger zone with
  a red Uninstall last, behind a confirmation.
- **⚙ dialog** — how it runs: new Logs tab (merging the `'log'` `GameSettingsModalType`), EOS
  overlay switch in Run → Launch (Linux + Epic), folder button by the Wine prefix field.
- **Footer** — tier one only: Install split ▾ / Play / Update / Pause / Stop, launch option, ⚙.

The Requirements ⋮ item and the left-card play-time block (`TimeContainer`) are removed as
duplicates. Right-panel tabs become `Install · Achievements · Ratings · Requirements`.

Frontend-only. No new capabilities: every action already exists today in ⋮ or elsewhere; this
phase moves it. Planning runs with `--skip-ui` — the sketch findings are the design contract in
place of a UI-SPEC.md.

</domain>

<decisions>
## Implementation Decisions

### Design source (locked by sketches, not re-discussed)
- **D-01:** `.claude/skills/sketch-findings-gamelib/references/game-page.md` §2–§5 is the design
  contract: the ⋮ item → new home table, Install-tab row order (installed and not installed), left
  card library row (heart, chips, Hide), integration switch rows (per-row pending and inline
  failure; state flips only on the backend's answer), and the footer. Its "What to Avoid" list is
  binding (no ⋮ "just for one thing", no flipping labels, no control swapped for a spinner, no
  destructive action in the footer, no filled chips for user categories, no hard-coded colours).
- **D-02:** `.claude/skills/sketch-findings-gamelib/references/game-settings-dialog.md` "Additions
  from 012" is the contract for the ⚙ changes (Logs tab after Advanced with session picker / Copy /
  Open folder / monospace log box, plus a "Game log → Open the Logs tab" link in Advanced →
  Diagnostics & updates; EOS overlay switch in Run → Launch; Wine prefix folder button). Rule: ⚙
  holds only what changes how the game runs.

### Install-tab content the sketch did not map
- **D-03:** Cloud saves becomes a fact row: value "Synced …" (or the syncing / unsupported state),
  actions `[Sync now ▾]` (the existing sync commands) and `[Open saves folder]`. Auto-sync moves out
  of the row into a switch row under Library & integration. The hover-opened MUI `Menu` in
  `CloudSavesSync.tsx` is removed — no hidden actions.
- **D-04:** The Apple compatibility block (`AppleWikiInfo` — AppleGamingWiki rating / "Runs via
  Windows Steam bottle", with refresh and its links) moves from the Install tab to the **Ratings**
  tab, beside the ProtonDB row.
- **D-05:** Platforms (glyphs, installed platform outlined), Online required and Third-party manager
  become fact rows with no actions in the same `.fact` shape. Online required / Third-party manager
  render only when they apply.
- **D-06:** The Native-port hint (`NativePortInfo`) and the Humble key origin (`HumbleOriginInfo`)
  render as neutral accent-tinted notes (the 009 `.note` style) in the Install tab, after the fact
  rows and before Library & integration.

### Library card menu and categories
- **D-07:** The library `GameCard` right-click menu stays as it is. The one change is forced by the
  ⚙ merge: its Logs item opens the ⚙ dialog on the new Logs tab.
- **D-08:** The per-game Categories modal (`openGameCategoriesModal`) stays, reachable only from the
  library card's right-click menu. The game page uses only the "+ Category" checklist popover.
- **D-09:** "New category…" in the popover creates the category and assigns this game in one step
  (type, Enter); the popover stays open. Renaming and deleting categories stay in
  `CategoriesManager`.

### Long-running row actions (Verify, Move…, Set install folder, Check for updates, Modify)
- **D-10:** The footer status line (`GameStatus`) stays the single progress readout (percent, ETA).
  The row's button that started the action turns into a pulsing busy label ("Verifying…",
  "Moving…"). No second progress bar in the row.
- **D-11:** While one runs, conflicting Install-tab actions are disabled with a reason tooltip
  (e.g. during Move: Verify, Modify, Set folder and Uninstall are disabled — "Wait for the move to
  finish"). Unrelated actions (Open, Open prefix, switch rows) stay live. Gating mirrors
  `MainButton`'s existing `is.*` checks.
- **D-12:** Failures show inline in the row: red text under it plus a Retry link, the same shape as
  switch-row failures. This replaces the error dialogs for these actions (e.g. the
  `repairFailure.ts` dialog path). Detail stays in the log (the Logs tab).
- **D-13:** Confirmations: Move… and "Wrong folder?" → Set install folder keep their confirmation;
  Verify drops its yes/no dialog. Uninstall / Remove all copies keep their existing confirm
  (`UninstallModal`, `steamUninstallConfirm.ts`).

### Rollout and live check
- **D-14:** Build the new homes plan by plan while ⋮ stays as a fallback; a final plan deletes
  `DotsMenu.tsx` and `GameSubMenu/` (moving `shortcutsToggle.ts`, `repairFailure.ts`,
  `steamUninstallConfirm.ts` logic to where their actions now live). Every intermediate build keeps
  every action reachable.
- **D-15:** Live UAT covers the midnight, dracula and gruvbox themes (dracula is the known risk for
  the new switch track: pink `--color-primary`, per-theme `--on-primary` knob; `--fav` heart colour
  is defined per theme).
- **D-16:** Live UAT walks a Steam game (danger zone with Remove all copies, no Move), an Epic or GOG
  game (Move / Modify / Check for updates, Engine row), a sideloaded game (no Verify), and one
  not-installed game (Download / Install size / Platforms, Locate link, Show in Steam only).

### Claude's Discretion
- Exact component split (e.g. a shared `FactRow` / `SwitchRow` component), file layout, and how the
  ⋮ logic is decomposed into hooks.
- Which conflicting actions each long action disables, within D-11's rule.
- Plan count and wave order within D-14's rollout shape.
- Copy for busy labels, reason tooltips and inline failures (through `t()`, noun labels).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract (in place of UI-SPEC.md)
- `.claude/skills/sketch-findings-gamelib/references/game-page.md` — ⋮ item map, Install-tab rows,
  left-card library row, switch rows, footer, CSS patterns, HTML structures, What to Avoid
- `.claude/skills/sketch-findings-gamelib/references/game-settings-dialog.md` — ⚙ dialog shape and
  the 012 additions (Logs tab, EOS switch, prefix folder button)
- `.claude/skills/sketch-findings-gamelib/SKILL.md` — index; multi-theme survival rules
- `.claude/skills/sketch-findings-gamelib/sources/012-game-page-no-menu/` — the sketch itself
  ("Where did each item go?" overlay, "Show moved items" toggle, ⚙ mock with Logs tab)
- `.claude/skills/sketch-findings-gamelib/sources/010-game-page-title-row/`,
  `.claude/skills/sketch-findings-gamelib/sources/011-integration-toggles/`,
  `.claude/skills/sketch-findings-gamelib/sources/008-game-page-action-bar/` — folded-in sketches

### Roadmap
- `.planning/ROADMAP.md` — Phase 100 entry (goal; frontend-only; no dependencies)

### Repo conventions
- `CLAUDE.md` + `Skill("gamelib-conventions")` — UAT item shape for `100-HUMAN-UAT.md`, scoped
  `npx prettier --check` in every `<verify>`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/frontend/screens/Game/GameSubMenu/index.tsx` (812 lines) — every action handler being
  rehomed (move, change location, repair, update, shortcuts, add to Steam, EOS overlay, browse
  files/prefix, modify, changelog, uninstall / remove all copies). Extract the handlers; don't
  rewrite them.
- `GameSubMenu/shortcutsToggle.ts` — the "state flips only on the backend's answer" pattern the
  switch rows follow.
- `GameSubMenu/repairFailure.ts`, `GameSubMenu/steamUninstallConfirm.ts` — failure and confirm
  logic to carry over (D-12, D-13).
- `GamePage/components/InstalledInfo.tsx`, `CloudSavesSync.tsx`, `DownloadSizeInfo.tsx`,
  `PlatformSupport.tsx`, `RunsForMeToggle.tsx` — the current Install-tab content that becomes fact
  and switch rows.
- `src/frontend/components/UI/ToggleSwitch/` — base for the new switch-track variant (sketch §4:
  label stays normal weight when on).
- `src/frontend/screens/Settings/components/SettingsModal/` + `GameSettingsModalType` in
  `src/frontend/state/uiState.ts` — where the `'log'` type merges into a Logs tab.

### Established Patterns
- `GamePage/components/DotsMenu.tsx` hosts the Requirements, ModifyInstall and Changelog dialogs;
  those dialogs need new owners when it is deleted (Modify → Size row, Changelog → "What's new").
- `GameStatus.tsx` already renders moving / updating / installing progress in the footer — D-10
  keeps it as the single readout.
- `MainButton.tsx` gates on `is.moving`, `is.updating`, `is.syncing`, `is.installing`, … — the
  model for D-11.
- Theme tokens only (`--color-*`, `--fav`, `--on-primary`); the sketch CSS uses them directly.

### Integration Points
- `src/frontend/screens/Game/GamePage/index.tsx` — page frame, footer (`DotsMenu` mount at the
  action bar), right-panel `Tabs` / `TabPanel`s (Install info, Achievements, Extra info,
  Requirements).
- `src/frontend/screens/Library/components/GameCard/index.tsx` — right-click menu; Logs item
  re-points (D-07); Categories modal stays (D-08).
- `src/frontend/helpers/steamInstallOptionsEntry.ts`, `src/frontend/helpers/declaredUnavailable.ts`,
  `src/frontend/components/UI/UninstallModal/index.tsx` — reference `GameSubMenu`/`DotsMenu`;
  update when they are deleted.

</code_context>

<specifics>
## Specific Ideas

- Cloud saves row: `Synced 3 days ago · [Sync now ▾] [Open saves folder]`; Auto-sync as a switch
  row with a one-line description.
- Reason tooltips name the running action: "Wait for the move to finish".
- Tab labels must fit at 3fr/2fr without clipping; the tab bar gets `overflow-x: auto` as a
  backstop (sketch §2).

</specifics>

<deferred>
## Deferred Ideas

- Aligning the library card right-click menu with the no-flipping-labels rule (checkmarked nouns
  instead of Add/Remove pairs) — considered and left out of this phase (D-07).

</deferred>

---

*Phase: 100-game-page-without-the-menu*
*Context gathered: 2026-11-21*
