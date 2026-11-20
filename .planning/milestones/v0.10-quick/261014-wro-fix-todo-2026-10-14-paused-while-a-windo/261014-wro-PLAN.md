---
phase: quick-261014-wro
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx
  - src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx
  - src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-REVIEW.md
  - .planning/todos/pending/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md
  - .planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md
  - .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha
autonomous: true
requirements:
  - 2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open
  - 50-UI-SPEC-E2

estimate:
  tokens: 35000
  raw_tokens: 35000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "`StoreEmbedPlaceholder` renders its message paragraph for EVERY call shape except exactly one.
      The single silent shape is `reason === 'epic-surface'` — the D-06 Epic-surface-only case, which
      is the only one where the sentence is false, because on that route the placeholder is the
      route's static backdrop and no window is open. `'suppressed'` and `'suppressed+epic-surface'`
      both have a window open, so the sentence is TRUE in both and both keep rendering it unchanged.
      `undefined` (the zero-argument call) keeps today's behaviour, so the component stays
      backwards-compatible and the three existing no-argument tests stay valid."
    - "Operator option 3, locked 2026-10-14, is what shipped — a text-free styled fill on the Epic
      surface. Options 1, 2 and 4 from the todo are NOT implemented and no new wording was invented."
    - "ZERO locale files change and the English string is byte-identical. The key
      `webview.embedPlaceholder.message` stays referenced by an unconditional `tGamelib(...)` call in
      the component, so `pnpm i18n` stays the no-op it was measured to be pre-edit, all 49 catalogues
      are untouched, and `meta/__tests__/genI18nGateScope.test.ts`'s scope artifact does not drift."
    - "No CSS change. `.WebView__embedPlaceholder` (`src/frontend/screens/WebView/index.css:97-104`)
      keeps `height/width: 100%` and `background: var(--background-secondary)`, so the Epic surface
      still shows a styled fill through the transparent subview (D-06) — just with no text in it.
      The root div, its className and the `data-placeholder-reason` attribute are all unchanged."
    - "Every existing assertion in `StoreEmbedPlaceholder.test.tsx` and every assertion in
      `StoreEmbedSlotContents.test.tsx` and `epicEmbedSurfaceContract.test.ts` stays green, with no
      edit to the latter two files. Scoped jest moves from a measured 3 suites / 27 tests to
      3 suites / 30 tests, all passing."
    - "The doc comments in BOTH touched components no longer assert the false thing. Every sentence
      claiming `reason` changes no pixel, adds no pixel, or is never rendered as visible text is
      rewritten — those sentences become FALSE under this change and leaving them would make the
      files lie about their own behaviour."
    - "`50-UI-SPEC.md`'s E2 and E6 rows state honestly that the Epic surface carries a text-free fill
      and that the string renders only for the D-19 suppression reason. The table is not
      restructured and every other row is byte-identical."
    - "The todo is in `.planning/todos/completed/` with a `## Resolution` section that states the
      live visual of the text-free fill on a Mac cold load is UNOBSERVED, and `pnpm planning-gates`
      still passes 12/12."
  artifacts:
    - path: "src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx"
      provides: "The one-value discriminator gating the message paragraph, plus rewritten doc
        comments that no longer claim the reason prop is invisible."
      contains: "epic-surface"
    - path: "src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx"
      provides: "Three added cases — the silent Epic-surface render, both suppression reasons still
        speaking, and a four-shape sweep pinning that EXACTLY ONE reason value suppresses the copy."
      contains: "epic-surface"
    - path: ".planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md"
      provides: "The closed todo with its `## Resolution` section."
      contains: "## Resolution"
  key_links:
    - "The arity test at `StoreEmbedPlaceholder.test.tsx:66-68` asserts
      `(StoreEmbedPlaceholder as unknown as () => void).length === 0`. That passes today ONLY because
      the signature is `({ reason }: Props = {}) =>` — a destructured parameter WITH a default does
      not count toward `Function.length`. Removing the `= {}` makes it 1 and reds a test this task
      must keep green. Do not touch the signature."
    - "The catalogue-equality test at `StoreEmbedPlaceholder.test.tsx:110-134` calls the component
      with NO reason and compares the rendered text to `public/locales/en/gamelib.json`. It is the
      ONLY thing in the repo tying the component's key and copy to the catalogue —
      `pnpm lint-translations:gamelib` cannot see a key that is spelled consistently wrong in both
      places. Keeping the `tGamelib(...)` call unconditional and byte-identical is what keeps that
      instrument alive."
    - "`StoreEmbedSlotContents.tsx:60-65` is the ONLY producer of the three reason strings, and the
      placeholder's discriminator must stay exactly in sync with the `'epic-surface'` literal
      emitted there. A rename on either side silently restores the defect. Pinned from both ends:
      `StoreEmbedSlotContents.test.tsx:89-91` on the producer, and the new four-shape sweep on the
      consumer."
    - "`meta/__tests__/genI18nGateScope.test.ts:261` lists this component in the i18n gate scope
      snapshot because it carries a string. The `tGamelib(...)` call must stay, or the file stops
      being string-carrying and the committed scope artifact rots."
---

<objective>
Close todo `2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open` by the
operator's locked choice, option 3: render no text on the Epic surface.

`StoreEmbedPlaceholder`'s sentence is correct for the D-19 suppression case it was written for and
simply false on macOS `/store/epic`, where `isEpicSurface` is statically true for the whole route
and the placeholder is the route's default backdrop. It is shown to users during every cold Epic
load while no window is open at all, and it already cost two debug cycles across two sessions, a
`severity: major` todo filed for a defect that does not exist, and a self-contradicting commit.

Purpose: make the component's visible copy agree with its own reason. The groundwork is already
done — `abbc84a71` threads a `reason` to this component — so this is a one-value discriminator, not
a copy rewrite. No new wording is invented and no locale file is touched.

Output: the gated paragraph with three added tests, rewritten doc comments in both components that
no longer claim the reason prop is invisible, amended 50-UI-SPEC E2/E6 rows, a discharge note on
50-REVIEW's open entry, and the todo moved to `completed/` with a `## Resolution`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` block or touching the todo.

**Codebase exploration rule (CLAUDE.md, mandatory):** `graphify-out/graph.json` exists. Run
`graphify query "<question>"` before grepping or reading raw source. Read raw files only afterwards,
to pin specific lines. Never read `graphify-out/GRAPH_REPORT.md` or `graph.json`.

**The operator's decision is locked.** Option 3 of the todo, chosen 2026-10-14 in session. Options 1
(conditional wording), 2 (reason-neutral wording) and 4 (accept it) are closed. Do not re-litigate
them in code, comments or the SUMMARY beyond recording which one was taken.

**Every line number below was verified live at planning time (2026-10-14).** Re-grep before editing;
if a number has drifted, trust the symbol name over the number.

| What | Where |
|---|---|
| `Props` interface / the `reason?: string` field | `StoreEmbedPlaceholder.tsx:3-20` / `:19` |
| Props doc comment (claims "never rendered as visible text") | `:4-18`, the false clause at `:14-17` |
| Component doc comment (claims the prop "is optional, diagnostic-only and invisible") | `:22-50`, the false clause at `:35-38` |
| Component signature (the `= {}` default is load-bearing) | `:51` |
| `tGamelib(...)` call — key and default copy | `:54-57` |
| The return: root div / the message `<p>` | `:59-63` / `:60` / `:61` |
| `StoreEmbedSlotContents` doc comment (claims "it changes no pixel") | `StoreEmbedSlotContents.tsx:33-38`, the false clause at `:36-38` |
| The one call site — reason computed / passed | `:59-66` / `:60-65` / `:66` |
| Existing placeholder tests to keep green | `StoreEmbedPlaceholder.test.tsx` — `:57` className, `:66` arity, `:75` attribute forwarded, `:87` attribute omitted, `:95` one short line / no button, `:110` catalogue equality, `:136` absent from translation.json |
| `collectText` helper / `MINTED_KEY` | `:37-52` / `:54` |
| Slot-contents tests (NO edit — confirm green) | `StoreEmbedSlotContents.test.tsx:59-98` |
| Source-shape contract test (NO edit — confirm green) | `epicEmbedSurfaceContract.test.ts:235-254` |
| `.WebView__embedPlaceholder` fill / `-message` rule (NO edit) | `src/frontend/screens/WebView/index.css:97-104` / `:106-110` |
| 50-UI-SPEC E2 overflow / E2 long-text | `50-UI-SPEC.md:148` / `:149` |
| 50-UI-SPEC E6 empty / E6 loading | `:160` / `:161` |
| 50-REVIEW open entry — bullet, its blockquote, stale `pending/` citation | `50-REVIEW.md:103-127`, citation at `:124`, next bullet begins `:128` |

**Facts measured at planning time — do not re-derive:**

- Scoped jest baseline, exact command, from the checkout root:
  `npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx src/frontend/screens/WebView/components/__tests__/StoreEmbedSlotContents.test.tsx src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts`
  → **3 suites passed, 27 tests passed, 0 failed, 0.5 s.** `jest.config.js` uses unnamed
  `projects` paths, so `--selectProjects frontend` finds nothing — scope by test path, as above.
- `pnpm codecheck` → exit 0, ~7 s. `pnpm lint` → exit 0, `production: PASS | tests: PASS`, ~8 s.
- **The lint ceilings carry ZERO padding** (`meta/lintScoped.cjs:58-59`): `SRC_CEILING = 1124`,
  `TESTS_CEILING = 638`, and the tests scope sits at exactly 638 of 638 today. One new warning in
  either scope reds `pnpm lint`. Fix the new code; never raise a ceiling.
- `pnpm i18n` is currently a **no-op** — run on this tree it reported `Added keys: 0`,
  `Restored keys: 0`, `Unreferenced keys: 0` and left the working tree clean.
- `pnpm planning-gates` → **12/12 passed**.
- `npx prettier --file-info`, per `Skill("gamelib-conventions")`, run on every path this plan writes:
  - `StoreEmbedPlaceholder.tsx`, `StoreEmbedSlotContents.tsx`, `StoreEmbedPlaceholder.test.tsx` →
    `{ "ignored": false, "inferredParser": "typescript" }` — these three MUST be `--check`ed.
  - `50-UI-SPEC.md`, `50-REVIEW.md`, the todo → `{ "ignored": true, "inferredParser": null }`
    (`.prettierignore:29` is a bare `.planning`) — a `--check` there is vacuous and is stated and
    omitted, not carried.
  - `--file-info` accepts **one path at a time**; multiple paths exit with
    `Cannot use --file-info with multiple files`.
- The todo cites `StoreEmbedSlotContents.tsx:52` for the `suppressed || isEpicSurface` branch. That
  line number is stale — the branch is at **`:59`** at HEAD. The todo's reasoning is unaffected.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Gate the placeholder's copy on one reason value, with the discriminator pinned from both ends</name>
  <files>src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx, src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx, src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx, .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha</files>
  <behavior>
    Three cases added to `StoreEmbedPlaceholder.test.tsx`'s existing `describe` block, written FIRST
    and watched RED against the current component before any source edit. Name them in the
    full-sentence style the file already uses, and follow the file's established cast-and-invoke
    pattern (`as unknown as (props: { reason?: string }) => AnyReactElement`) rather than introducing
    a renderer.

    1. **The Epic surface alone renders the fill with no copy.** Called with
       `{ reason: 'epic-surface' }`: `props.className` is still `'WebView__embedPlaceholder'`,
       `props['data-placeholder-reason']` is still `'epic-surface'`, `collectText(element)` is the
       empty string, and `JSON.stringify(element)` does not contain the message paragraph's
       className. Three of those four assertions are the no-regression half — the styled fill and
       the diagnostic attribute must survive intact; only the text goes.

    2. **Both suppression reasons still speak.** Called with `{ reason: 'suppressed' }` and with
       `{ reason: 'suppressed+epic-surface' }`: `collectText(element)` is non-empty in both. A
       window IS open in both cases, so the sentence is true and must not be touched.

    3. **Exactly one reason value suppresses the copy.** Sweep all four call shapes —
       `undefined`, `'suppressed'`, `'epic-surface'`, `'suppressed+epic-surface'` — filter to the
       ones whose `collectText` is empty, and assert that filtered list equals exactly
       `['epic-surface']`. This is the discriminator pin and the case that fails loudest if a future
       edit widens or narrows the gate: a blanket suppression returns four, reverting returns zero,
       and only the intended behaviour returns that one value.

    Watch case 1 and case 3 fail before implementing. Case 2 is expected to pass pre-edit (it
    describes today's behaviour) and must still pass post-edit — that is its whole job.
  </behavior>
  <action>
    **Before any edit**, record the pre-edit tree so the no-change gates below have a real range to
    measure against (the in-repo precedent is quick task `261012-gn8`'s `BASE.sha`):
    `git rev-parse HEAD > .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha`.
    An unranged diff reads clean once a change is committed, so every "unchanged" criterion in this
    plan is pinned to this SHA rather than to `HEAD` or to the bare working tree.

    Then run `graphify query "StoreEmbedPlaceholder message paragraph and its reason prop"`, and
    re-grep the symbols in the context table to confirm line numbers before editing.

    **A. `StoreEmbedPlaceholder.test.tsx`** — add the three cases from `<behavior>` inside the
    existing `describe` block. Reuse the file's existing `collectText` helper (`:37-52`) and
    `AnyReactElement` type (`:31-35`) as-is; do not add a dependency and do not widen the type. Edit
    no existing assertion. Carry a short comment above the new cases naming the operator decision
    (option 3 of the todo, 2026-10-14) and the one-sentence reason the gate is a single value: the
    sentence is false only where no window is open.

    **B. `StoreEmbedPlaceholder.tsx`** — the behavioural change is one conditional.

    Gate the message `<p>` (`:61`) on the reason NOT being the Epic-surface-only value. Everything
    else in the return stays byte-identical: the root div, `className="WebView__embedPlaceholder"`,
    and `data-placeholder-reason={reason}` (`:60`). Express the gate against the exact string
    `'epic-surface'` — strict equality on that one value, so `undefined`, `'suppressed'` and
    `'suppressed+epic-surface'` all keep rendering the paragraph. Prefer a named boolean over an
    inline comparison inside JSX so the intent is greppable.

    Four hard constraints, each of which reds an existing gate if broken:
    - **Keep the signature at `:51` exactly as it is**, `({ reason }: Props = {}) =>`. The `= {}`
      default is why `Function.length` is 0 and why the arity test at `:66-68` passes. Do not remove
      it, do not add a parameter.
    - **Keep the `tGamelib(...)` call at `:54-57` unconditional and byte-identical** — same key,
      same default copy, same position above the return. It is what keeps the key referenced for the
      i18n parser and the gate-scope artifact, and the catalogue-equality test at `:110-134` renders
      with no reason and compares that exact text against `gamelib.json`.
    - **No locale file may change.** No key is minted, renamed, removed or re-worded. The English
      stays as it is; this change is about WHERE it renders, not WHAT it says.
    - **No CSS change.** `.WebView__embedPlaceholder` already fills the slot with
      `background: var(--background-secondary)` at `index.css:97-104`, which is exactly the text-free
      styled fill option 3 asks for. `.WebView__embedPlaceholder-message` at `:106-110` stays too —
      the suppression case still uses it.

    **C. Doc comments in both components — rewrite the sentences that this change makes false.**
    They are read as specification in this module and leaving them would make both files assert the
    opposite of their own behaviour:

    - `StoreEmbedPlaceholder.tsx:14-17` currently says the reason is "Dev/live-gate inspection only
      ... never rendered as visible text, so it adds no pixel and no interactive control, and does
      not reopen the 'props-less and button-less by design' intent". The attribute itself is still
      inspection-only, but the prop now DOES change what renders. Rewrite to state that the
      attribute remains diagnostic while the value additionally gates the visible copy, name the one
      gating value, and keep the still-true half: no interactive control is added, so the button-less
      intent is untouched.
    - `StoreEmbedPlaceholder.tsx:35-38` currently says the prop "is optional, diagnostic-only and
      invisible -- calling it with zero arguments still works and still renders identically, so this
      stays props-less in every way that matters". The zero-argument half is still true and should
      stay, explicitly; the "invisible" and "renders identically" claims are not and must go.
    - `StoreEmbedPlaceholder.tsx:22-29` describes the component as D-19's slot filler whose point is
      that an empty hole reads as a glitch. Add that on the Epic surface (D-06) the fill exists to be
      seen THROUGH a transparent subview rather than read, which is why the copy is withheld there,
      and that the styled fill itself is unchanged so the slot is never actually an empty hole.
    - `StoreEmbedSlotContents.tsx:36-38` currently ends "it changes no pixel". Rewrite that clause:
      the reason is still the anti-conflation diagnostic, and it now also decides whether the copy
      renders. The explanation of WHY the two triggers were conflatable (`:33-36`) is still accurate
      and should be kept — note that this change is what stops the two cases looking identical to a
      human reader, not just to an inspector. Leave `:25-27` alone; "shows through the transparent
      subview until Epic paints" stays true of a text-free fill.

    Record the operator decision inline once, where the gate lives, with its date — a future reader
    must be able to see that withholding the copy was chosen rather than overlooked.

    **Do not** edit `StoreEmbedSlotContents.test.tsx`, `epicEmbedSurfaceContract.test.ts`,
    `meta/__tests__/genI18nGateScope.test.ts`, `index.css`, or any file under `public/locales/`.
    Those four are confirmed green, not changed.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx src/frontend/screens/WebView/components/__tests__/StoreEmbedSlotContents.test.tsx src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
    <automated>pnpm i18n >/dev/null 2>&1 && test -z "$(git status --porcelain -- public/locales)"</automated>
    <automated>BASE=$(cat .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha) && git diff --exit-code "$BASE" -- public/locales src/frontend/screens/WebView/index.css</automated>
    <automated>grep -v -E '^\s*(\*|//|/\*)' src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx | grep -cF "'epic-surface'"</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx</automated>
  </verify>
  <done>
    Scoped jest reports **3 suites passed, 30 tests passed, 0 failed** (baseline measured pre-edit:
    3 / 27 / 0). All 27 original assertions are untouched and still green, and
    `StoreEmbedSlotContents.test.tsx` and `epicEmbedSurfaceContract.test.ts` are green with zero
    diff. Cases 1 and 3 were observed RED before the source edit — state both pre-edit failures in
    the SUMMARY, since a test that was never red proves nothing about the gate it guards.

    `pnpm codecheck` exits 0. `pnpm lint` exits 0 with `production: PASS | tests: PASS` — the tests
    scope has zero headroom at 638, so any new warning must be fixed in the new code, never absorbed
    by a ceiling bump.

    `pnpm i18n` leaves the `public/locales` **working tree** clean, i.e. the parser is still the
    no-op it was pre-edit, and the `BASE.sha`-ranged diff shows zero **committed** change to
    `public/locales` or `index.css`. Both halves are needed: the first catches a parser rewrite in
    the worktree, the second catches an edit that was already committed and would read clean under
    an unranged check.

    The comment-filtered `grep -cF` returns **1**: the gating literal appears exactly once in
    non-comment code. The comment filter is deliberate — the doc comments rewritten in part C name
    that value in prose, and an unfiltered count would be inflated by this task's own documentation.
    A 0 means the gate was expressed some other way and the discriminator is no longer greppable;
    a 2 or more means a second comparison site was introduced where the sweep test only pins one.

    `npx prettier --check` passes over the three `.tsx` paths written here — all three measured
    `{ "ignored": false, "inferredParser": "typescript" }` at planning time, so this check is real,
    not vacuous.
  </done>
</task>

<task type="auto">
  <name>Task 2: Amend 50-UI-SPEC E2/E6, discharge the 50-REVIEW entry, and close the todo</name>
  <files>.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md, .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-REVIEW.md, .planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md</files>
  <action>
    Read Task 1's commit short hash with `git log -1 --format=%h` before writing anything here. Both
    docs edits cite it. Do not write a placeholder token for it.

    **A. `50-UI-SPEC.md` — four rows, amended minimally and honestly. Do not restructure the table;
    every other row stays byte-identical.**

    - **E2 overflow (`:148`)** currently says the placeholder "centres one existing short string
      (`webview.embedPlaceholder.message`), wrapping within the slot. Now visible *through* the
      transparent subview (D-06)." Both halves of that are now conditional. State that the slot-rect
      fill and the centring are unchanged, that the string is centred and wraps only for the D-19
      suppression reason, and that on the Epic surface (D-06) the fill carries no text at all — so on
      that surface there is nothing to overflow.
    - **E2 long-text (`:149`)** currently says "Existing, already-translated key; wraps inside the
      slot. No new text on this surface." The last sentence is now literally satisfied rather than
      merely respected — say so: no text at all renders on the Epic surface, so the long-text
      criterion applies only to the suppression case, where the existing already-translated key
      wraps inside the slot exactly as before. E2's original no-new-text constraint is honoured, not
      excepted.
    - **E6 empty (`:160`)** currently says the transparent subview means "the placeholder (E2) is
      what the user sees; GameLib adds no empty-state copy." Keep the second clause — it is now
      stronger, not weaker — and correct the first: what the user sees is the placeholder's styled
      fill with no copy in it.
    - **E6 loading (`:161`)** currently says "Placeholder through the transparent subview until first
      paint". Make it "the placeholder's text-free fill". Leave the 45 s banner clause and the
      occlusion clause byte-identical — neither is affected.

    Then add ONE dated line immediately below the table (not inside it, and not a new table row)
    recording that this was decided as option 3 of the todo on 2026-10-14, that it is a copy
    withholding and not a copy change, and that no locale file moved. Cite Task 1's commit hash.

    **B. `50-REVIEW.md` — discharge the open entry, in place.**

    The `## Open, not fixed here` bullet at `:103-127` is the one about this copy. Its blockquote runs
    to `:127` and the next bullet starts at `:128`. Append the discharge as continuation lines of that
    same blockquote (a `  >` separator line, then the note) so the bullet list structure is not
    broken and the entry stays one bullet. Do NOT delete or rewrite the existing entry or its
    2026-10-14 cost record — the file's own closing lesson is that an entry without a stated cost
    gets skipped, and that record is the evidence for it.

    The note states: closed by quick task `261014-wro` as option 3, Task 1's commit short hash, the
    one-line mechanism (the copy is withheld for the Epic-surface-only reason, kept for suppression),
    and that UI-SPEC E2's no-new-text constraint was honoured rather than excepted — which is the
    specific objection this entry raised against fixing it.

    Also correct the stale citation at `:124`: it points at the todo under
    `.planning/todos/pending/`, and part C moves the file. Repoint it at the `completed/` path. The
    filename itself does not change.

    Leave the identical citations in `.planning/debug/resolved/embed-suppression-sticks.md:31` and
    `.planning/todos/completed/2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md`
    alone — out of this task's scope. Record them as an open observation in the SUMMARY so the
    staleness is written down rather than discovered later.

    **C. Move and close the todo.**

    `git mv` it from `.planning/todos/pending/` to `.planning/todos/completed/`, keeping the filename
    byte-identical so every citation that already names it keeps resolving. Use `git mv`, not a
    copy-and-delete, so the rename is visible as an `R` in `git status`.

    Append a `## Resolution` section. Match the surrounding corpus in `completed/` for heading depth
    and register. It must state:
    - Option 3 was chosen by the operator on 2026-10-14, in session, and that options 1, 2 and 4
      are closed. Name what option 3 is: render no text on the Epic surface, a text-free styled fill.
    - What changed: the message paragraph is gated on the reason, withheld for the Epic-surface-only
      value and kept for both suppression values. Cite Task 1's commit short hash and the three
      added tests.
    - What did NOT change, explicitly: no locale file, no English wording, no new key, no CSS, no
      change to the root div, its className or the `data-placeholder-reason` attribute, and no change
      to the suppression case's behaviour.
    - **What is unobserved:** nobody has seen the text-free fill on a real Mac cold load. The visual
      question option 3's own text raises — whether a blank area during a long cold load reads as
      broken — is unanswered, and the jest cases prove only that no text renders, not how that looks.
      State this plainly rather than implying the fix is live-verified. Whether it is worth a live
      gate of its own is the operator's call; do not file a live-gate todo unilaterally.
    - That the `ready: human` classification was correct: this needed a decision, and the decision
      is what unblocked it.

    The three triage keys (`severity`/`platform`/`ready`) stay as they are. Per
    `Skill("gamelib-conventions")` the frontmatter gate scopes to `pending/` only and `completed/` is
    deliberately exempt, so no frontmatter edit is needed — and none should be invented.

    **Do not** edit `.planning/ROADMAP.md` or `.planning/STATE.md`. **Do not** edit `50-UAT.md` — no
    UAT item is being re-scored here, and nothing in this change makes an existing `result:` wrong.
  </action>
  <verify>
    <automated>pnpm planning-gates</automated>
    <automated>test -f .planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md && test ! -e .planning/todos/pending/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md</automated>
    <automated>grep -c '^## Resolution' .planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md</automated>
    <automated>grep -cF '261014-wro' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-REVIEW.md</automated>
    <automated>grep -cF '261014-wro' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md</automated>
    <automated>grep -cF 'todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-REVIEW.md</automated>
    <automated>BASE=$(cat .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha) && git diff --exit-code "$BASE" -- .planning/ROADMAP.md .planning/STATE.md .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md</automated>
    <automated>BASE=$(cat .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha) && RENAMED=$(git diff --find-renames --diff-filter=R --name-only "$BASE" -- .planning/todos) && printf '%s' "$RENAMED" | grep -q 'paused-while-a-window-is-open'</automated>
    <human-check>
      FORMATTER CHECK — deliberately omitted, with the measurement that justifies it.
      `npx prettier --file-info` was run on every path this task writes, one at a time, at planning
      time (`--file-info` rejects multiple paths):
        .planning/phases/50-.../50-UI-SPEC.md -> { "ignored": true, "inferredParser": null }
        .planning/phases/50-.../50-REVIEW.md  -> { "ignored": true, "inferredParser": null }
        the todo (pending path, same tree)    -> { "ignored": true, "inferredParser": null }
      All three are ignored via `.prettierignore:29`, a bare `.planning`, and match nothing. Per
      `Skill("gamelib-conventions")` a `--check` over an ignored path is vacuous and is stated and
      omitted rather than carried as a green that proves nothing. Nothing mechanical keeps these
      files formatted: consistency comes from hand-matching the wrap, indentation and table shape
      already in the file being edited. Task 1's `<verify>` carries the real formatter check, over
      the three `.tsx` paths that prettier does see.
    </human-check>
    <human-check>
      Read the four amended UI-SPEC rows back in the rendered table and confirm the pipe count and
      column alignment are intact, and that no row other than `:148`, `:149`, `:160`, `:161` moved.
      `git diff --stat "$(cat .planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/BASE.sha)" -- .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md`
      should show a small, four-row-plus-one-note change — a large churn count means the table was
      reflowed, which this task forbids. Ranged against `BASE.sha` so it reads the same before and
      after this task's commit.
    </human-check>
  </verify>
  <done>
    `pnpm planning-gates` passes at **12/12** (baseline measured pre-edit: 12/12).

    The todo exists under `completed/`, does not exist under `pending/`, carries exactly one
    `## Resolution` heading, and `git diff --find-renames --diff-filter=R` against `BASE.sha` names
    it — i.e. the move is recorded as a rename, not as an add-plus-delete. The rename gate is ranged
    against `BASE.sha` deliberately: `git status` goes clean the moment the move is committed, so a
    worktree-based check would read as a failure for the wrong reason once the task commits.

    `261014-wro` appears at least once in `50-REVIEW.md` and at least once in `50-UI-SPEC.md` —
    checked as two separate `grep -cF` calls, because `grep -c` over two files exits 0 if EITHER
    matches and would pass with a zero in one of them. The `completed/` todo path appears in
    `50-REVIEW.md`, i.e. the stale `pending/` citation at `:124` was repointed rather than left to
    rot the moment the file moved.

    `ROADMAP.md`, `STATE.md` and `50-UAT.md` have zero diff against `BASE.sha`. Measured at task
    time, before hand-back — the orchestrator's own closeout row in `STATE.md` comes after this and
    is not this gate's business.

    The 50-REVIEW entry's original text and its 2026-10-14 cost record are intact — the discharge is
    appended, not substituted. Verify by eye that the bullet list structure still parses: the
    appended lines are blockquote continuations of the same bullet, and `:128`'s
    "A cross-surface re-open" bullet still begins at column 0.

    The `## Resolution` names the unobserved live visual explicitly. The SUMMARY records the two
    stale `pending/` citations left out of scope (`embed-suppression-sticks.md:31` and the completed
    suppression todo) as open observations.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `StoreEmbedSlotContents` -> `StoreEmbedPlaceholder` | The `reason` value crosses here and now decides what renders, not merely what an inspector can read. Both sides are first-party renderer code; no remote content reaches this prop. |
| The placeholder's rendered DOM -> the operator's eye during a live gate | What this surface says is read as evidence about app state. A false sentence here has already corrupted three artifacts, so the copy is an instrument, not decoration. |
| `public/locales/**` -> all 49 shipped catalogues | A key or English change fans out to 49 files and a translation debt. This plan's whole shape is chosen to avoid crossing this boundary. |

## STRIDE Threat Register

Threat IDs are this quick task's own series; the phase-50 `T-50-NN` series is untouched.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261014-wro-01 | Repudiation | the placeholder's visible copy as a diagnostic signal | medium | mitigate | This defect's measured cost was epistemic: a false sentence let a route default be read as an active suppression refcount across two sessions, produced a `severity: major` todo for a non-existent defect, and shipped a self-contradicting commit. Withholding the copy where it is false removes the misleading signal at its source. The `data-placeholder-reason` attribute (`abbc84a71`) is retained unchanged as the honest signal, asserted by the existing test at `StoreEmbedPlaceholder.test.tsx:75` plus the new Epic-surface case. Task 2 writes the decision and its date into 50-UI-SPEC, 50-REVIEW and the todo so a future reader cannot mistake the blank fill for an unfinished surface. |
| T-261014-wro-02 | Tampering | the `webview.embedPlaceholder.message` key and its 49 catalogues | medium | mitigate | A careless edit here silently rewords, renames or orphans a string in 49 files, and `pnpm lint-translations:gamelib` cannot see a key spelled consistently wrong in both the component and the catalogue. Mitigated structurally: Task 1 forbids any locale edit, requires the `tGamelib(...)` call to stay unconditional and byte-identical, and is gated by three independent instruments — the catalogue-equality test at `:110-134`, a `pnpm i18n` run that must leave `public/locales` clean, and `pnpm lint` at its zero-headroom ceilings. |
| T-261014-wro-03 | Denial of Service | the Epic store surface during a long cold load | low | accept | A text-free fill during a 10-40 s cold load may read as broken — option 3's own stated downside, which the operator accepted in choosing it. The styled fill is retained unchanged (`index.css:97-104`), so the slot is never a transparent hole, and the D-07 timeout banner still appears at 45 s to explain a genuinely stuck load. Accepted and recorded: the todo's `## Resolution` states that this visual is UNOBSERVED on hardware, so the acceptance is visible rather than implied. |
| T-261014-wro-SC | Tampering | npm/pip/cargo installs | high | mitigate | **No package is installed, added or upgraded.** Every symbol this plan touches is already in the tree: `react-i18next` for the existing `useTranslation`, and the test file's own `collectText` helper and `AnyReactElement` type for the new cases. Task 1 forbids adding a dependency; no `package.json`, `pnpm-lock.yaml` or `Cargo.toml` path appears in `files_modified`, so the package-legitimacy gate has nothing to audit. |

**API Coverage** (`workflow.api_coverage_gate`): no external API is integrated by this plan. Nothing
leaves the process; the change is a render-time conditional in one renderer component. No
`COVERAGE.md` is written, and if the detector fires it fires on the pre-existing Epic/Steam surface
vocabulary in the surrounding files, not on anything this plan adds.

**Assumption-Delta** (`workflow.assumption_delta`): skipped — quick task, no ROADMAP phase section.

**Schema Push Detection** (`workflow.schema_push_detection`): skipped — no ORM schema file is touched.
</threat_model>

<verification>
From the checkout root:

1. `npx jest` over the three scoped test paths — **3 suites, 30 tests, 0 failed** (baseline 3 / 27 / 0).
2. `pnpm codecheck` — exit 0.
3. `pnpm lint` — exit 0, `production: PASS | tests: PASS`, no ceiling raised.
4. `pnpm i18n` then `git status --porcelain -- public/locales` — empty worktree change. All 49
   catalogues byte-identical; the parser is the no-op it was measured to be pre-edit.
5. `git diff --exit-code "$(cat <quick-dir>/BASE.sha)" -- public/locales
   src/frontend/screens/WebView/index.css` — no committed diff either. Every "unchanged" criterion
   in this plan is ranged against `BASE.sha` and never left unranged, because an unranged check
   reads clean once a change lands in a commit.
6. `npx prettier --check` over the three `.tsx` paths written — passes. The `.planning` paths are
   ignored; stated and omitted per `Skill("gamelib-conventions")`.
7. `pnpm planning-gates` — 12/12.
8. `git diff --exit-code "$(cat <quick-dir>/BASE.sha)" -- .planning/ROADMAP.md .planning/STATE.md
   .../50-UAT.md` — no diff.
9. Envelope hygiene — grep every file written for stray closing-tag text before committing, per the
   standing planner/executor leak lesson. The tags to look for are the harness envelope's closing
   forms; `.planning/planning-envelope-tag-gate.py` in `pnpm planning-gates` is the backstop and it
   reads the git index, so stage before trusting it.

**Not verifiable off-hardware, and not claimed:** that the text-free fill looks acceptable on a real
Mac cold load. No live gate is run by this plan. The jest cases prove that no text renders; they say
nothing about how an empty styled area reads during a 10-40 s load. The todo's `## Resolution`
records this as unobserved.
</verification>

<success_criteria>
- `StoreEmbedPlaceholder` renders its message paragraph for `undefined`, `'suppressed'` and
  `'suppressed+epic-surface'`, and withholds it for `'epic-surface'` alone — pinned by a four-shape
  sweep asserting exactly one silent value.
- The root div, its className, the `data-placeholder-reason` attribute, the component signature's
  `= {}` default, the `tGamelib(...)` call, and all of `index.css` are unchanged.
- Zero locale files changed; English byte-identical; `pnpm i18n` still a no-op.
- All 27 pre-existing assertions across the three scoped test files stay green, with zero diff to
  `StoreEmbedSlotContents.test.tsx` and `epicEmbedSurfaceContract.test.ts`.
- Cases 1 and 3 were observed RED pre-edit, and the SUMMARY says so.
- Every doc-comment sentence claiming the reason prop is invisible or changes no pixel is rewritten,
  in both components.
- 50-UI-SPEC E2 (`:148`, `:149`) and E6 (`:160`, `:161`) state the text-free Epic fill honestly, the
  table is not restructured, and one dated note records option 3 with Task 1's commit hash.
- 50-REVIEW's open entry carries an appended discharge citing `261014-wro` and the commit hash, its
  original text and cost record intact, and its stale `pending/` citation repointed at `completed/`.
- The todo is in `completed/` via `git mv` with a `## Resolution` that names the decision, what did
  not change, and the unobserved live visual.
- `ROADMAP.md`, `STATE.md` and `50-UAT.md` untouched.
</success_criteria>

<output>
Create `.planning/quick/261014-wro-fix-todo-2026-10-14-paused-while-a-windo/261014-wro-SUMMARY.md` when done.

Record as open observations: (a) the text-free fill on a Mac cold load is unobserved, and whether it
reads as broken during a 10-40 s load is the operator's call to gate or accept; (b) two stale
`todos/pending/` citations were left out of scope —
`.planning/debug/resolved/embed-suppression-sticks.md:31` and
`.planning/todos/completed/2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md`;
(c) the todo's own `StoreEmbedSlotContents.tsx:52` citation was already stale at planning time (the
branch is at `:59`), which is a small instance of the line-number rot this repo keeps paying for.
</output>
