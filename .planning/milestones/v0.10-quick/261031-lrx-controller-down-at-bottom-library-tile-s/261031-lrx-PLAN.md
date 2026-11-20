---
phase: quick-261031-lrx
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/preload/__tests__/gamepadAction.test.ts
  - src/preload/api/tauriGamepadInput.ts
  - .planning/todos/pending/2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md
autonomous: true
requirements:
  - TODO-2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel

must_haves:
  truths:
    - "Down on the lowest visible tile of a scrollable grid scrolls the grid by about one tile height. It does not focus a left-panel element outside the grid."
    - "After that scroll, the first tile that renders below the focused one within the reveal window (about 250ms) receives focus."
    - "When the grid is already scrolled to its end, Down falls back to today's whole-document search, so content below a scrollable list stays reachable."
    - "When the focused element has no scrollable ancestor other than the document scroller, directional moves behave exactly as before."
    - "tauriGamepadAction never rejects. Its promise resolves only after any reveal poll finishes. An arrow keydown that the app preventDefault()s still moves nothing, and WR-03's no-focus origin is unchanged."
  artifacts:
    - path: "src/preload/api/tauriGamepadInput.ts"
      provides: "Scroll-container-aware moveFocusDirectionally (async), with a bounded reveal poll"
      contains: "261031-lrx"
    - path: "src/preload/__tests__/gamepadAction.test.ts"
      provides: "Regression tests (a)-(g) for container preference, scroll-and-reveal, scroll-end fallback and the unchanged document-scroller path"
      contains: "261031-lrx"
  key_links:
    - from: "tauriGamepadAction"
      to: "moveFocusDirectionally"
      via: "await inside the existing try/catch"
      pattern: "await moveFocusDirectionally"
    - from: "moveFocusDirectionally"
      to: "findScrollableAncestor"
      via: "nearest scroll container of the focused element's parent"
      pattern: "findScrollableAncestor\\(current"
---

<objective>
Make the gamepad's directional focus move aware of scroll containers, so that Down on the lowest visible library tile scrolls the grid and focuses the next row instead of jumping to the left panel. The fix is in `src/preload/api/tauriGamepadInput.ts` only. The frontend does not change.

Purpose: this fixes the todo `.planning/todos/pending/2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md`. The orchestrator has already established the root cause. `moveFocusDirectionally` searches every focusable element in the document. `GameCard` (`src/frontend/screens/Library/components/GameCard/index.tsx`) renders an empty, non-focusable placeholder until `observeCardVisibility` (`cardVisibility.ts`) fires. That observer uses the implicit viewport root with `rootMargin: '500px'`, and IntersectionObserver clips targets by intermediate overflow scroll containers before it applies rootMargin. Rows below the grid's scroll container therefore stay placeholders, nothing in the grid lies below the bottom tile, and the best-scoring candidate is a left-panel element further down the screen.

Output: tests (a)-(g) first (RED). Then the implementation (GREEN), and a note on the todo saying the fix landed and only the live Gate remains.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md
@src/preload/api/tauriGamepadInput.ts
@src/preload/__tests__/gamepadAction.test.ts

Load `Skill("gamelib-conventions")` before writing a `<verify>` block or touching the todo frontmatter.

<interfaces>
These are the existing members of src/preload/api/tauriGamepadInput.ts the executor builds on. All of them are module-private except `tauriGamepadAction`.
- `getFocusableElements(): HTMLElement[]` (L51). It filters out disabled, aria-hidden and zero-area elements.
- `activeElement(): HTMLElement | null` (L64). `document.body` counts as null.
- `dispatchKey(target, key, opts?): boolean` (L95). It returns whether the keydown was prevented.
- `isScrollable(el: Element): boolean` (L181). It checks the scrollHeight > clientHeight case and that overflowY is not visible or hidden.
- `findScrollableAncestor(start: Element | null): Element` (L188). It walks parentElement and falls back to `document.scrollingElement ?? document.documentElement`.
- `doScroll(delta)` (L203). It calls `scrollBy({ top })` when available, else `scrollTop += delta`. The new scroll step mirrors this.
- `viewportOriginFor(direction)` (L240, WR-03), `isInDirection(direction, origin, rect)` (L262) and `directionScore(direction, origin, rect)` (L281).
- `moveFocusDirectionally(direction: Direction): void` (L328). Today it is synchronous.
- `export function tauriGamepadAction(args: GamepadActionArgs): Promise<void>` (L355). It is a try/catch around a switch and returns `Promise.resolve()`.

The caller is `src/frontend/helpers/gamepad.ts:348`, which calls `window.api.gamepadAction({ action })` without awaiting it, via `src/preload/api/misc.ts:96`. Presses can therefore overlap while a reveal poll is pending. The poll must abort if focus moved in the meantime.

The test harness is src/preload/__tests__/gamepadAction.test.ts and runs under the node test env, without jsdom.
- `FakeElement extends EventTarget` (L66) has the fields scrollHeight, clientHeight, scrollTop, overflowY, parentElement and a `rect`. It also has `getBoundingClientRect()`, `scrollBy({top})` (it adds to scrollTop) and a `focus = jest.fn` that sets `fakeDocument.activeElement`. It has no `contains`.
- `FakeDocument` has activeElement, body, documentElement and `scrollingElement = null`, plus jest.fn mocks for `querySelectorAll` and `elementFromPoint`.
- `beforeEach` stubs `window` ({ history, innerWidth: 800, innerHeight: 600 }) and `getComputedStyle` (it returns `{ overflowY: el.overflowY }`), plus KeyboardEvent and MouseEvent. It does NOT stub `requestAnimationFrame`, so it is absent in tests.
- The preload jest config sets `resetMocks: true`.
- The directional tests are in `describe('tauriGamepadAction directional focus movement (REQ-34.1-06)')` at about L297. The existing test "never rejects, even when the DOM query throws" (about L288) must keep passing.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (RED): Extend the FakeElement harness and add failing scroll-container regression tests</name>
  <files>src/preload/__tests__/gamepadAction.test.ts</files>
  <behavior>
    - (a) A candidate inside the scroll container is preferred. The container is a FakeElement with overflowY 'auto', scrollHeight 1000, clientHeight 400 and scrollTop 0. The current tile has parentElement = container and rect top 300, bottom 380, left 300, right 400. tileBelow is in the container at rect top 600, bottom 680, left 300, right 400. leftPanelBtn has parentElement null and rect top 390, bottom 410, left 300, right 400; it scores lower and would win under the old code. After padDown, activeElement is tileBelow and leftPanelBtn.focus was not called.
    - (b) With no in-container candidate and a container that can still scroll, the grid scrolls and the revealed tile gets focus. Use the same container and current tile. querySelectorAll returns [current, leftPanelBtn] at first. The test overrides container.scrollBy to add opts.top to scrollTop, shift current.rect up by the same amount (to prove the origin is recomputed), and schedule a setTimeout of about 50ms. That timeout sets querySelectorAll.mockReturnValue([current, leftPanelBtn, newTile]), where newTile is in the container and directly below the shifted current rect. Expect container.scrollTop === 80 (the current tile's height), activeElement === newTile, and leftPanelBtn.focus not called. Because the tile appears after a delay, the test also proves that the returned promise waits for the poll.
    - (b2) Same as (b), but no tile ever appears. Then container.scrollTop === 80, activeElement is still current, leftPanelBtn.focus is not called, and the promise resolves (the default jest timeout is enough).
    - (b3) Up mirror case. The container scrollTop is 200, the current tile is the topmost in the container, and an outside header button sits above it. After padUp, scrollTop === 120 and focus does not go to the header.
    - (c) At the scroll end it falls back. Set container.scrollTop = 600 (scrollHeight - clientHeight). Down then focuses leftPanelBtn, the old behaviour, and scrollTop stays 600.
    - (d) The document-scroller path is unchanged. The current tile's parent is a plain div with overflowY 'visible' and parentElement null, so findScrollableAncestor resolves to documentElement. Using the same geometry as (a), but with tileBelow under the plain div, leftPanelBtn wins as before (the pure lowest-score pick). documentElement.scrollTop stays 0.
    - (e) The preventDefault short-circuit holds inside a container. Use the (b) setup with a keydown listener on current that calls preventDefault for ArrowDown. After padDown, container.scrollTop stays 0 and focus does not change.
    - (f) The poll aborts if focus moved meanwhile. Use the (b) setup, but the scheduled timeout first sets fakeDocument.activeElement = otherEl and then exposes newTile. Expect activeElement === otherEl and newTile.focus not called.
  </behavior>
  <action>
Harness changes only. The module under test is not touched in this task.

1. Add `contains(other: FakeElement | null): boolean` to `FakeElement`. It walks `other` and then its `parentElement` chain, and returns true when it reaches `this`. The node is included, so `el.contains(el)` is true, matching DOM `Node.contains`.
2. Add a new `describe('tauriGamepadAction scroll-container-aware directional moves (quick 261031-lrx)')` block after the existing directional describe. Give it a one-paragraph header comment that explains the root cause: rows below the grid's scroll container are non-focusable placeholders until cardVisibility's IntersectionObserver fires, so the old whole-document search escaped to the left panel. Cite the todo filename.
3. Implement cases (a), (b), (b2), (b3), (c), (d), (e) and (f) from `<behavior>`. Name each test with the prefix `261031-lrx:`. Build the geometry with the existing `new FakeElement('button', {...rect})` pattern and set `parentElement` by hand. For (b) and (f), override `scrollBy` on the container instance and use real timers. Do not use fake timers: the implementation's poll mixes rAF-absent `setTimeout` and `Date.now()` deadlines, and real timers keep the test honest. Keep the delay of the late-appearing tile (about 50ms) well inside the implementation's reveal window of about 250ms.
4. Run the tests. Cases (a), (b), (b3) and (f) must FAIL against the current module, with focus going to the outside element or no scroll happening. Cases (c), (d) and (e) are expected to pass already, because they pin unchanged behaviour. Record which tests fail and why for the SUMMARY. Commit as `test(261031-lrx): add failing scroll-container focus-move tests`.

The preload `.prettierrc` sets printWidth 120. Keep formatting consistent with the file.
  </action>
  <verify>
    <automated>npx prettier --file-info src/preload/__tests__/gamepadAction.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/preload/__tests__/gamepadAction.test.ts && (npx jest --selectProjects Preload --runTestsByPath src/preload/__tests__/gamepadAction.test.ts -t '261031-lrx' ; test $? -ne 0)</automated>
  </verify>
  <done>The harness has `contains`. Eight `261031-lrx:` tests exist. The RED run fails on (a), (b), (b3) and (f) for the stated reasons. All pre-existing tests in the file still pass, so the harness change broke nothing. The test file passes the prettier check. The work is committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Make moveFocusDirectionally scroll-container-aware with a bounded reveal poll, then annotate the todo</name>
  <files>src/preload/api/tauriGamepadInput.ts, .planning/todos/pending/2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md</files>
  <behavior>
    - All eight `261031-lrx:` tests from Task 1 pass.
    - Every pre-existing test in gamepadAction.test.ts still passes. That includes WR-02, WR-03, the preventDefault test and "never rejects, even when the DOM query throws".
  </behavior>
  <action>
All edits go in src/preload/api/tauriGamepadInput.ts and follow the module's comment style. Explain the why, and cite `quick 261031-lrx` and the todo filename in a docstring block that sits beside the WR-02 and WR-03 blocks.

1. Helpers (pure, module-private):
   - `isDocumentScroller(el: Element): boolean`. It is true when el is `document.scrollingElement`, `document.documentElement` or `document.body`.
   - `bestInDirection(direction, origin, candidates): HTMLElement | null`. Extract the existing scoring loop from `moveFocusDirectionally` into this, with the same isInDirection filter and the lowest directionScore. Do not change the scoring.
   - `canScrollToward(container: Element, direction: Direction): boolean`. For 'Down' it is true when `scrollTop < scrollHeight - clientHeight - 1`, where the 1px allows for sub-pixel scroll positions. For 'Up' it is true when `scrollTop > 0`. For 'Left' and 'Right' it returns false. Horizontal reveal is deliberately out of scope: the library grid scrolls only vertically, and Left from the leftmost tile must keep reaching the left panel through the fallback. Document this choice in a comment (Claude's discretion, per the orchestrator's "horizontal containment is optional").
   - `scrollContainerBy(container, top)`. Mirror `doScroll`: call `scrollBy({ top })` when it is a function, else `scrollTop += top`.
   - `nextFrame(): Promise<void>`. It resolves on whichever comes first of `requestAnimationFrame` (only when `typeof requestAnimationFrame === 'function'`) or `setTimeout(…, 16)`. The setTimeout race matters for two reasons. The preload test env is node, with no rAF. A hidden or occluded WKWebView may throttle rAF indefinitely, and the promise must never hang.
2. Make `moveFocusDirectionally(direction): Promise<void>` an async function. Keep its existing first steps unchanged: the preventDefault short-circuit on `dispatchKey(current, ARROW_KEYS[direction])`, and the WR-03 origin when `current` is null. Then:
   - If `current` is null, run today's whole-document search via `bestInDirection` and return. WR-03 is unchanged.
   - Set `container = findScrollableAncestor(current.parentElement)`. Start from the parent so that a scrollable focused element is never its own container. If `isDocumentScroller(container)`, run today's whole-document search and return. This is the document-scroller path, and it must behave exactly as before.
   - Otherwise set `all = getFocusableElements().filter(el => el !== current)`. Let `inside` be the elements of `all` that `container.contains` reports as inside the container. If `bestInDirection(direction, origin, inside)` returns an element, focus it and return. In-container candidates are preferred over nearer-scoring outside ones.
   - Else, if `canScrollToward(container, direction)`: take `step = current.getBoundingClientRect().height`, falling back to 1 when the height is not positive. Call `scrollContainerBy(container, direction === 'Down' ? step : -step)`. Then poll: set `deadline = Date.now() + REVEAL_TIMEOUT_MS`, with a named constant of 250 and a comment on why it is bounded. Loop while `Date.now() < deadline`. In each pass: `await nextFrame()`. If `activeElement() !== current`, return; focus moved through an overlapping press or the app, and the poll must not steal it (gamepad.ts does not await). Recompute `origin` from `current.getBoundingClientRect()`, because the scroll moved it. Recompute the in-container candidates with `getFocusableElements()`, because cards render lazily. If `bestInDirection` finds one, focus it and return. If the deadline passes, return with focus unchanged; the grid has still scrolled one step, which is visible progress, and the next press continues.
   - Else, the container cannot scroll further. Fall back to the whole-document search over `all` with the original origin. This is today's behaviour, and it keeps controls below a scrollable list reachable.
   Update the `moveFocusDirectionally` docstring to describe the container-first order and to explain the IntersectionObserver clipping root cause, citing cardVisibility.ts.
3. Make `tauriGamepadAction` an `async function` that still returns `Promise<void>`. In the directional case, use `await moveFocusDirectionally(direction)` inside the existing try/catch, so that any rejection is caught, `warn`ed and swallowed. The function still never rejects (T-34.1-19), and its promise now settles only after the reveal poll. Leave every other case as it is.
4. Run the targeted jest test until it is fully green. Then run `pnpm lint:src` (or `npx eslint` on the module path if lint:src is slow or scoped differently) and `pnpm codecheck`. Fix any no-floating-promises or require-await findings in place.
5. Todo note. Edit `.planning/todos/pending/2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md`. Leave its frontmatter byte-identical: `severity: medium`, `platform: any` and `ready: live-gate` stay, per the gamelib-conventions triage rule. Append a `## Fix landed (quick 261031-lrx)` section that states the root cause in two or three sentences (IntersectionObserver clipping, placeholder cards, the whole-document search) and the change (container-first, then scroll-and-reveal, then fall back at the scroll end). It also records that the keyboard comparison in "First step" is moot, because WKWebView has no spatial navigation and arrow keys never move focus there. Finally, it states that the todo stays pending until the operator runs the Gate live. Do not move the todo to completed: the Gate is a live check the executor cannot run. Completed live-gated todos in this repo carry operator-park metadata (for example `2026-08-23-keyring-get-bounded-timeout-unverified-live.md`), and that decision is the operator's.
6. In the SUMMARY, add a `## Human Verification (live gate, not blocking)` section. Copy the todo's Gate verbatim, and add numbered steps:
   1. Restart `tauri dev`. A dev session does not rebuild the sidecar, but this is a preload/renderer change, so a reload is enough. Confirm the bundle is fresh anyway.
   2. Open Games in a library with more rows than fit.
   3. Focus the top-left tile with the pad, then press Down repeatedly. Each press should scroll the grid about one row and move focus down a row. Focus never lands in the left panel until the last row.
   4. At the very last row, with the grid scrolled to its end, one more Down falls back to the old whole-document search by design (step 4 of the intended fix), so it may reach a control below or to the left. Note whether the operator accepts that edge.
   5. Press Up back to the top. The grid should scroll up symmetrically.
   6. Left from the leftmost tile should still reach the left panel.
   Also run `graphify update .`, per CLAUDE.md.

Commit the code as `fix(261031-lrx): scroll the grid instead of escaping when Down has no in-container target` and the todo note separately as `docs(261031-lrx): note fix on controller-down todo; live gate pending`.
  </action>
  <verify>
    <automated>npx prettier --file-info src/preload/api/tauriGamepadInput.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/preload/api/tauriGamepadInput.ts src/preload/__tests__/gamepadAction.test.ts && npx jest --selectProjects Preload --runTestsByPath src/preload/__tests__/gamepadAction.test.ts && pnpm codecheck && grep -c '261031-lrx' src/preload/api/tauriGamepadInput.ts && pnpm planning-gates</automated>
    The todo file is under `.planning`, which `npx prettier --file-info` reports as `{ "ignored": true, "inferredParser": null }`. A prettier check over it would be vacuous, so it is deliberately omitted. `pnpm planning-gates` covers the todo instead: it proves the frontmatter still passes the triage gate.
  </verify>
  <done>The whole gamepadAction.test.ts suite is green, including all eight 261031-lrx tests and every WR-02, WR-03 and never-rejects test. codecheck and planning-gates pass. Both .ts paths pass the prettier check. The todo stays in pending with `ready: live-gate` and an appended "Fix landed" section. The SUMMARY carries the non-blocking live-gate steps. There are two commits.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gamepad poll loop -> preload DOM | Physical pad input drives synthetic focus moves. There is no untrusted network data. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261031-01 | Denial of Service | moveFocusDirectionally reveal poll | mitigate | The poll is bounded by REVEAL_TIMEOUT_MS (250ms). Each wait races rAF against setTimeout(16), so a throttled rAF cannot hang the promise. The loop exits when focus changes. |
| T-261031-02 | Denial of Service | tauriGamepadAction | mitigate | The `await` sits inside the existing try/catch, so the promise never rejects (T-34.1-19). The "never rejects" test is pinned. |
| T-261031-03 | Tampering | focus stolen by an overlapping un-awaited press | mitigate | The activeElement !== current abort check in the poll loop is pinned by test (f). |
</threat_model>

<verification>
- `npx jest --selectProjects Preload --runTestsByPath src/preload/__tests__/gamepadAction.test.ts` is fully green.
- `pnpm codecheck` passes.
- `npx prettier --check` passes over the two .ts paths. Both were confirmed non-ignored via `--file-info`.
- `pnpm planning-gates` passes, with the todo frontmatter unchanged.
- No file under `src/frontend/` is modified (`git diff --stat` shows only the two preload files plus the todo).
</verification>

<success_criteria>
- Down from the lowest visible tile in a scrollable container scrolls that container and focuses the newly rendered tile below, never an outside element, while the container can still scroll.
- The scroll-end fallback and the document-scroller path keep today's behaviour.
- The live Gate is recorded as a non-blocking human-verify item in the SUMMARY. The todo stays pending with `ready: live-gate`.
</success_criteria>

<output>
Create `.planning/quick/261031-lrx-controller-down-at-bottom-library-tile-s/261031-lrx-SUMMARY.md` when done.
</output>
