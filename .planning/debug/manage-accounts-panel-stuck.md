---
status: fixed_pending_live_verification
trigger: "After a successful GOG login the Manage Accounts panel never updates — it stays on 'Signing in to Gog' even though the login succeeded and the library refreshed"
created: 2026-08-03T02:10:00Z
updated: 2026-08-03T02:10:00Z
phase: 34.5
tracks: second half of F-34.5-G6-12's original symptom set
follows: .planning/debug/resolved/gog-login-ui-never-updates.md
---

## Current Focus

hypothesis: |
  CONFIRMED (static, from source + existing live logs). Two independent causes, both
  required to produce the symptom:

  1. **Nothing navigates away from the login route on the Tauri OAuth path.** Every OTHER
     successful-login path in `WebView/index.tsx` leaves the surface —
     `handleSuccessfulLogin()` -> `navigate('/login')` for Electron's epic/gog/zoom/amazon
     branches (`index.tsx:178-180`, called at :274/:296/:366 and from the amazon `.then`
     at :173), and the humble watch's own `navigate('/login')` at its `status === 'done'`
     arm (:225-228). The Tauri path (`useTauriOAuthLogin` + `completeOAuthLogin`) had no
     navigation at all.
  2. **The panel cannot self-recover.** `useTauriOAuthLogin`'s terminal
     `setState({ phase: 'idle' })` goes through `safeSetState`, gated on `!cancelled`
     (`useTauriOAuthLogin.ts:152-156`, :326). A teardown lands mid-flight on every success
     here, so `cancelled` is true and that update is a NO-OP. State stays `awaiting`, which
     `TauriLoginPanel` renders as "Signing in to <Runner>".
test: |
  Live: complete a GOG login under Tauri and observe where you end up.
expecting: |
  Land on Manage Accounts (`/login`) with GOG signed in — not on a "Signing in to Gog" panel.
next_action: |
  Live-verify. Automated verification is complete but this project's standing
  `live-gate-beats-green-suite-three-times` lesson applies.

reasoning_checkpoint:
  confirming_evidence:
    - "index.tsx:178-180 — `handleSuccessfulLogin = () => { navigate('/login') }`, the Electron path's exit."
    - "index.tsx:274/:296/:366 — `gog.login(code).then(() => handleSuccessfulLogin())` and siblings. The Tauri path had no equivalent."
    - "index.tsx:222-228 — the humble watch guards with `mounted` and then navigates on `status === 'done'`. Precedent for both the navigation AND the guard."
    - "useTauriOAuthLogin.ts:152-156 — `safeSetState` returns early when `cancelled`."
    - "useTauriOAuthLogin.ts:313-326 — the success arm fires `onLoginSuccess` UNCONDITIONALLY (plan 34.5-34 Task 2, why the library refreshes) but routes its own `{ phase: 'idle' }` through the gated `safeSetState`."
    - "LIVE LOG (every observed successful run, e.g. 01:31:46-51 and 01:57:29-34): `phase=teardown inflight=true` then `phase=cancelled-midflight at=auth authStatus=done` then `phase=idle` — proving `cancelled` is TRUE at the moment the terminal state update is attempted."
    - "TauriLoginPanel.tsx:95-110 — `phase === 'awaiting'` renders the 'Signing in to <Runner>' heading the developer reported being stuck on."
  falsification_test: |
    If the panel were stuck at some phase OTHER than `awaiting`, or if `cancelled` were
    false at the success arm, this account would be wrong. The live logs show
    `cancelled-midflight` on every run, and `awaiting` is the only phase whose copy matches
    the reported text.
  blind_spots: |
    1. **WHY the teardown fires mid-login is STILL UNDIAGNOSED.** The effect's deps are
       `[runner, onLoginSuccess]`; both should be stable (`completeOAuthLogin` is a
       GlobalState class field, `runner` comes from `useParams`). Something re-runs or
       unmounts the effect ~0-5s after `Login Successful` and it is not established what.
       **This fix does not explain it and does not depend on it** — it makes the stuck
       state unreachable regardless. Anyone investigating the teardown should not read this
       fix as having closed the question.
    2. Static confirmation only; no live run yet.

## Symptoms

expected: |
  After a successful login, the user lands on Manage Accounts with the account signed in.
actual: |
  Stays on the WebView login route showing "Signing in to Gog" indefinitely, while the login
  has in fact succeeded and (since `eb117d9e4`) the library has populated behind it.
errors: none — the login genuinely succeeds; this is purely a surfacing failure.
reproduction: sign out of GOG, sign back in, observe the panel.

## Resolution

root_cause: |
  The Tauri OAuth path completed the login without leaving the login surface, and the panel
  could not self-correct because its terminal state update is suppressed by the same
  mid-flight teardown that `onLoginSuccess` was already deliberately made to survive.
fix: |
  `WebView/index.tsx`: a new `handleTauriOAuthSuccess` wrapper, passed to
  `useTauriOAuthLogin` in place of the bare `completeOAuthLogin`. It completes the login and
  then `navigate('/login')` — the same exit every other success path in this file already
  takes.

  **Why navigate rather than un-gate the state update.** `phase: 'idle'` renders
  `TauriLoginPanel`'s DECLARED-BLOCKED copy. Forcing the panel to idle would replace
  "Signing in…" with a message implying the sign-in channel is unported — a worse lie than
  the stuck spinner. The correct end state after a successful login is not a better panel;
  it is not being on the login page.

  **Why `mountedRef`, not `cancelled`.** The guard is a true-unmount ref cleared only by an
  empty-deps cleanup, mirroring the humble watch's "a late resolution after the route
  unmounted must not navigate" rule. The hook's `cancelled` means "this effect instance was
  superseded", which is TRUE on every successful login here while the user is still on the
  route — guarding on it would reintroduce the bug exactly.

  **Why `useCallback`.** `onLoginSuccess` is one of `useTauriOAuthLogin`'s effect
  dependencies, so an unstable wrapper would re-run the capture effect every render. Both
  deps are stable (`completeOAuthLogin` is a class field; `navigate` is stable in
  react-router v6).
verification: |
  AUTOMATED (complete): `npm run test:ci` exit 0, **184/184 suites, 3589/3589 tests**.
  `npx tsc --noEmit` exit 0. eslint: 0 errors on the touched files.

  New gate `WebViewOAuthNavigation.test.ts` (source-text — nothing imports `index.tsx`;
  no jsdom), self-tested for anti-vacuity AND verified to go RED against TWO real injected
  regressions in the actual source, not only synthetic strings:
    - reverting the hook to the bare `completeOAuthLogin` -> 1 failure
    - guarding the navigate on `cancelled` instead of `mountedRef` -> 2 failures

  **LIVE VERIFICATION OWED.** Observable: complete a GOG login and land on Manage Accounts
  signed in, rather than on a "Signing in to Gog" panel.
files_changed:
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/__tests__/WebViewOAuthNavigation.test.ts (new)

## Not closed by this

- **The mid-flight teardown's cause** — see blind spot 1. Still unknown.
- **Gate item 2** — only a gate run retires it; clause (g) (`origin=unknown`,
  F-34.5-G6-14) is untouched by this and by `eb117d9e4`.
- **The ~40 s login latency** — dominated by a 23 s `gogdl auth` CLI call, unrelated to this.
