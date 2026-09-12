---
phase: quick-260912-it4
plan: 01
subsystem: frontend-styling
tags: [css-custom-properties, design-tokens, source-gate, themes]
requires:
  - src/backend/testUtils/stripSourceComments.ts
provides:
  - src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts
affects:
  - src/frontend/themes.scss
  - src/frontend/styles/_buttons.scss
tech-stack:
  added: []
  patterns:
    - "Source-text sweep gate with an explicit, rot-detected allowlist"
    - "color-mix(in srgb, …) as the rgba(var(--x-rgb), …) replacement"
key-files:
  created:
    - src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts
    - .planning/todos/pending/2026-09-12-installing-effect-grayscale-amount-is-unrecoverable-needs-a-design-decision.md
  modified:
    - src/frontend/themes.scss
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/components/UI/SearchBar/index.scss
    - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.css
    - src/frontend/screens/Login/index.scss
    - src/frontend/styles/_buttons.scss
    - src/frontend/components/UI/EditGameDialog/index.css
    - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.scss
    - src/frontend/screens/Settings/index.css
    - src/frontend/screens/WineManager/index.css
    - src/frontend/screens/WineManager/components/WineItem/index.css
    - src/frontend/components/UI/PopoverComponent/index.scss
    - src/frontend/components/UI/SteamGridDBPicker/index.scss
    - src/frontend/components/UI/Dropdown/index.scss
    - .planning/quick/260912-it4-drain-the-undefined-css-custom-property-/sweep-census.py
decisions:
  - "--status-sucess collapsed to var(--success), NOT spelling-corrected: --status-success is a raw Figma constant body.nord-light does not override"
  - "--border-color declared once in the base body {} block rather than rewriting 7 call sites, so themes can override"
  - "--installing-effect allowlisted, not guessed: it is a number with no recoverable value and needs a design decision"
  - "Login/index.scss:118 got a family-only fix, deviating from the plan, because line 119 already declares font-weight: 700 explicitly"
metrics:
  duration: ~50 min
  completed: 2026-09-12
---

# Quick 260912-it4: Drain the Undefined CSS Custom Property References — Summary

Drained every undefined `var(--x)` reference in the frontend stylesheets — **39 references
across 23 names down to 1 reference across 1 name** — and installed a rot-detecting jest gate
so the count cannot drift back up. The one survivor (`--installing-effect`) is explicitly
allowlisted with its reasoning and spun out as a `ready: human` todo.

## Commits

| # | Hash | Task |
|---|------|------|
| 1 | `a7fd4ebd5` | Task 1 — the 6 names a fallback does or should catch |
| 2 | `fbafefcc0` | Task 2 — migrate the last stragglers off the retired type vocabulary |
| 3 | `e777fe8f6` | Task 3 — resolve the colour/surface tokens and gate the sweep at 0 |
| 4 | `e2870201c` | Close the originating todo |

## Verification — actual output, not paraphrase

### Census (the plan's primary gate)

```
$ python3 .planning/quick/260912-it4-drain-the-undefined-css-custom-property-/sweep-census.py
1 references across 1 names

--installing-effect  x1
    src/frontend/screens/Library/components/GameCard/index.css:406
```

Trajectory across the three commits: **39/23 → 32/17 → 19/11 → 1/1**. (Every intermediate
figure matched the plan's prediction exactly.)

### The new jest gate

```
$ npx jest --selectProjects Frontend --passWithNoTests -t 'css token sweep'
Running one project: Frontend
PASS Frontend src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts

Test Suites: 159 skipped, 1 passed, 1 of 160 total
Tests:       2509 skipped, 2 passed, 2511 total
Snapshots:   0 total
Time:        4.052 s
Ran all test suites with tests matching "css token sweep".
```

### Full Frontend suite (including the pre-existing `themeTokens.test.ts`)

```
$ npx jest --selectProjects Frontend
Test Suites: 160 passed, 160 total
Tests:       2511 passed, 2511 total
```

### Lint, prettier, planning gates

- `pnpm lint:src` → exit 0, `✖ 1123 problems (0 errors, 1123 warnings)` — unchanged ceiling.
- `pnpm lint:tests` → exit 0, `✖ 638 problems (0 errors, 638 warnings)`. `cssTokenSweep.test.ts`
  contributes **0** findings (`grep -c cssTokenSweep` on the lint output = 0).
- `npx prettier --check "src/frontend/**/*.css" "src/frontend/**/*.scss"` → *All matched files
  use Prettier code style!*
- `pnpm planning-gates` → **10/10 planning gates passed**, including
  `.planning/todos/todo-frontmatter-gate.py`.

### Negative controls — both were SEEN to fail

A gate never seen failing proves nothing. Both controls were run and both reverted.

**(a) Bogus reference.** Replaced `color: var(--text-default)` with
`color: var(--definitely-not-a-token)` at `Dropdown/index.scss:65`:

```
● css token sweep › references no CSS custom property that nothing declares
    +   "--definitely-not-a-token (src/frontend/components/UI/Dropdown/index.scss:65)",
Tests:       1 failed, 2509 skipped, 1 passed, 2511 total
```

RED, and the reported line number is correct — confirming the raw-file lookup that backs the
failure message. Reverted; the file is byte-identical to its committed state.

**(b) Stale allowlist entry.** Added `'--a-name-that-is-no-longer-undefined'` to `ALLOWLIST`:

```
● css token sweep › allowlists no name that has stopped being an undefined reference
    +   "--a-name-that-is-no-longer-undefined",
Tests:       1 failed, 2509 skipped, 1 passed, 2511 total
```

RED via the rot check, exactly as intended. Reverted.

---

## Rendering deltas — one line per site

"Zero delta" lines carry their reasoning, per the measure-don't-eyeball rule. Every "before"
below was established by reading what the ancestor chain actually declares, not by looking at
the app.

### Task 1 — the fallback-caught group (7 refs, 6 names)

| # | Site | Change | Rendering delta |
|---|------|--------|-----------------|
| 1 | `SearchBar/index.scss:25` | fallback arm `--input-backgroundd` → `--input-background` | **REAL, and a live defect fixed.** `--search-bar-border` is declared exactly once, at `themes.scss:58` inside `body.midnightMirage`. On the other **10 themes** the chain fell through to the misspelling, the whole `box-shadow` was invalid at computed-value time, and there was **no `:focus-within` ring at all**. Now a 3px ring in `--input-background` (declared ×11). midnightMirage unchanged. |
| 2 | `GameCard/index.css:385` | `var(--status-sucess, var(--success))` → `var(--success)` | **ZERO.** The fallback arm was declared, so `--success` is what already rendered. Collapsing removes a dead arm only. |
| 3 | `themes.scss:16` | delete `--anticheat-unknown: var(--status-denied)` | **ZERO.** `git grep -n 'anticheat-unknown' -- src` returned exactly the one declaration — zero consumers. `Anticheat/index.scss:27-31` groups `.Unknown` with `.Denied` and styles both from `--anticheat-denied`. A dead token with a broken value. |
| 4 | `GameCard/index.css:492` | dead arm `--warning-hover` → `--status-warning-hover` | **ZERO.** `--cancel-button-overlay` is declared in the base `body {}` block (`themes.scss:8`), so the fallback arm is unreachable on every theme. |
| 5 | `GameCard/index.css:501` | same | **ZERO**, same reason. |
| 6 | `DownloadManagerItem/index.css:29` | `var(--cancel-button-hover, var(--danger-hover))` → `var(--danger-hover)` | **ZERO.** Primary arm never declared in any revision; the fallback is what rendered. |
| 7 | `DownloadManagerItem/index.css:45` | `var(--install-button-hover, var(--accent-overlay))` → `var(--accent-overlay)` | **ZERO**, same reason. |

**Do not "fix the typo" at site 2.** `--status-success` is a RAW Figma constant in
`_colors.scss`; `body.nord-light` overrides the `--success` *alias* and leaves the raw token
untouched. Renaming would make installed-game labels near-invisible on that theme.

### Task 2 — the retired typography vocabulary (13 refs, 6 names)

All six names were deleted on purpose by upstream `b6f3da757` (#1851), which introduced
`_typography.scss`. Every one of these is a **rendering change, not a restoration** — the
declarations have never applied.

| # | Site | Selector | Change | Rendering delta |
|---|------|----------|--------|-----------------|
| 1 | `Login/index.scss:157` | `.title` | `--actions-font-family` → `--primary-font-family` | Family: **inherited → Rubik**. `.title` is not in `_typography.scss`'s `h1..h6, .subtitle` family rule, so it genuinely inherited body's Cabin-led stack. Also drops body's `-apple-system, …` fallback chain. |
| 2 | `Login/index.scss:165` | `.subtitle` | same | Family: **inherited → Rubik**. `.subtitle` *is* in `_typography.scss:95-97` at equal specificity, but the IACVT declaration here won or lost on source order and computed to `inherit` either way. After: unambiguously Rubik — which is what `_typography.scss` intended all along. |
| 3 | `DownloadManagerItem/index.css:117` | `.downloadManagerListItem > .progress` | same | Family: **inherited → Rubik**. |
| 4 | `DownloadManagerItem/index.css:140` | `.react-contextmenu-item` | same | Family: **inherited → Rubik**. |
| 5 | `_buttons.scss:157` | `.button.is-text` | `--content-font-family` → `--secondary-font-family` | Family: **inherited → Cabin**. Near-identical in practice (body is Cabin-led), but now explicit and without body's system-font fallback chain. |
| 6 | `EditGameDialog/index.css:23` | `.previewLabel` | `--font-size-sm` → `--text-sm` | Size: **16px → ≈13.33px**. No ancestor in `.EditGameDialog > .editGameGrid > .imageIcons > .previewItem` declares `font-size`, and `Dialog__content` does not either (only `Dialog__headerTitle`/`Dialog__CloseIcon` do), so the nearest declaring ancestor is `body { font-size: 1rem }` (`_typography.scss:65`). `--text-sm` is `calc(1rem / 1.2)`. |
| 7 | `EditGameDialog/index.css:98` | `.advancedFields summary` | same | Size: **16px → ≈13.33px**, same chain. |
| 8 | `SideloadDialog/index.scss:109` | `.advancedFields summary` | same | Size: **16px → ≈13.33px**. **This site is absent from the originating todo's `files:` list** — noted on closure. |
| 9 | `Login/index.scss:118` | `.goToLibrary` | `--font-primary-bold` → `--primary-font-family` (family only) | Family: **inherited → Rubik**. Weight: **unchanged at 700**. See the deviation below. |
| 10 | `Settings/index.css:27` | `.Settings .Field label` (+3 grouped) | `font:` shorthand → `font-family` + `font-weight: var(--regular)` | Family: **inherited → Cabin**; weight: **inherited (400) → explicit 400**. Size and line-height **unchanged** — they are re-declared as `--text-md` / `--space-lg` on the very next two lines and survived the invalid shorthand. Net visible change: essentially nil, plus the loss of body's system-font fallback chain. |
| 11 | `WineManager/index.css:186` | `label` (nested) | same | Same as #10. |
| 12 | `Settings/index.css:82` | `.save` | `font:` shorthand → `font-family` + `font-weight` + **`font-style: italic`** | **Becomes italic for the first time.** The whole shorthand was invalid, so the italic has never rendered. Family inherited → Cabin; weight inherited(400) → explicit 400; size/line-height unchanged (re-declared below). **The most visible change in this task.** |
| 13 | `Settings/index.css:94` | `.appName` | same | **Newly italic**, same reasoning. |

`font-size` was deliberately **omitted** from the expanded longhands at #10-13 so today's
inherited/re-declared size is preserved exactly — the smallest honest change.

### Task 3 — colour and surface tokens (24 refs, 12 names)

| # | Site(s) | Change | Rendering delta |
|---|---------|--------|-----------------|
| 1 | `--border-color` ×7: `PopoverComponent:6,:8`; `SteamGridDBPicker:12`; `WineManager:30,:112,:207`; `WineItem:113` | declare `--border-color: var(--divider, var(--neutral-03))` once in base `body {}`; **call sites untouched** | **REAL, all 7.** Never declared in any revision (`git log -S` empty), so all seven were invalid → `unset` → `border-style: none` / `box-shadow: none`: **no border or ring rendered anywhere**. Now a 1px `--divider` border (falling back to `--neutral-03`, since `--divider` is declared in only 2 of 11 theme blocks). Themes may now override. |
| 2 | `--text-primary` ×5: `PopoverComponent:5`; `WineItem:58`; `WineManager:33,:84,:89` | → `--text-default` | **REAL.** Colour was inherited (invalid declaration); now the base-`body` token, guaranteed on every theme. Disposition taken verbatim from `SteamLogin/index.scss:83-93`, an already-reviewed in-repo finding that names WineManager as the dead-token site and prescribes exactly this. |
| 3 | `--background-hover` ×2: `SteamGridDBPicker:58`; `DownloadManagerItem:63` | → `--background` | **REAL.** No hover background rendered before; now the repo's dominant `:hover` surface (10 existing sites). **Not `--background-darker`**: midnightMirage sets `--body-background: var(--background-darker)` and nord-light sets `--background-darker: var(--body-background)`, so it would be invisible on both. Historic value was `rgb(20 20 20 / 47%)`, retired by `5e9003e39`. |
| 4 | `--stop-button` ×2: `Settings:165` (`.button.is-footer:hover/:focus-visible`); `_buttons.scss:79` (`.button.is-tools:hover/:focus-visible`) | → `--background-darker` | **REAL.** No hover/focus background before; now the theme-adaptive dark surface. Historic value was `#252121`, a near-black neutral; `--background-darker` is `--neutral-01` `#070a0b` on midnightMirage — the closest live match, declared in all 11 themes. |
| 5 | `--background-gradient` ×1: `DownloadManagerItem:109` (`.progress`) | → `--background-darker-80` | **REAL.** No background before; now `#000000cc`. Historic value was `linear-gradient(180deg, rgba(0,0,0,.418) 2.4%, #0d0f1cd2 64%)` — a dark translucent scrim behind the progress badge over cover art. `--background-darker-80` is the live translucent-dark scrim token (base `body {}`, `themes.scss:9`); a flat 80% black rather than a gradient. |
| 6 | `--bg-primary` ×1: `WineManager:111` (`.gameListHeader`) | → `--body-background` | **REAL.** Transparent before; now the page surface. The sibling at `:29` already uses `--body-background`. |
| 7 | `--error` ×1: `WineManager:160` (`.errorState`) | → `--danger` | **REAL.** Colour inherited before; now the theme-adaptive danger alias — **not** the raw `--status-danger`. |
| 8 | `--text` ×1: `Dropdown/index.scss:65` (`.only`) | → `--text-default` | **REAL.** Colour inherited before; now the base-`body` token. |
| 9 | `--text-muted` ×1: `SteamGridDBPicker:104` (`&__no-results`) | → `--text-secondary` | **REAL.** Colour inherited before; now the base-`body` secondary token. |
| 10 | `--danger-rgb` ×1: `SteamGridDBPicker:35` (`&__error`) | `rgba(var(--danger-rgb), .1)` → `color-mix(in srgb, var(--danger) 10%, transparent)` | **REAL.** No background before; now a 10% danger-tinted error panel. Cannot be a rename — `rgba()` needs an r,g,b triplet and no declared token is one. `color-mix` is Safari 16.2+, and WKWebView is this app's renderer. |
| 11 | `--primary-button-hover` ×1: `themes.scss:596` | dead arm collapsed to `var(--primary-button)` | **ZERO.** Scoped to `body.zombie/.zombie-classic`, where `--primary-button: #14e8c8` is declared locally, so the fallback arm is what rendered. |
| 12 | `--installing-effect` ×1: `GameCard:406` | **allowlisted, unchanged** | **ZERO** — deliberately. See below. |

---

## Deviations from the plan

### 1. `Login/index.scss:118` — family only, no `font-weight`

The plan prescribed adding `font-weight: var(--medium)` (500) alongside the family fix, with
the stated delta "weight changes from inherited to 500".

**Measured: line 119 already declares `font-weight: 700;` explicitly.** Adding the plan's
declaration would have *downgraded* the primary login CTA from 700 to 500 — a visible
regression — and the plan's premise ("inherited") is simply false at this site.

The deeper reason: constraint 3's weight trap governs the `font:` **shorthand** sites. At
`:118` the retired token sits in a `font-family:` **longhand**, which can only ever contribute
a family; its retired weight semantics do not apply here at all. Family only.

### 2. No `border-style` todo was filed — the predicted defect does not exist

The plan directed that `WineManager/index.css:206` and `WineItem/index.css:113` be recorded as
a residual and spun out as a `severity: minor` todo, on the premise that both are bare
`border-bottom: var(--border-color);` — a whole-shorthand position that would remain visually
inert (`border-style: none`) even once the token is declared.

**Measured — all seven `--border-color` sites carry an explicit style:**

```
src/frontend/screens/WineManager/index.css:30:      border: 1px solid var(--border-color);
src/frontend/screens/WineManager/index.css:112:      border-bottom: 1px solid var(--border-color);
src/frontend/screens/WineManager/index.css:207:    border-bottom: 1px solid var(--border-color);
src/frontend/screens/WineManager/components/WineItem/index.css:113:    border-bottom: 1px solid var(--border-color);
src/frontend/components/UI/PopoverComponent/index.scss:6:    border: 1px solid var(--border-color);
src/frontend/components/UI/PopoverComponent/index.scss:8:    box-shadow: 0 0 0 1px var(--border-color);
src/frontend/components/UI/SteamGridDBPicker/index.scss:12:    border-bottom: 1px solid var(--border-color);
```

There is no missing `border-style`. Filing that todo would have recorded a defect that does not
exist, so it was not filed. This also means **7 sites gain a border**, not the 5 the plan
predicted.

### 3. Two names the plan (and the todo) never saw — both found by the plan's own Part A fix

Fixing the census surfaced a larger population than 18/10, and resolving both was in scope
because the success criterion is *zero* undefined references.

- **`--text-primary` ×5** — hidden by a **false negative**, the dangerous direction.
  `SteamLogin/index.scss:86` carries a `//` comment whose text is literally
  `` grep -rn -- "--text-primary:" src/frontend `` — a faithful record of the token being dead.
  Unstripped, that prose matched the **declaration** regex, so the census believed
  `--text-primary` was declared and hid five live undefined references behind the very comment
  documenting them. This is the repo's recorded *"prose satisfies the gate that names it"*
  failure mode, caught here only because comment stripping was made load-bearing.
- **`--primary-button-hover` ×1** (`themes.scss:596`) — a line-by-line reference scan cannot see
  a prettier-wrapped `var(\n  --primary-button-hover,\n  var(--primary-button)\n)`. The census
  was changed to scan whole text with an offset→line mapping so it agrees with the jest gate,
  which caught this and the census did not.

---

## The gate

`src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts`, modelled on the
`themeTokens.test.ts` beside it. Two tests:

1. **`references no CSS custom property that nothing declares`** — collects declarations from
   git-tracked `src/**`+`public/**` `.css/.scss/.ts/.tsx/.js/.html` (plus
   `setProperty('--x', …)`), collects `var(--x)` from `.css/.scss`, asserts the difference is
   empty except for `ALLOWLIST`.
2. **`allowlists no name that has stopped being an undefined reference`** — the rot check.
   Mandatory, and the known failure mode: `themeTokens.test.ts:68-99` records a guard whose own
   originating site escaped it and whose residual survived a green suite for 14 days.

Both the declaration scan and the reference scan run over `stripSourceComments`
(`src/backend/testUtils/stripSourceComments.ts`), reused rather than re-rolled.

**Two blind spots recorded in the gate's own header**, per the constraint:

- **Trailing `//` comments survive.** `stripSourceComments` deliberately avoids a naive
  `/\/\/.*$/` pass (it would truncate `url(https://...)` — the WR-08 regression class). A
  `var(--x)` inside a trailing comment on a code line is therefore still counted. The remedy if
  it ever bites is to layer `stripTrailingLineCommentTs` on top, **not** to hand-roll a stripper.
- **It checks NAMES, not SCOPES.** A declaration found anywhere in any file counts as declared,
  so a token declared under one narrow selector reads as universally available.
  `--search-bar-border` is the worked example — declared once inside `body.midnightMirage`,
  unavailable on 10 themes, and this gate would not have caught it (the `260912-it4` sweep found
  it only via the misspelled fallback arm sitting behind it). A scope-aware sweep is a
  different, harder gate.

## Residual work

| Item | Where | Why not now |
|------|-------|-------------|
| `--installing-effect` grayscale amount | `.planning/todos/pending/2026-09-12-installing-effect-grayscale-amount-is-unrecoverable-needs-a-design-decision.md` (`severity: minor`, `platform: any`, `ready: human`) | It is a **number**, not a colour, and `git log -S` is empty — the intended value (0? 0.5? 1?) is unrecoverable. Guessing changes every non-installed tile in the library grid, so it needs a design decision. Allowlisted with that reasoning inline; the todo names the traps (do not set `0` — that satisfies the gate while leaving the rule inert). |

The `border-style` todo the plan sanctioned was **not** filed — see Deviation 2; that defect
does not exist.

## What this does NOT prove

The gate is a **source-text** gate. The Frontend jest project is `testEnvironment: 'node'` with
no jsdom and no CSS engine, so nothing here proves anything **renders**. Every delta above is
derived by reading what the source and its ancestor chain declare. In particular these are
worth a live look on at least midnightMirage and nord-light:

- the SearchBar `:focus-within` ring, now present on 10 themes where it was absent;
- the 7 newly-visible `--border-color` borders (WineManager and the Popover especially);
- the two newly-italic Settings labels (`.save`, `.appName`);
- the three dialog `font-size` drops from 16px to ≈13.33px;
- the SteamGridDBPicker `color-mix` error tint (WKWebView `color-mix` support is Safari 16.2+,
  asserted from documentation, not measured here).

## Self-Check: PASSED

- `src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts` — FOUND, tracked in `e777fe8f6`.
- `.planning/todos/pending/2026-09-12-installing-effect-…md` — FOUND, tracked in `e777fe8f6`.
- `.planning/todos/completed/2026-09-12-39-references-…md` — FOUND in `HEAD`; the `pending/` copy is gone from `HEAD`.
- Commits `a7fd4ebd5`, `fbafefcc0`, `e777fe8f6`, `e2870201c` — all present in `git log`.
- No file deletions in any of the four commits (`git diff --diff-filter=D HEAD~1 HEAD` empty for each; commit 4 is a tracked rename).
- Working tree contains only the pre-existing uncommitted items it started with.
