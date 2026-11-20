---
phase: quick-260803-mcu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/helpers/epicAuthCode.ts
  - src/frontend/helpers/__tests__/epicAuthCode.test.ts
  - src/frontend/screens/Login/components/SIDLogin/index.tsx
autonomous: true
requirements: [QUICK-SIDLOGIN-PASTE]

must_haves:
  truths:
    - "Pasting the full Epic JSON blob into the field submits successfully (code auto-extracted)"
    - "Pasting a bare ~32-char authorizationCode still submits successfully"
    - "Opening the SIDLogin modal with a valid code on the clipboard pre-fills the input without submitting"
    - "Returning to the app window (focus) with a valid code on the clipboard pre-fills the empty input"
    - "The user must click Login to authenticate — nothing auto-submits"
    - "The hidden middle-click (onAuxClick) paste affordance no longer exists"
  artifacts:
    - path: "src/frontend/helpers/epicAuthCode.ts"
      provides: "Pure parser: bare code OR JSON blob -> authorizationCode string | null"
      exports: ["parseEpicAuthCode"]
    - path: "src/frontend/helpers/__tests__/epicAuthCode.test.ts"
      provides: "Unit coverage for bare/JSON/whitespace/malformed cases"
    - path: "src/frontend/screens/Login/components/SIDLogin/index.tsx"
      provides: "Smart clipboard pre-fill on mount + focus; parser-backed submit"
  key_links:
    - from: "src/frontend/screens/Login/components/SIDLogin/index.tsx"
      to: "parseEpicAuthCode"
      via: "import from frontend/helpers/epicAuthCode"
      pattern: "parseEpicAuthCode"
    - from: "src/frontend/screens/Login/components/SIDLogin/index.tsx"
      to: "window.api.clipboardReadText"
      via: "useEffect on mount + window focus listener"
      pattern: "clipboardReadText"
---

<objective>
Improve the Epic SIDLogin paste UX so the user never hand-extracts an auth code from JSON, and so a code sitting on the clipboard is pre-filled automatically (confirm-to-login, never auto-submit).

Purpose: The Epic browser login page returns a JSON blob (`{"redirectUrl":...,"authorizationCode":"...","sid":null,...}`). Today the user must manually pull `authorizationCode` out of it, and the only paste shortcut is an undiscoverable middle-click (`onAuxClick`). This is friction and a support trap.

Output: A pure, unit-tested parser helper and a reworked SIDLogin component that accepts either input shape, auto-reads the clipboard on mount and window focus, pre-fills the field, and keeps the existing `epic.login(code)` / loading / error flow.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/frontend/screens/Login/components/SIDLogin/index.tsx

<!-- Convention reference: pure helper + colocated jest __tests__ using it.each -->
@src/frontend/helpers/steamKeyValidation.ts
@src/frontend/helpers/__tests__/steamKeyValidation.test.ts

<interfaces>
<!-- Executor: use these directly, no exploration needed. -->

Clipboard wrapper (Tauri-safe — DO NOT use navigator.clipboard, it no-ops under Tauri):
From src/common/types/ipc.ts:
  clipboardReadText: () => string        // window.api.clipboardReadText() resolves to a string
  clipboardWriteText: (text) => void

Existing SIDLogin submit flow (keep intact):
  epic.login(code) -> resolves 'done' on success; component then calls window.api.getUserInfo() and backdropClick()
  Current submit guard on the button: disabled={loading || input.length < 30 || error}

Epic browser-login JSON shape returned by the login page:
  {"redirectUrl":"https://...","authorizationCode":"<~32 alnum chars>","sid":null,"exchangeCode":null,...}
</interfaces>

<project_skills>
Relevant Tauri gotchas (Skill: spike-findings-gamelib):
- `navigator.clipboard` silently no-ops under WKWebView/Tauri — MUST use window.api.clipboardReadText().
- This component is frontend-only; no sidecar/preload changes are in scope.
</project_skills>

<scope_boundaries>
STRICTLY the SIDLogin component paste UX + its parser helper/test.
DO NOT touch src/frontend/screens/Login/index.tsx or any Runner/index.tsx — those hold uncommitted routing changes from a just-completed debug session that must not be disturbed.
</scope_boundaries>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create pure epic auth-code parser with unit tests</name>
  <files>src/frontend/helpers/epicAuthCode.ts, src/frontend/helpers/__tests__/epicAuthCode.test.ts</files>
  <behavior>
    parseEpicAuthCode(raw: string): string | null
    - Bare code: "abc1234567890abc1234567890abcd12" -> returns that string (trimmed)
    - Surrounding whitespace / newlines: "  \n abc...123 \n " -> returns trimmed code
    - Full JSON blob: '{"redirectUrl":"x","authorizationCode":"abc...123","sid":null}' -> returns "abc...123"
    - JSON blob with surrounding whitespace -> still extracts authorizationCode
    - JSON with missing/empty/null authorizationCode -> returns null
    - Malformed JSON that starts with "{" -> returns null (does not throw)
    - Empty string / whitespace-only -> returns null
    - A short implausible string (e.g. "hello") -> returns null (below plausible code length)
    - A bare-string plausibility floor of length >= 20 alphanumeric-ish chars; a value extracted from a JSON authorizationCode field is trusted and returned as-is once non-empty
  </behavior>
  <action>
    Create parseEpicAuthCode as a pure function (no React, no window). Trim input; return null if empty. If the trimmed value starts with "{", JSON.parse inside a try/catch — on parse failure return null; read authorizationCode, return it trimmed if it is a non-empty string, else null. Otherwise treat as a bare code: strip surrounding quotes/whitespace and return it only if it meets a plausible-code floor (length >= 20 and matches an alphanumeric-friendly charset such as /^[A-Za-z0-9_-]+$/), else null. Add a short file header comment noting this is a UX/paste-extraction helper, not a security validator (Epic's login is authoritative). Model the helper file layout and the it.each test structure on steamKeyValidation.ts / steamKeyValidation.test.ts. Write the test FIRST covering every case in the behavior block above.
  </action>
  <verify>
    <automated>yarn jest src/frontend/helpers/__tests__/epicAuthCode.test.ts</automated>
  </verify>
  <done>parseEpicAuthCode exported; all listed cases pass; malformed JSON never throws.</done>
</task>

<task type="auto">
  <name>Task 2: Wire smart clipboard pre-fill + parser into SIDLogin</name>
  <files>src/frontend/screens/Login/components/SIDLogin/index.tsx</files>
  <action>
    Import parseEpicAuthCode from 'frontend/helpers/epicAuthCode'. Import useEffect/useRef/useCallback as needed alongside the existing useState/useContext.

    (1) Submit path: change the Login onClick to run parseEpicAuthCode(input) and, if it returns a code, call handleLogin(code); if it returns null, set the error state (reuse the existing error path) instead of calling epic.login with junk. Keep handleLogin, loading/error states, getButtonLabel, getUserInfo, and backdropClick exactly as-is.

    (2) Submit guard: replace the raw `input.length < 30` disabled condition with one derived from the parser — the button is disabled when loading, error, or parseEpicAuthCode(input) returns null. This keeps a ~sensible length floor while allowing a pasted JSON blob (whose bare length far exceeds 30 but whose extracted code is what matters) to enable the button.

    (3) Auto pre-fill: add a tryPrefillFromClipboard callback that awaits window.api.clipboardReadText(), runs parseEpicAuthCode on it, and — only if a code is returned — pre-fills the field. To avoid clobbering user typing, track the last auto-filled value in a ref and only setInput when the field is empty OR its current value equals that last auto-filled ref value; update the ref whenever you auto-fill. Wire this to: (a) a useEffect on mount, and (b) a window 'focus' event listener (added in the same/adjacent useEffect, removed on cleanup) so returning from the system browser re-checks the clipboard.

    (4) Remove the onAuxClick handler and its trailing comment from the input entirely. Optionally add a small visible "Paste" button that calls the same tryPrefillFromClipboard callback if it fits the existing MUI/button styling — keep it minimal; skip if it complicates layout. Do NOT use navigator.clipboard anywhere.

    Do not modify Login/index.tsx or Runner/index.tsx.
  </action>
  <verify>
    <automated>yarn tsc --noEmit -p tsconfig.json 2>&1 | grep -i "SIDLogin" || echo "no SIDLogin type errors"</automated>
  </verify>
  <done>onAuxClick removed; input pre-fills from clipboard on mount and window focus only when a valid code is present and the field is empty/auto-filled; Login uses parseEpicAuthCode; pasting either a bare code or the full JSON blob enables and completes login; no navigator.clipboard usage; typecheck clean for this file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| clipboard -> renderer | Untrusted arbitrary text read from the system clipboard enters the app |
| renderer -> epic.login | User-controlled code string crosses into the Epic auth flow (existing boundary) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mcu-01 | Tampering | parseEpicAuthCode JSON.parse of clipboard text | mitigate | JSON.parse wrapped in try/catch; malformed input returns null, never throws or mutates state |
| T-mcu-02 | Denial of Service | window focus listener firing repeatedly | mitigate | Read is cheap and idempotent; pre-fill only mutates state when a valid code is found and field is empty/auto-filled, so no render churn / no clobber |
| T-mcu-03 | Information disclosure | clipboard contents auto-read | accept | Read is local, in-process, discarded if not a plausible code; no logging of clipboard content; Epic's login remains the authoritative validator |
</threat_model>

<verification>
- `yarn jest src/frontend/helpers/__tests__/epicAuthCode.test.ts` passes.
- `yarn tsc --noEmit -p tsconfig.json` reports no errors for SIDLogin/index.tsx or epicAuthCode.ts.
- `grep -n onAuxClick src/frontend/screens/Login/components/SIDLogin/index.tsx` returns nothing.
- `grep -n "navigator.clipboard" src/frontend/screens/Login/components/SIDLogin/index.tsx` returns nothing.
- Login/index.tsx and Runner/index.tsx remain unchanged (`git status` shows no new modifications to them).
</verification>

<success_criteria>
- A pasted full Epic JSON blob and a pasted bare code both enable the Login button and authenticate.
- The clipboard is auto-read on modal mount and on window focus, pre-filling only when a valid code is present and the field is empty or holds a prior auto-filled value.
- Nothing auto-submits — an explicit Login click is always required.
- The undiscoverable onAuxClick affordance is gone.
- Parser logic lives in a pure, unit-tested helper.
</success_criteria>

<output>
Create `.planning/quick/260803-mcu-epic-sidlogin-smart-clipboard-paste-auto/260803-mcu-SUMMARY.md` when done.
</output>
