---
phase: quick-261003-nsk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src/backend/__tests__/tauriShellSource.test.ts
autonomous: true
requirements: [D-1, D-2, D-3]

estimate:
  tokens: 72000
  raw_tokens: 36000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "The macOS Humble login sheet shows ONE horizontal bar across its top edge, not two corner pills (D-1, D-2)."
    - "The live origin is centred in that bar and re-texts on every main-frame origin change, via the existing update-script path."
    - "A bare multiplication-sign close glyph sits flush in the bar's right end and still carries the accessible name Cancel sign-in plus aria-keyshortcuts Escape (T-34.4.2-33, T-34.4.2-15)."
    - "The bar is pointer-transparent, so a full-width overlay cannot swallow a click anywhere across the top of a page GameLib does not control."
    - "Page content is NOT pushed down — no body offset is injected (D-2)."
    - "The visible Humble login window opens 572 wide by 700 tall; the pristine Epic login window still opens 900 by 700 (D-3)."
  artifacts:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
  key_links:
    - "login_origin_banner_script -> login_origin_banner_update_script: the update path re-texts by element id, so the id must not change when the element's geometry does."
    - "login_cancel_strip_script z-index 2147483000 > login_origin_banner_script z-index 2147482999: the only exit must paint above the origin display now that the two elements overlap geometrically."
    - "login_origin_banner_script horizontal padding >= login_cancel_strip_script glyph box width: the centred origin text must not run under the close glyph."
    - "login_chrome_css_script and src/common/humble/loginChromeCss.ts byte-equality drift pin: untouched by this task, so the pin does not move."
---

<objective>
Replace the Humble login sheet's two injected corner pills with a single themed title bar —
origin centred, bare close glyph flush right, GameLib-dark palette — and narrow the sheet's start
width from 900 to 572.

Purpose: an AppKit sheet renders no title bar at all (F-34.5-G6-16), so the two pills are the
only chrome that exists. Two floating black pills in opposite corners read as injected debris
rather than as the application's own window chrome. One bar reads as chrome.

Output: `src-tauri/src/main.rs` with both injected-script builders restyled into one bar and
`inner_size` narrowed, plus new RED-proven cargo coverage and two jest source guards.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/261003-nsk-humble-login-title-bar/261003-nsk-CONTEXT.md
@CLAUDE.md

Read before editing — these doc comments ARE the contract, clause by clause:
- `src-tauri/src/main.rs` lines 2849-2908 (`login_cancel_strip_script`'s doc comment)
- `src-tauri/src/main.rs` lines 2985-3037 (`login_origin_banner_script`'s doc comment)
- `src-tauri/src/main.rs` lines 3113-3127 (`login_origin_banner_update_script`'s doc comment)

Project skill: `Skill("spike-findings-gamelib")` — login-window UX on macOS, the login webview seam.
</context>

<decision_record>
## Shape taken: TWO scripts cooperating on ONE visual bar. The merge was considered and rejected.

The merge is what the goal superficially asks for — one bar, so one script. It is rejected on
three measured grounds, and the cost of NOT merging is stated so the trade is visible:

1. **It would destroy the banner's by-construction inertness.** `login_origin_banner_script`
   registers no `addEventListener` of any kind today — its loading-state arm assigns
   `document.onreadystatechange` as a property instead. That makes it provably inert with respect
   to REQ-34.4.2-06 (Cmd+V into the password field must keep working) by construction, not by
   omission of specific key names, and the cargo test
   `login_origin_banner_script_binds_no_keyboard_listener` asserts the stronger
   no-`addEventListener` form. A merged script necessarily carries the cancel control's `click`
   listener, so that assertion could only be weakened to the name-by-name form. Weakening a gate
   to admit a change is the pattern this repo keeps stamping out.

2. **It would couple the only exit to the origin display's lifetime.** One element means one
   idempotence flag, one `build()`, one failure mode. If the origin half throws mid-build, the
   exit goes with it. Two elements with independent flags, independent `build()` calls and
   independent `MutationObserver` re-appends means the exit survives a broken banner. For a
   control that is the only way out of a parent-blocking sheet (T-34.4.2-15/-33), that
   independence is worth more than source-file tidiness.

3. **Two pinned jest source guards require both call sites to survive.**
   `src/backend/__tests__/loginChromeCssInjection.test.ts:137` asserts
   `login_origin_banner_script(` appears in the visible block and strictly before
   `login_chrome_css_script(`; `src/backend/__tests__/tauriShellSource.test.ts:1962` asserts
   `login_cancel_strip_script(` appears exactly once there. A merge deletes one of the two names
   and reds both suites.

**What NOT merging costs, stated plainly:** the "two controls can never overlap because they are
in opposite corners" rationale in the banner's doc comment (T-34.5-C7-05) is now FALSE — the bar
spans the full width, including under the glyph. That non-overlap invariant is replaced by three
weaker-but-real ones, each newly gated in Task 1:
- the glyph's z-index stays strictly greater than the bar's (already gated, numerically);
- the bar keeps `pointerEvents: 'none'`, so it cannot intercept the glyph's click (already gated);
- the bar's horizontal padding is at least the glyph box's width, so the centred text cannot run
  under the glyph (NEW gate).

The doc comment must be corrected to say this. Leaving the opposite-corners sentence in place
would be a false comment describing geometry that no longer exists.
</decision_record>

<palette>
D-1 fixes the palette in source because the chrome is injected into humblebundle.com's document
and cannot read GameLib's CSS custom properties. The values below are RESOLVED from GameLib's own
default theme (`body.midnightMirage` in `src/frontend/themes.scss`, through
`src/frontend/styles/_colors.scss`) rather than invented:

| role | token chain | hex |
| --- | --- | --- |
| bar + glyph background | `--navbar-background` -> `--background` -> `--neutral-02` | `#161c1e` |
| bar + glyph text | `--text-default` -> `--brand-text-01` | `#caf3fd` |
| 1px bottom rule | `--divider` -> `--neutral-03` | `#272f31` |

`#caf3fd` on `#161c1e` is roughly 14:1 — comfortably past AA for the 12px origin text.

D-1 was taken knowing this does NOT follow a theme switch. Do not add a theme-reading mechanism;
that is route D and a different-sized job.
</palette>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: one bar across the sheet's top edge — both injected scripts restyled, gated</name>
  <files>src-tauri/src/main.rs</files>
  <read_first>
    `src-tauri/src/main.rs` 2849-2908, 2909-2979 (`login_cancel_strip_script` doc comment + body);
    2985-3037, 3038-3099 (`login_origin_banner_script` doc comment + body). Both `concat!`
    bodies in full — the house conventions (single-quoted JS literals, one top-level try/catch,
    `@@TOKEN@@` placeholder interpolation) are only legible from the existing pieces.
  </read_first>
  <behavior>
    New cargo tests, written and proven RED against the current source before any production edit.
    Place them in `mod tests` beside the existing `login_origin_banner_script_*` /
    `login_cancel_strip_script_*` blocks, and record each one's RED direction in a comment the way
    the neighbouring blocks already do.

    - `login_origin_banner_script_spans_the_full_width_and_centres_its_text`: the emitted script
      sets `left` to `'0'`, sets `right` (a property it does not set today), sets `textAlign` to
      `'center'`, sets `top` to `'0'`, and no longer carries the former 8px inset values for `top`
      or `left`. RED today on every clause.
    - `login_origin_banner_script_reserves_horizontal_room_for_the_close_glyph`: parse the bar's
      horizontal padding value and the strip's `width` value as integers from the emitted scripts
      and assert padding >= width. Numeric comparison, not substring presence — mirrors
      `login_origin_banner_script_z_index_is_strictly_below_the_cancel_strips`. RED today: neither
      value exists.
    - `login_origin_banner_and_cancel_strip_agree_on_one_bar_height`: extract the `height` literal
      from each emitted script and assert they are equal. This is the "reads as ONE bar" invariant.
      RED today: neither script sets `height`.
    - `login_cancel_strip_script_shows_a_bare_glyph_and_keeps_its_accessible_name`: the emitted
      script still sets the `aria-label` attribute to the cancel phrase and still sets
      `aria-keyshortcuts` to `'Escape'`, AND its `textContent` write no longer carries that same
      phrase as its value. RED today: the phrase is the visible label.
    - `login_cancel_strip_script_glyph_box_is_flush_with_the_bar_corner`: `top` and `right` are
      both `'0'`, and `width` equals `height`. RED today: both insets are 8px and neither
      dimension is set.

    Every pre-existing cargo test in the `login_` selection must still pass unchanged — 76 of them
    do today. None of them needs editing under this shape; if one goes red, the change has drifted
    from the contract, not the other way round.
  </behavior>
  <action>
Restyle BOTH `concat!` bodies. Keep every existing structural clause: the top-frame guard as the
first statement inside the try, the idempotence flag set before any DOM work, exactly one
top-level `try { } catch (e) { }` per script, `createElement` plus `appendChild` only (no
HTML-fragment-write API), the debounced `MutationObserver` on `document.documentElement` with its
`scheduleEnsure` / `ensure` / `build` shape, the null-root-safe `document.body ||
document.documentElement` resolve, the `@@TOKEN@@` plus `serde_json::to_string` interpolation, and
the one-piece-per-line `concat!` discipline with single-quoted JS literals so every source line
keeps an even raw double-quote count.

In `login_origin_banner_script`'s `build()`, the element becomes the bar — a floating overlay per
D-2, so inject NO body offset and no page-layout rule of any kind; page content stays where Humble
put it. Every colour literal below comes from this plan's `<palette>` table, fixed in source per
D-1. Set `position` fixed;
`top`, `left` and `right` all to `'0'`; `height` to `'32px'`; `boxSizing` to `'border-box'`;
`lineHeight` to `'31px'` (32 minus the 1px rule, so the text sits optically centred);
`borderBottom` to a 1px solid `#272f31` rule; `background` `#161c1e`; `color` `#caf3fd`;
`fontFamily` sans-serif; `fontSize` `'12px'`; `textAlign` `'center'`; `padding` to `'0 36px'`;
`whiteSpace` nowrap, `overflow` hidden and `textOverflow` ellipsis so a long origin truncates
instead of wrapping the bar open; `boxShadow` to a 1px-down soft black shadow so the bar reads as
floating chrome over the page. Drop the former corner-pill properties: the 8px `top`/`left`
insets, `borderRadius`, and the pill `padding`. KEEP `zIndex` at `'2147482999'`, KEEP
`pointerEvents` none, KEEP `userSelect` none, KEEP the id, KEEP the `textContent` write sourced
from `window.__GAMELIB_LOGIN_ORIGIN_VALUE__`.

`pointerEvents` none is no longer cosmetic. A 32px-tall full-width element with pointer events
enabled would intercept every click across the top of a page GameLib does not control, including
the glyph's. State that in the doc comment — it is now load-bearing, where before it was politeness.

In `login_cancel_strip_script`'s `build()`, the element becomes the bar's right-hand glyph. Set
`position` fixed; `top` and `right` to `'0'`; `width` and `height` both to `'32px'`; `boxSizing`
border-box; `lineHeight` `'31px'`; `textAlign` center; `fontSize` `'18px'`; `fontFamily`
sans-serif; `background` `#161c1e`; `color` `#caf3fd`; `borderBottom` the same 1px `#272f31` rule
so the bottom edge reads continuous with the bar; `cursor` pointer; `userSelect` none. Drop the
former 8px insets, the pill `padding`, `borderRadius` and `boxShadow`. KEEP `zIndex` at
`'2147483000'`, KEEP the id, KEEP the `role` button attribute, KEEP the `aria-label` attribute set
to the cancel phrase, KEEP `aria-keyshortcuts` `'Escape'`, KEEP the absence of `tabindex`, KEEP
the single `click` listener with its `preventDefault()` plus `deliver()`, KEEP the hidden 1x1
display-none iframe delivery to the exfil sentinel.

Replace only the glyph's visible text: the `textContent` write's value becomes the JS escape
sequence for the multiplication sign — write it in the Rust piece as a backslash-escaped
`\\u00d7` inside single quotes, so the Rust source stays ASCII in this region, the piece keeps an
even double-quote count, and the glyph's identity is greppable. Do NOT write the character
literally.

Give the glyph its OWN opaque `#161c1e` background rather than transparent. The two colours match,
so it reads seamless inside the bar, but if the bar's own `build()` ever fails or the page deletes
it, the only exit from a parent-blocking sheet is still legible against whatever is underneath.
A transparent glyph would make the exit's legibility depend on the bar's survival, which is
exactly the lock-out this control exists to prevent. Record that reasoning in the doc comment.

Then correct both doc comments. In the banner's, the sentence claiming the two controls occupy
opposite corners and "can never overlap" is now false — replace it with the three replacement
invariants from this plan's decision record (strict z-order, pointer transparency, padding at
least the glyph width), each naming its gate. In the strip's, note that the visible label is now a
glyph while the accessible name is unchanged, and that the differing visible-text/accessible-name
pair is the accepted icon-button pattern, not an oversight. In both, note that the shape is two
cooperating scripts and that a merge was rejected to preserve the banner's no-listener inertness.

Do NOT touch `login_origin_banner_update_script` — it re-texts by element id, and the id does not
change. Do NOT touch `login_chrome_css_script`: it stays ungated while these two stay macOS-gated,
and its byte-equality drift pin against `src/common/humble/loginChromeCss.ts` must not move.

Do NOT run `cargo fmt`. The file is already rustfmt-dirty at many pre-existing sites from line
10113 onward, so a format pass would bury this change under hundreds of unrelated lines. Match the
surrounding `concat!` piece style by hand.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell login_</automated>
    <automated>npx jest --selectProjects Backend --silent src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/backend/__tests__/longRunningChannels.test.ts</automated>
    <note>No prettier clause. `npx prettier --file-info src-tauri/src/main.rs` reports
    `{ "ignored": false, "inferredParser": null }`, and `npx prettier --check` on it exits 2 with
    "No parser could be inferred" — measured. A prettier clause here would be an error, not a
    vacuous green. This task writes no prettier-visible path.</note>
  </verify>
  <done>
    All five new cargo tests pass, and were observed RED against the pre-edit source before the
    production edit landed. The 76 pre-existing `login_`-selected cargo tests still pass with no
    edits to any of them. All three main.rs source-guard jest suites still pass (295 tests).
  </done>
  <reversibility rating="reversible">
    Palette and geometry are literals in one function each; reverting is a local edit with no
    data or protocol consequence.
  </reversibility>
</task>

<task type="auto">
  <name>Task 2: narrow the visible Humble sheet to 572 wide, and gate that Epic stays 900</name>
  <files>src-tauri/src/main.rs, src/backend/__tests__/tauriShellSource.test.ts</files>
  <read_first>
    `src-tauri/src/main.rs` line 7365 and its surrounding comment block from 7338; line 3571
    (the pristine Epic builder's own sizing call).
    `src/backend/__tests__/tauriShellSource.test.ts` 1245-1268 — the existing presentation-token
    placement test, and the `extractHumbleLoginOpenArmBody` / `extractBracedBlock` helpers it uses.
  </read_first>
  <action>
At `src-tauri/src/main.rs:7365`, inside `humble_login_open`'s `if visible` block, change the
builder's inner-size width from 900.0 to 572.0. Height stays 700.0. This is the only production
line this task changes.

The 572 is a measurement, not a taste call: `CGWindowListCopyWindowInfo` with
`.optionOnScreenOnly` against the live `gamelib-shell` pid on 2026-10-03 returned exactly one
on-screen login window at w=572 h=700. Cite that in a brief comment next to the changed line so
the number is not later read as arbitrary and rounded off.

Leave line 3571 alone. `open_pristine_epic_login_window` keeps 900.0 by D-3: it contains zero
`initialization_script` calls, and that zero-injection property is what defeated Talon's anti-bot
403 under Tauri. Its login form is a different layout and 572 was never measured against it.

Then add two guards to `src/backend/__tests__/tauriShellSource.test.ts`, in the describe block that
already owns the presentation-token placement test. Use the file's existing `loadMainRsCode`,
`extractHumbleLoginOpenArmBody` and `extractBracedBlock` helpers rather than new slicing code.

Guard one: the visible block's sizing call carries the narrowed width and no longer carries the
former one. Assert the extracted visible block contains the 572.0-by-700.0 call and does not
contain a 900.0-width sizing call. Scope the negative clause to the extracted visible block only —
a file-wide negative would red on Epic's own legitimate 900 at line 3571, which D-3 requires to
stay.

Guard two (the D-3 scope guard, and the reason the negative above is block-scoped): slice
`open_pristine_epic_login_window`'s body out of the comment-stripped source and assert it still
contains the 900.0-by-700.0 sizing call. Follow the file's existing find-start-then-find-end
slicing idiom.

Give each guard a RED proof against a synthetic source, matching the sibling tests' own convention
in this file and in `loginChromeCssInjection.test.ts`: a synthetic arm whose visible block still
carries the old width must fail guard one's positive clause, and a synthetic pristine body
narrowed to 572 must fail guard two.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --silent src/backend/__tests__/tauriShellSource.test.ts</automated>
    <automated>npx prettier --check src/backend/__tests__/tauriShellSource.test.ts</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell login_</automated>
    <note>`src/backend/__tests__/tauriShellSource.test.ts` reports
    `{ "ignored": false, "inferredParser": "typescript" }` — measured — so its prettier check is
    real, not vacuous. `src-tauri/src/main.rs` has no inferable parser and is excluded, as in
    Task 1. No `src/frontend` file is touched and `meta/i18nGateScope.json` is `src/frontend`-only
    (verified), so `--selectProjects Meta` is not in scope for this task.</note>
  </verify>
  <done>
    Both new jest guards pass and each was observed RED against its synthetic counter-source.
    `tauriShellSource.test.ts` is prettier-clean. The pre-existing presentation-token placement
    test still passes — the sizing call is still inside the visible block and still absent from
    both hidden builders.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| injected script -> humblebundle.com document | GameLib-authored JS executes inside a third-party, credential-bearing document |
| humblebundle.com page script -> injected chrome | the page can mutate or delete GameLib's injected DOM at will |
| injected glyph -> shell navigation handler | the cancel signal crosses back into Rust via a navigation sentinel |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-nsk-01 | Denial of Service | `login_cancel_strip_script` glyph | critical | mitigate | the glyph keeps its own opaque `#161c1e` background and its own independent `build()`/`MutationObserver`, so a failed or deleted bar cannot render the only exit from a parent-blocking sheet invisible or absent; gated by `login_cancel_strip_script_glyph_box_is_flush_with_the_bar_corner` plus the retained self-re-append tests |
| T-nsk-02 | Denial of Service | `login_origin_banner_script` full-width bar | high | mitigate | `pointerEvents: 'none'` retained and newly load-bearing — a 32px full-width overlay with pointer events enabled would swallow clicks across the whole top of the page including the glyph's; gated by the retained `login_origin_banner_script_pointer_events_are_disabled` |
| T-nsk-03 | Tampering | glyph vs bar paint order | high | mitigate | glyph `zIndex` 2147483000 stays strictly above bar 2147482999, asserted by numeric extraction in the retained `login_origin_banner_script_z_index_is_strictly_below_the_cancel_strips`; the former opposite-corners non-overlap argument is retired in the doc comment rather than left standing as a false claim |
| T-nsk-04 | Elevation of Privilege | injected script -> page input surface | critical | mitigate | no `keydown`/`keyup`/`keypress` listener is added anywhere and the banner keeps zero `addEventListener` calls (the merge that would have broken this was rejected); gated by `login_cancel_strip_script_binds_no_keyboard_listener`, `login_origin_banner_script_binds_no_keyboard_listener`, and the comment-stripped-source jest Test 5 |
| T-nsk-05 | Information Disclosure | injected script -> network | critical | mitigate | no input `value` read and no page content transmitted; the only outbound signal stays the payload-free sentinel iframe; gated by the retained `login_cancel_strip_script_never_reads_field_value_or_password_content` and jest Test 6 |
| T-nsk-06 | Spoofing | origin display | high | mitigate | the centred text is still `textContent`-only from the shell-resolved origin, never page content, and the bar's padding is gated to be at least the glyph width so a long origin truncates with an ellipsis instead of being visually clipped under the glyph into a different-looking hostname |
| T-nsk-07 | Tampering | Epic pristine login surface | critical | accept | out of scope by D-3 and gated: the task adds a positive assertion that Epic's own sizing call is unchanged, so an accidental edit there reds the suite |
| T-nsk-SC | Tampering | npm/pip/cargo installs | high | accept | no package-manager install task exists in this plan — no dependency is added, removed or upgraded, so the package-legitimacy gate has no input; RESEARCH.md's audit table is not required and none is cited |
</threat_model>

<verification>
Desk-verifiable, all three measured on this tree before planning:
- `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell login_` — 76 passed today
  in 4.9s warm; must be 81 after Task 1.
- `npx jest --selectProjects Backend --silent src/backend/__tests__/tauriShellSource.test.ts
  src/backend/__tests__/loginChromeCssInjection.test.ts
  src/backend/__tests__/longRunningChannels.test.ts` — 295 passed today in 1.2s.
- `npx prettier --check src/backend/__tests__/tauriShellSource.test.ts`.

Deliberately NOT in any verify block, with reasons:
- `npx prettier --check src-tauri/src/main.rs` — exits 2, "No parser could be inferred"
  (`inferredParser: null`). An error, not a pass.
- `cargo fmt -- --check` — exits 1 on this tree TODAY, dirty at many pre-existing sites from line
  10113 on. A pre-existing red cannot gate this change, and running `cargo fmt --write` would bury
  the diff.
- `npx jest --selectProjects Meta` — not mandated: no `src/frontend` file is touched, and both
  `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json` were checked and contain no
  `src-tauri` or `src/backend` path. If it is run anyway, Meta has 5 KNOWN-PRE-EXISTING failures
  (4 from the `i18nForkTouchedFiles.json` 214-vs-215 drift, 1 from `hardcodedStringGate` flagging
  two CSS literals at `src/frontend/components/UI/Header/index.tsx:181`/`:188`, introduced by
  commit `20f7c2153`). Those are not this task's breakage and must not be absorbed into it.

OUTSTANDING BY CONSTRUCTION — live visual confirmation. The bar only exists inside a live macOS
login sheet injected into humblebundle.com's own document. Nothing at the desk renders it: every
automated check above asserts properties of a GENERATED STRING, never a pixel. A green run proves
the script says the right things, not that the operator saw one bar, that the origin was legible
and centred, that the glyph was clickable, or that 572 is the right width for Humble's form. That
confirmation needs `pnpm tauri:dev`, a real Humble sign-in, and the operator's eyes. Do not write
or accept any clause that implies otherwise.
</verification>

<success_criteria>
- One bar spans the sheet's top edge; the two corner pills are gone.
- The origin is centred in the bar and still re-texts on origin change through the untouched
  update-script path.
- A bare multiplication-sign glyph sits flush in the bar's right end, is clickable, and still
  reports the accessible name Cancel sign-in with `aria-keyshortcuts` Escape.
- No page content is pushed down; no body offset is injected.
- The visible Humble sheet opens 572 by 700; the pristine Epic window still opens 900 by 700.
- 81 `login_`-selected cargo tests pass; all five new ones were proven RED first.
- The three main.rs source-guard jest suites pass, including two new width guards each proven RED
  against a synthetic counter-source.
- `login_chrome_css_script` and `src/common/humble/loginChromeCss.ts` are untouched, so the
  byte-equality drift pin has not moved.
</success_criteria>

<output>
Create `.planning/quick/261003-nsk-humble-login-title-bar/261003-nsk-SUMMARY.md` when done.
Record in it: the two-scripts-not-merged decision and what it cost, the resolved palette chain,
the five new cargo tests with their observed RED output, and the outstanding live visual gate.
</output>
