---
phase: quick-260925-pga
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [QUICK-260925-pga]
files_modified:
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts

must_haves:
  truths:
    - "A focused game card in the NORMAL (non-console) library shows a thick, accent-coloured ring that is obvious at a glance — not the near-invisible 1px `-webkit-focus-ring-color auto` hairline it shows today."
    - "The ring colour comes from `var(--accent, ...)` — the SAME token `.consoleCard.focused` uses — so every one of the 11 shipped themes gets its own accent, and no theme gets a hardcoded colour."
    - "Console mode is byte-for-byte unchanged: `src/frontend/screens/ConsoleMode/index.scss` is not in `files_modified`, and `ConsoleCard/index.tsx` imports only `GameCard/constants` (never `GameCard/index.css`), so the edited stylesheet cannot reach a console card."
    - "The ring survives a browser that lacks `color-mix()`: the ring is an `outline` declaration and the glow is a SEPARATE `box-shadow` declaration, so a dropped `color-mix()` kills only the glow."
    - "The focused card paints ABOVE its later-in-DOM grid siblings (`z-index` on the focus state), so the ring is not half-covered by the next card."
    - "A list-view row (`.gameListItem`) focused in non-console mode also shows an accent ring, not only the `--accent-overlay` text-colour change it shows today."
  artifacts:
    - path: "src/frontend/screens/Library/components/GameCard/index.css"
      provides: "Accent focus ring for .gameCard and .gameListItem"
      contains: "outline: 3px solid var(--accent"
    - path: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts"
      provides: "Source-text gate: token-driven ring present, hairline gone, console reference intact"
      contains: "stripSourceComments"
  key_links:
    - from: "src/frontend/screens/Library/components/GameCard/index.css .gameCard:focus-within"
      to: "--accent theme token (styles/_colors.scss base + 10 overrides in themes.scss)"
      via: "var(--accent, #0080ff) in the outline declaration"
      pattern: "outline:\\s*3px solid var\\(--accent"
    - from: "src/frontend/screens/ConsoleMode/index.scss .consoleCard.focused"
      to: "src/frontend/screens/Library/components/GameCard/index.css .gameCard:focus-within"
      via: "both spend the same --accent token for their highlight ring"
      pattern: "0 0 0 3px var\\(--accent"
---

<objective>
Make the highlighted/focused game card visible in NORMAL (non-console) mode by replacing its
browser-default hairline with the same accent ring console mode already uses.

Purpose: `.gameCard:focus-within` currently renders `outline: -webkit-focus-ring-color auto 1px`
(`index.css:28-30`) — a 1px system hairline over full-bleed cover art. The only other focus
affordance is `transform: scale(1.05)` (`index.css:187-189`), which is easy to miss in a dense
grid. Console mode has no such problem: `.consoleCard.focused`
(`ConsoleMode/index.scss:259-268`) paints `0 0 0 3px var(--accent, #0080ff)` plus an accent glow
and raises `z-index`. Normal mode should read the same.

Output: a token-driven focus ring in `GameCard/index.css`, a source-text gate that keeps it
token-driven, and a human visual confirmation across themes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

@src/frontend/screens/Library/components/GameCard/index.css
@src/frontend/screens/ConsoleMode/index.scss
@src/backend/testUtils/stripSourceComments.ts
@src/frontend/jest.config.js

<investigation_findings>
Read these before touching anything — they are the facts this plan is built on and they remove
every reason to go exploring.

**1. Where the weak highlight lives.** `src/frontend/screens/Library/components/GameCard/index.css`
has exactly two focus rules for the grid card:

- `index.css:28-30` — `.gameCard:focus-within { outline: -webkit-focus-ring-color auto 1px; }`
- `index.css:187-189` — `.gameCard:hover, .gameCard:focus-within { transform: scale(1.05); }`

and one for the list row:

- `index.css:343-346` — `.gameListItem > a:hover, .gameListItem > a:focus-within { color: var(--accent-overlay); }`

That is the whole of it. There is no `.selected`, no `.highlighted`, no keyboard-nav state class
on the card — the highlight IS real DOM focus, reaching the card through `:focus-within` on the
inner `<Link>`.

**2. Why `:focus-within` and not `:focus-visible`.** Gamepad navigation moves the highlight by
calling `.focus()` programmatically (`src/frontend/helpers/gamepad.ts`). Chromium's
`:focus-visible` heuristic for programmatic focus is conditional on the previously-focused
element's state and is NOT guaranteed to match. `:focus-within` is already proven to fire for
every path that highlights a card today — it is what drives the existing `scale(1.05)`. Reusing
it means this change alters only the APPEARANCE of the highlight state, never WHICH state
highlights. Do not switch selector.

**3. The token, and that it is theme-safe.** `--accent` has a base value in
`src/frontend/styles/_colors.scss:46` (`#8bffff`, on the `body` selector) and is re-declared by
10 of the 11 shipped theme blocks in `src/frontend/themes.scss` (lines 136, 199, 249, 288, 365,
487, 526, 560, 599, 650). The one theme without its own override (`midnightMirage`) inherits the
base. So `var(--accent, #0080ff)` resolves in every theme; the `#0080ff` literal is a dead
fallback carried only to match console mode's spelling exactly.

**4. Console mode cannot regress from this edit.** `ConsoleCard/index.tsx:9` imports
`getImageFormatting` from `GameCard/constants` — it does NOT import `GameCard/index.css`, and it
renders `.consoleCard`, not `.gameCard`. Console styling lives entirely in
`ConsoleMode/index.scss`, which this plan does not modify. The only `.gameCard` renderer is
`Library/components/GamesList/index.tsx`.

**5. The exact console-mode highlight being matched** (`ConsoleMode/index.scss:259-268`):

`.consoleCard.focused` sets `transform: scale(1.06)`, `filter: none`, `z-index: 2`, and a
three-layer `box-shadow`: a `0 10px 30px rgba(0,0,0,0.6)` drop shadow, a `0 0 0 3px
var(--accent, #0080ff)` hard ring, and a `0 0 22px color-mix(in srgb, var(--accent, #0080ff)
40%, transparent)` glow.

**6. Why this plan splits ring from glow instead of copying that `box-shadow` verbatim.** A
`box-shadow` is one property: if `color-mix()` is unsupported by the host webview, the WHOLE
declaration is invalid and dropped — ring included. Tauri ships different engines per platform
(WebView2 / WKWebView / WebKitGTK), so the ring is moved to `outline` and only the glow stays in
`box-shadow`. Degradation then costs the glow, never the ring.

**7. The `overflow: hidden` question, settled.** `.gameCard` sets `overflow: hidden`
(`index.css:5`). That clips DESCENDANTS; it does not clip the element's OWN `outline` or
`box-shadow`. No wrapper change is needed. `.gameCard` is already `position: relative`
(`index.css:6`), so `z-index` on the focus state takes effect without adding positioning.

**8. Source-gate precedent.** `src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx`
is the in-repo pattern for asserting on stylesheet source text: `readFileSync` the stylesheet,
run it through `stripSourceComments` from `backend/testUtils/stripSourceComments` (which strips
`/* ... */` blocks — the CSS comment form), then assert. The frontend jest project
(`src/frontend/jest.config.js`) has `moduleDirectories: ['node_modules', '<rootDir>']` with
`rootDir` at the repo root, so `import { stripSourceComments } from 'backend/testUtils/stripSourceComments'`
resolves. It is `testEnvironment: 'node'` with no DOM — a pure source-text test file (`.ts`, no
JSX) is the only workable shape here.
</investigation_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace the hairline focus ring with the console-mode accent ring</name>
  <files>src/frontend/screens/Library/components/GameCard/index.css</files>
  <action>
Edit three places in `src/frontend/screens/Library/components/GameCard/index.css`. Make no other
change to the file, and do not touch `ConsoleMode/index.scss`.

**(a) The grid-card focus ring — replace the rule at lines 28-30.** Today it is
`.gameCard:focus-within { outline: -webkit-focus-ring-color auto 1px; }`. Replace the body of
that rule so the focused card carries, in this order: an `outline` of `3px solid var(--accent,
#0080ff)`; an `outline-offset` of `-1px` so the ring sits just inside the card's border box and
reads as a border drawn on the cover art rather than a halo floating off it; a `box-shadow`
carrying TWO layers — the drop shadow `0 10px 30px rgba(0, 0, 0, 0.6)` and the accent glow `0 0
22px color-mix(in srgb, var(--accent, #0080ff) 40%, transparent)` — and `z-index: 2`. Keep the
selector exactly `.gameCard:focus-within`. Do NOT merge this rule into the `:hover` rule at 187:
hover must not gain a ring.

The `3px` width, the `--accent` token, the `#0080ff` fallback spelling, the `0 10px 30px
rgba(0,0,0,0.6)` drop shadow, the `22px`/`40%` glow and `z-index: 2` are all taken verbatim from
`.consoleCard.focused` so the two modes read identically. The ring is deliberately an `outline`
rather than a fourth `box-shadow` layer — see investigation finding 6; do not "simplify" it back
into the shadow list.

Write a short CSS comment above the rule recording: that this ring intentionally mirrors
`.consoleCard.focused` in `ConsoleMode/index.scss` and the two are expected to stay in step; that
the colour must stay a `var(--accent, ...)` token because 11 themes ship and a literal would be
wrong in 10 of them; and that ring-as-`outline` / glow-as-`box-shadow` is a deliberate split so a
webview without `color-mix()` loses only the glow. Keep it to a few lines — the reasoning, not a
restatement of the declarations.

**(b) The grid-card scale.** Leave lines 187-189 exactly as they are. `transform: scale(1.05)`
on hover and focus-within stays; the ring is additive.

**(c) The list-view row.** The rule at 343-346 (`.gameListItem > a:hover, .gameListItem > a:focus-within`)
changes only text colour, which is just as hard to see. Immediately AFTER that rule, add a new
rule `.gameListItem:focus-within` giving the row `outline: 2px solid var(--accent, #0080ff)` and
`outline-offset: -2px`. Note the selector is on the ROW, not on `> a` — the row is the unit a
user is picking. Use 2px, not 3px: a list row is a thin horizontal strip and a 3px ring on it
reads as a box rather than a highlight. Give the row NO glow and NO `z-index` — `.gameListItem`
rows are separated by `border-bottom: 1px solid gray` and do not overlap, so neither buys
anything.

Do not add a `transition` for the ring. The card already has `transition-duration: 0.1s` at
`index.css:7` covering all animatable properties on `.gameCard`; adding a second one risks
fighting it.
  </action>
  <verify>
    <automated>npx prettier --check src/frontend/screens/Library/components/GameCard/index.css</automated>
    <automated>node -e "const s=require('fs').readFileSync('src/frontend/screens/Library/components/GameCard/index.css','utf8').replace(/\/\*[\s\S]*?\*\//g,''); const m=s.match(/\.gameCard:focus-within\s*\{[^}]*\}/); if(!m) throw new Error('no .gameCard:focus-within rule'); if(!/outline:\s*3px solid var\(--accent/.test(m[0])) throw new Error('ring is not a 3px --accent outline'); if(!/z-index:\s*2/.test(m[0])) throw new Error('missing z-index'); if(/-webkit-focus-ring-color/.test(s)) throw new Error('hairline survives'); const l=s.match(/\.gameListItem:focus-within\s*\{[^}]*\}/); if(!l||!/outline:\s*2px solid var\(--accent/.test(l[0])) throw new Error('list row ring missing'); console.log('OK');"</automated>
    <automated>git diff --name-only -- src/frontend/screens/ConsoleMode/ | wc -l</automated>
  </verify>
  <done>
`.gameCard:focus-within` carries a 3px `var(--accent, #0080ff)` outline at `-1px` offset, a
two-layer `box-shadow` (drop shadow + `color-mix` accent glow) and `z-index: 2`;
`.gameListItem:focus-within` carries a 2px `var(--accent, #0080ff)` outline at `-2px` offset;
`-webkit-focus-ring-color` appears nowhere in the file; the `:hover`/`:focus-within`
`scale(1.05)` rule is untouched; the third verify command prints `0`, proving no console-mode
file was modified; prettier reports the file formatted.
  </done>
</task>

<task type="auto">
  <name>Task 2: Source-text gate keeping the ring token-driven and in step with console mode</name>
  <files>src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</files>
  <action>
Create `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts`,
following the source-gate half of `Dropdown/__tests__/dropdownDisclosure.test.tsx`: `readFileSync`
+ `join` from node, and `stripSourceComments` from `backend/testUtils/stripSourceComments` run
over both stylesheets BEFORE any assertion (it strips `/* ... */`, the CSS comment form — without
it the descriptive comment written in Task 1, which names every token this gate looks for, would
satisfy the gate on its own).

Open the file with a docstring that states plainly what the gate does and does NOT prove: it
proves the DECLARATIONS exist in source and are token-driven; it proves nothing about the
rendered pixels, about whether the ring is actually legible in any given theme, or about whether
`:focus-within` fires — that proof is routed to Task 3's human check. This project treats a gate
that appears to cover more than it does as worse than no gate; say so explicitly rather than
leaving the scope implied.

Assert, against `GameCard/index.css`:

1. A `.gameCard:focus-within` rule exists, and its body matches a 3px `solid var(--accent` outline.
2. That same body contains `z-index: 2` and a `box-shadow`.
3. `-webkit-focus-ring-color` does not appear anywhere in the comment-stripped stylesheet.
4. No BARE hex literal appears in the `.gameCard:focus-within` body. A hex is permitted only in
   the `var(--token, #fallback)` fallback slot and inside the `rgba(...)`-free drop shadow's
   spelling — implement this by removing every `var\([^)]*\)` span from the rule body first, then
   asserting the remainder carries no `#[0-9a-fA-F]{3,8}`. This is the assertion that actually
   enforces "theme-token driven, not hardcoded"; the other three only enforce presence.
5. A `.gameListItem:focus-within` rule exists with a 2px `solid var(--accent` outline.

Then assert, against `src/frontend/screens/ConsoleMode/index.scss` — a READ-ONLY cross-file
guard, no edit:

6. `.consoleCard`'s `&.focused` block still contains `0 0 0 3px var(--accent`. Comment at this
   assertion that its purpose is to fail LOUDLY if a future change moves console mode off
   `--accent`, because at that moment the two modes silently stop matching and the whole premise
   of this quick task ("matching the highlight border used in console mode") is void. It is not
   asserting ownership of console mode's styling.

Write it as plain `.ts` with no JSX and no React import — the frontend jest project is
`testEnvironment: 'node'` with no jsdom, and the CSS is never imported as a module here, only
read as text, so no `jest.mock` of a stylesheet is needed.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</automated>
    <automated>npx prettier --check src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
The new test file passes under the Frontend jest project with all six assertions green; it
imports `stripSourceComments` and applies it to both stylesheets before asserting; its docstring
names what the gate does not prove; `tsc --noEmit` is clean; prettier reports the file formatted.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human visual check — ring is legible in normal mode, console mode unchanged</name>
  <action>
Pause and hand the app to the operator. Do not self-approve, and do not substitute a screenshot
or a passing test for this step: Tasks 1 and 2 prove only that the declarations exist and are
token-driven, and the one question this task exists to answer — "can you actually tell which card
is highlighted?" — is not answerable from source text. Walk the seven checks below in order and
record the operator's verdict verbatim in the SUMMARY, including any theme they flagged as hard
to read.
  </action>
  <what-built>
`.gameCard:focus-within` and `.gameListItem:focus-within` in
`src/frontend/screens/Library/components/GameCard/index.css` now paint a 3px / 2px
`var(--accent)` ring (plus, on the grid card, an accent glow and `z-index: 2`) instead of the
1px `-webkit-focus-ring-color auto` hairline. Console mode's `ConsoleMode/index.scss` was not
touched. A source-text gate
(`GameCard/__tests__/gameCardFocusRing.test.ts`) holds the ring to the `--accent` token, but it
proves nothing about pixels — that is what this check is for.
  </what-built>
  <how-to-verify>
1. Run the app in NORMAL mode (not console mode) and open the Games library in grid view.
2. Press Tab, or move with the arrow keys / a gamepad, until a game card takes the highlight.
   CONFIRM: the highlighted card carries an obvious coloured ring around it and is unmistakable
   at a glance from two feet back. If you still have to hunt for it, this task failed.
3. Move the highlight to a card in the MIDDLE of a row and to one in the LAST row. CONFIRM: the
   ring is complete on all four sides and is not clipped by the grid edge or half-covered by the
   neighbouring card. (This is the `z-index: 2` claim.)
4. Hover a DIFFERENT card with the mouse while one is focused. CONFIRM: the hovered card grows
   slightly but gets NO ring — only the focused card has the ring.
5. Switch the library to LIST view and Tab onto a row. CONFIRM: the row carries a visible
   accent ring, not only a text-colour change.
6. Change theme (Settings) to at least three themes with different accents — suggested:
   `gruvbox_dark` (`--accent: #b57614`, a dark ochre — the hardest case), `dracula-classic`
   (`#bd93f9`) and `high-contrast` (`#00ddff`). CONFIRM in each: the ring changes colour with
   the theme and stays legible against cover art. Report any theme where it does NOT read
   clearly rather than approving around it — the fix there is a theme-token adjustment, not a
   hardcoded colour.
7. Enter CONSOLE mode and move the highlight between cards. CONFIRM: it looks exactly as it did
   before this change — scale-up, accent ring, accent glow, nothing new and nothing missing.
  </how-to-verify>
  <resume-signal>Type "approved", or describe which step failed and what you saw.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | This plan edits one stylesheet and adds one source-text test. No untrusted input is parsed, no IPC surface changes, no network call is made, no process is spawned, and no package is installed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pga-01 | Information disclosure | `z-index: 2` on the focused card | accept | The raised stacking context applies only to a `.gameCard` inside the library grid and can at most let a focused card's own ring paint over an adjacent card's edge — the same thing `.consoleCard.focused` already does. No overlay, modal or credential surface is involved. |
| T-pga-SC | Tampering | npm/pip/cargo installs | n/a | No package-manager install task exists in this plan; no new dependency is added. |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts` passes.
- `npx prettier --check` passes on both written paths (explicit paths, never `.` — `src/preload/.prettierrc` sets a different `printWidth`, so directory matters).
- `npx tsc --noEmit` is clean.
- `git diff --name-only` lists exactly the two files in `files_modified` and nothing under `src/frontend/screens/ConsoleMode/`.
- The Task 3 human check returns "approved".
</verification>

<success_criteria>
- A highlighted game card in non-console mode is identifiable at a glance, in grid view and in list view.
- The ring colour is `var(--accent, ...)` in both rules — no theme-specific literal anywhere.
- Console mode's highlight is visually unchanged and `ConsoleMode/index.scss` is unmodified.
- The source gate fails if someone later swaps the token for a literal, restores the
  `-webkit-focus-ring-color` hairline, or moves console mode off `--accent`.
</success_criteria>

<output>
Create `.planning/quick/260925-pga-make-highlighted-game-cards-in-non-conso/260925-pga-SUMMARY.md` when done
</output>
