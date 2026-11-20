---
phase: quick-261008-aoe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
  - src/frontend/screens/Login/components/OAuthLogin/index.tsx
  - src/frontend/screens/Login/components/HumbleLogin/index.tsx
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts
  - src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
  - src/frontend/screens/Login/__tests__/overlayDismiss.test.ts
  - .planning/todos/pending/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md
  - .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md
autonomous: true
requirements:
  - QUICK-261008-aoe

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - On Manage Accounts, clicking Retry in the GOG, Epic or Amazon `error`/`timeout` Dialog starts a fresh sign-in attempt WITHOUT reloading the app. Only that overlay remounts, because `overlayMountKey` was bumped, and `useTauriOAuthLogin`'s mount effect runs a new capture.
    - Clicking Retry in the Humble `error`/`timeout` Dialog starts a fresh Humble login watch WITHOUT reloading the app, because the `HumbleLogin` remount re-runs `HumbleLoginSurface`'s mount effect.
    - The `/loginweb/*` routes still reload the page on Retry, exactly as today. That covers `WebView/index.tsx`'s login arm and `HumbleLoginSurface`'s no-`renderState` fallback, and neither passes `onRetry`.
    - "`TauriLoginPanel` stays hookless and invocable as a plain function. When the host omits `onRetry`, its Retry behaviour is unchanged: one `window.location.reload()` call site."
    - Retry never forwards the click event into host code. The panel calls `onRetry()` with zero arguments.
    - A late `dismiss` from an OAuth overlay that Retry (or a reopen) has replaced can never close the current overlay. `OAuthLogin` gets the same key-bound dismiss that Steam and Humble already have.
    - The capture effect is never re-run mid-login. `OAuthLogin` still builds exactly two empty-dependency `useCallback`s (D-2 of 261003-s04), and `onRetry` never enters `useTauriOAuthLogin`'s dependency array.
  artifacts:
    - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
    - src/frontend/screens/Login/components/OAuthLogin/index.tsx
    - src/frontend/screens/Login/components/HumbleLogin/index.tsx
    - src/frontend/screens/Login/index.tsx
    - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
    - src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts
    - src/frontend/screens/Login/__tests__/loginCrossfade.test.ts
    - src/frontend/screens/Login/__tests__/overlayDismiss.test.ts
    - .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md
  key_links:
    - "`TauriLoginPanel` Retry button `onClick` -> host `onRetry()` (zero args) when supplied, else `window.location.reload()`. This one branch is the whole seam. Losing the fallback breaks the `/loginweb/*` routes, and losing the delegation brings the full-app reload back to the overlays."
    - "`Login/index.tsx` `retryLoginOverlay` -> `openLoginOverlay(openOverlay)` -> `overlayMountKeyRef.current += 1` + `setOverlayMountKey` -> `key={overlayMountKey}` on `<OAuthLogin>` / `<HumbleLogin>` -> React discards the old overlay subtree and mounts a fresh one."
    - "Fresh `OAuthLogin` mount -> `useTauriOAuthLogin` effect (deps `[runner, onLoginSuccess, onCancelled]`, all stable) -> `run()` -> `oauthCaptureLogin` opens a new native window (`getAmazonLoginData` first for nile). The remount IS the re-trigger, so no explicit restart call exists or is needed."
    - "Fresh `HumbleLogin` mount -> fresh `HumbleLoginSurface` -> its `[]`-dep effect -> `humbleStartLogin()`/`humbleReconnect()`. The old surface's cleanup sends `humbleStopLogin()` first (see T-AOE-02)."
    - "`bindOverlayDismiss(overlayMountKey, overlayMountKeyRef, dismissLoginOverlay)` on `<OAuthLogin>`. Without it, a replaced OAuth overlay's late `onCancelled`/`onLoginSuccess` dismiss closes whichever overlay is current."
---

<objective>
Action the pending todo
`.planning/todos/pending/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md`.
Its "Fix shape" is the authority for this plan.

Today the Retry button in `TauriLoginPanel`'s `cancelled`/`timeout`/`error` branches is hard-wired to
`window.location.reload()`. Inside the Login screen's `OAuthLogin` (GOG, Epic/legendary,
Amazon/nile) and `HumbleLogin` overlays, that tears down and re-boots the whole renderer to retry
one sign-in attempt. Quick task 261003-s04 (its D-5) deferred the fix only because `TauriLoginPanel`
was out of scope there.

This plan gives the panel an optional `onRetry` prop. When it is absent the panel keeps today's
reload, which the `/loginweb/*` routes need because they have no overlay to remount. Both Login-screen
overlays get a remount-based `onRetry` that re-opens the same overlay through `openLoginOverlay`.
That call bumps `overlayMountKey`, so React remounts only that overlay. The fresh mount's own effect
re-triggers the capture: `useTauriOAuthLogin`'s `run()` for OAuth, and `HumbleLoginSurface`'s login
watch for Humble.

Purpose: one sign-in retry stops costing a full app restart.
Output: the `onRetry` seam, wired into both overlays and pinned by source gates and plain-function
tests. The todo moves to `.planning/todos/completed/` with a Resolution section.

Planning-time observations that shape this plan:

1. **Path correction.** The panel lives at `src/frontend/screens/WebView/components/TauriLoginPanel.tsx`.
   It is a single file, not `.../TauriLoginPanel/index.tsx`. Its test is
   `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx`.
2. **Pre-existing red, fixed in Task 2.** `src/frontend/screens/Login/__tests__/overlayDismiss.test.ts`
   has failed at HEAD since `d6c124006` (261003-s04). That commit added `<OAuthLogin ... dismiss={dismissLoginOverlay} />`,
   but the suite asserts that no overlay receives the bare `dismissLoginOverlay` (line 72).
   Baseline measured at planning time: 5 targeted suites, 79 tests, 78 pass, 1 fails (this one).
   This plan fixes it for two reasons. The suite gates the exact mount-key mechanism that Retry
   rides on. And Retry makes replacing an overlay with another of the same runner a routine user
   path, which is precisely the case `bindOverlayDismiss` exists for ("A Steam -> Steam reopen was
   likewise closed by the previous mount", `overlayDismiss.ts`).
   This is a planner-discretion inclusion, not part of the todo's fix shape. It is called out so it
   can be vetoed.
3. **Remount is the re-trigger.** `useTauriOAuthLogin`'s cleanup only sets `cancelled = true` and logs.
   It sends nothing to the backend, and a fresh mount runs `run()` again. Retry only renders on
   terminal phases, so the old `run()` has already finished when it is clicked. For Humble, the old
   `HumbleLoginSurface`'s cleanup calls `humbleStopLogin()` and the new mount calls
   `humbleStartLogin()`/`humbleReconnect()`. See threat T-AOE-02 for the residual risk in that
   ordering.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md
@.planning/quick/261003-s04-move-the-gog-epic-legendary-and-amazon-n/261003-s04-PLAN.md
@src/frontend/screens/WebView/components/TauriLoginPanel.tsx
@src/frontend/screens/Login/components/OAuthLogin/index.tsx
@src/frontend/screens/Login/components/HumbleLogin/index.tsx
@src/frontend/screens/Login/overlayDismiss.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>`-style check. Every path this
plan touches under `src/frontend` was measured at planning time with
`npx prettier --file-info <path>` (prettier 3.7.4). Each reported
`{ "ignored": false, "inferredParser": "typescript" }`, and the root `printWidth` of 80 governs all
of them. `.planning/**` reports `{ "ignored": true, "inferredParser": null }`.

Key source facts, so the executor does not have to rediscover them:

- `TauriLoginPanel.tsx`
  - The Retry element is the single `retryButton` const (about line 123), whose `onClick` is
    `() => window.location.reload()`.
  - It is rendered only in the `cancelled` (about 253), `timeout` (about 280) and `error` (about 311)
    branches. The `humble` early-return branch (about 104) and `blocked` render no Retry.
  - `Props` is `{ runner?: string; state?: TauriOAuthLoginState }`.
  - The component's only hook is `useTranslation`. That is deliberate: the file's doc comment and
    its test both rely on invoking it as a plain function.
- `Login/index.tsx`
  - `openLoginOverlay(which)` (about line 225) clears the unmount timer, does
    `overlayMountKeyRef.current += 1`, calls `setOverlayMountKey`, then sets
    `setMountedOverlay(which)` and `setOpenOverlay(which)`.
  - `dismissLoginOverlay` (about 242) clears `openOverlay` synchronously and unmounts after
    `LOGIN_DIALOG_EXIT_MS` (500).
  - The overlays mount at about 286-312 as `<SteamLogin key={overlayMountKey} dismiss={bindOverlayDismiss(...)} />`
    and `<HumbleLogin key={overlayMountKey} dismiss={bindOverlayDismiss(...)} />`, plus
    `<OAuthLogin key={overlayMountKey} runner={mountedOverlay} dismiss={dismissLoginOverlay} />`.
    That last bare dismiss is the pre-existing red.
- `OAuthLogin/index.tsx`
  - `DIALOG_PHASES` is `preparing`/`blocked`/`error`/`timeout`. A `cancelled` outcome routes to
    `onCancelled` -> `dismiss`, so this overlay's Retry is only ever visible in `error` and
    `timeout`.
  - The D-2 gate in `oauthLoginOverlay.test.ts` requires exactly 2 `useCallback(` occurrences, both
    with empty dependency arrays.
- `HumbleLogin/index.tsx` renders `<TauriLoginPanel runner="humble" state={state} />` inside its
  `renderState` Dialog, for `error`/`timeout` only.
- `overlayDismiss.test.ts` slices each overlay's JSX tag with `new RegExp('<' + overlay + '\\b[^>]*>')`.
  `[^>]*` stops at the FIRST `>`, so an inline arrow function (`() =>`) written inside an overlay tag
  truncates the slice at the arrow. **Every new prop on `<OAuthLogin>`/`<HumbleLogin>` must
  therefore be a named reference (`onRetry={retryLoginOverlay}`), never an inline arrow.** The new
  gates below slice tags the same way.
- Test runner: `pnpm test -- <paths>`, i.e. jest with the root `projects` config. The Frontend
  project is `testEnvironment: 'node'` with `resetMocks: true`. There is no jsdom and no
  react-test-renderer, so component tests invoke components as plain functions, and screen-level
  wiring is pinned with `readFileSync` + `stripSourceComments` source gates.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer, GOG/Epic/Amazon Retry remounts the OAuth overlay end to end (panel seam, OAuthLogin, Login host, gates)</name>
  <files>src/frontend/screens/WebView/components/TauriLoginPanel.tsx, src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx, src/frontend/screens/Login/components/OAuthLogin/index.tsx, src/frontend/screens/Login/index.tsx, src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts</files>
  <behavior>
    - Panel with `onRetry` (runner `gog`). For each Retry-bearing phase (`cancelled`, `timeout`, and `error` with a message), invoking the Retry button's `onClick` calls `onRetry` exactly once with zero arguments (`toHaveBeenCalledWith()`). The `window.location.reload` spy is never called.
    - Panel with `onRetry` (runner `humble`, phase `error`). Clicking Retry calls `onRetry` once and does not reload. This is the HumbleLogin overlay's path.
    - Panel WITHOUT `onRetry` (runner `gog`, phase `timeout`). Clicking Retry calls the reload spy once. This is the `/loginweb/*` default.
    - SOURCE GATE on comment-stripped `TauriLoginPanel.tsx`: exactly one `window.location.reload()` match (the single default site), and `Props` declares `onRetry?:`.
    - SOURCE GATE on `OAuthLogin/index.tsx`: `Props` declares `onRetry: () => void`, and the panel is rendered as `<TauriLoginPanel runner={runner} state={state} onRetry={onRetry} />`. Use whitespace-tolerant `\s+` between attributes.
    - SOURCE GATE on `Login/index.tsx`: the `<OAuthLogin\b[^>]*>` tag slice contains `onRetry={retryLoginOverlay}`. The `retryLoginOverlay` body, sliced from `function retryLoginOverlay(` to the next `\n  }\n` exactly as `overlayDismiss.test.ts` slices `openLoginOverlay`, calls `openLoginOverlay(` and reads `openOverlay`. The stripped file has zero `location.reload(` matches.
    - SOURCE GATE on `WebView/index.tsx` (read-only): the stripped file has zero `onRetry` matches, so the loginweb arm keeps the panel's reload default.
  </behavior>
  <action>
**RED first.** Write all the tests below, run them, and confirm the new behavioural tests and new
PRESENCE gates fail against the unmodified source. The failure should be "onRetry not called /
reload called" and the missing-token gates. Commit as `test(261008-aoe): add failing gates for host-supplied Retry on the OAuth overlay`.

Two gates are green at RED by design, because they pin the preserved default:

- the single-reload-site PRESENCE gate;
- the `WebView/index.tsx` zero-`onRetry` ABSENCE gate.

For each of those, mirror these suites' FALSIFIABILITY practice. Make one temporary local mutation
of the guarded file: delete the reload call, or add an `onRetry` token to the loginweb arm. Watch the
gate go red, then revert. Verify restoration with a SHA-256 of the pristine file taken before the
mutation, NOT `git diff --quiet`, which this repo has a documented false-negative trap against.
Record each mutation and its observed failure in the SUMMARY.

**Tests.**

`TauriLoginPanel.test.tsx`:

- Hoist the `findButton` helper out of the existing "the Retry button reloads the page..." test to
  module scope, next to `collectText`/`collectClassNames`. That existing test keeps working
  unchanged against the hoisted helper.
- Append a new describe, `TauriLoginPanel -- host-supplied onRetry (quick task 261008-aoe)`,
  holding the behaviours above:
  - Use `it.each` over the three Retry-bearing phases.
  - Stub reload per test with the same `Object.defineProperty(window, 'location', { value: { reload: reloadSpy }, writable: true })` idiom the existing test uses.
  - For the two source gates, read the panel through the existing `panelSourcePath` idiom:
    `join(__dirname, '..', 'TauriLoginPanel.tsx')` + `readFileSync` + `stripSourceComments`.

`oauthLoginOverlay.test.ts`:

- Update the existing "TauriLoginPanel is rendered with the live hook state" regex so it also
  requires `onRetry={onRetry}`.
- Leave the `WebView/index.tsx` regression guard (the exact `<TauriLoginPanel runner={runner} state={oauthLoginState} />` match) and the D-2 `useCallback` count gate byte-identical. Both must still pass, and they are what proves the loginweb route and the capture-effect stability are untouched.
- Append a describe, `261008-aoe: Retry remounts the OAuth overlay instead of reloading the app`,
  holding the OAuthLogin, Login and WebView gates above.
- Label each test PRESENCE or ABSENCE, with a "Breaks if:" comment, matching the file's existing
  style. Extend the file header doc to mention 261008-aoe.

**Implementation (GREEN).**

1. `TauriLoginPanel.tsx`:
   - Add `onRetry?: () => void` to `Props`, with a comment. It is a host-supplied Retry action; the
     Login screen's overlays pass one that remounts just their overlay through `overlayMountKey`.
     When absent the panel reloads the page, which is what the `/loginweb/*` routes need because
     they have no overlay to remount.
   - Destructure `onRetry` in the signature.
   - Change `retryButton`'s `onClick` to an arrow. It calls `onRetry()` with NO arguments when
     `onRetry` is defined, and otherwise `window.location.reload()`. Keep that as the file's single
     reload call site.
   - Do not pass `onRetry` directly as `onClick`. That would forward React's SyntheticEvent into
     host code, the same shape of defect as debug session `open-external-frame-noop` in
     `src/preload/tauriTransport.ts`.
   - Add no hook (no `useCallback`). The component must stay invocable as a plain function.
   - Update the component doc comment's `{ phase: 'cancelled' | 'timeout' | 'error' }` bullet
     (about lines 77-79) to describe the delegation and the reload default.
2. `OAuthLogin/index.tsx`:
   - Add a required `onRetry: () => void` to `Props`, destructure it, and pass `onRetry={onRetry}`
     to `TauriLoginPanel`.
   - Do NOT wrap it in `useCallback` and do NOT route it through a ref. It is only a click handler,
     and it never reaches `useTauriOAuthLogin`'s dependency array. A third `useCallback` would also
     turn the D-2 count gate red.
   - Rewrite the doc comment's D-5 paragraph. 261008-aoe supersedes 261003-s04's D-5. Retry is still
     the panel's one button (no second affordance), but the host now supplies the action: re-open
     this overlay, which bumps `overlayMountKey` and remounts this component, whose
     `useTauriOAuthLogin` mount effect runs a fresh capture.
3. `Login/index.tsx`:
   - Add `function retryLoginOverlay()` directly after `dismissLoginOverlay`. It returns early when
     `openOverlay === null`, and otherwise calls `openLoginOverlay(openOverlay)`.
   - Comment why it reads `openOverlay` and not `mountedOverlay`. An overlay already dismissed and
     still playing its 500ms exit must not be resurrected by its own Retry.
   - Comment why it is not wrapped in `bindOverlayDismiss`. Retry is a synchronous click inside the
     currently mounted overlay, and a key remount discards the old subtree in the same commit, so the
     late-async hazard that binder guards cannot arise for it.
   - Comment why no explicit restart call exists: the remount itself re-runs the overlay's mount
     effect.
   - Add `onRetry={retryLoginOverlay}` to the `<OAuthLogin ...>` tag as a named reference, never an
     inline arrow (see the `[^>]*>` note in context).
   - Extend the overlay-lifecycle comment block (about lines 82-93) so `overlayMountKey`'s stated
     purposes include Retry.
   - Leave `<OAuthLogin>`'s `dismiss` prop alone in THIS task. Task 2 owns that edit, so
     `overlayDismiss.test.ts` is expected to stay at its pre-existing single failure here.

Run the verify battery and commit as `feat(261008-aoe): Retry in TauriLoginPanel hands back to the host; OAuth overlay remounts via overlayMountKey`.
  </action>
  <verify>
    <automated>pnpm test -- src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx src/frontend/screens/Login/__tests__/loginCrossfade.test.ts && pnpm codecheck && npx prettier --check src/frontend/screens/WebView/components/TauriLoginPanel.tsx src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx src/frontend/screens/Login/components/OAuthLogin/index.tsx src/frontend/screens/Login/index.tsx src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts</automated>
  </verify>
  <done>
- The four named suites pass, including every new 261008-aoe test.
- `pnpm codecheck` exits 0, which proves the required `onRetry` prop threads from `Login/index.tsx` through `OAuthLogin` into the panel with types intact.
- `npx prettier --check` over the five written paths exits 0. All five were measured `"ignored": false` at planning time.
- `overlayDismiss.test.ts` is deliberately not in this task's battery. It stays at its pre-existing single failure until Task 2.
- RED and GREEN are committed separately, and the two default-preserving gates have a recorded mutation proof.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Humble overlay Retry remounts too; OAuthLogin's dismiss joins the key-bound dismiss</name>
  <files>src/frontend/screens/Login/components/HumbleLogin/index.tsx, src/frontend/screens/Login/index.tsx, src/frontend/screens/Login/__tests__/loginCrossfade.test.ts, src/frontend/screens/Login/__tests__/overlayDismiss.test.ts</files>
  <behavior>
    - SOURCE GATE on `HumbleLogin/index.tsx`: `Props` declares `onRetry: () => void`, and the Dialog renders `<TauriLoginPanel runner="humble" state={state} onRetry={onRetry} />`. Use whitespace-tolerant `\s+` between attributes. The stripped file has zero `location.reload(` matches.
    - SOURCE GATE on `Login/index.tsx`: the `<HumbleLogin\b[^>]*>` tag slice contains `onRetry={retryLoginOverlay}`.
    - SOURCE GATE on `HumbleLoginSurface.tsx` (read-only): the stripped file has zero `onRetry` matches, so the `/loginweb/humble` route keeps the panel's reload default. The existing PRESENCE gate for `<TauriLoginPanel runner="humble" state={humbleLoginState} />` stays green.
    - `overlayDismiss.test.ts`: the key-bound-dismiss loop covers `SteamLogin`, `HumbleLogin` AND `OAuthLogin`. The existing "no bare `dismiss={dismissLoginOverlay}`" assertion turns GREEN, fixing the pre-existing red.
  </behavior>
  <action>
**RED first.** Add the tests below and confirm they fail against the post-Task-1 source:

- the new Humble gates in `loginCrossfade.test.ts`;
- `overlayDismiss.test.ts` with `OAuthLogin` added to its loop. It is already red at line 72, and
  now also red in the per-tag loop.

Commit as `test(261008-aoe): add failing gates for Humble Retry remount and OAuthLogin key-bound dismiss`.

The `HumbleLoginSurface` zero-`onRetry` ABSENCE gate is green at RED by design. Give it the same
temporary-mutation proof, with SHA-256 restore verification, that Task 1 used, and record it in the
SUMMARY.

**Tests.**

`loginCrossfade.test.ts`:

- Append a describe, `261008-aoe: the Humble overlay's Retry remounts it instead of reloading the app`.
- Hold the HumbleLogin, Login and HumbleLoginSurface gates above in it, reusing the file's existing
  `read`/`readRaw` helpers and path constants.
- Label each test PRESENCE or ABSENCE, with a "Breaks if:" comment.

`overlayDismiss.test.ts`:

- Extend the `for (const overlay of [...])` list to include `'OAuthLogin'`.
- Retitle the test to name all three overlays.
- Add a sentence to the file's header doc. Retry (261008-aoe) makes replacing an overlay with
  another of the same runner routine, and `useTauriOAuthLogin` invokes `onCancelled`/`onLoginSuccess`
  outside its `cancelled` state gate (Plan 34.5-34). An unbound OAuthLogin dismiss can therefore
  arrive late from a replaced mount and close the current overlay.

**Implementation (GREEN).**

1. `HumbleLogin/index.tsx`:
   - Add a required `onRetry: () => void` to `Props`, destructure it, and pass `onRetry={onRetry}` to
     the `TauriLoginPanel` inside the `renderState` Dialog.
   - Leave `HumbleLoginSurface` untouched. Its no-`renderState` fallback is the `/loginweb/humble`
     route and must keep the panel's reload default.
   - Update the component doc comment. Retry now re-opens this overlay through the host, which bumps
     `overlayMountKey`. The remount gives a fresh `HumbleLoginSurface`, whose mount effect restarts
     the login watch. The replaced surface's cleanup issues `humbleStopLogin()` first.
2. `Login/index.tsx`:
   - Add `onRetry={retryLoginOverlay}` to the `<HumbleLogin ...>` tag as a named reference, never an
     inline arrow.
   - Change `<OAuthLogin ...>`'s `dismiss` prop to `bindOverlayDismiss(overlayMountKey, overlayMountKeyRef, dismissLoginOverlay)`,
     in the exact argument order and shape the `SteamLogin`/`HumbleLogin` tags use.
   - This does not disturb 261003-s04's D-2. `OAuthLogin` already reads `dismiss` through
     `dismissRef`, so a per-render bound closure is no different from today's per-render
     `dismissLoginOverlay` identity.

Run the verify battery and commit as `feat(261008-aoe): Humble overlay Retry remounts via overlayMountKey; bind OAuthLogin dismiss to its mount`.
  </action>
  <verify>
    <automated>pnpm test -- src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx src/frontend/screens/Login/__tests__/loginCrossfade.test.ts src/frontend/screens/Login/__tests__/overlayDismiss.test.ts && pnpm codecheck && npx prettier --check src/frontend/screens/Login/components/HumbleLogin/index.tsx src/frontend/screens/Login/index.tsx src/frontend/screens/Login/__tests__/loginCrossfade.test.ts src/frontend/screens/Login/__tests__/overlayDismiss.test.ts</automated>
  </verify>
  <done>
- All five suites pass with zero failures. The planning-time baseline was 78/79, with the one failure at `overlayDismiss.test.ts:72`; that failure is now gone and the new tests are added on top.
- `pnpm codecheck` exits 0.
- `npx prettier --check` over the four written paths exits 0.
- RED and GREEN are committed separately, and the HumbleLoginSurface absence gate has a recorded mutation proof.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo, run the full scoped battery, and hand the live Retry click to the operator</name>
  <files>.planning/todos/pending/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md, .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md</files>
  <action>
1. Move the todo with `git mv` from `.planning/todos/pending/` to `.planning/todos/completed/`,
   keeping its filename. That is the repo's convention: 309 files in `completed/`, and `pending/` is
   the only directory the triage gate scans.
2. Following the observed completed-todo shape (for example
   `.planning/todos/completed/2026-09-21-confirm-the-five-guarded-suites-run-green-on-the-linux-ci-runner.md`),
   insert two lines directly after `ready: code`: `status: RESOLVED`, then `resolved: 2026-10-08`.
   Leave every other frontmatter key as it is.
3. Append a `## Resolution (2026-10-08, quick 261008-aoe)` section. Keep it factual, and match the
   wrap and indentation of the surrounding file by hand, because prettier ignores `.planning/`. It
   records:
   - the `onRetry` seam and its reload default;
   - `retryLoginOverlay` -> `openLoginOverlay` -> `overlayMountKey` remount, and why the remount is
     itself the capture re-trigger;
   - the two overlays wired;
   - the `/loginweb/*` routes unchanged;
   - the bundled `OAuthLogin` key-bound-dismiss fix for the pre-existing `overlayDismiss.test.ts`
     red;
   - the gate suites and the commit hashes.

   State honestly that fix-shape item 3's LIVE half (a real Retry click on one OAuth runner and on
   Humble) is NOT proven by any automated check. It is carried by this plan's `<human-check>` below,
   and the residual Humble stop/start ordering risk (T-AOE-02) is named there.
4. Run the full scoped battery:
   - the five Login/panel suites;
   - the five untouched `/loginweb/*` regression suites, all green at planning time (67 tests):
     `HumbleLoginWatchErrorHandling.test.ts`, `humbleLoginChromeCss.test.ts`,
     `WebviewUnavailablePanel.test.tsx`, `WebViewOAuthNavigation.test.ts` and
     `HumbleLoginSurfaceWatchRejection.test.tsx`;
   - `pnpm lint` (both ceilings PASS);
   - `pnpm planning-gates`.
5. Run `graphify update .` (per CLAUDE.md). `graphify-out/` is gitignored, so there is nothing to
   commit from it.

Commit as `docs(261008-aoe): resolve the OAuth/Humble overlay Retry todo`.

Formatter: this task writes only `.planning/**`, which `npx prettier --file-info` reports as
`{ "ignored": true, "inferredParser": null }`. A `--check` over it would be vacuous, so it is
deliberately omitted per the gamelib-conventions formatter rule. That omission is stated here, not
silently skipped.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md && grep -q '^status: RESOLVED$' .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md && grep -q '^resolved: 2026-10-08$' .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md && grep -q '^## Resolution (2026-10-08, quick 261008-aoe)' .planning/todos/completed/2026-10-03-oauth-overlay-retry-is-a-full-app-reload-not-a-dialog-remount.md && pnpm test -- src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx src/frontend/screens/Login/__tests__/loginCrossfade.test.ts src/frontend/screens/Login/__tests__/overlayDismiss.test.ts src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx src/frontend/screens/WebView/__tests__/WebViewOAuthNavigation.test.ts src/frontend/screens/WebView/__tests__/HumbleLoginSurfaceWatchRejection.test.tsx && pnpm lint && pnpm planning-gates</automated>
    <human-check>
Live Retry gate. Run on the Tauri build (`pnpm tauri:dev` or a packaged build). No automated check
in this plan can see any of this.

Q1 (OAuth). Force one OAuth runner into `error` or `timeout`. Suggested: disable networking, then
click the Amazon tile; `getAmazonLoginData` fails and the `error` Dialog appears. Re-enable
networking and click Retry. Expected:
- The app does NOT reload. Manage Accounts never blanks, and gamelib.log shows no fresh boot lines
  between the attempts.
- The log shows `[useTauriOAuthLogin] runner=nile phase=teardown inflight=false` followed by a new
  `phase=preparing` line.
- A fresh native sign-in window opens.

Q2 (Humble). Get the Humble overlay to `error` or `timeout`. The WR-03 ten-minute watch deadline is
the deterministic route; any reproducible error path also works. Click Retry. Expected:
- No app reload.
- A fresh native Humble sign-in window opens.
- The overlay does NOT immediately re-show the timeout Dialog. If it does, that is the T-AOE-02
  stop/start ordering race. Record it and file a todo; do not patch it inside this plan.

Q3 (unchanged route, optional if reachable). On a `/loginweb/<runner>` route (reachable from
LoginWarning or Humble > Keys), a failure's Retry still reloads the app as before.
    </human-check>
  </verify>
  <done>
- The todo exists only under `.planning/todos/completed/`, with `status: RESOLVED`, `resolved: 2026-10-08` and a Resolution section that names the live half as pending the human-check.
- All ten scoped suites pass.
- `pnpm lint` passes both ceilings.
- `pnpm planning-gates` passes.
- The SUMMARY records the human-check questions as pending operator verification.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| panel -> host callback | `TauriLoginPanel` (shared, also route-hosted) invokes a host-supplied function on click |
| overlay mount -> overlay mount | a replaced overlay's late async callbacks can reach `Login/index.tsx` state owned by its successor |
| renderer -> sidecar IPC | Humble Retry issues `humbleStopLogin` (`sidecar_send`, FIFO writer thread) then `humbleStartLogin` (`sidecar_invoke`, `spawn_blocking`) on two different Rust transports |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-AOE-01 | Denial of service | `Login/index.tsx` `<OAuthLogin dismiss=...>` | low | mitigate | Task 2 binds OAuthLogin's dismiss with `bindOverlayDismiss(overlayMountKey, overlayMountKeyRef, dismissLoginOverlay)`. A late `onCancelled`/`onLoginSuccess` dismiss from the mount that Retry replaced becomes a no-op. `completeOAuthLogin` still runs, because only the dismiss is key-gated. Pinned by `overlayDismiss.test.ts` with `OAuthLogin` in its loop. |
| T-AOE-02 | Denial of service | Humble Retry: `HumbleLoginSurface` cleanup -> `humbleStopLogin` vs fresh mount -> `humbleStartLogin` | low | accept | React runs the old surface's cleanup before the new mount's effect, so stop is SENT first. But the two travel different Rust transports (`sidecar_send` enqueues to a FIFO writer thread; `sidecar_invoke` writes from `spawn_blocking`), so their arrival order at the sidecar is not guaranteed. A stop landing after `watchForLogin` sets `HumbleUser.activeWatch` would settle the new watch as `waiting`, which shows as an instant timeout. Accepted because: the old watch has already settled (`activeWatch` is null) so the window is narrow; the existing reopen-during-teardown path already relies on the same ordering; and the only in-scope fix edits `HumbleLoginSurface`'s shared cleanup, which also serves `/loginweb/humble`. Human-check Q2 observes it, and a todo is filed if it reproduces. |
| T-AOE-03 | Tampering | `TauriLoginPanel` `retryButton` `onClick` | low | mitigate | The panel calls `onRetry()` with zero arguments, never `onClick={onRetry}`. The React SyntheticEvent therefore cannot cross into host code (the same defect shape as `open-external-frame-noop`). Pinned by `toHaveBeenCalledWith()` in `TauriLoginPanel.test.tsx`. |
| T-AOE-04 | Tampering | `/loginweb/*` routes (`WebView/index.tsx`, `HumbleLoginSurface.tsx`) | low | mitigate | `onRetry` is optional and the reload is its default. Gates pin: one reload site in the panel; zero `onRetry` in `WebView/index.tsx` and in `HumbleLoginSurface.tsx`; the exact route render strings unchanged. The five `/loginweb/*` regression suites run in Task 3. |
| T-AOE-05 | Denial of service | `OAuthLogin` capture effect | low | mitigate | `onRetry` is not wrapped in `useCallback` and never enters `useTauriOAuthLogin`'s deps, so the D-2 two-empty-dep-`useCallback` gate is unchanged and still enforced. Retry only renders on terminal phases, so remounting never abandons an in-flight capture or burns a single-use OAuth code. |
| T-AOE-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package-manager install occurs in this plan. Every dependency used is already in the tree, so the package-legitimacy gate is vacuous by construction; this is stated rather than silently skipped. If any task turns out to need an install, stop and raise a blocking human checkpoint before running it. |
</threat_model>

<verification>
Planning-time baselines (measured 2026-10-08):

- **Targeted suites.** The five targeted suites (`TauriLoginPanel.test.tsx`, `oauthLoginOverlay.test.ts`,
  `loginInFlightUiReachability.test.tsx`, `loginCrossfade.test.ts`, `overlayDismiss.test.ts`) gave
  79 tests, 78 passing, 1 failing. The failure is `overlayDismiss.test.ts:72`, pre-existing since
  `d6c124006`.
- **Regression suites.** The five `/loginweb/*` regression suites gave 67/67 passing.

After this plan:

1. All ten suites are green with zero failures. Run them scoped via `pnpm test -- <paths>`, never
   the whole suite.
2. `pnpm codecheck` exits 0.
3. `pnpm lint` passes both ceilings.
4. `pnpm planning-gates` passes.
5. `npx prettier --check` passes over the eight `src/frontend` paths written. All eight were measured
   `"ignored": false` at planning time. The `.planning/**` todo move is prettier-ignored and is
   deliberately not checked.
6. Task 3's `<human-check>` live Retry gate (Q1-Q3) is left for the operator. No automated check
   here can see it. It is emitted as `<human-check>` rather than a mid-flight
   `checkpoint:human-verify` task because `.planning/config.json` sets no
   `workflow.human_verify_mode`, so the end-of-phase default applies (same as 261003-s04).

NOT run, and why: no `public/locales/**` key is added or changed. The Retry label reuses
`webview.login.oauth.retry`, so `pnpm lint-translations` and `pnpm i18n-churn-guard` have nothing to
say about this change.
</verification>

<success_criteria>
- Retry in the GOG/Epic/Amazon and Humble overlay Dialogs remounts only that overlay, through
  `overlayMountKey`. The fresh mount re-triggers the capture or watch, and the app is not reloaded.
- `TauriLoginPanel` without `onRetry` behaves exactly as before, and the `/loginweb/*` routes pass
  none.
- `overlayDismiss.test.ts` is green for the first time since `d6c124006`, now covering `OAuthLogin`.
- The todo lives in `.planning/todos/completed/` with an honest Resolution section.
- The verification battery is green. The live Retry click is recorded as pending operator
  verification.
</success_criteria>

<output>
Create `.planning/quick/261008-aoe-retry-in-tauriloginpanel-hands-back-to-h/261008-aoe-SUMMARY.md` when done
</output>
