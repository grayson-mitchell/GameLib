# Phase 45: Native in-app Winetricks UI — Pattern Map

**Mapped:** 2026-10-10
**Files analyzed:** 20 (11 new, 9 modified/deleted)
**Analogs found:** 18 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/frontend/components/UI/Winetricks/index.tsx` (rewritten tab-body owner) | component (state owner) | request-response + event-driven | same file, pre-rewrite (`src/frontend/components/UI/Winetricks/index.tsx`) | exact (self, carry mount-gate discipline) |
| `src/frontend/components/UI/Winetricks/SuggestedGroup/index.tsx` | component | CRUD (derived list render) | `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx` (row) + `verbs.ts` resolver | role-match |
| `src/frontend/components/UI/Winetricks/TaskGroup/index.tsx` | component (disclosure) | event-driven (expand/collapse) | `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx` | exact (pattern, not import) |
| `src/frontend/components/UI/Winetricks/EverythingElseGroup/index.tsx` | component (disclosure + search) | event-driven + CRUD (filter) | `FilterFacetGroup/index.tsx` + Phase 44's `WinetricksBrowse/index.tsx` search wiring | role-match |
| `src/frontend/components/UI/Winetricks/Row/index.tsx` (checkbox variant) | component | event-driven | `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx` | exact |
| `src/frontend/components/UI/Winetricks/StickyBar/index.tsx` | component | event-driven (queue state machine) | none in-tree (new UI shape) — nearest is the `ProgressDialog` footer button bar | no analog (see below) |
| `src/frontend/components/UI/Winetricks/LogPanel/index.tsx` | component | streaming (append-only log) | `src/frontend/components/UI/ProgressDialog/index.tsx` (log pane + classifier) | role-match |
| `src/frontend/components/UI/Winetricks/EnvironmentBanner/index.tsx` | component | request-response (static per-mount) | none in-tree — nearest is `HumbleExpiryToast` (explicitly NOT to be copied for styling, see Shared Patterns) | partial match (styling anti-pattern only) |
| `src/common/winetricks/verbs.ts` (extend: task-group map, retire `NEEDS_GUI_WINETRICKS_VERBS` list) | utility (pure data) | transform | same file, current state | exact (self) |
| `src/common/winetricks/deriveRowState.ts` (extend: selected/queued inputs) | utility (pure function) | transform | same file, current state | exact (self) |
| `src/common/winetricks/metadata.ts` (new `w_metadata` parser) | utility (pure parser) | transform | `src/backend/tools/winetricksListParse.ts` | exact |
| `src/backend/tools/index.ts` (`Winetricks.install` → queue wrapper; stderr classifier; delete `Winetricks.run`) | service (child-process orchestration) | event-driven + streaming | same file, `installFixes()` in `src/backend/launcher.ts:993-1008` | exact |
| `src/backend/tools/ipc_handler.ts` (delete `case 'winetricks'`) | route/IPC handler | request-response | same file, current state | exact (self, deletion) |
| `src/backend/sidecar/runnerMiscFlowRegistration.ts` (delete `case 'winetricks'`) | route/IPC handler (sidecar dup) | request-response | `src/backend/tools/ipc_handler.ts`'s sibling case | exact |
| `src/backend/sidecar/wineToolsFlowRegistration.ts` (extend payload for queue invoke, if chosen) | route/IPC handler | invoke + send-kind | same file, `winetricksInstall`/`winetricksAvailable`/`winetricksInstalled` registrations | exact |
| `src/backend/tools/__tests__/winetricksListParse.test.ts` (extend fixtures / new metadata fixture) | test | transform | same file, current state | exact |
| `src/frontend/components/UI/Winetricks/__tests__/remountSafety.test.tsx` (ported) | test | event-driven | `WinetricksBrowse/__tests__/remountSafety.test.tsx` | exact |
| `src/frontend/components/UI/Winetricks/__tests__/winetricksInstallMouseRace.test.tsx` (ported) | test | event-driven | `WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx` | exact |
| `src/frontend/screens/Settings/sections/GamesSettings/index.tsx` (new `<Tab>` + `<TabPanel>`) | component (tab strip) | request-response | same file, `Wine`/`Other` tab entries | exact |
| `src/frontend/screens/Settings/components/Tools/index.tsx` (remove Winetricks button + mount) | component | request-response | same file, current state | exact (self, deletion) |
| `public/locales/en/gamelib.json` (38 new keys, 2 retired) | config (locale catalog) | CRUD (string table) | same file, `winetricksBrowse.*` existing block | exact |
| `public/locales/en/translation.json` (remove `winetricks.openGUI`) | config (locale catalog) | CRUD | same file, current state | exact |

## Pattern Assignments

### `src/backend/tools/index.ts` — install queue + stderr classifier (service, event-driven)

**Analog 1 — the sequential install loop to extend:** `src/backend/launcher.ts:993-1008` (`installFixes`)
```typescript
async function installFixes(appName: string, runner: Runner) {
  const knownFixes = readKnownFixes(appName, runner)
  if (!knownFixes) return
  if (knownFixes.winetricks) {
    sendGameStatusUpdate({ appName, runner: runner, status: 'winetricks' })
    for (const winetricksPackage of knownFixes.winetricks) {
      await Winetricks.install(runner, appName, winetricksPackage)
    }
  }
  ...
}
```
D-11's queue is this loop, extended to: accept an ordered verb list from the renderer (not `knownFixes.winetricks`), record per-verb outcome instead of discarding it, support dropping not-yet-started verbs (`Cancel remaining`, D-13), and not stop on failure (D-12 — unlike this loop, which has no failure handling at all).

**Analog 2 — single-flight guard to keep as the primitive the queue wraps:** `src/backend/tools/index.ts` `Winetricks.install`
```typescript
install: async (runner: Runner, appName: string, component: string) => {
  if (installingComponent !== '') {
    logWarning(`Not installing ${component}: ${installingComponent} is already installing`, LogPrefix.WineTricks)
    return
  }
  installingComponent = component
  sendFrontendMessage('installing-winetricks-component', component)
  try {
    await Winetricks.runWithArgs(runner, appName, ['-q', component], false, undefined, component)
  } finally {
    installingComponent = ''
    sendFrontendMessage('installing-winetricks-component', '')
  }
}
```
Do not replace this; the queue is a new `for…await` loop around unmodified calls to it, exactly matching how `installFixes` already calls it.

**Analog 3 — the firehose being classified (D-15):**
```typescript
child.stderr.setEncoding('utf8')
child.stderr.on('data', (data: string) => {
  logError(data, LogPrefix.WineTricks)
  appendMessage(data)
})
```
Replace the unconditional double-send with a classifier invoked at this exact point: curl progress → percentage (never `logError`), wine `fixme:`/`err:` noise → details-only, winetricks' own warnings → environment banner payload, real failures → row `Install failed` + red in details. `stdout.on('data', ...)` and the 1s `flushProgress`/`sendDone` machinery (`doneSent`, `exitCode`, `child.on('exit'/'close')`) are untouched — classification sits inside the existing stderr handler, not a new spawn pipeline.

**Analog 4 — the escape hatch being deleted (D-17):**
```typescript
run: async (runner: Runner, appName: string) => {
  await Winetricks.runWithArgs(runner, appName, ['-q', '--gui'])
}
```
Delete this method entirely, plus its 3 call sites (see below).

---

### `src/backend/tools/ipc_handler.ts` and `src/backend/sidecar/runnerMiscFlowRegistration.ts` — delete the GUI route (route, request-response)

Both files register an identical `case 'winetricks':` inside a `callTool` switch — confirmed duplicate registration, not an oversight (the sidecar file's own docstring states it intentionally never imports `tools/ipc_handler.ts`). **Grep both files for the literal string `'winetricks'` before considering the deletion complete**; the plan's verify step should assert neither file contains `Winetricks.run` afterward (Pitfall 1 in RESEARCH.md). `wineToolsFlowRegistration.ts`'s existing invoke/send registrations (`winetricksAvailable`, `winetricksInstalled`, `winetricksInstall`) are NOT touched by this deletion — only the `callTool('winetricks')` route dies.

---

### `src/common/winetricks/metadata.ts` (new) — pure `w_metadata` parser (utility, transform)

**Analog:** `src/backend/tools/winetricksListParse.ts` — same discipline: no electron, no fs, no logger import, pure regex-driven line parser, unit-tested against a committed script fixture.
```typescript
import type { WinetricksComponent } from 'common/types'
const HEADER_RE = /^===== (\S+) =====$/
const VERB_SHAPE_RE = /^[a-z0-9_][a-z0-9_=]*$/
```
`metadata.ts` should follow the same shape: a pure function taking the raw script text (read backend-side, no wine invocation — D-19's constraint) and returning per-verb `{publisher, year, media, conflicts, homepage, needsGui}` by regex-extracting `w_metadata ... publisher="..." year="..." media="..."` blocks and separately flagging verbs whose body calls `w_download_manual` (D-17's derived needs-GUI set — grep-based, not a `media` heuristic; RESEARCH.md Pitfall 3 is explicit that `media="manual_download"` is NOT the same signal). Test fixture pattern: extend `src/backend/tools/__tests__/winetricksListParse.test.ts`'s existing committed-script-fixture discipline, or add a sibling fixture test colocated with `metadata.ts`.

---

### `src/common/winetricks/verbs.ts` — extend with task-group map, retire hand-written GUI list (utility, transform)

**Analog:** same file, current state.
```typescript
export const CURATED_WINETRICKS_VERBS = [
  'vcrun2019', 'vcrun2013', 'vcrun2010', 'dotnet48',
  'd3dx9', 'xact', 'corefonts', 'physx'
] as const

const NEEDS_GUI_VERBS_LIST = [ /* 8 hand-written verbs */ ] as const
export const NEEDS_GUI_WINETRICKS_VERBS: ReadonlySet<string> = new Set(NEEDS_GUI_VERBS_LIST)

export function resolveCuratedComponents(
  all: readonly WinetricksComponent[]
): WinetricksComponent[] {
  const resolved: WinetricksComponent[] = []
  for (const verb of CURATED_WINETRICKS_VERBS) {
    const match = all.find((component) => component.verb === verb)
    if (match) resolved.push(match)
  }
  return resolved
}
```
Keep `CURATED_WINETRICKS_VERBS` and `resolveCuratedComponents` verbatim (D-06 reuses both). **Delete `NEEDS_GUI_VERBS_LIST`/`NEEDS_GUI_WINETRICKS_VERBS`** (D-17 retires the hand-written list) and replace with a value computed from `metadata.ts`'s derived set, supplied at call time (keep the exported binding name if `deriveRowState.ts`'s import must not change shape, or update the one import site). Add the new hand-maintained task-group membership map (D-07) as a new export in this same file, following the same "pure, dependency-free, unit-tested against the committed fixture" discipline as `CURATED_WINETRICKS_VERBS` — a plain object/array literal, no derivation, with a test asserting every verb in the map round-trips.

---

### `src/common/winetricks/deriveRowState.ts` — extend with selected/queued states (utility, transform)

**Analog:** same file, current state.
```typescript
type WinetricksRowState =
  | 'available' | 'installing' | 'installingElsewhere'
  | 'installed' | 'needsGui' | 'errored'

export function deriveRowState(input: {
  verb: string
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
}): WinetricksRowState {
  const { verb, installed, installing, installingComponent, erroredVerbs } = input
  if (NEEDS_GUI_WINETRICKS_VERBS.has(verb)) return 'needsGui'
  if (installing && installingComponent === verb) return 'installing'
  if (installed.includes(verb)) return 'installed'
  if (erroredVerbs[verb]) return 'errored'
  if (installing) return 'installingElsewhere'
  return 'available'
}
```
The precedence-order discipline is load-bearing (a comment states order matches a numbered rule list, each with its own test case in `deriveRowState.test.ts`). D-10/D-13 require two new states — `selected` (ticked, no run in flight) and `queued` (ticked, a run is in flight, this verb hasn't started) — inserted into the precedence chain without disturbing the existing six. `attributeProgressEvent`'s pure-reducer pattern (returns the SAME object reference when nothing changed, to avoid re-rendering all rows) must be preserved for any new reducer this phase adds (e.g. a `queued`-set reducer for `Cancel remaining`).

---

### `TaskGroup/index.tsx` and `EverythingElseGroup/index.tsx` — disclosure header (component, event-driven)

**Analog:** `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx`
```tsx
export function FilterFacetRow({ label, count, checked, onToggle }: FilterFacetRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={classNames('FilterFacetRow', {
        'FilterFacetRow--checked': checked,
        'FilterFacetRow--zero': count === 0 && !checked
      })}
    >
      <span className="FilterFacetRow__box" aria-hidden="true" />
      <span className="FilterFacetRow__label">{label}</span>
      {count !== undefined && <span className="FilterFacetRow__count">{count}</span>}
    </button>
  )
}
```
Copy the **contract** — real `<button aria-expanded>` (task-group headers need `aria-expanded`, not `aria-checked`/`role="checkbox"` like this row primitive, since they disclose rather than select), caret rotation, uppercase bold-tracked label, tabular-nums count badge — into a **new component under `src/frontend/components/UI/Winetricks/`'s own CSS scope**. Do **not** import `FilterFacetGroup`/`FilterFacetRow` directly: its styling is selector-scoped to `.NavShell__tier2Portal` and consumes the `--navbar-*` chain this surface is explicitly banned from using (UI-SPEC Color section, Anti-Pattern in RESEARCH.md: "this codebase has been burned twice by exactly this — `Dropdown` styling leaking into its panel's contents; the unscoped `.MuiTabs-root` leak").

---

### `Row/index.tsx` (checkbox variant) — row component (component, event-driven)

**Analog:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx`
```tsx
const suppressNextClick = useRef(false)
const activate = (action: () => void) => ({
  onMouseDown: (event: React.MouseEvent) => {
    event.preventDefault()
    suppressNextClick.current = true
    action()
  },
  onClick: () => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    action()
  }
})
```
Carry this mousedown-capture + `suppressNextClick` helper forward verbatim onto every clickable control in the new Row (checkbox, Retry) — D-04/Interaction Contract §2 requires it, and `winetricksInstallMouseRace.test.tsx` (ported, not deleted) encodes it. The `deriveRowState(...)` call site and the `switch (rowState)` rendering shape are the template for the new row's trailing-slot rendering, extended with `selected`/`queued` cases. The existing `type Props` (`component`, `installed`, `installing`, `installingComponent`, `erroredVerbs`, `onInstall`, `onOpenGui`) confirms there is **no** `selected`/`onToggleSelect` concept today — D-10's checkbox is net-new frontend surface, not an extension; drop `onOpenGui` entirely (D-17).

---

### `LogPanel/index.tsx` — classified log display (component, streaming)

**Analog:** `src/frontend/components/UI/ProgressDialog/index.tsx:68-89` (classifier being retired, now backend-side per D-15)
```typescript
// line.toLowerCase().includes(' err') -> 'log-error'
// line.toLowerCase().includes(' warn') -> 'log-warning'
// else -> 'log-info'
```
`LogPanel` receives an already-classified payload shape from the backend (per D-15, the frontend must never re-parse a raw line) and should keep this same three-class CSS-styling convention (`log-error`/`log-warning`/`log-info`) for rendering, driven by the backend's classification field rather than re-deriving it from substring matching client-side.

---

### `GamesSettings/index.tsx` — new tab + visibility gate (component, request-response)

**Analog:** same file's existing `Wine` tab entry
```tsx
{showWineTab && <Tab label="Wine" value="wine" />}
...
<TabPanel value={value} index={'wine'}>
  ...
  {!isCrossover && ( /* <Tools /> etc */ )}
</TabPanel>
```
New `<Tab value="winetricks">` is added beside `Wine`, gated `showWineTab && !isCrossover` (D-01/D-03 — the exact `!isCrossover` guard the Wine `TabPanel` already applies to `<Tools />`), with its own `<TabPanel value={value} index={'winetricks'}>`.

**Visibility gate to mirror exactly** — `src/frontend/screens/Settings/components/Tools/index.tsx`:
```tsx
const isWindows = platform === 'win32'
if (isDefault || isWindows || !runner) {
  return <></>
}
```
D-03's gate is this condition's negation, ANDed with `!isCrossover`.

---

### `Tools/index.tsx` — remove Winetricks button and mount (component, deletion)

**Analog:** same file, current state.
```tsx
import { Winetricks } from 'frontend/components/UI'
...
const [winetricksRunning, setWinetricksRunning] = useState(false)
```
Delete the `Winetricks` import, the `winetricksRunning` state, the button, and the `<Winetricks onClose={...} runner={runner} />` dialog mount. `Winecfg`/`Run EXE` (`callTools('winecfg'|'runExe', ...)`) stay unchanged — do not touch the `callTools` helper or its two remaining tool cases.

---

### `public/locales/en/gamelib.json` — locale fill (config, CRUD)

**Analog:** same file's existing `winetricksBrowse.*` block (13 frozen keys from Phase 44).
Reuse 11 keys as-is (`installedTag`, `installFailedTag`, `retry`, `cachedTag`, `curatedGroup`, `searchPlaceholder`, `zeroResultHeading`, `clearSearch`, `resultsHeading_one`/`_other`, `emptyHeading`, `emptyBody`). Retire `needsGuiTag`, `installingRow`. Add 38 new keys per the UI-SPEC Copywriting Contract table (`suggestedHeading`, `taskGroup.*` ×5, `everythingElse`, `apply`/`applyAriaLabel`, `selectedCount_one`/`_other`, `family.*` ×13, `publisherYear`, `phaseDownloading`/`phaseInstalling`/`phaseDone`, `installingBar`, `cancelRemaining`, `installedCount_one`/`_other`, `failedCount_one`/`_other`, `showDetails`/`hideDetails`, `environmentBannerGptk`/`environmentBannerMissingDeps`).

**Pitfall to carry (D-20/RESEARCH Pitfall 4):** inserting a key that sorts alphabetically last changes the *previous* line's trailing comma too — expect a 2-line diff for a 1-key insertion, not a 1-line diff. This repeats across 49 locale directories for `gamelib.json`.

**Pitfall to carry (D-20/RESEARCH Pitfall 5):** `translation.json`'s `winetricks.openGUI` removal touches 47 locale dirs, not 49 — do not assume `gamelib.json`'s and `translation.json`'s locale-directory sets are identical when scripting the removal; `_one` plural forms are load-bearing and must be grepped for individually before deletion.

## Shared Patterns

### Mousedown-capture click-race guard
**Source:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx` (`activate`/`suppressNextClick`)
**Apply to:** every clickable control on the new surface — checkbox, `Apply`, `Retry`, `Cancel remaining`, task-group/Suggested headers.
```tsx
const suppressNextClick = useRef(false)
const activate = (action: () => void) => ({
  onMouseDown: (event: React.MouseEvent) => {
    event.preventDefault()
    suppressNextClick.current = true
    action()
  },
  onClick: () => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    action()
  }
})
```

### Mount-gate discipline (never gate on `installing`/revalidation flags)
**Source:** `src/frontend/components/UI/Winetricks/index.tsx:226-233` (comment + `!declined`-only mount condition)
**Apply to:** the new tab's top-level component — D-18's stronger "survive full navigation" requirement inherits this exact lesson. Port `remountSafety.test.tsx` first and make it pass before writing any new mount-gating logic.
```tsx
{!declined && ( /* the new tab body */ )}
```

### Backend-resident sequential queue with per-item outcome
**Source:** `src/backend/launcher.ts:993-1008` (`installFixes`)
**Apply to:** `src/backend/tools/index.ts`'s new Apply queue (D-11).
```typescript
for (const winetricksPackage of knownFixes.winetricks) {
  await Winetricks.install(runner, appName, winetricksPackage)
}
```

### Theme-adaptive color aliases, never raw `--status-*` or `--navbar-*`/`--text-hover`
**Source:** UI-SPEC Color section, cross-referenced against `FilterFacetGroup/index.scss`'s own token-survival substitution comments (`--navbar-inactive` → `--navbar-accent`; `--text-hover` → `--accent`; bare `--navbar-active` always wrapped in a fallback chain).
**Apply to:** every SCSS file this phase adds (`Row`, `TaskGroup`, `StickyBar`, `EnvironmentBanner`, `LogPanel`).
```scss
// Accent — direct, no --navbar-active/--navbar-accent chain:
color: var(--accent, #0080ff);
// Success/danger aliases, never raw --status-success/--status-danger:
color: var(--success, #2ecc71);
color: var(--danger, #cc3333);
// Unchecked checkbox border — NOT --border-color (1.08:1 in 10/13 themes):
border-color: var(--neutral-05, #a8aeaf);
```
The `EnvironmentBanner` explicitly must NOT follow `HumbleExpiryToast`'s own pattern (`border-inline-start: var(--space-3xs) solid var(--status-warning)`) — that is the exact raw-`--status-*` anti-pattern this phase's own lesson warns against; use `var(--input-background)`/`var(--text-secondary, #a8aeaf)` instead (see UI-SPEC Color section).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/frontend/components/UI/Winetricks/StickyBar/index.tsx` | component | event-driven (3-state machine: rest/in-flight/done) | No existing component in this codebase renders a persistent bottom action bar with a 3-state progress/summary machine; UI-SPEC's own States table (rest/in-flight/done) is the contract to build against directly — no closer analog than `ProgressDialog`'s now-retired footer button, which is a single static button, not a state machine. |
| `src/frontend/components/UI/Winetricks/EnvironmentBanner/index.tsx` | component | request-response (static per-mount) | `HumbleExpiryToast` is structurally similar (persistent top-of-surface banner) but is explicitly named in UI-SPEC as the wrong model to copy *styling* from (raw `--status-warning` anti-pattern); use it only as a negative example, not a positive analog. |
| `src/backend/sidecar/wineToolsFlowRegistration.ts` (new queue invoke channel, if the planner chooses `winetricksInstallMany`) | route (new channel) | invoke | The file's own existing `winetricksInstall`/`winetricksAvailable`/`winetricksInstalled` registrations are the closest in-file precedent (see Pattern Assignments above) but there is no existing *multi-item queue* invoke channel anywhere in this codebase to copy outcome-reporting shape from — RESEARCH.md Open Question 2 leaves this IPC shape as planner discretion. |

## Metadata

**Analog search scope:** `src/frontend/components/UI/Winetricks/`, `src/frontend/components/UI/NavShell/components/FilterFacetGroup/`, `src/frontend/screens/Settings/`, `src/backend/tools/`, `src/backend/sidecar/`, `src/backend/launcher.ts`, `src/common/winetricks/`, `public/locales/en/`.
**Files scanned:** ~20 direct reads/greps across the above directories, cross-checked against CONTEXT.md canonical_refs and RESEARCH.md Code Examples (all previously `[VERIFIED]` by the researcher via direct `Read`).
**Pattern extraction date:** 2026-10-10
