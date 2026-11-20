---
phase: 260929-qth
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [CR-40-01, CR-40-02]
files_modified:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
  - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md
  - .planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md

must_haves:
  truths:
    - "A start-URL change to a KNOWN-but-NOT-embeddable store origin (Epic, D-05) calls storeEmbedHide() and issues no storeEmbedNavigate — the background page load behind WebviewUnavailablePanel stops."
    - "A start-URL change to the /wiki route's github.com URL still navigates the embed and does not hide it — the wiki is not a store and must not be caught by the guard."
    - "Returning from a non-embeddable target to an embeddable one re-shows the embed, but never while suppression is active (D-19/D-20)."
    - "A slot that first appears on a LATER render (cold start on /store/epic, then /store/gog) opens the embed exactly once, with the URL current at that moment."
    - "A same-store start-URL change creates no second ResizeObserver and re-registers no window listeners — the observer identity that plan 40-11's live gate protects survives."
    - "An open that lands after a start-URL change is not followed by a redundant storeEmbedNavigate to the URL just opened."
  artifacts:
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
    - .planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
  key_links:
    - "index.tsx callback ref -> setSlotPresent(true) -> useStoreEmbedHost({ slotPresent }) -> open/bounds effect deps [slotPresent]"
    - "useStoreEmbedHost -> resolveStoreForUrl + isEmbeddableOrigin (storeEmbedOrigins.ts) — first production call site of isEmbeddableOrigin"
    - "flush() open branch -> previousUrlRef seed -> start-URL effect's equality check (suppresses the redundant navigate)"
---

<objective>
Close phase 40's CR-01 and CR-02 in the store embed host.

CR-01: the start-URL sync effect (`useStoreEmbedHost.ts:314-327`) compares only the URL string, so a
GOG -> Epic route switch loads `https://www.epicgames.com/store/en-US/` into the live native child
webview behind `WebviewUnavailablePanel`. That child webview inherits the injected globals that are
the root-caused Talon fingerprint — the exact load D-05 exists to prevent.

CR-02: the open/bounds effect (`:208-309`) is mount-once with `[]` deps and early-returns on a null
slot. Cold-starting on `/store/epic` (whose early return at `index.tsx:472` means the slot div never
renders) then navigating to `/store/gog` leaves the embed permanently unopened for that mount,
because a param-only route change does not remount the component.

Purpose: stop an unintended cross-origin page load, and make the embed recoverable when its slot
arrives late.
Output: two guarded effects, a one-way slot-presence latch, six new regression tests each proven
non-vacuous by an observed red control, and the review bookkeeping CONTEXT.md requires.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/260929-qth-fix-phase-40-cr-01-cr-02-in-the-store-em/260929-qth-CONTEXT.md
@src/frontend/screens/WebView/useStoreEmbedHost.ts
@src/frontend/screens/WebView/storeEmbedOrigins.ts
@src/frontend/screens/WebView/index.tsx
@src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
</context>

<measured_at_planning_time>
Everything below was MEASURED on 2026-09-29 at HEAD (`fix-40-cr01-cr02-store-embed-remount`), not
inferred. Treat it as edit authority; re-derive nothing.

1. **`isEmbeddableOrigin(wikiURL)` is `false`.** Run against the real module with
   `node --experimental-strip-types`:
   `{"url":"https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki","resolvedKey":null,"embeddable":null,"isEmbeddableOrigin":false}`.
   `github.com` matches no `apexHosts` entry in `STORE_EMBED_ORIGINS`, so `resolveStoreForUrl`
   returns `null` and `isEmbeddableOrigin` returns `false`. Epic returns
   `{"resolvedKey":"epic","embeddable":false,"isEmbeddableOrigin":false}`; gog/steam/amazon all
   return `true`.

2. **The `/wiki` route reaches the live embed.** `App.tsx:253` registers `path: 'wiki'` against the
   same lazy `screens/WebView` component. `index.tsx` has NO `/wiki` early return: `store` is
   `undefined` so the `store === 'epic'` gate at `:468` is false, and on darwin it falls through to
   the embed render at `:481`. `urls['/wiki']` is the github wiki URL (`:148-149`, `:160`) and
   `storeKey` resolves to the literal `wiki` (`:261`).

   **Consequence — this is the plan's pivotal correction.** CONTEXT.md's locked decision says "Gate
   the effect on `isEmbeddableOrigin(startUrl)`". Implemented literally, that predicate is `false`
   for the wiki and would hide the embed instead of navigating it, removing a shipped route's
   entire function. The decision's stated purpose is Epic and D-05 — its rationale paragraphs name
   no route but Epic — so this plan implements the decision's INTENT with a predicate narrowed to
   "known store that this app deliberately does not embed", and pins the correction with a test.
   Task 3 records the deviation in the SUMMARY.

3. **React 18.3.1 / @types/react 18.3.21.** `RefObject<T>.current` is `readonly`, so
   `useRef<HTMLDivElement>(null)` cannot be assigned through. `useRef<HTMLDivElement | null>(null)`
   yields `MutableRefObject<HTMLDivElement | null>`, which IS assignable to the hook's existing
   `RefObject<HTMLDivElement>` option. Probed with `tsc --strict`: 0 errors attributable to the
   probe file.

4. **Baseline test counts.** `npx jest --selectProjects Frontend --testPathPattern 'screens/WebView'`
   -> 14 suites passed, 280 tests passed, 0 failed.

5. **Prettier visibility.** All three source paths report
   `{ "ignored": false, "inferredParser": "typescript" }`. `.planning/STATE.md` reports
   `{ "ignored": true, "inferredParser": null }` — the `.planning/` writes in Task 3 are
   formatter-vacuous and the check is deliberately omitted there.

6. **`storeEmbedSingleOpener.test.ts` asserts `useStoreEmbedHost.ts` is the SOLE file calling the
   open channel**, after comment stripping. No task here adds that call anywhere else.

7. **Structural source-text gates read `index.tsx`:** `WebviewUnavailablePanel.test.tsx:330-528`
   (anchors on the FIRST literal occurrence of `isLoginPathname(pathname)`),
   `WebViewDeepLinkAndRestore.test.ts`, `WebViewAdtractionGapDeclared.test.ts`,
   `WebViewAmazonLoginDataSpawn.test.ts`, `WebViewOAuthNavigation.test.ts`. The Task 2 edit must
   not introduce an earlier occurrence of that anchor literal and must leave the deep-link,
   restore, adtraction and nile regions byte-identical.

8. **`index.tsx:1` already imports `useCallback`, `useContext`, `useEffect`, `useRef`, `useState`**
   and `index.tsx:24` already imports `resolveStoreForUrl`. No new import line is needed there.

9. **Test harness shape** (`useStoreEmbedHost.test.tsx`): a hand-rolled `react` mock, no jsdom.
   `mount()` resets slots; `reinvoke()` re-invokes with new options so dep changes fire.
   `MountOptions` fields other than `slotRef` are optional with defaults applied in `invoke()`
   (`:265-270`). `MockResizeObserver.instances` is a live array — a re-attached observer appends a
   new instance, which is how "the observer was not torn down" is asserted. `disconnect()` is a
   no-op by design; listener teardown is observed through the `windowListeners` map instead.
   `mockApi` already stubs every channel this plan touches, including `storeEmbedHide` and
   `storeEmbedShow`.
</measured_at_planning_time>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: CR-01 — refuse to navigate a known-non-embeddable start URL, and restore visibility on the way back</name>
  <files>src/frontend/screens/WebView/useStoreEmbedHost.ts, src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</files>

  <read_first>
Read `useStoreEmbedHost.ts:311-349` (the start-URL effect and the suppression effect immediately
below it) and `storeEmbedOrigins.ts:100-128` before editing. Read `useStoreEmbedHost.test.tsx:284-332`
for the `mount`/`reinvoke`/`okStatus` harness conventions and the "Observed-red mutation" comment
style this file uses above every test.
  </read_first>

  <behavior>
    - A start-URL change to `https://www.epicgames.com/store/en-US/` calls `storeEmbedHide` exactly
      once and `storeEmbedNavigate` zero times.
    - A start-URL change to `https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki`
      calls `storeEmbedNavigate` with that URL and `storeEmbedHide` zero times.
    - A change away from Epic back to `https://af.gog.com?as=1838482841` calls `storeEmbedShow`
      once and then `storeEmbedNavigate` with the gog URL.
    - The same return transition while the suppression context reports suppressed calls
      `storeEmbedShow` zero times, and still navigates.
    - The first effect run (no previous URL) neither hides nor navigates, unchanged from today.
  </behavior>

  <action>
Edit the start-URL sync effect in `useStoreEmbedHost.ts` (currently `:311-327`). Keep its existing
section header and the "navigate, never re-open" intent; the effect gains a target check it never
had.

Import `isEmbeddableOrigin` alongside a new `resolveStoreForUrl` import from `./storeEmbedOrigins`
into `useStoreEmbedHost.ts`.

Move the existing `const suppressed = useStoreEmbedSuppressed()` declaration (currently at `:330`)
to sit ABOVE this effect, leaving `wasSuppressedRef` and the suppression effect itself exactly where
they are. Only the context read moves; do not reorder any `useRef`, `useState` or `useEffect` call,
because the test harness assigns those by cursor position. Leave a one-line comment at the new
location saying the value is read here because the start-URL effect below consults it, and that its
own effect still lives further down.

Preserve the effect's existing first-run and unchanged-URL early returns verbatim, and keep
advancing `previousUrlRef.current` BEFORE any new guard returns. That ordering is load-bearing: if
the ref were left stale on a blocked transition, the subsequent Epic-back-to-GOG change would
compare equal to the pre-Epic URL, return early, and strand the embed hidden forever.

Then add, in this order:

1. **The target guard.** Compute the resolved config once with `resolveStoreForUrl(startUrl)` and
   treat the target as refused when that config is non-null AND `isEmbeddableOrigin(startUrl)` is
   false. On a refused target, set a new `useRef(false)` latch (declare it next to
   `previousUrlRef`) to true, call `window.api.storeEmbedHide()` with the file's existing
   `.catch(logNavCallFailure(...))` shape and a label naming D-05, and return without issuing any
   navigation.

   Write the predicate as "a KNOWN store the app does not embed", NOT as the bare negation of
   `isEmbeddableOrigin`. Carry a comment at the guard recording the measured reason: the `/wiki`
   route's github start URL resolves to no configured store at all, so the bare negation is true
   for it and would hide the wiki embed instead of navigating it. This app embeds the wiki
   deliberately and that route has no unavailable-panel of its own.

2. **The not-yet-open skip.** If `openedRef.current` is false there is no embed to re-point, so
   return here without calling the navigate channel. Comment that the open effect above will open
   at whatever `startUrl` is current when the slot arrives, which is what Task 2 makes reachable.

3. **The visibility restore.** If the latch from step 1 is set, clear it and — only when
   `suppressed` is false — call `window.api.storeEmbedShow()` with the same `.catch` shape. Comment
   that the suppression check is what stops a hidden-then-restored embed from resurfacing over a
   modal (D-19/D-20), and that the suppression effect below owns the ordinary release transition.

4. Leave the existing `storeEmbedNavigate(startUrl).then(applyNavResult)` call as the effect's
   final statement, unchanged.

Add `suppressed` to the effect's dependency array alongside `startUrl` and `applyNavResult`. A
suppression flip with an unchanged URL is already absorbed by the unchanged-URL early return, so
this adds no behavioural surface.

Then append four tests to `useStoreEmbedHost.test.tsx`, numbered to continue the existing sequence,
each preceded by the file's established "Observed-red mutation:" comment naming the exact source
mutation that turns it red. Drive transitions with `mount(...)` followed by `reinvoke(...)` carrying
a different start URL, exactly as the existing tests do. Flip suppression for the fourth test by
reassigning `suppressionContextValue` before the `reinvoke`, mirroring the existing suppression
test's technique.
  </action>

  <verify>
    <automated>npx jest --selectProjects Frontend --testPathPattern 'useStoreEmbedHost' 2>&1 | tail -15</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</automated>
    <automated>npx tsc --noEmit</automated>
    <red-control>MANDATORY, and a task step rather than a report line. For each of the four new tests in turn: comment out ONLY the source hunk that test targets (the target guard for the Epic test and for the wiki test, the visibility-restore block for the other two), re-run the jest command above, and record the ACTUAL "Tests: N failed, M passed, T total" line. Restore the hunk, re-run, record the green line. A test that stays green against the reverted source is vacuous — rewrite it rather than keeping it. Paste all eight recorded count lines into the SUMMARY.</red-control>
  </verify>

  <done>
`storeEmbedNavigate` is never issued for a start URL that resolves to a configured-but-non-embeddable
store; `storeEmbedHide` is issued instead. The wiki's github start URL still navigates. Returning to
an embeddable target re-shows the embed unless suppression is active. All four new tests were
observed red against their own reverted hunk and green after restore, with counts recorded. tsc
exits 0 and both edited files are prettier-clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CR-02 — re-arm the open/bounds effect exactly when the slot appears, and never on a URL change</name>
  <files>src/frontend/screens/WebView/index.tsx, src/frontend/screens/WebView/useStoreEmbedHost.ts, src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</files>

  <read_first>
Read `useStoreEmbedHost.ts:205-236` (the `openedRef` declaration and the `flush` body) and
`:298-309` (the cleanup and the dependency-array comment) before editing. Read `index.tsx:258-269`
and `:481-496`. Read the note in `<measured_at_planning_time>` item 7 about the source-text gates
that read `index.tsx`.
  </read_first>

  <behavior>
    - Mounting with no slot and the presence flag false opens nothing and logs the existing
      null-slot line.
    - Re-invoking with the flag true and a real slot calls the open channel exactly once, carrying
      the start URL current at that re-invocation, not the one from the original mount.
    - After that open, changing the start URL leaves `MockResizeObserver.instances.length` at 1 and
      leaves the registered `resize`/`scroll` listener counts unchanged.
    - An open that lands after a start-URL change issues no follow-up navigation to the URL it just
      opened at.
    - Every existing test in the file still passes with its assertions unmodified.
  </behavior>

  <action>
**`index.tsx`** — change `slotRef` at `:258` to `useRef<HTMLDivElement | null>(null)` (the readonly
`current` on the single-argument form cannot be assigned through under @types/react 18.3.21; the
mutable form is assignable to the hook's existing option type, probed at plan time). Add beside it a
`useState(false)` presence flag and a `useCallback` callback ref with an empty dependency array that
assigns the node into `slotRef.current` and, only when the node is non-null, sets the flag true.

Comment that the callback ref is deliberately stable so React does not detach and re-attach it on
every render, and that the flag is a ONE-WAY latch: it is never set back to false on detach, because
lowering it would re-arm the effect below on a later re-attach and tear down the very
`ResizeObserver` whose identity this design protects.

Pass the flag into the existing `useStoreEmbedHost({ ... })` call at `:264-269`. Replace
`ref={slotRef}` on the slot div at `:492` with the callback ref. Change nothing else in this file —
in particular do not touch the deep-link, restore, adtraction or `/loginweb/nile` regions, and do
not introduce any earlier occurrence of the login-pathname call literal that
`WebviewUnavailablePanel.test.tsx` anchors on (see `<measured_at_planning_time>` item 7).

**`useStoreEmbedHost.ts`** — add the presence flag to `UseStoreEmbedHostOptions` with a doc comment
explaining that it is a caller-owned latch reporting that the slot div has attached at least once,
and that it exists because the slot renders BELOW three early returns in `index.tsx` so a cold start
on a route that takes one of them leaves the slot null on the first render.

Move the `previousUrlRef` declaration up so it sits above the open/bounds effect (it is currently
declared below it, at `:312`). Reordering `useRef` declarations relative to each other is safe for
the test harness — each still gets its own cursor slot with its own initial value — but do not move
it across any `useState` or `useEffect` call.

In `flush`, inside the branch that performs the open, seed `previousUrlRef.current` with the
`startUrl` the open is using. Comment that this is what stops the start-URL effect from following a
late open with a navigation to the URL just opened, which would reload the page the user has only
just arrived on.

Change the open/bounds effect's dependency array from empty to the presence flag alone. **Keep the
existing multi-line comment above that array and extend it** — do not replace it. The extension must
state that the flag is the ONLY admissible dependency here, that it transitions at most once per
mount, and that adding the route's URL to this array would tear down and re-attach the observer on
every navigation, which is precisely the drag-resize regression plan 40-11's live gate caught on
real hardware. Keep the existing eslint exhaustive-deps suppression; the effect still closes over
values that are intentionally not dependencies.

Accept, and record in a comment, that when the slot is present on the very first render the effect
may run once with the flag low and once more after the latch raises. This is bounded to mount, costs
one extra bounds send, and cannot double-open because `openedRef` already guarantees exactly one
open. Do not build machinery to suppress it: React runs the previous cleanup before any re-run, so
an "already attached" check cannot observe the prior attachment and would be dead code.

**`useStoreEmbedHost.test.tsx`** — add the presence flag to `MountOptions` as an optional field and
default it to true in `invoke()`, so every existing test keeps its current behaviour with no edit.
Append three tests continuing the numbering, each with the file's "Observed-red mutation:" comment.
Use `MockResizeObserver.instances.length` and the `windowListeners` map to assert the observer and
its listeners survived a URL change — `disconnect()` is a no-op stub, so instance count is the
observable that actually moves.
  </action>

  <verify>
    <automated>npx jest --selectProjects Frontend --testPathPattern 'screens/WebView' 2>&1 | tail -20</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/index.tsx src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</automated>
    <automated>npx tsc --noEmit</automated>
    <red-control>MANDATORY, as a task step. (a) Revert the dependency array to empty, re-run the jest command, record the actual failed/passed/total line — the late-slot test must be among the failures. Restore, re-run, record green. (b) Separately, set the dependency array to carry the route's start URL as well, re-run, and record the counts — the observer-identity test must fail. Restore, re-run, record green. (c) Remove the `previousUrlRef` seed from the open branch, re-run, record — the redundant-navigation test must fail. Restore, re-run, record green. Six count lines total, all pasted into the SUMMARY. Step (b) is the one that proves the Chesterton's-fence guard is real rather than decorative.</red-control>
  </verify>

  <done>
A slot that first attaches on a later render opens the embed exactly once at the then-current start
URL. A same-store URL change leaves the observer instance count and the window listener counts
unchanged. No redundant navigation follows a late open. The 280 pre-existing WebView tests still
pass unmodified, plus the seven added across Tasks 1 and 2. All six red-control count lines recorded.
  </done>
</task>

<task type="auto">
  <name>Task 3: full gate battery, the D-35 narrowing, and the unmeasured-visibility todo</name>
  <files>.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md, .planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md</files>

  <read_first>
Read `40-REVIEW.md:76-161` (CR-01 and CR-02 as written) before annotating. Read the Todo triage
frontmatter section of `CLAUDE.md` and one existing file in `.planning/todos/pending/` for the exact
key order.
  </read_first>

  <action>
**Gates.** Run the full battery below and report each ACTUAL result. Do not record any gate as green
without having run it. Both lint ceilings sit at zero headroom (`SRC_CEILING = 1124`,
`TESTS_CEILING = 638`), so a single new warning turns `pnpm lint` red: fix the warning at its
source, never raise a ceiling.

**`40-REVIEW.md` annotation.** Under CR-01, append a dated note recording the narrowing CONTEXT.md
requires: the sub-claim that the effect "carries one store's key-scoped session into another store's
content" does not hold at this layer, because `src-tauri/src/main.rs:5066` declares a single
`store-embed` label resolved by every command, `store_embed_open_args` (`main.rs:5265`) parses no
store key, and `storeEmbedFlowRegistration.ts:189` discards the argument outright. Re-keying is not
expressible today and same-origin isolation already separates the stores' cookies. State plainly
that the embeddability half of CR-01 IS fixed by this task and the re-keying half is declined as
not-applicable rather than deferred. Under CR-02, note the fix and the file it landed in.

**The todo.** File the unmeasured visibility hypothesis from CONTEXT.md's `<specifics>`. It must
read as a hypothesis, not a fixed defect: reading the code, a GOG -> Epic switch left the bounds
where the GOG slot was with nothing calling hide, so the native webview was expected to remain
visible over the unavailable panel — this was never observed on macOS hardware. Task 1's hide arm
should also resolve it if it was real. Body must say explicitly that nothing in this task proves the
visual symptom existed or that it is now gone, and name the live check that would settle it: on
macOS, cold-start on `/store/gog`, switch to `/store/epic`, and look for native web content drawn
over the panel.

Frontmatter must carry `created`, `title`, `area`, `severity`, `platform`, `ready` and `files`, with
`platform` immediately after `severity` and `ready` immediately after `platform`, values bare and
lowercase. Use `severity: minor`, `platform: macos`, `ready: live-gate` — it needs the operator's
Mac and cannot be settled at a desk. `pnpm planning-gates` enforces this shape and will turn red on
a missing or quoted key.

**Formatter note.** The two paths this task writes are under `.planning/`, which
`npx prettier --file-info` reports as `{ "ignored": true, "inferredParser": null }`. A `--check` over
them prints the same success text and the same exit code it prints for a real file while matching
nothing, so it is omitted here deliberately rather than carried as a green that proves nothing. Match
the surrounding wrap and key order in each file by hand instead.
  </action>

  <verify>
    <automated>npx prettier --check src/frontend/screens/WebView/useStoreEmbedHost.ts src/frontend/screens/WebView/index.tsx src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
    <automated>npx jest --selectProjects Frontend 2>&1 | tail -20</automated>
    <automated>pnpm find-deadcode 2>&1 | tail -20</automated>
    <automated>pnpm planning-gates 2>&1 | tail -20</automated>
    <automated>python3 -c "import io,re;s=io.open('.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md',encoding='utf-8').read();fm=s.split('---')[1];ks=[l.split(':')[0] for l in fm.strip().split('\n') if re.match(r'^[a-z_]+:',l)];print('keys',ks);assert 'severity' in ks and ks[ks.index('severity')+1]=='platform' and ks[ks.index('platform')+1]=='ready', 'triage key ORDER wrong';print('OK')"</automated>
  </verify>

  <done>
`pnpm codecheck` exits 0. `pnpm lint` exits 0 with both ceilings untouched at 1124 / 638.
`npx jest --selectProjects Frontend` passes with counts reported, at least 287 tests (280 baseline
plus the seven added). `pnpm find-deadcode` reports no new finding for `isEmbeddableOrigin` or
`resolveStoreForUrl` — the guard gives the former its first production call site. `pnpm
planning-gates` exits 0. `40-REVIEW.md` carries the CR-01 narrowing and the CR-02 disposition. The
live-gate todo exists with triage keys in the enforced order.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer route state -> native `store-embed` child webview | A React route param change decides what URL the Tauri-managed child webview loads. Nothing between the two re-checks the target. |
| third-party store page -> the embed's shared cookie jar | One long-lived child webview, one jar, reused across every store the embed visits. |
| app modal UI -> native subview compositing | The native subview composites OVER the DOM, so any code path that shows it can cover app chrome. |

## STRIDE Threat Register (ASVS L1, block on high)

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-QTH-01 | Information Disclosure | `useStoreEmbedHost.ts` start-URL effect -> `store-embed` webview | high | mitigate | Task 1's target guard: a start URL resolving to a configured-but-non-embeddable store issues hide and no navigation. The child webview inherits the injected globals that are the root-caused Talon fingerprint, so the current background load exposes that fingerprint to Epic behind a panel the user believes blocked it. |
| T-QTH-02 | Spoofing | the origin predicate itself | medium | mitigate | The guard reuses `resolveStoreForUrl`'s exact-or-dot-suffix hostname matcher rather than a substring test. A bare substring check passes `https://attacker.net/?x=gog.com`; F-34.4.2-19 already shipped that defect once in `cookie_domain_matches`. Task 1 adds no new matching logic. |
| T-QTH-03 | Denial of Service | the `/wiki` route | high | mitigate | Measured: the literal predicate in the locked decision is false for the wiki's github start URL and would hide a route that has no unavailable-panel fallback. Task 1 narrows the predicate to known-non-embeddable and Task 1's wiki test pins it. |
| T-QTH-04 | Elevation of Privilege (UI redress) | Task 1's visibility-restore arm | medium | mitigate | The new show call is gated on the suppression context being clear, so a hidden-then-restored embed cannot composite a live third-party page over a modal (D-19/D-20). |
| T-QTH-05 | Tampering | Task 2's presence latch | low | accept | A latch that could lower would re-arm the open effect and tear down the ResizeObserver mid-session. Mitigated structurally by making it one-way; residual risk is a future edit lowering it, accepted because Task 2's observer-identity test fails if that happens. |
| T-QTH-SC | Tampering | npm/pip/cargo installs | n/a | accept | No package-manager install task exists in this plan; no dependency is added or upgraded. The package-legitimacy gate does not arm. |
</threat_model>

<verification>
Run from the repo root after all three tasks:

1. `npx prettier --check` over the three edited source paths — all prettier-visible, check is real.
2. `pnpm codecheck` exits 0.
3. `pnpm lint` exits 0, ceilings unchanged at `SRC_CEILING = 1124` / `TESTS_CEILING = 638`.
4. `npx jest --selectProjects Frontend` — report actual suite and test counts; expect >= 287 tests
   against the 280 measured at plan time.
5. `pnpm find-deadcode` — no new finding.
6. `pnpm planning-gates` exits 0.
7. Ten red-control count lines (four from Task 1, six from Task 2) recorded verbatim in the SUMMARY.

**What this plan does NOT prove.** No step here runs the app on macOS hardware. The prediction that
the embed currently remains visible over the Epic panel is untested and stays a hypothesis; the
filed todo is the only honest disposition for it. Do not write in the SUMMARY that a visual defect
was fixed.
</verification>

<success_criteria>
- A route change to a configured-but-non-embeddable store hides the embed and issues no navigation.
- The `/wiki` route's github start URL still navigates and is not hidden.
- Returning to an embeddable target re-shows the embed only when suppression is clear.
- A slot arriving on a later render opens the embed exactly once at the then-current URL.
- A same-store URL change leaves the ResizeObserver instance count and window listener counts
  unchanged.
- Every new test observed red against its own reverted source hunk and green after restore, with
  actual counts recorded.
- CR-01's re-keying sub-claim is recorded as declined-not-applicable in `40-REVIEW.md`, never
  silently dropped.
</success_criteria>

<output>
Create `.planning/quick/260929-qth-fix-phase-40-cr-01-cr-02-in-the-store-em/260929-qth-SUMMARY.md` when done.

The SUMMARY must carry, at minimum:
- The ten red-control count lines, verbatim.
- The measured deviation from the locked decision: `isEmbeddableOrigin` alone is false for the
  `/wiki` route's github URL (measured output quoted), so the guard was narrowed to
  known-non-embeddable. State that the decision's purpose — stopping the Epic background load — is
  fully delivered, and that the narrowing exists only to avoid regressing a shipped route.
- The two guards added beyond the letter of CONTEXT.md (the not-yet-open skip and the
  suppression-aware re-show) and why each is required for the locked fix not to introduce a worse
  defect: without the re-show, an Epic-then-back-to-GOG switch would strand the embed hidden.
- The D-35 narrowing, mirroring the `40-REVIEW.md` note.
- A plain statement that the visibility hypothesis was NOT verified, and the todo path.
</output>
