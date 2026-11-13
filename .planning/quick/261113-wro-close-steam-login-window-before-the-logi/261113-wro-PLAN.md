---
phase: quick-261113-wro
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Login/components/SteamLogin/index.tsx
  - src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts
  - src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts
  - src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx
autonomous: false
requirements:
  - QUICK-261113-wro

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On a successful Steam sign-in (QR scan, username/password, Steam Guard code, or phone approval), the 'Sign in to Steam' dialog plays its own 500ms slide-out exit BEFORE anything on the login screen moves"
    - "The login panel's slide-down (the loginFlowOpen class dropping) starts only after the dialog's exit transition has completed, because dismiss() is called from the dialog's onExited, not from the success branch"
    - "Closing the Steam dialog by hand (X button, backdrop, Escape, 'Return to Login') behaves exactly as before: the dialog slides out while the panel slides back in at the same time"
    - "Every other consumer of the shared Dialog primitive is unaffected: the new open prop defaults to true and onExited is optional"
    - "After a successful sign-in the Steam tile still re-reads its state (openOverlay still goes 'steam' -> null, just after the exit instead of before it)"
    - "The fix is one React code path with no platform branch, so Windows, macOS and Linux all get it"
  artifacts:
    - path: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
      provides: "optional caller-driven close (open prop, default true) and an onExited callback wired to MUI's TransitionProps"
      contains: "TransitionProps={{ onExited }}"
    - path: "src/frontend/screens/Login/components/SteamLogin/index.tsx"
      provides: "finishSignIn(): success closes the dialog first; dismiss runs from onExited"
      contains: "onExited={signedIn ? closeWindow : undefined}"
    - path: "src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts"
      provides: "updated closeWindow census (8 -> 5) and the 261113-wro source gates"
      contains: "261113-wro"
    - path: "src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts"
      provides: "source gate pinning the primitive's open/onExited contract and its default"
      contains: "requestedOpen"
  key_links:
    - from: "src/frontend/screens/Login/components/SteamLogin/index.tsx (four success branches)"
      to: "Dialog open prop"
      via: "await steamLogin(...) then finishSignIn() -> setSignedIn(true) -> open={!signedIn}"
      pattern: "await steamLogin\\(\\{[^)]*\\}\\)\\s*finishSignIn\\(\\)"
    - from: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
      to: "SteamLogin closeWindow -> dismiss -> Login/index.tsx dismissLoginOverlay"
      via: "MuiDialog TransitionProps onExited fires after the 500ms Slide exit"
      pattern: "TransitionProps=\\{\\{ onExited \\}\\}"
---

<objective>
Make a successful Steam sign-in close the "Sign in to Steam" window FIRST, and only then let the
login panel slide down into place.

**Root cause (confirmed by reading the code, file:line):**

- The Steam sign-in "window" is not a native or Tauri window. It is the in-app MUI dialog that
  `SteamLogin` renders through the shared `Dialog` primitive
  (`src/frontend/screens/Login/components/SteamLogin/index.tsx:716-725`). No file under
  `src-tauri/src` references a Steam login window. The same React path runs on Windows, macOS and
  Linux, so one fix covers all three.
- `Dialog` keeps its own `open` state (`Dialog.tsx:69`). Only its internal `close()` (`Dialog.tsx`,
  the `useCallback` that calls `setOpen(false)` and then `onClose()`) ever sets it false and plays
  the 500ms `SlideUpTransition` exit. The X button, backdrop and Escape all go through `close()`.
- The four success branches in `SteamLogin` (the credential poll at `:136-140`, the QR poll at
  `:181-188`, `handleCredentialSubmit` at `:274-277`, `handleGuardSubmit` at `:305-308`) call
  `closeWindow`, which is `() => dismiss()` (`:71`). That goes straight to the parent and never
  touches the dialog's `open`.
- The parent's `dismissLoginOverlay` (`src/frontend/screens/Login/index.tsx:287-299`) clears
  `openOverlay` at once. `overlayRendersChrome` goes false, the `loginFlowOpen` class drops, and
  `.loginContentWrapper` runs its 500ms transform/opacity transition back to `translateY(0)`. That
  is the slide-down. The 500ms deferred `setMountedOverlay(null)` then unmounts `SteamLogin`
  **while its dialog is still fully open**, so the dialog vanishes with no exit animation.
- Net effect: the panel slides down behind a dialog that stays fully visible, and the dialog then
  pops out. That matches the report. The manual X path does not have this defect, because there
  `close()` sets `open=false` first, so the dialog slides out and the panel slides in together (the
  designed crossfade, `loginCrossfade.test.ts`).

**Fix (minimal, at the source):** give the shared `Dialog` an optional caller-driven `open`
(default `true`) and an optional `onExited`. On success, `SteamLogin` sets `signedIn` to true. That
closes the dialog through its own exit transition, and `closeWindow` (so `dismiss`, so the panel
slide) runs only from `onExited`, once the dialog has gone. `Login/index.tsx`,
`LOGIN_DIALOG_EXIT_MS`, `bindOverlayDismiss` and the manual-close paths stay exactly as they are.

Purpose: the user-reported polish defect. The sign-in window should be gone before the login panel
animates.
Output: the fixed `Dialog` and `SteamLogin` source, updated or added source gates, and an operator
live check.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/frontend/screens/Login/components/SteamLogin/index.tsx
@src/frontend/components/UI/Dialog/components/Dialog.tsx
@src/frontend/screens/Login/index.tsx
@src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts

<interfaces>
Current Dialog primitive (src/frontend/components/UI/Dialog/components/Dialog.tsx):
- `interface DialogProps { className?: string; children: ReactNode; showCloseButton: boolean; onClose: () => void }` (line 21)
- `export const Dialog: React.FC<DialogProps> = ({ children, className, showCloseButton = false, onClose }) => {` (line 63)
- `const [open, setOpen] = useState(true)` (line 69). The internal `close()` sets this false and calls `onClose()`.
- `<MuiDialog open={open} ... TransitionComponent={SlideUpTransition} transitionDuration={500}>` (lines 99, 134-135)

MUI 5.17.1 facts this plan relies on (verified in node_modules):
- `@mui/material/Dialog/Dialog.js:241-246` spreads `TransitionProps` onto the TransitionComponent element (after `appear`, `in`, `timeout`, `role`).
- `@mui/material/Modal/useModal.js:181` chains the child's `onExited` (`createChainedFunction(handleExited, children.props.onExited)`), so a caller `onExited` fires once, when the exit completes.
- `SlideUpTransition` forwards `{...props}` to `<Slide>`, so `onExited` reaches the Slide. The transition's completion is driven by react-transition-group's `timeout` (500ms), not by a CSS `transitionend` event, so `onExited` still fires when App.css's `disableAnimations` override cancels the visual transition.

Parent contract (src/frontend/screens/Login/index.tsx). DO NOT EDIT:
- `dismissLoginOverlay()` clears `openOverlay` synchronously, then defers `setMountedOverlay(null)` by `LOGIN_DIALOG_EXIT_MS` (500).
- `SteamLogin` receives `dismiss={bindOverlayDismiss(overlayMountKey, overlayMountKeyRef, dismissLoginOverlay)}`.
- `className={classNames('loginPage', { loginFlowOpen: overlayRendersChrome })}` with `overlayRendersChrome = openOverlay === 'steam'`.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): success closes the Steam dialog first, then dismisses: Dialog primitive -> SteamLogin -> parent dismiss</name>
  <files>src/frontend/components/UI/Dialog/components/Dialog.tsx, src/frontend/screens/Login/components/SteamLogin/index.tsx, src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts</files>
  <behavior>
    Source gates (this jest project is testEnvironment 'node' with no DOM, so source gates over comment-stripped text are the house pattern; see steamLoginWindowChrome.test.ts's header):
    - Census (rewritten): comment-stripped SteamLogin source has exactly 5 `closeWindow` identifier occurrences: 1 definition (`const closeWindow = () => dismiss()`), 3 Class C consumers (`onClick={closeWindow}` once, `onClose={closeWindow}` twice), and 1 exit-completion consumer (`onExited={signedIn ? closeWindow : undefined}`). There are ZERO call-syntax occurrences: the regex `/closeWindow\(\)/g` matches 0 times.
    - Ordering: `/await steamLogin\(\{[^)]*\}\)\s*finishSignIn\(\)/g` matches exactly 4 times. These are the four success branches, each finalising the auth state before it starts the close.
    - `/function finishSignIn\(\)/` matches once, and `/finishSignIn\(\)/g` matches 5 times in total (1 declaration and 4 calls).
    - The finishSignIn body, captured by `/function finishSignIn\(\)\s*\{([^}]*)\}/`, contains `setSignedIn(true)` and contains neither `closeWindow` nor `dismiss`.
    - The single `<Dialog` element carries `open={!signedIn}` and `onExited={signedIn ? closeWindow : undefined}`, and still carries `showCloseButton={true}` and `onClose={closeWindow}`.
  </behavior>
  <action>
    RED first. In `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts`, rewrite the existing census test at lines 112-134 (title and body) to the 5-occurrence shape in the behavior block. Keep the 1-definition assertion and the 3 Class C consumer assertion, and replace the "4 Class B calls / total 8" comment and count with "0 direct calls, 1 exit-completion consumer, total 5". The old 8 pinned the defect: the 4 Class B sites ARE the bypass. Add a new `describe` block titled for quick task 261113-wro ("a successful sign-in closes the Steam window before the login panel slides"). Give it a FILLED-SPECIMEN raw guard (the raw file contains `finishSignIn`) plus the ordering, finishSignIn-census, finishSignIn-body and Dialog-wiring gates from the behavior block. Label each one PRESENCE or ABSENCE and give it a "Breaks if:" comment, matching the file's existing style. Use the file's existing `read` (comment-stripped) and `readRaw` helpers. No new helper is needed, because the finishSignIn body has no nested braces. Run the suite and confirm the new gates and the census are RED against the unfixed source.

    GREEN, Dialog primitive (`src/frontend/components/UI/Dialog/components/Dialog.tsx`):
    - Add two optional members to `DialogProps`: `open?: boolean` and `onExited?: () => void`. Give each a short comment. `open` lets a caller close the dialog through the same 500ms exit the close button plays, and it defaults to true so the ~25 existing consumers are unchanged. `onExited` fires once that exit transition has completed.
    - In the component's parameter destructuring, add `open: requestedOpen = true` and `onExited`. Keep the internal `const [open, setOpen] = useState(true)` and `close()` exactly as they are. Do NOT rename the internal `open`.
    - On `<MuiDialog>`, change `open={open}` to `open={open && requestedOpen}` and add `TransitionProps={{ onExited }}`. Leave `TransitionComponent={SlideUpTransition}`, `transitionDuration={500}`, `StyledPaper`, the `onClose` reason handling and the unconditional `useSuppressStoreEmbed()` call untouched. loginCrossfade.test.ts's three-way 500ms agreement and dialogStoreEmbedSuppression.test.ts both read this file.

    GREEN, SteamLogin (`src/frontend/screens/Login/components/SteamLogin/index.tsx`):
    - Add `const [signedIn, setSignedIn] = useState(false)` with the other `useState` hooks.
    - Add `function finishSignIn()` next to the cleanup helpers. Its whole body is `setSignedIn(true)`. Add a comment saying why: the dialog must play its own exit first, and `dismiss` (which slides the login panel down via `loginFlowOpen`) is deferred to the Dialog's `onExited`. Calling `dismiss` directly left the dialog fully open while the panel slid behind it, then unmounted it un-animated (quick task 261113-wro).
    - In each of the four success branches, replace the closeWindow call that directly follows `await steamLogin({ ... })` with a `finishSignIn` call: the credential-poll `done`+username branch (line 140), the QR-poll `done`+username branch (line 188), `handleCredentialSubmit`'s `done` branch (line 277) and `handleGuardSubmit`'s `done` branch (line 308). Keep `await steamLogin(...)` immediately before it on each path, so the auth state is finalised before the close starts.
    - On the `<Dialog>` element (line 717), add `open={!signedIn}` and `onExited={signedIn ? closeWindow : undefined}`. Make onExited conditional so the manual X/backdrop path, which has already called `closeWindow` via `onClose`, does not dismiss a second time and push back the parent's unmount timer. Keep `showCloseButton={true}`, `onClose={closeWindow}`, `className="steamLoginDialog"` and the `DialogHeader onClose={closeWindow}` as they are. The `Return to Login` button's `onClick={closeWindow}` also stays. Manual close keeps today's simultaneous crossfade, deliberately: the report covers the success path only.
    - Do NOT edit `src/frontend/screens/Login/index.tsx`. `dismissLoginOverlay` still clears `openOverlay` synchronously when it is called; it is now called 500ms later on the success path, once the window is gone.

    Falsifiability, following the repo's house practice in these gate files: for each new or changed assertion, mutate the guarded file temporarily and confirm the assertion goes red. Examples: put one closeWindow call back in a success branch; drop `onExited` from the Dialog; swap the order of `await steamLogin` and `finishSignIn`. Then restore. Before mutating, copy the file into the session scratchpad and record its `sha256sum`. Restore by copying it back and compare the hash. Do not restore with `git checkout -- <file>`, because the husky post-checkout hook runs `pnpm install`. Do not use `git diff --quiet` either, which has a documented false-negative trap here. Record each mutation and the red result in the SUMMARY.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx src/frontend/screens/Login/__tests__/loginCrossfade.test.ts src/frontend/screens/Login/__tests__/overlayDismiss.test.ts src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts src/frontend/components/UI/Dialog/__tests__/dialogStoreEmbedSuppression.test.ts && npx tsc --noEmit && npx eslint src/frontend/components/UI/Dialog/components/Dialog.tsx src/frontend/screens/Login/components/SteamLogin/index.tsx src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts && npx prettier --check src/frontend/components/UI/Dialog/components/Dialog.tsx src/frontend/screens/Login/components/SteamLogin/index.tsx src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts</automated>
  </verify>
  <done>All six suites are green, including the rewritten census (5 occurrences, 0 direct calls) and the new 261113-wro block, and each new assertion has a recorded red mutation. `npx tsc --noEmit` passes, so `open`/`onExited` type-check for SteamLogin and for every other Dialog consumer. eslint and scoped prettier are clean on the three written paths. `src/frontend/screens/Login/index.tsx` is byte-unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pin the Dialog primitive's new open/onExited contract and correct the cross-file census note</name>
  <files>src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts, src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx</files>
  <behavior>
    - PRESENCE: comment-stripped Dialog.tsx declares `open?: boolean` and `onExited?: () => void` in `DialogProps`.
    - PRESENCE: the destructuring defaults the caller prop to open, with `/open: requestedOpen = true/`. A default of false, or no default, would close every one of the ~25 consumers on mount.
    - PRESENCE: `<MuiDialog` receives `open={open && requestedOpen}` (the internal close and the caller close both still work) and `TransitionProps={{ onExited }}`.
  </behavior>
  <action>
    In `src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts`, add one test for quick task 261113-wro inside the existing describe (or as a sibling describe). It asserts the three PRESENCE items in the behavior block against `read(DIALOG_TSX)`, with a "Breaks if:" comment per assertion in the file's existing style. Do not alter the existing assertions. `transitionDuration={500}` is already pinned there and by loginCrossfade.test.ts. Confirm each new assertion goes red under a temporary mutation of Dialog.tsx: drop `= true`, revert to `open={open}`, remove `TransitionProps`. Use the same scratchpad-copy plus `sha256sum` restore procedure as Task 1, and record each mutation in the SUMMARY.

    In `src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx`, the comment inside the DIALOG-STAYS-OPEN GATE test (around lines 233-237) says closeWindow's total occurrence count "is pinned at 8 by steamLoginWindowChrome.test.ts". Change 8 to 5, so the cross-reference matches Task 1's rewritten census. Comment-only edit. No assertion in this file changes.
  </action>
  <verify>
    <automated>npx jest src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx && npx eslint src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx && npx prettier --check src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx</automated>
  </verify>
  <done>dialogWindowChrome.test.ts carries a green 261113-wro gate whose three assertions each have a recorded red mutation. steamCreateAccountLink.test.tsx's census cross-reference reads 5. Both suites, eslint and scoped prettier are clean.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Operator live check: the window closes, then the panel slides</name>
  <what-built>A successful Steam sign-in now closes the "Sign in to Steam" dialog through its own slide-out first. The login panel slides down into place only once the dialog has gone. Closing the dialog by hand is unchanged. The change is frontend-only (React), so there is no sidecar rebuild, and it runs identically on Windows, macOS and Linux. One platform is enough to check it.</what-built>
  <how-to-verify>
    1. Restart GameLib with `pnpm tauri:dev`, stopping any already-running dev instance first.
    2. Open the login / Manage Accounts screen. If Steam already shows Connected, sign out from the Steam tile first.
    3. Click the Steam tile. Expected (unchanged): the dialog slides up and the login panel slides up and away.
    4. Sign in with either QR (scan with the Steam phone app) or Username & Password (plus a Steam Guard code if asked). Expected: the instant sign-in succeeds, the "Sign in to Steam" dialog slides down and out, with its dimmed backdrop fading with it. Only AFTER it is gone does the login panel slide down into place. The Steam tile then reads Connected and the screen is interactive.
    5. Regression check: click the Steam tile again (or Reconnect) and close the dialog with its X. Expected: unchanged. The dialog slides out while the panel slides back in at the same time, and the screen is interactive afterwards.
    6. Optional: Settings, then Accessibility, then turn on "Disable animations", and repeat step 4. Expected: the dialog disappears, the panel appears within about half a second, and the login screen never stays stuck or unclickable.
  </how-to-verify>
  <resume-signal>Type "approved", or describe the order you saw (dialog vs panel) and on which sign-in method</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Renderer-only animation ordering. No IPC, sidecar, credential or filesystem path changes. `steamLogin(...)` and the Steam IPC calls run exactly as before, in the same order |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-wro-01 | Denial of Service (login screen latched inert) | SteamLogin success path -> Login/index.tsx `openOverlay` (T-34.4.2-41 guard) | low | mitigate | `openOverlay` now clears ~500ms later on success, from the Dialog's `onExited`. That callback is driven by react-transition-group's 500ms `timeout`, not a CSS `transitionend`, so it fires even when the disableAnimations override cancels the visual transition. The only way to unmount SteamLogin mid-exit is a remount, and remounts are blocked while `openOverlay === 'steam'` (tiles `disabled` + `inert`; `resolveLoginOpenRequest` refuses while `overlayOpen`). The X control still calls `closeWindow` through `onClose` as a manual way out. Task 3 step 6 checks the no-animation case live |
| T-wro-02 | Tampering (double dismiss) | SteamLogin `onExited` + `onClose` | low | mitigate | `onExited` is bound only while `signedIn` is true, so the manual-close path dismisses once. A backdrop/X click during the post-success exit can reach `dismiss` twice; `dismissLoginOverlay` is idempotent (clears and re-arms its own timer), and `bindOverlayDismiss` still drops any stale-mount call |
| T-wro-03 | Spoofing/Repudiation | credential form during the 500ms exit | low | accept | The form stays rendered for the exit, as it already did for the 500ms before this change (the dialog then stayed fully open). The exposure window is unchanged, and re-submitting only re-runs the user's own sign-in |
| T-wro-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan. MUI 5.17.1 is already a dependency and only its existing `TransitionProps` prop is used |
</threat_model>

<verification>
- The Task 1 and Task 2 automated blocks are green. They cover the six touched or adjacent suites, `npx tsc --noEmit`, scoped eslint and scoped `npx prettier --check` over exactly the five written paths. All five report `"ignored": false` under `npx prettier --file-info`, so the check is not vacuous.
- `grep -n "finishSignIn\|onExited" src/frontend/screens/Login/components/SteamLogin/index.tsx` shows one declaration, four calls and the Dialog wiring.
- `git diff --stat` touches exactly the five files in `files_modified`. `src/frontend/screens/Login/index.tsx` is not among them.
- Operator live check (Task 3) approved.
- Local note: about 40 jest suites fail on this Windows box regardless of the change (CI is ubuntu-only). Run only the scoped suites above, not the full battery, and do not read unrelated Windows-local reds as regressions.
</verification>

<success_criteria>
- On a successful Steam sign-in by any of the four routes (QR, credentials, Steam Guard, phone approval), the sign-in dialog is visibly gone before the login panel starts sliding.
- Manual close of the Steam dialog and every other Dialog consumer behave exactly as before.
- The Steam tile shows Connected after sign-in, and the login screen is never left inert.
- One code path covers Windows, macOS and Linux. There is no platform branch.
</success_criteria>

<output>
Create `.planning/quick/261113-wro-close-steam-login-window-before-the-logi/261113-wro-SUMMARY.md` when done. Record the root cause with its file:line evidence, the mutation and red-result log for every new or changed gate, and the Task 3 outcome. Commit with explicit `git add <paths>` + `git commit`. Do not use `gsd-sdk query commit`: it sweeps every dirty `.planning` file, and this tree has unrelated ones (a modified todo, untracked `.planning/debug/*.md`, `.planning/milestone.lock`). After the code commits, run `graphify update .` locally. `graphify-out/` is gitignored, so there is nothing to commit from it.
</output>
