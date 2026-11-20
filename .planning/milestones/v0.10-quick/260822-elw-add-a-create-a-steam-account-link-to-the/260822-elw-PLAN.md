---
phase: quick-260822-elw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Login/components/SteamLogin/index.tsx
  - src/frontend/screens/Login/components/SteamLogin/index.scss
  - src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx
  - meta/i18nGateAllowlist.json
autonomous: true
requirements:
  - QUICK-260822-elw-01
user_setup: []

must_haves:
  truths:
    - "On the QR tab, before the code is scanned, the Steam sign-in dialog offers a way to create a Steam account."
    - "On the Username & Password tab, before credentials are submitted, the same affordance is offered."
    - "Activating it opens https://store.steampowered.com/join/ in the system browser and leaves the dialog open."
    - "It is absent once authentication is actually in progress (QR scanned, or Steam Guard entry)."
    - "It is absent from the Steam-client-not-found and checking states."
    - "No other login tile gains an account-creation affordance."
  artifacts:
    - path: "src/frontend/screens/Login/components/SteamLogin/index.tsx"
      provides: "exported Step type, showsCreateAccountLink(step) predicate, renderCreateAccountLink(step) renderer, and its single call site in renderWindowBody's fragment"
      contains: "showsCreateAccountLink"
    - path: "src/frontend/screens/Login/components/SteamLogin/index.scss"
      provides: ".steamCreateAccount row + .steamCreateAccountLink text-link treatment, token-only"
      contains: ".steamCreateAccountLink"
    - path: "src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx"
      provides: "both-direction gate over all seven Step values, plus behavioural onClick assertion"
      contains: "openExternalUrl"
    - path: "meta/i18nGateAllowlist.json"
      provides: "re-baselined expectedCount for SteamLogin/index.tsx in the SAME commit as the new literals"
      contains: "expectedCount"
  key_links:
    - from: "src/frontend/screens/Login/components/SteamLogin/index.tsx renderWindowBody() fragment"
      to: "renderCreateAccountLink(step)"
      via: "single call site after the second TabPanel"
      pattern: "\\{renderCreateAccountLink\\(step\\)\\}"
    - from: "renderCreateAccountLink"
      to: "window.api.openExternalUrl"
      via: "button onClick with the literal /join/ URL"
      pattern: "openExternalUrl\\('https://store\\.steampowered\\.com/join/'\\)"
---

<objective>
Add a "create a Steam account" affordance to the native Steam login dialog — the
only one of GameLib's six login tiles with no account-creation path, because it
is the only one that never shows a vendor web page.

Purpose: closes the account-creation gap for new users who reach the Steam tile
without a Steam account. Account creation cannot happen in-app (Valve gates it
behind captcha + email verification), so an external link is the only correct
shape. Do NOT attempt an in-app registration form.

Output: a gated, token-styled text link in `SteamLogin/index.tsx` that opens
`https://store.steampowered.com/join/` via `window.api.openExternalUrl`, a
both-direction test over the gate, and a same-commit re-baseline of the i18n
hardcoded-string allowlist that the new literals would otherwise turn RED.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Read before editing:
- `src/frontend/screens/Login/components/SteamLogin/index.tsx` (the file being changed)
- `src/frontend/screens/Login/components/SteamLogin/index.scss` (class-based conventions)
- `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts`
  (the source-gate conventions AND the count pins this change must not disturb)
- `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx`
  (the DOM-less `collectText` / `findByClassName` element-graph harness to copy)

<interfaces>
<!-- Extracted from the codebase during planning. No exploration needed. -->

Existing in `SteamLogin/index.tsx` (currently NOT exported — Task 1 exports it):

  type Step =
    | 'checking' | 'not-installed' | 'tab' | 'qr-active'
    | 'qr-confirmed' | 'credentials-1' | 'credentials-2'

The external-link call shape already used in this exact file, in the
`step === 'not-installed'` branch (mirror it, do not invent a new mechanism):

  <button className="button is-secondary"
          aria-label="Download Steam client from steampowered.com"
          onClick={() => window.api.openExternalUrl('https://store.steampowered.com/about/')}>

`renderWindowBody()`'s final fallback branch returns a fragment containing
`<Tabs>`, `<TabPanel value={activeTab} index="qr">` and
`<TabPanel value={activeTab} index="credentials">`. It is reached for
`'tab' | 'qr-active' | 'qr-confirmed' | 'credentials-1' | 'credentials-2'`;
`'checking'` and `'not-installed'` return earlier.

Step transitions worth knowing (they drive the gating decision):
- `step` starts `'checking'`, becomes `'tab'` or `'not-installed'` on mount.
- Switching to the credentials tab does NOT change `step` — it stays `'tab'`
  while the username/password form is shown. `'credentials-1'` is only ever set
  by the "Back to Credentials" button on the Steam Guard screen.
- `'qr-confirmed'` = QR scanned, completing sign-in. `'credentials-2'` = Steam
  Guard code entry.

DOM-less test harness (copy from `WebviewUnavailablePanel.test.tsx`):

  function collectText(node: unknown): string        // recursive children flatten
  function findByClassName(node: unknown, className: string): AnyReactElement | null

  const mockApi = { openExternalUrl: jest.fn() }
  ;(globalThis as unknown as { window: { api: typeof mockApi } }).window = { api: mockApi }
</interfaces>

<measured_facts>
Measured during planning against the live tree. Do not re-derive, but DO
re-confirm the ones marked "verify live".

1. `src/frontend/jest.config.js` is `testEnvironment: 'node'`. There is no jsdom,
   no react-test-renderer, no `render()`. Components are invoked as plain
   functions and the returned element object graph is inspected.

2. The task brief's claim that `SteamLogin/index.tsx` is absent from the i18n
   gate is WRONG and was disproven during planning. The file is listed in
   `meta/i18nGateScope.json` under `excluded.deferred`, AND it carries an entry
   in `meta/i18nGateAllowlist.json` with `expectedCount: 26`.
   `scanScope()` reports a `staleExemption` the moment `measured !== expectedCount`,
   and `meta/__tests__/hardcodedStringGate.test.ts`'s
   "scans the whole committed scope..." test asserts
   `expect(report.staleExemptions).toHaveLength(0)`. That test is GREEN today
   (verified by running it). Adding hardcoded English WILL turn it RED unless
   `expectedCount` is re-baselined in the same commit.

3. The exact markup this plan specifies was measured against the real scanner
   (temporary fixture, torn down, working tree left clean) and produced **3**
   violations, so the expected new `expectedCount` is **29**. Verify live — do
   not hardcode 29 blindly.

4. `aria-label` is NOT in `EXCLUDED_ATTRIBUTES` (`meta/hardcodedStringGate.ts`);
   `className`, `id`, `role`, `href`, `style` are. Hence 3 violations, not 1.

5. `meta/__tests__/hardcodedStringGate.test.ts` also asserts the allowlist has
   exactly TWO entries in a fixed file order. Changing `expectedCount` and
   `reason` is fine; adding, removing or reordering entries is not.

6. Existing count pins in `steamLoginWindowChrome.test.ts` that this change must
   not disturb: `<Dialog[\s>]` === 1, `renderWindowBody(` === 2, `closeWindow`
   === 8, `onClick={closeWindow}` + `onClose={closeWindow}` === 3,
   `className="steamQrBox"` === 1, **`lineHeight: 1.4` === 2**, `--text-primary`
   === 0 in the scss. The `lineHeight` pin is the live trap: adding a third
   inline `lineHeight: 1.4` anywhere in this file turns that suite RED. Style
   the new element from the stylesheet, not from an inline style object.

7. Baselines taken during planning (re-run and compare, do not assume):
   - `npx jest --selectProjects Frontend --testPathPattern "screens/Login"`
     → 5 suites / 76 tests, ALL GREEN.
   - `npx jest --selectProjects Meta --testPathPattern "genI18nGateScope"`
     → 1 FAILED (A-17, the `forkTouchedSnapshot.files` array equality at
     line 402), 25 passed, 1 skipped. **PRE-EXISTING. Do not fix it.**
     Regenerating that artifact takes the suite from 1 failure to 5. After this
     change the suite must still show exactly 1 failure, still that same
     assertion. `__tests__/` paths are excluded by `genI18nGateScope.ts` line
     163, so the new test file cannot make it staler.

8. `prettier --check` is RED repo-wide. Format only the files touched here, in
   place — never on a temp copy (a temp copy resolves a different config and
   has previously motivated a 1,650-line bogus reformat in this repo).

9. There is NO existing link-styled button class anywhere in
   `src/frontend/**/*.scss`. `.button.is-tertiary` (`styles/_buttons.scss:67`)
   is a filled button with its own background and padding. A new local class is
   therefore correct, not a missed reuse.

10. A CONCURRENT quick task (260822-eib) is editing
    `src/common/humble/loginChromeCss.ts`, `humbleLoginChromeCss.ts` and
    `src-tauri/src/main.rs` right now. Do not touch those. **Never run
    `git stash`** — it has stranded a concurrent session's work twice in this
    repo, both times triggered by wanting a clean tree to compare against.
</measured_facts>
</context>

<decisions>
Three decisions this task was asked to make explicitly rather than incidentally.

**D-01 — Placement and gating.** The link renders ONCE, from a single call site
placed after the second `<TabPanel>` inside `renderWindowBody()`'s fragment, so
it appears under both tabs without duplication and without depending on
`activeTab`. It is gated to `step ∈ {'tab', 'qr-active', 'credentials-1'}` and
absent for `{'checking', 'not-installed', 'qr-confirmed', 'credentials-2'}`.

Rationale — the recommendation is accepted, deliberately, not inherited:
offering "create an account" while the user is mid-Steam-Guard entry
(`'credentials-2'`) or mid-QR-completion (`'qr-confirmed'`) is misdirection at
the exact moment the user is closest to success. `'not-installed'` already owns
a deliberate two-button row with a different job, and `'checking'` is a bare
spinner. Note the gate covers `'tab'` — which is the live step for BOTH the QR
panel and the username/password form (see the interfaces block) — and
`'credentials-1'`, only reachable via "Back to Credentials", so both tabs' entry
states are covered by `step` alone with no `activeTab` coupling. The predicate is
nonetheless made total over all seven `Step` values so the two
structurally-unreachable states are still pinned `false` and the gate is
testable in both directions.

**D-02 — Visual treatment.** A low-emphasis text link, not a button. Fact 9
establishes there is no existing link class to reuse and that `is-tertiary` is a
filled button that would fight an adjacent inline prompt sentence. The new
`.steamCreateAccountLink` is defined in the component's own stylesheet using
only tokens already present in that file (`--accent`, `--text-secondary`,
`--text-default`, `--space-*`, `--text-sm`, `--primary-font-family`), which
matches the file's class-based convention for stable structural chrome and keeps
the change clear of the `lineHeight: 1.4` count pin (fact 6). A prompt sentence
plus link, rather than a bare button dropped under the tab panel, is what makes
it read as a designed secondary path instead of a bolted-on control — the user's
stated bar for this dialog.

**D-03 — Localisation: hardcoded English, debt recorded, allowlist re-baselined.**
All three new literals are hardcoded English, matching the other 26 literals in
this file. A lone `t()` call in a file where every other string is hardcoded
would be half-done, and the `gamelib:`-namespaced `t()` route additionally drags
in `pnpm i18n` catalog regeneration plus `i18n-churn-guard` — a separate task,
not a rider on a link.

This is a deliberate INCREASE of this file's recorded localisation debt from 26
to 29 strings, against a repo-wide standing localisation requirement. It must be
stated as such in the SUMMARY, not left unmentioned. The allowlist `reason`
string is also now factually false — it says the component is "deletion-pending,
blocked on Phase 34.4.2", but Phase 36 kept the component and re-homed it as a
co-mounted overlay on `/login`. Task 1 corrects that text while re-baselining
the count.
</decisions>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Render the gated create-account link and re-baseline the i18n count pin</name>
  <files>
src/frontend/screens/Login/components/SteamLogin/index.tsx,
src/frontend/screens/Login/components/SteamLogin/index.scss,
meta/i18nGateAllowlist.json
  </files>

  <behavior>
    - showsCreateAccountLink('tab') === true
    - showsCreateAccountLink('qr-active') === true
    - showsCreateAccountLink('credentials-1') === true
    - showsCreateAccountLink('checking') === false
    - showsCreateAccountLink('not-installed') === false
    - showsCreateAccountLink('qr-confirmed') === false
    - showsCreateAccountLink('credentials-2') === false
    - renderCreateAccountLink(step) returns null for every step where the
      predicate is false, and a non-null element for every step where it is true
    - The returned element contains a descendant with className
      'steamCreateAccountLink' whose onClick calls
      window.api.openExternalUrl('https://store.steampowered.com/join/')
    - That onClick does NOT dismiss the dialog
  </behavior>

  <action>
Edit `SteamLogin/index.tsx` in place — do not create a new component file. The
file already owns this concern, and a new frontend source file would make the
already-stale `meta/i18nForkTouchedFiles.json` snapshot staler (fact 7).

Export the existing `Step` type by adding the `export` keyword to the existing
`type Step =` declaration; do not restate the union. `tsc --noEmit` needs the
export so the test file can type its cases, and `ts-jest` is transpile-only so
it will not catch a missing export for you.

Add, at module level BELOW the `Step` declaration and ABOVE `interface Props`,
two named exports that use no hooks and therefore need no React mocking in tests:

`showsCreateAccountLink(step: Step): boolean` — true for exactly `'tab'`,
`'qr-active'` and `'credentials-1'`; false for all four other values. Implement
it as a membership test against a module-level
`const CREATE_ACCOUNT_STEPS: readonly Step[] = ['tab', 'qr-active', 'credentials-1']`
so the excluded states are readable at a glance. Add a short comment recording
D-01's reasoning: no account-creation offer once authentication is actually in
flight.

`renderCreateAccountLink(step: Step)` — returns `null` when the predicate is
false. Otherwise returns a `div` with className `steamCreateAccount` containing,
in order: a `span` with className `steamCreateAccountPrompt` whose text is
exactly `Don&apos;t have a Steam account?`, then a `button` with className
`steamCreateAccountLink`, `type="button"`, `aria-label` exactly
`Create a Steam account at steampowered.com`, text content exactly `Create one`,
and an `onClick` arrow function calling
`window.api.openExternalUrl('https://store.steampowered.com/join/')` and nothing
else. Mirror the `not-installed` branch's call shape verbatim — same
`openExternalUrl` mechanism, same aria-label discipline. Do NOT reference
`closeWindow`: the dialog stays open so the user can return from the browser and
sign in, and `closeWindow`'s occurrence count is pinned at 8 (fact 6).

Use NO inline `style` object on any of these three elements. Everything visual
comes from the stylesheet. This is what keeps the `lineHeight: 1.4 === 2` pin
intact.

Wire it in exactly once: inside `renderWindowBody()`'s final returned fragment,
immediately after the closing tag of the `index="credentials"` TabPanel, add the
expression `{renderCreateAccountLink(step)}`. One call site, no second.

In `index.scss`, append two rules using only tokens the file already uses.
`.steamCreateAccount`: `display: flex; align-items: center; justify-content:
center; gap: var(--space-3xs); font-size: var(--text-sm); font-family:
var(--primary-font-family); color: var(--text-secondary);`.
`.steamCreateAccountLink`: `background: none; border: none; padding: 0; margin:
0; font-size: inherit; font-family: inherit; color: var(--accent);
text-decoration: underline; cursor: pointer;`, plus a `:hover` rule setting
`color: var(--text-default);` and a `:focus-visible` rule setting `outline: 2px
solid var(--accent); outline-offset: 2px;`. Do not reference `--text-primary`
anywhere — it is defined nowhere in this codebase and is pinned at 0 occurrences
in this stylesheet (fact 6).

Then re-baseline the i18n count pin IN THIS SAME TASK, measured rather than
assumed. Run `npx jest --selectProjects Meta -t "scans the whole committed scope"`.
It is expected to FAIL with a `staleExemptions` entry; the printed
`formatReport()` output names the measured count for
`src/frontend/screens/Login/components/SteamLogin/index.tsx`. Set that file's
`expectedCount` in `meta/i18nGateAllowlist.json` to the measured value. Planning
measured 3 new violations, so 29 is expected — if the measured value is anything
other than 29, STOP and report the discrepancy in the SUMMARY rather than
silently accepting a different number, because it means the copy or the
classifier differs from what was measured. If that run PASSES unchanged, do NOT
edit the allowlist at all: an unnecessary edit would itself create a stale
exemption. Do not add, remove or reorder allowlist entries (fact 5).

While editing that entry, replace its `reason` text. The current wording claims
the component is deletion-pending and blocked on Phase 34.4.2, which Phase 36
falsified by keeping it as a co-mounted overlay on `/login`. The new reason must
state that the file's 26 pre-existing literals plus 3 added by quick task
260822-elw remain deferred D-17 debt, and that the file is no longer
deletion-pending.

Run `npx prettier --write` on the three touched files, in place (fact 8).
  </action>

  <verify>
    <automated>npx jest --selectProjects Meta --testPathPattern "hardcodedStringGate" && npx jest --selectProjects Frontend --testPathPattern "screens/Login" && npx tsc --noEmit && npx eslint src/frontend/screens/Login/components/SteamLogin/index.tsx</automated>
  </verify>

  <done>
The Meta hardcodedStringGate suite is fully green (zero violations, zero stale
exemptions, allowlist still exactly two entries in the same order). The Login
frontend suite is still 5 suites / 76 tests green — in particular
`steamLoginWindowChrome.test.ts` is untouched and passing, proving no count pin
was disturbed. `tsc --noEmit` is clean and eslint reports nothing on the edited
component. `meta/i18nGateAllowlist.json` carries the measured `expectedCount`
(expected 29) and a factually accurate `reason`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Pin the gate in both directions and the click behaviour</name>
  <files>
src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx
  </files>

  <action>
Create `steamCreateAccountLink.test.tsx` next to `steamLoginWindowChrome.test.ts`.
Note the `.tsx` extension: this file constructs and inspects React elements, and
the Frontend jest project matches both `.test.ts` and `.test.tsx`.

Open with a file-header docstring in the convention of the two neighbouring test
files: state that this jest project is `testEnvironment: 'node'` with no DOM,
that the two functions under test take no hooks and are therefore invoked
directly as plain functions on the element object graph, and that this is a
BEHAVIOURAL test of the gate plus ONE source gate for the call site. Record
D-01's gating decision in the header so a future reader knows the excluded steps
are a decision, not an oversight.

Stub `window.api` at the `globalThis` level exactly as
`WebviewUnavailablePanel.test.tsx` does — `const mockApi = { openExternalUrl:
jest.fn() }` assigned onto `globalThis.window` — because `testEnvironment: 'node'`
has no `window`. Note `resetMocks: true` is set in the frontend jest config, so
do not rely on call history surviving across `it` blocks.

Copy that file's `collectText` and `findByClassName` helpers verbatim (they are
local helpers there, not a shared module — duplicating them is the established
convention in this repo).

Write these assertions, importing `showsCreateAccountLink`,
`renderCreateAccountLink` and the `Step` type from `'../index'`:

BOTH-DIRECTION PREDICATE GATE. Drive a table of all seven `Step` values with
their expected boolean, asserting each. Type the table as
`Array<[Step, boolean]>` so that adding an eighth `Step` member without updating
the table is at least visible to `tsc`. The critical property: the three `true`
rows and the four `false` rows are asserted in the same test, so a predicate
rewritten to `return true` fails on the false rows and a predicate rewritten to
`return false` fails on the true rows. Neither direction can pass vacuously.

BOTH-DIRECTION RENDER GATE. For each of the four excluded steps, assert
`renderCreateAccountLink(step)` is exactly `null`. For each of the three included
steps, assert it is non-null AND that `findByClassName(element,
'steamCreateAccountLink')` finds a descendant. Assert both directions in this
test too, for the same reason.

BEHAVIOURAL CLICK GATE. For `step = 'tab'`, find the
`steamCreateAccountLink` descendant, invoke its `onClick`, and assert
`mockApi.openExternalUrl` was called exactly once with the exact string
`https://store.steampowered.com/join/`. Assert the URL literally rather than by
regex — a `/join/` substring match would also pass against a wrong host.

COPY GATE. For `step = 'tab'`, assert `collectText(element)` contains the prompt
sentence and the link label, so the visible affordance cannot be silently
emptied while the element still renders.

DIALOG-STAYS-OPEN GATE (ABSENCE, honestly labelled). Assert the link element's
props expose no `onClose`/`dismiss`-shaped handler and that the rendered subtree
text does not contain a dismissal label — plus a source-text check (using
`readFileSync` + `stripSourceComments` from `backend/testUtils/stripSourceComments`,
the pattern both neighbouring files use) that the `renderCreateAccountLink`
function body contains no `closeWindow` reference. Label it ABSENCE in the test
name: it is the weaker kind of assertion and the file should say so, matching
the PRESENCE/ABSENCE labelling convention already used in this directory.

CALL-SITE SOURCE GATE. The predicate tests above cannot detect a JSX edit that
deletes the gate — for example replacing `{renderCreateAccountLink(step)}` with
an unconditional render of the same markup. Close that with a source-text
assertion over `stripSourceComments`'d `index.tsx`: the literal
`{renderCreateAccountLink(step)}` occurs exactly once, and
`renderCreateAccountLink` occurs exactly twice in the file (one declaration, one
call site). Also assert the `/join/` URL literal occurs exactly once. Include a
FILLED-SPECIMEN GUARD first — a raw, unstripped `toMatch` on a token you know is
present — so a broken comment stripper turns this block RED instead of vacuously
green, exactly as `steamLoginWindowChrome.test.ts` does.

FALSIFIABILITY. This repo requires every assertion to have been observed
failing. For each of the six blocks above, temporarily mutate the file it guards
(for example: make the predicate `return true`; change the URL host; delete the
`{renderCreateAccountLink(step)}` call site and inline the markup unconditionally;
empty the prompt text), run the suite, record the observed Jest failure output,
then revert. Take a SHA-256 checksum of the pristine file before each mutation
and compare it after each revert — this repo has a documented false-negative
trap against using `git diff --quiet` for that check. Record every mutation and
its observed failure in the SUMMARY. Do NOT use `git stash` at any point.

Run `npx prettier --write` on the new test file.
  </action>

  <verify>
    <automated>npx jest --selectProjects Frontend --testPathPattern "screens/Login" && npx jest --selectProjects Meta --testPathPattern "genI18nGateScope|hardcodedStringGate" && npx tsc --noEmit && npx eslint src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx</automated>
  </verify>

  <done>
The Login frontend suite is 6 suites green, up from the 5-suite / 76-test
baseline, with the new suite's own tests passing and every prior test still
passing. Every assertion in the new file has been individually observed failing
against a recorded mutation, with the pristine file restored by checksum
comparison each time. The Meta genI18nGateScope suite still shows exactly ONE
failure — the pre-existing A-17 `forkTouchedSnapshot.files` array equality — and
not five. `tsc --noEmit` and eslint are clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer → OS default browser | `window.api.openExternalUrl` hands a URL to the host OS handler |
| renderer → filesystem/network | none added by this change |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-elw-01 | Tampering | `renderCreateAccountLink` external URL | mitigate | The URL is a hardcoded module-level string literal with no interpolation, no state, and no user input on any path. Task 2's call-site gate asserts it occurs exactly once and matches the exact literal, so a host swap fails the suite. |
| T-elw-02 | Spoofing | user redirected to a non-Valve page | mitigate | Asserted against the full literal `https://store.steampowered.com/join/`, not a `/join/` substring — a lookalike host would fail the behavioural click gate. |
| T-elw-03 | Elevation of Privilege | opening the browser mid-authentication | mitigate | D-01 gates the link off for `'qr-confirmed'` and `'credentials-2'`, so no external navigation is offered while a Steam Guard code or QR approval is in flight. Pinned in both directions by Task 2's render gate. |
| T-elw-04 | Denial of Service | dialog dismissed by the link, losing an in-flight session | mitigate | The handler does not reference `closeWindow`; the dialog and its polling intervals survive. Pinned by Task 2's dialog-stays-open gate. |
| T-elw-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs NO packages. No package-manager install task exists, so no legitimacy checkpoint is required. If an executor finds itself wanting to add a dependency, that is a deviation requiring a blocking human checkpoint, not an auto-fix. |
</threat_model>

<verification>
1. `npx jest --selectProjects Frontend --testPathPattern "screens/Login"` — 6
   suites green (baseline was 5 suites / 76 tests).
2. `npx jest --selectProjects Meta --testPathPattern "hardcodedStringGate"` —
   fully green, including zero `staleExemptions` and the two-entry allowlist
   assertion.
3. `npx jest --selectProjects Meta --testPathPattern "genI18nGateScope"` —
   exactly ONE failure, still the pre-existing A-17 `forkTouchedSnapshot.files`
   array equality. Five failures means the snapshot was regenerated; revert.
4. `npx tsc --noEmit` clean.
5. `npx eslint` clean on the three touched `src/` files.
6. `git status --short` shows only the four files in `files_modified` plus this
   plan's own `.planning/quick/260822-elw-*` directory. In particular, nothing
   under `src/common/humble/`, `src/frontend/screens/Login/components/SteamLogin/`
   siblings not listed, or `src-tauri/` — the concurrent 260822-eib task owns
   those.
</verification>

<success_criteria>
- The Steam login dialog offers a create-account link on the QR tab and the
  username/password tab, and does not offer it during Steam Guard entry or QR
  completion — both directions proven by a test observed failing.
- Clicking it calls `window.api.openExternalUrl` with exactly
  `https://store.steampowered.com/join/` and leaves the dialog open.
- No other login tile is touched.
- `meta/i18nGateAllowlist.json`'s `expectedCount` for this file matches the
  measured count in the SAME commit as the literals that changed it, and its
  `reason` text is factually true.
- The pre-existing genI18nGateScope A-17 failure is still exactly one failure.
- The SUMMARY explicitly records: the localisation debt increase from 26 to 29
  hardcoded strings and that it is a stated decision against a standing repo
  requirement; the corrected allowlist reason; D-01's gating decision and its
  reasoning; and the per-assertion falsifiability mutations with their observed
  failure output.
</success_criteria>

<output>
Create `.planning/quick/260822-elw-add-a-create-a-steam-account-link-to-the/260822-elw-SUMMARY.md` when done
</output>
