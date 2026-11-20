---
phase: quick-260924-swb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Library/components/GameCard/cardVisibility.ts
  - src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/GamesList/index.tsx
  - src/frontend/types.ts
  - .planning/todos/pending/2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md
autonomous: true
requirements: [TODO-260923-library-card-art]

must_haves:
  truths:
    - 'A GameCard that mounts AFTER the observer has already announced its region still becomes visible (no permanent blank art).'
    - 'A GameCard that remounts after being announced re-observes its own node rather than relying on a past broadcast.'
    - 'Intersection still unobserves the node once announced — the perf property of the original design is preserved.'
    - 'Exactly one IntersectionObserver exists for the whole library, not one per card.'
    - 'The `visible-cards` CustomEvent no longer exists anywhere in src/ — no dispatcher, no listener, no type declaration.'
    - "GamesList's activeController / scrollCardIntoView focus effect still works."
  artifacts:
    - path: 'src/frontend/screens/Library/components/GameCard/cardVisibility.ts'
      provides: 'Module-singleton IntersectionObserver + per-node callback registry'
      exports: ['observeCardVisibility']
    - path: 'src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts'
      provides: 'Behavioural unit spec for cardVisibility + comment-stripped source gates for the three rewired files'
  key_links:
    - from: 'src/frontend/screens/Library/components/GameCard/index.tsx'
      to: 'cardVisibility.ts'
      via: 'observeCardVisibility(node, () => setVisible(true)) in an effect keyed on a state-held callback ref'
      pattern: 'observeCardVisibility\('
---

<objective>
Library cards render blank art permanently. Reproduced live twice on the operator's Windows 11 machine on 2026-09-23 — once as a contiguous block ~3.5 rows down, once scattered. The victim set VARIES between runs, so this is a race, not a deterministic off-by-one.

The structural fault is a **one-shot fire-and-forget handshake**: `GamesList` sweeps `[data-invisible]` nodes with a single `IntersectionObserver`, and on intersection calls `observer.unobserve(entry.target)` and then broadcasts `window.dispatchEvent(new CustomEvent('visible-cards', ...))`. `dispatchEvent` retains no state and has no replay, and the node is unobserved the instant it is announced. A card that misses its event — listener not yet attached when the batch fired, or the card remounted after it fired — is blank **forever**: nothing re-observes it, and `GamesList`'s effect only re-runs when the `library` array changes IDENTITY.

Purpose: invert the handshake so each card observes its OWN node, while keeping ONE shared observer for perf. Because the card's effect runs immediately after its own node commits, it cannot miss its own announcement, and a remount re-observes. **This fixes BOTH candidate misses (listener-not-yet-attached AND card-remounted) without discriminating between them** — which is why the todo's open `rootMargin` measurement is MOOT here rather than skipped. Do not attempt that measurement; it exists to choose between two fixes, and this fix covers both.

Output: a new `cardVisibility.ts` module with a unit spec, a rewired `GameCard`, and the deletion of the broadcast machinery in `GamesList` and `types.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md

<interfaces>
<!-- Extracted from the codebase. Do NOT re-explore for these — they are current as of 2026-09-24. -->

**The 4 call sites of the current mechanism (exhaustive — confirmed by grep over `src/` + `meta/`):**

1. `src/frontend/screens/Library/components/GamesList/index.tsx:95-135` — effect on `[library]`, creates the observer (`rootMargin: '500px'`, `threshold: 0`), `document.querySelectorAll('[data-invisible]')` sweep, `observer.unobserve(entry.target)` + `window.dispatchEvent(...)`, cleanup `observer.disconnect()`.
2. `src/frontend/screens/Library/components/GameCard/index.tsx:88-102` — mount-only effect (deps `[]`) adding the `visible-cards` window listener that matches `gameInfoFromProps.app_name` and calls `setVisible(true)`.
3. `src/frontend/screens/Library/components/GameCard/index.tsx:504-513` — the `if (!visible)` early return rendering the placeholder div.
4. `src/frontend/types.ts:232` — `'visible-cards': CustomEvent<{ appNames: string[] }>` inside `interface WindowEventMap`.

**GameCard facts the executor needs:**
- `const [visible, setVisible] = useState(false)` at `:86`.
- `appName` is destructured from gameInfo at `:137` (`app_name: appName`), i.e. AFTER `:86`. The new effect must therefore not depend on `appName` — it does not need to.
- `wrapperClasses` is computed at `:490`.
- The placeholder at `:506-511` carries `className={wrapperClasses}`, `data-app-name={appName}`, `data-invisible={true}`, `data-tour={dataTour}`.
- `data-app-name` also appears on the REAL card at `:532`. `data-invisible` appears ONLY on the placeholder and in the GamesList sweep being deleted.
- `useState` and `useEffect` are already imported at `:3`. No import changes needed beyond the new module.
- The `if (!visible) return` early-return sits at `:504`, so the new hook MUST be declared in the top-of-component hook block (it already will be, alongside `:86`).

**Test-harness constraints (read `src/frontend/jest.config.js` header comment — this is load-bearing):**
- `displayName: 'Frontend'`, `testEnvironment: 'node'` — **there is NO jsdom, no `jest-environment-jsdom`, no `react-test-renderer`** in this project, and installing one is out of scope (package-manager-install carve-out + human legitimacy checkpoint).
- Therefore a `render(<GameCard/>)` regression test is NOT available. `GameCard/index.tsx` also imports `./index.css` at `:1`, which has no jest transformer — it cannot be imported at all.
- The established idiom for this exact situation is the two-shape test file: **direct unit specs for the pure module** + **comment-stripped source gates for the un-importable components**. Precedent: `src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts` (read its header comment and its `readGated`/`gateSource` helpers) and `downloadsRingStyles.test.ts`.
- `stripSourceComments` / `stripTrailingLineComment` live at `backend/testUtils/stripSourceComments` and are importable from frontend tests (the precedent file does exactly this).
- Root `tsconfig.json` has `"lib": ["esnext", "dom", "dom.iterable"]`, so `IntersectionObserver` and `Element` TYPES resolve fine under `testEnvironment: 'node'`. The RUNTIME global does not exist there — the test must stub `globalThis.IntersectionObserver`.
- `resetMocks: true` is set in the frontend project.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create cardVisibility.ts with a behavioural unit spec</name>
  <files>src/frontend/screens/Library/components/GameCard/cardVisibility.ts, src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts</files>
  <behavior>
    Write these as failing tests FIRST (RED), then implement the module (GREEN). Stub `globalThis.IntersectionObserver` with a hand-rolled fake class that records its constructor options, records `observe`/`unobserve`/`disconnect` calls, and exposes a way to drive the callback with synthetic entries. Because the module memoises its observer in module scope, use `jest.isolateModules` or `jest.resetModules()` + a fresh `require` per test so each test gets a clean singleton — state leaking between tests here would make the suite lie.
    - Observer is created with EXACTLY `rootMargin: '500px'` and `threshold: 0` — assert the constructor options object, because these are the values the current behaviour is tuned to and a silent change would alter how much of the library preloads.
    - Observing two different nodes creates only ONE IntersectionObserver (the singleton property — assert the constructor was called once).
    - `observe` is called with the node passed in.
    - Driving the callback with an entry whose `intersectionRatio > 0` fires that node's `onVisible` callback exactly once AND calls `unobserve(node)` — the perf property the todo explicitly warns against dropping.
    - An entry with `intersectionRatio === 0` fires nothing and does not unobserve.
    - An intersecting entry for node A does NOT fire node B's callback.
    - Calling the returned unsubscribe BEFORE intersection calls `unobserve(node)` and a subsequent intersection for that node fires nothing.
    - After a node has been announced, its WeakMap entry is gone: driving the callback a second time for the same node does not fire the callback again.
    - Fallback: when `globalThis.IntersectionObserver` is `undefined`, `observeCardVisibility` calls `onVisible()` synchronously and returns a no-op unsubscribe that throws nothing when called. This is fail-OPEN (show the art) rather than fail-blank, which is the whole point of the defect being fixed.
  </behavior>
  <action>
    Create `src/frontend/screens/Library/components/GameCard/cardVisibility.ts` exporting a single function `observeCardVisibility(node: Element, onVisible: () => void): () => void`.

    Module-private state: a lazily-created singleton `IntersectionObserver` (created on first call, never recreated, never disconnected — it lives for the app's lifetime) and a `WeakMap<Element, () => void>` mapping node to callback. Use a WeakMap specifically so a detached node cannot pin a closure in memory.

    The observer callback iterates entries; for each entry with `intersectionRatio > 0` it looks up the callback, deletes the WeakMap entry, calls `observer.unobserve(entry.target)`, and then invokes the callback. Delete-before-invoke so a callback that synchronously triggers a re-render cannot be re-entered.

    `observeCardVisibility` registers the callback in the WeakMap, calls `observer.observe(node)`, and returns an unsubscribe that deletes the WeakMap entry and calls `observer.unobserve(node)`. The unsubscribe must be idempotent-safe (deleting an absent key and unobserving an unobserved node are both no-ops in the DOM API).

    Guard the whole thing behind `typeof IntersectionObserver === 'undefined'` → call `onVisible()` and return a no-op. Write a short comment saying WHY (fail-open: a card that cannot be observed must show its art, not stay blank forever — that is the defect this module exists to fix).

    Keep the module free of React imports. It is a plain DOM utility, which is exactly what makes it unit-testable under `testEnvironment: 'node'`.

    Write the test at `src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts`. Open it with a header comment stating what it does and does NOT prove — specifically that no component is mounted here (no jsdom), so the React wiring in Task 2 is covered only by source gates and the real proof is owed to a live run. Follow the header-comment style of `libraryHeaderVisibility.test.ts`.
  </action>
  <verify>
    <automated>pnpm codecheck && npx jest --selectProjects Frontend src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts && npx prettier --check src/frontend/screens/Library/components/GameCard/cardVisibility.ts src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts</automated>
  </verify>
  <done>`cardVisibility.ts` exports `observeCardVisibility`; every behaviour above has a passing assertion; `pnpm codecheck` exits 0; both new files are prettier-clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rewire GameCard to self-observe and delete the broadcast machinery</name>
  <files>src/frontend/screens/Library/components/GameCard/index.tsx, src/frontend/screens/Library/components/GamesList/index.tsx, src/frontend/types.ts, src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts</files>
  <behavior>
    Append a second `describe` block of comment-stripped SOURCE GATES to the test file from Task 1 (these three files cannot be imported — CSS imports and the ContextProvider import graph). Read each file, run it through `stripSourceComments` so prose in comments cannot satisfy or falsify a gate, then assert:
    - `GameCard/index.tsx` contains `observeCardVisibility` and `setNode` and `ref={setNode}`.
    - `GameCard/index.tsx` does NOT contain `visible-cards` and does NOT contain `addEventListener`.
    - `GamesList/index.tsx` does NOT contain `IntersectionObserver`, `visible-cards`, `dispatchEvent`, or `data-invisible`.
    - `GamesList/index.tsx` STILL contains `scrollCardIntoView` and `activeController` — a negative-only gate would stay green if someone deleted the wrong effect, and the focus effect sits immediately below the one being removed. This gate is the guard against that.
    - `frontend/types.ts` does NOT contain `visible-cards`, and STILL contains `controller-changed` (same reasoning: prove the neighbouring entry survived).
    Assert against the comment-STRIPPED text in every case. Per CLAUDE.md's grep-gate hygiene rule, a gate that counts comment lines is self-invalidating — this test file's own header will mention `visible-cards` by name.
  </behavior>
  <action>
    **GameCard/index.tsx** — replace the mount-only listener effect at `:88-102` with self-observation:

    Add `const [node, setNode] = useState&lt;HTMLDivElement | null&gt;(null)` alongside the existing `visible` state at `:86`, and an effect with dependency `[node]` that returns early when `node` is null, otherwise calls `observeCardVisibility(node, () =&gt; setVisible(true))` and RETURNS that unsubscribe as its cleanup. Delete the old effect and its `callback`/`addEventListener`/`removeEventListener` body entirely.

    On the placeholder div at `:506-511`, add `ref={setNode}`.

    **Use a callback ref stored in STATE — not `useRef`.** This is the one place a naive implementation silently reintroduces the very race being fixed: the placeholder div exists ONLY while `!visible`, so it mounts and unmounts across the visible flip, and mutating a `useRef`'s `.current` does not trigger an effect. A `useRef` + `useEffect(..., [])` would read `null` on the first pass and never re-fire when the node actually commits. `ref={setNode}` makes the effect's dependency genuinely change on mount AND on remount. Write a comment at the `useState` saying this, in one or two sentences — the next reader will otherwise "simplify" it back to `useRef`.

    On the placeholder, DELETE `data-invisible={true}` — its sole consumer is the `querySelectorAll` sweep being deleted in this same change, and leaving it would imply a sweep that no longer exists. KEEP `data-app-name={appName}`: it also appears on the real card at `:532` and is a general identity attribute, not part of this mechanism. KEEP `className={wrapperClasses}` and `data-tour={dataTour}` unchanged.

    **GamesList/index.tsx** — delete the ENTIRE first `useEffect` at `:95-135` (the options object, the `IntersectionObserverCallback`, the `new IntersectionObserver`, the `querySelectorAll('[data-invisible]')` sweep, the `dispatchEvent`, and the `disconnect` cleanup). **LEAVE the `activeController` / `scrollCardIntoView` effect at `:137-151` COMPLETELY UNTOUCHED** — it is adjacent and unrelated. Remove any import that becomes unused as a result (check what `useEffect` is still used for before removing it from the import list — the second effect still needs it).

    **frontend/types.ts** — remove the `'visible-cards': CustomEvent&lt;{ appNames: string[] }&gt;` line at `:232`. Leave `'controller-changed'` and the surrounding `WindowEventMap` interface intact.

    Then append the source-gate describe block to the test file per `&lt;behavior&gt;`.
  </action>
  <verify>
    <automated>pnpm codecheck && pnpm lint && npx jest --selectProjects Frontend src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts && npx prettier --check src/frontend/screens/Library/components/GameCard/index.tsx src/frontend/screens/Library/components/GamesList/index.tsx src/frontend/types.ts src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts</automated>
  </verify>
  <done>`visible-cards` appears nowhere in `src/` (verify with `grep -rn "visible-cards" src/ | grep -v __tests__` returning nothing); GamesList's focus effect is intact; `pnpm codecheck` and `pnpm lint` exit 0; all four paths are prettier-clean.</done>
</task>

<task type="auto">
  <name>Task 3: Retire the todo</name>
  <files>.planning/todos/pending/2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md</files>
  <action>
    `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/`. Do NOT edit its frontmatter — the `severity`/`platform`/`ready` gate in `.planning/todos/todo-frontmatter-gate.py` scopes to `pending/` only, and `completed/` is deliberately exempt.

    In the SUMMARY, record the two of the todo's three open questions that this fix makes MOOT rather than answered, and the one it does not touch:
    - "Which miss is it — listener-not-yet-attached or card-remounted?" — moot. Self-observation covers both, so the discriminating `rootMargin` experiment was deliberately not run.
    - "Does a full app restart clear it?" — moot for blast-radius purposes; there is no longer a permanent state to persist.
    - "Is it Steam-specific?" — untouched by this fix and unanswerable from code. The mechanism was never store-specific (`GameCard` is shared), so the question is most likely a red herring, but say so rather than claiming it resolved.

    Also record honestly that NO live verification was performed: the frontend jest project has no jsdom, so nothing here mounts a card or renders artwork. The proof that library art now recovers is owed to a live run on the operator's machine — returning to the library after opening a game's install dialog, which is how it was reproduced twice.
  </action>
  <verify>
    <automated>pnpm planning-gates && test ! -f .planning/todos/pending/2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md && test -f .planning/todos/completed/2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md</automated>
  </verify>
  <done>Todo lives in `completed/`, moved with `git mv` so history is preserved; `pnpm planning-gates` exits 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none crossed) | This change is entirely renderer-local DOM observation. No IPC, no network, no filesystem, no user input parsing, no new dependencies. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-swb-01 | Denial of Service | `cardVisibility.ts` singleton observer | mitigate | WeakMap keyed on Element so detached nodes cannot pin callbacks; `unobserve` retained on announce and on unsubscribe, so the observer's watch set does not grow without bound across library re-renders. |
| T-swb-02 | Denial of Service | `IntersectionObserver` unavailable | mitigate | Fail-open: `onVisible()` fires immediately, so the failure mode is "art loads eagerly", not "library is permanently blank". |
| T-swb-SC | Tampering | npm/pip/cargo installs | n/a | No packages are installed by this plan. The no-jsdom constraint is honoured rather than solved by installing a test environment. |
</threat_model>

<verification>
- `grep -rn "visible-cards" src/` returns matches ONLY inside the new test file (its header comment and its source-gate string literals).
- `grep -rn "data-invisible" src/` returns nothing.
- `npx jest --selectProjects Frontend` passes in full, not just the new file.
- `pnpm codecheck` and `pnpm lint` exit 0.
- `npx prettier --check` passes over every path this plan wrote — explicit paths only, never a bare `.`.

**Not proven by any of the above, and stated plainly:** that library artwork actually recovers on the operator's machine. Nothing here mounts a component or loads an image. The defect was reproduced live twice; only a live run can retire it.
</verification>

<success_criteria>
- Each `GameCard` observes its own node via a shared module-singleton observer; a card mounting after an earlier announcement still becomes visible.
- `unobserve()` on intersection is preserved — the perf property the todo explicitly warned against dropping.
- The `visible-cards` broadcast, its `GamesList` dispatcher, its `GameCard` listener, and its `WindowEventMap` declaration are all gone.
- `GamesList`'s `activeController` / `scrollCardIntoView` effect is untouched and gated as such.
- The todo is in `completed/`.
</success_criteria>

<output>
Create `.planning/quick/260924-swb-fix-library-card-art-never-recovering-fr/260924-swb-SUMMARY.md` when done.
</output>
