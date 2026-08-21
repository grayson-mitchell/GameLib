---
quick_id: 260822-eib
type: execute
extends: 260822-di1
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/common/humble/loginChromeCss.ts
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/components/humbleLoginChromeCss.ts
  - src/backend/humble/__tests__/loginChromeCss.test.ts
  - src/backend/__tests__/loginChromeCssInjection.test.ts

must_haves:
  truths:
    - "HUMBLE_LOGIN_CHROME_CSS hides .simple-navbar in addition to footer.site-footer."
    - "The Tauri Rust literal and the TypeScript constant remain byte-identical (drift pin green)."
    - "#flash, page-top-messages, grayout, zdconsent (and jest-side showConsentTool, js-view-body, js-login-form) are still asserted absent from the CSS."
    - "No gate anywhere still asserts simple-navbar is absent from the injected script."
    - "The Rust test name no longer claims the footer is hidden 'and nothing else'."
  artifacts:
    - path: "src/common/humble/loginChromeCss.ts"
      provides: "Two-rule single-line CSS constant"
      contains: ".simple-navbar"
    - path: "src-tauri/src/main.rs"
      provides: "Byte-identical Rust literal plus updated cargo gates"
      contains: ".simple-navbar { display: none !important; }"
  key_links:
    - from: "src-tauri/src/main.rs"
      to: "src/common/humble/loginChromeCss.ts"
      via: "byte-equality drift pin in loginChromeCssInjection.test.ts"
      pattern: "style\\.textContent = '([^']*)';"
---

<objective>
Extend the Humble login-chrome CSS so the ~70px full-width `.simple-navbar` logo band is hidden
alongside `footer.site-footer`, leaving the login form as the only visible page content on both
login surfaces.

Purpose: `.simple-navbar` is the last remaining full-width page chrome around the login form.
Removing it completes the "login frame only" target quick task 260822-di1 started.

Output: one extended shared constant, one mirrored Rust literal, and a gate set whose
`simple-navbar` assertion has been INVERTED from "must not touch" to "must hide" -- in every
location, with the genuinely protected selectors left intact.

**This is not a one-line change.** `simple-navbar` is currently a member of the
forbidden-selector arrays in two suites. Landing the CSS without flipping those gates leaves
the build RED; flipping them carelessly weakens the protection those arrays exist for.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260822-di1-inject-chrome-stripping-css-into-the-hum/260822-di1-PLAN.md
@src/common/humble/loginChromeCss.ts
@src/backend/humble/__tests__/loginChromeCss.test.ts
@src/backend/__tests__/loginChromeCssInjection.test.ts
@src/frontend/screens/WebView/components/humbleLoginChromeCss.ts

<interfaces>
Extracted from the codebase during planning. Do NOT go re-explore for these.

Current constant, `src/common/humble/loginChromeCss.ts` lines 33-34 -- an `export const`
assigned the single-quoted single-line string `footer.site-footer { display: none !important; }`.

Current Rust literal, `src-tauri/src/main.rs` line 1752, inside `fn login_chrome_css_script()`'s
`concat!` -- one `concat!` piece, one source line, assigning `style.textContent` a
single-quoted JS literal holding that same CSS text.

Drift-pin extractor, `src/backend/__tests__/loginChromeCssInjection.test.ts` line 203 --
`fnBody.match(/style\.textContent = '([^']*)';/)`, run over comment-stripped Rust source.

Rust forbidden array, `src-tauri/src/main.rs` lines 7345-7351, inside
`fn login_chrome_css_script_hides_the_marketing_footer_and_nothing_else` -- five entries:
`#flash`, `page-top-messages`, `grayout`, `simple-navbar`, `zdconsent`.

Jest forbidden array, `src/backend/humble/__tests__/loginChromeCss.test.ts` lines 22-31 -- a
`test.each` over eight entries: those five plus `showConsentTool`, `js-view-body`, `js-login-form`.

Jest exact-string gate, `src/backend/humble/__tests__/loginChromeCss.test.ts` lines 16-20 --
a `toBe` against the full CSS text.
</interfaces>

<measured_selector>
Fetched live from Humble's CSS bundle (`cdn.humblebundle.com/static/hashed/*.css`, 2026-08-22):
`.simple-navbar` sets `background:#3b3e48`, `height:4.375em`, `width:100%`, and flex centering.
Its only content is `.navbar-content > a.navbar-item.logo-navbar-item.desktop > img` -- the
Humble logo, nothing else. This is a measurement, not a recollection.
</measured_selector>
</context>

<decisions>

**D-1 -- Shape: TWO separate rules, not a comma-joined selector list.**
Ship `footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }`,
NOT `footer.site-footer, .simple-navbar { ... }`. A comma-joined list is a single declaration
block, so a CSS syntax error anywhere in the list drops the whole rule and both hidings fail
together. Separate rules fail independently -- the same fail-safe reasoning that made di1 choose
CSS over DOM surgery. di1's own doc comment already anticipated exactly this shape ("a second
rule is a one-line append to `HUMBLE_LOGIN_CHROME_CSS` later").

**D-2 -- The constant stays a SINGLE-LINE string with NO newline. This is load-bearing.**
The two rules are separated by one space, never a newline. Reason: the drift-pin extractor is
`/style\.textContent = '([^']*)';/` run over Rust *source*. A newline in the TS constant could
only be mirrored on the Rust side as a `\n` **escape** -- two source characters -- so the
extracted Rust literal would hold a backslash and an `n` while the TS constant held a real
newline, and byte equality would fail with no clean fix. Keeping one line means **the extractor
regex is UNCHANGED and needs no re-proof.** Do not "tidy" this into a multi-line template
literal or a joined array.

**D-3 -- Forbidden lists shrink by exactly ONE entry each. Nothing else moves.**
- Rust array becomes exactly four: `#flash`, `page-top-messages`, `grayout`, `zdconsent`.
- Jest array becomes exactly seven: those four plus `showConsentTool`, `js-view-body`,
  `js-login-form`.

`js-view-body` and `js-login-form` **STAY forbidden**. The task brief's own out-of-scope note
requires that Humble's React-rendered signup affordance inside `.js-view-body` remains
untouched -- these two entries ARE that guarantee, and dropping them would be exactly the
weakening this plan exists to prevent. The four survivors protect login error messages
(`#flash`), real notices (`page-top-messages`), modal overlays (`grayout`), and the legally
sensitive, potentially interaction-blocking Ziff Davis cookie-consent UI (`zdconsent` /
`showConsentTool`).

**D-4 -- Rename the Rust test; verified safe during planning.**
`login_chrome_css_script_hides_the_marketing_footer_and_nothing_else` becomes a lie the moment
the navbar is hidden. A repo-wide grep confirmed this name appears **only** at
`src-tauri/src/main.rs:7342` and inside di1's own historical planning docs. It is NOT one of the
two names pinned by the "Cargo-test survival pin" at `loginChromeCssInjection.test.ts:249,252`
(which pin `..._is_wrapped_in_a_single_top_level_try_catch` and
`..._top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag`). Renaming breaks no pin.
The new name must state the guarantee that actually holds now.

**D-5 -- The anti-phishing rationale is SUPERSEDED, and that must be recorded in source.**
di1 kept the navbar partly as an "authenticity cue" (the Humble logo). That reasoning is
retired: this is an OS-level child webview the user reached from inside GameLib, its origin is
already shown by `login_origin_banner_script`, and a logo rendered by the page itself was never
a signal a phisher could not also render. Write the supersession into the doc comment so a
future reader does not re-litigate it and silently revert this change.

**D-6 -- Formatting is a non-issue; do NOT split the Rust literal for line width.**
The new `concat!` piece runs roughly 124 characters. `main.rs` already carries 91 lines over 100
chars and 38 over 120 (longest: 624), and `src-tauri/` has no `rustfmt.toml`. rustfmt does not
break string literals. Leave it on one line -- D-2 requires it.

</decisions>

<known_red>
Pre-existing failures that are NOT yours. Do not "fix" them and do not mistake them for
regressions you caused:

- **`meta/__tests__/genI18nGateScope.test.ts` A-17 is RED at exactly 1 failure** because
  `meta/i18nForkTouchedFiles.json` is stale: di1 added
  `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` and the JSON was never
  regenerated (confirmed during planning -- grepping that JSON for `loginChromeCss` returns
  nothing). Regenerating it takes that suite from 1 failure to 5, so it has its own deferred
  item. **This task adds NO new frontend file** -- it only edits existing ones -- so that count
  must stay at exactly 1. Task 2 verifies the count rather than assuming it.
- **`prettier --check` is RED repo-wide.** Format only the files you touch. Never sweep
  formatting into this behavioural commit.
- **ts-jest is transpile-only** -- type errors do not fail jest. `tsc --noEmit` is a separate,
  required gate.
- **Never run `git stash`.** It has stranded a concurrent session's work twice in this repo.
</known_red>

<tasks>

<task type="auto">
  <name>Task 1: Extend the CSS on both surfaces, and OBSERVE the old gates go RED</name>
  <files>src/common/humble/loginChromeCss.ts, src-tauri/src/main.rs, src/frontend/screens/WebView/components/humbleLoginChromeCss.ts</files>
  <action>
Change production CSS only. Deliberately do NOT touch any test file in this task -- the
resulting RED is the real RED-direction proof for Task 2 (see this task's `<verify>`), driven
by the actual production code path rather than by a synthetic reimplementation.

1. `src/common/humble/loginChromeCss.ts` -- set `HUMBLE_LOGIN_CHROME_CSS` to the exact
   single-line two-rule value from D-1, honouring D-2 (one space between rules, no newline,
   no template literal, no array join).

   Update the file's doc comment. Its header currently describes a single footer rule, and its
   `D-1 (declined scope)` paragraph says hiding the footer alone already achieves the de-clutter
   goal and frames a second rule as a future append. Rewrite that prose to the current two-rule
   reality, cite `<measured_selector>` above as the source (a live CSS-bundle fetch dated
   2026-08-22, not memory), and record D-5's supersession of the authenticity-cue argument.
   Keep the `.base-main-wrapper` / `.inner-main-wrapper` spacing tighten DECLINED -- there is
   still no measured baseline. If removing the navbar leaves the form oddly positioned, that is
   a follow-up driven by real measurement, not a guess bundled here.

2. `src-tauri/src/main.rs` -- replace the `style.textContent` `concat!` piece at line 1752 with
   the byte-identical two-rule literal. Constraints that must all hold simultaneously: it stays
   ONE single-quoted JS literal, on ONE source line, so the drift-pin extractor still matches
   (D-2); the source line keeps an EVEN raw double-quote count -- exactly 2 -- for the WR-08
   per-line guard; and no apostrophe appears anywhere inside the CSS text, which would terminate
   the JS literal early and silently truncate what the extractor captures.

   Then fix the function's doc comment (roughly lines 1676-1735), which asserts three things
   that become false: that Humble's marketing *footer* is the visual noise being removed, that
   the fail-safe case is "if Humble re-skins and `footer.site-footer` stops matching", and --
   most importantly -- that "this stays scoped to exactly one selector". Restate as two
   selectors, both full-width page chrome, each failing independently per D-1. Leave every other
   contract bullet exactly as written: top-frame guard, host gate before idempotence flag,
   single top-level try/catch, zero listeners, no `.value` read, no HTML-fragment write. None of
   them change, and none of their gates change.

3. `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` -- doc comment ONLY. The
   `attachHumbleLoginChromeCss` docblock says the helper hides "Humble's marketing footer" and
   names `footer.site-footer` in its fail-safe rationale; update that prose to name both
   selectors. Change no code in this file: the `dom-ready` -> `insertCSS` wiring, the deliberate
   absence of an idempotence guard (Electron drops inserted CSS on navigation, so idempotence
   here would be a bug), and the cleanup contract all stay as-is. The file must not gain or lose
   an import.

Touch no other file. In particular do not regenerate `meta/i18nForkTouchedFiles.json`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && for F in src/common/humble/loginChromeCss.ts src-tauri/src/main.rs; do echo -n "$F non-comment hits: "; grep -v '^[[:space:]]*//' "$F" | grep -v '^[[:space:]]*\*' | grep -c "simple-navbar { display: none !important; }"; done</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && awk '/fn login_chrome_css_script\(\) -> String/,/^}/' src-tauri/src/main.rs | awk 'gsub(/"/,"&")%2!=0 {print "ODD QUOTE LINE: " $0; f=1} END {exit f+0}' && echo "WR-08 even-quote check PASS"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && cargo test --manifest-path src-tauri/Cargo.toml login_chrome_css 2>&1 | tail -25</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts 2>&1 | tail -40</automated>
  </verify>
  <done>
The constant and the Rust literal both carry the two-rule CSS, and the WR-08 even-quote check
passes.

**Three failures are REQUIRED at this point and must be captured verbatim into the SUMMARY as
the RED-direction evidence for Task 2 -- they are the whole reason production and gates are
split across two tasks:**
  a. cargo `login_chrome_css_script_hides_the_marketing_footer_and_nothing_else` FAILS, because
     the script now contains the string it forbids.
  b. jest `HUMBLE_LOGIN_CHROME_CSS` exact-string `toBe` gate FAILS against the old one-rule value.
  c. jest `does not name protected selector simple-navbar` FAILS.

These prove the flipped assertions in Task 2 were non-vacuous before the flip, against the real
extractor and the real `login_chrome_css_script()` output -- not a reimplementation.

The drift pin (`the real login_chrome_css_script fn body embeds exactly
HUMBLE_LOGIN_CHROME_CSS`) must be **GREEN**, since both sides changed together. If it is RED,
the two literals diverged -- fix that before proceeding; do not carry it into Task 2.

If any of (a), (b), (c) unexpectedly PASSES, stop: the gate was already vacuous and that is a
finding to report, not to paper over.
  </done>
</task>

<task type="auto">
  <name>Task 2: Invert every simple-navbar gate from "must not touch" to "must hide"</name>
  <files>src-tauri/src/main.rs, src/backend/humble/__tests__/loginChromeCss.test.ts, src/backend/__tests__/loginChromeCssInjection.test.ts</files>
  <action>
Flip the gates so they assert the new guarantee. Every edit below is either a list shrink of
exactly one entry (D-3), a positive assertion replacing it, or a name that stops lying.

1. `src-tauri/src/main.rs`, the cargo test block at lines ~7331-7355:
   - Remove `"simple-navbar"` from the `forbidden` array, leaving exactly the four entries from
     D-3. Change nothing else in that array.
   - Add a positive assertion alongside the existing footer one, asserting the script contains
     the exact `.simple-navbar` rule text.
   - Rename the test per D-4 to a name that describes what is now guaranteed -- both full-width
     chrome elements hidden, the four protected selectors untouched. Do not reuse "and nothing
     else"; the honest claim is about which specific selectors are and are not named.
   - Update the RED-direction prose comment block above the tests (lines ~7333-7339). It
     currently enumerates three RED directions (a)/(b)/(c) for innerHTML, gate ordering, and
     suffix-vs-substring -- all three still hold verbatim, so keep them. Add a fourth recording
     that dropping either CSS rule from the `concat!` literal would fail the byte-equality drift
     pin on the jest side, and note that this task OBSERVED that failure live (cite Task 1's
     captured output) rather than merely reasoning about it.

2. `src/backend/humble/__tests__/loginChromeCss.test.ts`:
   - Update the exact-string `toBe` gate to the new two-rule value and rename that test so it no
     longer says "the one footer-hiding rule" -- it is now two chrome-hiding rules. This gate is
     exact equality, so it is self-proving in both directions: any drift in either rule, in
     either direction, fails it. It needs no separate synthetic RED specimen, and adding one
     would be degenerate.
   - Remove `'simple-navbar'` from the `test.each` forbidden list, leaving exactly the seven
     entries from D-3. **Leave `'js-view-body'` and `'js-login-form'` in place** -- they are the
     signup-affordance guarantee.
   - Add a positive `toContain` assertion for the `.simple-navbar` rule, so the constant is
     pinned by both an exact-equality gate and a named-selector gate. A future author who
     rewrites the exact-equality gate wholesale still trips the named one.
   - Leave the colour/theme absence gate (`color:`, `background`, `filter:`, `--`,
     `prefers-color-scheme`) untouched and confirm it still passes: the new rule declares only
     `display`, so it must.
   - Leave the entire `isHumbleLoginChromeHost` describe block, including its naive-substring
     RED proof, completely untouched. Host scoping is unchanged by this task.

3. `src/backend/__tests__/loginChromeCssInjection.test.ts` -- add ONE new test inside the
   existing `DRIFT PIN (T-di1-06)` describe, next to the two RED proofs already there. It must
   call the SAME `extractCssLiteral` helper the real gate uses (not a copy) over a synthetic
   `fn login_chrome_css_script() { ... }` body carrying the OLD, footer-only literal, and assert
   the extracted value is non-null but NOT equal to `HUMBLE_LOGIN_CHROME_CSS`.

   Why this specific specimen: the realistic failure mode this change introduces is that a
   future edit updates the TypeScript constant but forgets the Rust `concat!` literal (or the
   reverse), leaving the navbar visible in Tauri while every TypeScript-side gate stays green.
   The generic "different literal" RED proof already present uses `footer.wrong-selector`, which
   does not exercise that case. This one feeds the exact plausible bad input through the exact
   production extractor. Name it so the specimen's meaning is explicit -- that it is di1's
   shipped literal, i.e. a half-applied update.

   Change nothing else in this file. The extractor regex stays as-is per D-2, the WR-08 guard
   stays as-is, and the Cargo-test survival pin stays as-is -- D-4 confirmed it does not
   reference the renamed test.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && ! grep -rn "simple-navbar" --include="*.ts" --include="*.rs" src src-tauri | grep -iE "forbidden|not\.toContain|!script\.contains" && echo "NO stale simple-navbar negative assertion remains"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -rn "simple-navbar" --include="*.ts" --include="*.rs" src src-tauri</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && cargo test --manifest-path src-tauri/Cargo.toml login_chrome_css 2>&1 | tail -20</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts 2>&1 | tail -30</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit 2>&1 | tail -10</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx eslint src/common/humble/loginChromeCss.ts src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/frontend/screens/WebView/components/humbleLoginChromeCss.ts 2>&1 | tail -20</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/common/humble/loginChromeCss.ts src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/frontend/screens/WebView/components/humbleLoginChromeCss.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/genI18nGateScope.test.ts 2>&1 | grep -E "Tests:|✕" | tail -10</automated>
  </verify>
  <done>
- `cargo test login_chrome_css` is GREEN at 8/8 (same count as before -- one test renamed, none
  added or removed on the Rust side), including the renamed test with its four-entry forbidden
  array and its new positive `.simple-navbar` assertion.
- All three jest suites GREEN, with the new half-applied-update RED proof passing.
- The grep sweep shows `simple-navbar` surviving ONLY as: the CSS text in the constant, the CSS
  text in the Rust literal, positive `contains`/`toContain` assertions, and prose. Zero
  remaining negative assertions anywhere in `src/` or `src-tauri/`.
- `tsc --noEmit` clean; eslint 0 errors on the touched files; prettier clean on the touched
  files only (repo-wide prettier stays RED and is not this task's problem).
- `genI18nGateScope.test.ts` still reports **exactly 1** failure -- unchanged from before this
  task, since no new frontend file was added. If it reports more, you touched something you
  should not have; if fewer, someone regenerated the JSON and that must be reported.
- SUMMARY records Task 1's three captured RED outputs as the non-vacuity evidence, and states
  plainly that **every gate here is structural -- no live visual observation has occurred.**
  di1's owed live check is now larger, not discharged: a human still owes a freshly-built
  `pnpm tauri:dev` Humble login (footer AND navbar gone, login form still centred and usable,
  Cmd+V into the password field still works, error `#flash` still renders on a bad password)
  plus the equivalent Electron `<webview>` check. Carry that forward as still-owed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib -> live humblebundle.com DOM | Injected CSS runs inside a live, credential-bearing login page |
| TS constant -> Rust literal | Two hand-maintained copies of the same string that can silently diverge |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-eib-01 | Denial of service | Hiding an element the user needs | mitigate | Only two selectors, both measured full-width chrome. `#flash` (login errors), `page-top-messages`, `grayout` (modal overlays), `zdconsent`/`showConsentTool` (cookie consent) stay pinned absent in both suites (D-3). `js-view-body`/`js-login-form` stay pinned so the signup affordance is untouched. |
| T-eib-02 | Tampering | TS/Rust literal divergence | mitigate | Byte-equality drift pin, plus a NEW RED proof feeding di1's old footer-only literal through the same extractor -- the exact half-applied-update failure mode this change introduces (Task 2, step 3). |
| T-eib-03 | Spoofing | Removing the Humble logo weakens an authenticity cue | accept | D-5: OS-level child webview reached from inside GameLib, origin already shown by `login_origin_banner_script`, and a page-rendered logo is trivially reproducible by a phisher. Recorded in source so it is not re-litigated. |
| T-eib-04 | Elevation of privilege | Injected script gains new capability | accept | No script logic changes. Top-frame guard, host gate ordering, single try/catch, zero listeners, no `.value` read and no HTML-fragment write are all untouched, and all their gates still run unmodified. |
| T-eib-05 | Information disclosure | Wider CSS reach than intended | mitigate | Only `display: none` is declared. The colour/theme absence gate (`color:`, `background`, `filter:`, `--`, `prefers-color-scheme`) is retained and must stay green. Host scoping is unchanged and its suffix-anchored RED proof is untouched. |

No package-manager installs in this task, so no legitimacy gate applies.
</threat_model>

<verification>
- `cargo test --manifest-path src-tauri/Cargo.toml login_chrome_css` -> 8/8 green.
- `npx jest src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts` -> all green.
- `npx tsc --noEmit` -> clean.
- eslint and prettier -> clean on touched files only.
- `genI18nGateScope.test.ts` -> still exactly 1 pre-existing failure.
- Repo-wide grep: zero negative `simple-navbar` assertions remain.
</verification>

<success_criteria>
Both login surfaces hide `footer.site-footer` and `.simple-navbar` from one single-line shared
constant that is byte-identical to the Rust literal; every `simple-navbar` gate has been
inverted rather than deleted; the four protected selectors plus the two signup-form selectors
remain pinned absent; the Rust test name states a true guarantee; and Task 1's observed RED
proves none of the flipped assertions were vacuous. Live visual verification remains OWED and
is explicitly recorded as such.
</success_criteria>

<output>
Create `.planning/quick/260822-eib-strip-the-humble-login-navbar-so-only-th/260822-eib-SUMMARY.md` when done.
</output>
