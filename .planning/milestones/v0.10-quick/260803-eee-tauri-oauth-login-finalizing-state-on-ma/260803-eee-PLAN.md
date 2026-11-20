---
phase: quick-260803-eee
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
  - src/frontend/screens/WebView/index.css
autonomous: false
requirements: [QUICK-EEE-01]

must_haves:
  truths:
    - "Under Tauri, once the native OAuth popup closes, the login surface changes from 'Signing in to <Runner>' to a 'Finalizing sign-in with <Runner>…' surface carrying a visibly animated spinner."
    - "The finalizing surface is shown for all four OAuth runners (legendary/gog/nile/zoom), not GOG only, because it is driven by the shared hook."
    - "A non-captured outcome (cancelled/timeout/unsupported/error) never renders the finalizing surface — it goes straight to its own existing surface."
    - "When the token exchange completes, the hook still settles on { phase: 'idle' } and the existing navigate-to-/login completion still runs, unchanged."
    - "Electron's embedded <webview> login path is byte-unchanged: no file under src/backend, src-tauri, or WebView/index.tsx is modified."
  artifacts:
    - path: "src/frontend/screens/WebView/useTauriOAuthLogin.ts"
      provides: "A { phase: 'finalizing'; runner } member of TauriOAuthLoginState, set on the captured→auth-exchange boundary"
      contains: "phase: 'finalizing'"
    - path: "src/frontend/screens/WebView/components/TauriLoginPanel.tsx"
      provides: "The finalizing render branch with heading, body and spinner element"
      contains: "webview.login.oauth.finalizing.heading"
    - path: "src/frontend/screens/WebView/index.css"
      provides: "Top-level spinner class + keyframes for the finalizing surface"
      contains: "WebView__unavailablePanel-spinner"
  key_links:
    - from: "src/frontend/screens/WebView/useTauriOAuthLogin.ts"
      to: "src/frontend/screens/WebView/components/TauriLoginPanel.tsx"
      via: "the existing `state={oauthLoginState}` prop already wired in WebView/index.tsx line 540 — NO new wiring"
      pattern: "phase === 'finalizing'"
---

<objective>
Replace the dead gap in the Tauri OAuth login surface — the 5–27 s window between the native
popup closing (backend `[oauthLoginCapture] status=captured`) and the login completing
(`phase=idle`) — with a communicative finalizing state: a spinner plus
"Finalizing sign-in with <Runner>…".

Purpose: today the user stares at the static "Signing in to <Runner>" panel for up to 27 s with
zero indication that anything is happening; the developer read it as the app hanging. Electron
users get this for free because the embedded `<webview>` stays visible through the exchange, so
this is a Tauri-only communication gap.

Output: a new `finalizing` phase on `useTauriOAuthLogin`'s state union, a matching render branch
in `TauriLoginPanel`, one CSS spinner rule, and regression tests on both.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/frontend/screens/WebView/useTauriOAuthLogin.ts
@src/frontend/screens/WebView/components/TauriLoginPanel.tsx
@src/frontend/screens/WebView/index.css

Project skill: `Skill("spike-findings-gamelib")` covers the Tauri login-webview surface.

<discovery_findings>
Planner already resolved the plan's central design question — the executor must NOT re-litigate it.

**How the frontend learns the popup closed: an existing signal, no new IPC.**
`useTauriOAuthLogin.ts` line 195 awaits `window.api.oauthCaptureLogin({ runner, url })`. That
promise RESOLVES exactly when the backend capture finishes — the same moment the native popup
closes and `[oauthLoginCapture] status=captured` is logged. Everything after that await, up to
the `await window.api.login/authGOG/authAmazon/authZoom` call resolving, IS the token exchange.
So the boundary is already in this file: the point after the four non-captured outcome branches
return (lines 232–258) and before the auth-exchange `try` at line 266. No new sidecar channel,
no new registration module, no backend change of any kind.

**Existing state union** (line 38): `idle | awaiting | blocked | cancelled | timeout | error`.
`awaiting` is set once at line 159 and never updated again until a terminal phase — that is
the whole defect.

**Panel structure**: `TauriLoginPanel.tsx` is a pure function component whose ONLY import is
`useTranslation` from react-i18next plus a type-only import. It renders a chain of
`if (phase === ...)` branches, each returning `<div className="WebView__unavailablePanel">` with
an `h2` heading and a `p` body.

**i18n house pattern** (verified): every string uses `t('<dot.key>', '<inline default>')` and the
`webview.login.*` keys are NOT present in `public/locales/en/translation.json` — the inline
default is the shipped copy. Runner interpolation is done by embedding `${runnerLabel}` directly
in the default string (this is the Phase 34.4 "i18n-interpolation warning" pattern). Match it
exactly. Do NOT add locale-JSON entries; do NOT switch to `t(key, { runner })` interpolation
options for this branch while its five siblings use template literals.

**`runnerLabel`** (line 79) capitalises the raw runner id → "Legendary", "Gog", "Nile", "Zoom".
Keep that derivation. Do NOT introduce an Epic/GOG/Amazon/Zoom display-name map — that would
make this branch inconsistent with its five siblings and is out of scope.

**Jest constraint that governs the spinner choice**: `src/frontend/jest.config.js` is
`testEnvironment: 'node'` with NO `moduleNameMapper` and NO CSS transform. Any `import` that
transitively pulls a `.css`/`.scss` file crashes the test file. Therefore the spinner must NOT
be `<UpdateComponent />` (imports `./index.css`), `<TextWithProgress />` (imports `./index.scss`)
or `@mui/material`'s `CircularProgress`. It must be a bare `<div>` with a class name, and
`TauriLoginPanel.tsx` must keep exactly its current import list.

**CSS placement constraint**: `WebView/index.css` nests all existing rules under `.WebView`, but
`TauriLoginPanel` is returned from the early return at `WebView/index.tsx` line 540 — OUTSIDE the
`.WebView` wrapper (which only appears in the later `return` at line ~570). A rule nested under
`.WebView` would never apply. The new rule must be TOP LEVEL in that file. The file is still
loaded because `WebView/index.tsx` line 15 imports it unconditionally at module scope.
`UpdateComponent/index.css` already defines a global `@keyframes refreshing`; use a distinct
keyframes name to avoid a global collision.

**Test-file facts**: `TauriLoginPanel.test.tsx` (159 lines) invokes the component as a plain
function and walks the returned element object graph with a local `collectText` helper; it has NO
coverage of the `awaiting`/`cancelled`/`timeout`/`error` phases at all. `useTauriOAuthLogin.test.tsx`
drives a mocked-`react` harness with `mount()` / `rerender()` / `settle()` / `flushPromises()`
helpers already defined at lines 122–160.
</discovery_findings>

<interfaces>
The exact shapes the executor writes against — no codebase exploration needed.

From `src/frontend/screens/WebView/useTauriOAuthLogin.ts` (current):
```typescript
export type TauriOAuthLoginState =
  | { phase: 'idle' }
  | { phase: 'awaiting' }
  | { phase: 'blocked'; runner: OAuthRunner; channel: string }
  | { phase: 'cancelled' }
  | { phase: 'timeout' }
  | { phase: 'error'; message: string }

export function useTauriOAuthLogin(
  runner: OAuthRunner | undefined,
  onLoginSuccess?: (payload: OAuthLoginCompletionPayload) => void
): TauriOAuthLoginState
```

From `src/frontend/screens/WebView/components/TauriLoginPanel.tsx` (current):
```typescript
interface Props {
  runner?: string
  state?: TauriOAuthLoginState
}
```

Already wired, requires NO change — `src/frontend/screens/WebView/index.tsx` line 540:
```tsx
return <TauriLoginPanel runner={runner} state={oauthLoginState} />
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the `finalizing` phase to useTauriOAuthLogin at the capture→exchange boundary</name>
  <files>src/frontend/screens/WebView/useTauriOAuthLogin.ts, src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx</files>
  <behavior>
    - A capture that resolves `{ status: 'captured', code }` while the runner's auth channel is
      still pending leaves the hook at `{ phase: 'finalizing', runner: '<that runner>' }` — asserted
      for all four runners (legendary/gog/nile/zoom) via the existing `it.each` style, since the
      user-visible fix must be runner-generic.
    - When that same auth channel then resolves `{ status: 'done' }`, the hook still settles on
      `{ phase: 'idle' }` and `onLoginSuccess` is still invoked exactly once — the finalizing phase
      is purely intermediate and changes no terminal outcome.
    - `{ status: 'cancelled' }`, `{ status: 'timeout' }`, `{ status: 'unsupported' }` and
      `{ status: 'error', message }` outcomes never pass through `finalizing`: the hook goes
      straight to `cancelled` / `timeout` / `error`, and no `phase=finalizing` line is logged.
    - An auth channel that rejects with `UNPORTED_CHANNEL_MARKER` still settles on
      `{ phase: 'blocked', runner, channel }` — finalizing does not shadow the blocked branch.
    - Exactly one `window.api.logInfo` line containing `phase=finalizing` and the runner name is
      emitted per captured login.
  </behavior>
  <action>
Add `| { phase: 'finalizing'; runner: OAuthRunner }` to the `TauriOAuthLoginState` union. Carry the
runner on the state (mirroring how `blocked` carries it) so the panel can name the runner from the
state alone rather than depending on the separately-passed `runner` prop staying in sync.

Insert the transition in `run()` at the ONE correct site: after the `outcome.status === 'error'`
branch returns (current line 258) and before the auth-exchange `try` (current line 266) — i.e. on
the fall-through where `outcome.status === 'captured'` is the only remaining possibility. Use the
existing `safeSetState` helper, never the raw setter, so the Plan 34.5-34 cancellation gate keeps
holding: `safeSetState({ phase: 'finalizing', runner: activeRunner })`.

Immediately above it emit one log line in the file's established format:
`window.api.logInfo(\`[useTauriOAuthLogin] runner=${activeRunner} phase=finalizing (capture complete, exchanging with auth channel)\`)`.
This is the line a future live gate greps to prove the popup-close boundary was observed, so the
literal `phase=finalizing` must be present verbatim.

Do NOT touch `reachedTerminal` — finalizing is not a terminal phase, and setting that flag here
would suppress the `onLoginSuccess` invocation at line 322 and silently break login completion.
Do NOT add an early return, do NOT reorder the existing outcome branches, and leave the
`cancelled`-fall-through comment block at lines 218–230 exactly as it stands.

Extend the module doc comment with one short paragraph naming why the phase exists (the popup-close
to token-exchange gap is 5–27 s of dead UI) and that `oauthCaptureLogin`'s own resolution is the
popup-closed signal, so no new IPC channel was added.

In the test file, add a `describe('useTauriOAuthLogin — finalizing (capture complete, exchange in flight)')`
suite using the existing `mount`/`settle`/`rerender`/`flushPromises` harness. Hold the auth channel
open with `mockApi.authGOG.mockImplementation(() => new Promise(() => {}))` (and the peer mocks for
the other three runners) so the intermediate phase is observable; resolve
`mockApi.oauthCaptureLogin` with `{ status: 'captured', code: 'code-1' }` (zoom also needs
`redirectUrl`). Add the four behaviours above. Do not modify any existing assertion in that file —
every current test asserts a settled terminal phase and must keep passing untouched.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx --silent && npx tsc --noEmit</automated>
  </verify>
  <done>`TauriOAuthLoginState` has a `finalizing` member carrying the runner; the hook emits it exactly once per captured login with a `phase=finalizing` log line; the new suite passes and all pre-existing tests in the file still pass; `pnpm codecheck` (tsc --noEmit) is clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Render the finalizing surface with a spinner in TauriLoginPanel</name>
  <files>src/frontend/screens/WebView/components/TauriLoginPanel.tsx, src/frontend/screens/WebView/index.css, src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx</files>
  <behavior>
    - `TauriLoginPanel({ runner: 'gog', state: { phase: 'finalizing', runner: 'gog' } })` returns a
      tree whose text contains "Finalizing" and the runner label, and does NOT contain
      "Phase 34.5", "not wired up" or "sign-in window has opened".
    - The returned tree contains an element carrying the spinner class name — the visual proof the
      surface reads as active work rather than a static message.
    - The same holds for all four runners (`legendary`/`gog`/`nile`/`zoom`) — a shared `it.each`.
    - `{ phase: 'awaiting' }` still renders the byte-identical original "Signing in to <Runner>" /
      "A sign-in window has opened." copy — the pre-capture state stays distinct from the
      post-capture one.
    - The declared-blocked default (`state` undefined) is unchanged: same text, same single
      `logInfo` call.
  </behavior>
  <action>
Add a `if (phase === 'finalizing')` branch to `TauriLoginPanel.tsx`. Place it immediately AFTER the
existing `awaiting` branch so the two adjacent states read together in source order. Use the same
`WebView__unavailablePanel` wrapper / `-heading` / `-body` class structure as its five siblings, and
the same `t(key, inlineDefault)` shape:

- heading key `webview.login.oauth.finalizing.heading`, default
  `` runnerLabel ? `Finalizing sign-in with ${runnerLabel}…` : 'Finalizing sign-in…' `` — note the
  single-character ellipsis `…`, matching the developer's requested copy.
- body key `webview.login.oauth.finalizing.body`, default
  `'Sign-in captured. Completing the exchange with the store — this can take a few seconds.'`
  Do NOT name a specific duration in user-facing copy.

Prefer reading the runner label from `state.runner` when the branch has it (the state now carries
it), falling back to the existing `runnerLabel` local; keep the existing capitalisation derivation
and do NOT add a display-name map.

Add the spinner as a bare element with no new imports:
`<div className="WebView__unavailablePanel-spinner" role="progressbar" aria-hidden="true" />`,
rendered above the heading. `TauriLoginPanel.tsx`'s import list must remain exactly
`useTranslation` + the `TauriOAuthLoginState` type import — importing `UpdateComponent`,
`TextWithProgress` or `@mui/material` here would crash this component's own test file (no CSS
transform in the frontend jest config).

Emit one `window.api.logInfo` line for this branch, matching the sibling branches' format:
`[TauriLoginPanel] runner=<runner> phase=finalizing`.

In `src/frontend/screens/WebView/index.css`, append a TOP-LEVEL (not nested under `.WebView`) rule
for `.WebView__unavailablePanel-spinner` plus its own `@keyframes` — the panel renders outside the
`.WebView` wrapper, so a nested rule would never match. Give it an explicit size, a
`border`/`border-top-color` ring built from the existing `var(--text-default)` / `var(--accent)`
custom properties already used elsewhere in this project's CSS, `border-radius: 50%`, centred
horizontally (`margin: 0 auto var(--space-md)`), and a linear infinite rotation. Name the keyframes
`gamelibFinalizingSpin` — `@keyframes refreshing` is already taken globally by
`UpdateComponent/index.css`, and keyframes names are not scoped.

In `TauriLoginPanel.test.tsx`, add a `describe('TauriLoginPanel — finalizing surface')` suite. Add a
local `collectClassNames(node): string[]` helper alongside the existing `collectText` (walk
`props.className` and recurse through `props.children` the same way) so the spinner's presence can
be asserted from the element graph without a DOM. Cover the five behaviours above. Do not modify
any existing test in the file.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/WebView --silent && npx tsc --noEmit && npx eslint src/frontend/screens/WebView</automated>
  </verify>
  <done>The finalizing branch renders heading + body + spinner for all four runners; the awaiting and declared-blocked surfaces are textually unchanged; the spinner class and its keyframes exist at top level in `WebView/index.css`; the whole `src/frontend/screens/WebView` test tree passes, tsc is clean and eslint reports no new findings.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    A `finalizing` phase on `useTauriOAuthLogin`, rendered by `TauriLoginPanel` as
    "Finalizing sign-in with <Runner>…" plus an animated spinner, driven entirely by the existing
    `oauthCaptureLogin` resolution — no new IPC channel, no backend change, no change to
    `WebView/index.tsx`, `src/backend/**` or `src-tauri/**`.
  </what-built>
  <how-to-verify>
    1. Confirm the Electron path is untouched — `git diff --stat` must list ONLY these five files:
       `useTauriOAuthLogin.ts`, `useTauriOAuthLogin.test.tsx`, `TauriLoginPanel.tsx`,
       `TauriLoginPanel.test.tsx`, `WebView/index.css`. Any `src/backend/**`, `src-tauri/**` or
       `WebView/index.tsx` entry is a failure — the just-landed login/token perf fixes
       (`82ce07376` / `9c9ad5a95`) must stay byte-stable.
    2. Run the Tauri build: `GAMELIB_DEV_SECRET_VAULT=1 pnpm tauri:dev`
       (the env var suppresses the Keychain prompting — see the dev-secret-vault memory).
    3. Go to Manage Accounts and start a GOG sign-in. While the native popup is open and you are
       typing credentials, the panel behind it must still read "Signing in to Gog".
    4. Complete the GOG sign-in so the popup closes. The panel must IMMEDIATELY switch to
       "Finalizing sign-in with Gog…" with a visibly rotating spinner, and must hold that surface
       for the whole exchange (roughly 5–27 s) instead of showing the old static screen.
    5. Confirm the login still completes: the app navigates to Manage Accounts and the GOG account
       shows as signed in. Nothing about completion should feel different from before.
    6. In `~/Library/Logs/GameLib/gamelib.log`, confirm exactly one
       `[useTauriOAuthLogin] runner=gog phase=finalizing` line for that login, followed later by the
       existing `phase=idle (login completed, library refresh triggered)` line.
    7. Start a sign-in and CLOSE the popup without completing it. The panel must go straight to the
       cancelled surface — it must never flash the finalizing copy.
    8. Launch the Electron build (`pnpm start`) and sign in to any store. The embedded webview login
       must look and behave exactly as it did before this change.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what you saw instead</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| capture outcome → renderer UI copy | `OAuthCaptureOutcome` carries a single-use OAuth `code` / full `redirectUrl`; this change adds a new render path that reads that same outcome's arrival |
| renderer UI copy → app log file | `TauriLoginPanel` and the hook both write `logInfo` lines that land in `gamelib.log`, which is routinely attached to bug reports |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-EEE-01 | Information disclosure | `useTauriOAuthLogin.ts` finalizing log line | mitigate | The `phase=finalizing` line interpolates `activeRunner` only. Never add `outcome.code`, `outcome.redirectUrl` or any auth response field to it — Task 1's action fixes the exact literal. |
| T-EEE-02 | Information disclosure | `TauriLoginPanel.tsx` finalizing copy | mitigate | The new state member carries `runner` only (no code/token), so the render branch has no secret in scope to leak into user-visible copy or a screenshot. |
| T-EEE-03 | Tampering | npm/pip/cargo installs | mitigate | No package is installed by this plan — the spinner is deliberately hand-rolled CSS precisely to avoid a new dependency. If an executor finds itself reaching for one, stop and escalate. |
| T-EEE-04 | Denial of service | login completion path | accept | The finalizing phase is a non-terminal `safeSetState` that never sets `reachedTerminal`; Task 1's behaviour list asserts `{ status: 'done' }` still settles `idle` and still fires `onLoginSuccess` exactly once. |
</threat_model>

<verification>
- `npx tsc --noEmit` (i.e. `pnpm codecheck`) clean.
- `npx jest src/frontend/screens/WebView --silent` green, including every pre-existing test in both
  touched test files.
- `git diff --stat` lists exactly the five files in `files_modified` — no backend, no `src-tauri`,
  no `WebView/index.tsx`.
- `grep -rn "phase === 'finalizing'" src/frontend/screens/WebView/components/TauriLoginPanel.tsx`
  returns exactly one match.
- Blocking human verification of the live Tauri surface (task 3).
</verification>

<success_criteria>
- Between popup-close and login-complete the Tauri login surface shows an animated spinner and
  "Finalizing sign-in with <Runner>…" for all four OAuth runners.
- The pre-capture "Signing in to <Runner>" surface and every terminal surface are unchanged.
- Login completion, `onLoginSuccess`, and the navigate-to-Manage-Accounts behaviour are unchanged.
- Electron's login path is untouched and visually identical.
</success_criteria>

<output>
Create `.planning/quick/260803-eee-tauri-oauth-login-finalizing-state-on-ma/260803-eee-SUMMARY.md` when done
</output>
