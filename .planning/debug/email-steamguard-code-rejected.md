---
status: diagnosed
trigger: "Submitting a valid EMAIL SteamGuard code is rejected with 'invalid code'; credential login never completes (Phase 1 UAT Test 2, major)"
created: 2026-06-29
updated: 2026-06-29
mode: find_root_cause_only
---

## Current Focus

hypothesis: The SteamGuard code entry/submit path is built and tested only for NUMERIC (TOTP-style) codes. Steam EMAIL guard codes are alphanumeric (uppercase letters + digits) and are transmitted verbatim to Steam with no case normalization, so the entry layer mishandles them — primarily by hinting/assuming numeric input and never uppercase-normalizing the value before submission.
test: Static trace of the full code path (frontend input → preload → IPC → backend → steam-session library) plus inspection of steam-session 1.9.4 internals for guard-type selection and code normalization.
expecting: If the entry layer is the problem, the transport/library layers should be provably correct (verbatim pass-through, correct EmailCode type) and the only numeric/code-shape assumptions should live in the frontend + tests.
next_action: Hand diagnosis to gsd-planner (--gaps). No fix applied (find_root_cause_only).

## Symptoms

expected: Credentials tab accepts username/password → triggers EMAIL SteamGuard prompt → submitting the 5-char email code completes login and shows the logged-in Runner tile.
actual: Email SteamGuard code "is not being recognised"; UI shows "invalid code"; login never completes.
errors: UI message "Incorrect code. Check your authenticator and try again." (the generic error branch in handleGuardSubmit).
reproduction: Phase 1 UAT Test 2 (.planning/phases/01-steam-authentication/01-HUMAN-UAT.md). Guard type = EMAIL (not mobile authenticator).
started: Discovered during UAT 2026-06-29 (feature never verified for the email path).

## Eliminated

- hypothesis: Backend submits the wrong EAuthSessionGuardType (treats email code as a device/TOTP code).
  evidence: steam-session LoginSession.submitSteamGuardCode (node_modules/steam-session/dist/LoginSession.js:605-618) derives the type from the session's allowedConfirmations: `needsEmailCode = allowedConfirmations.some(EmailCode)`, then sends `authCodeType: needsEmailCode ? EmailCode : DeviceCode`. For an email-guard account it correctly sends EmailCode. The app never passes a guard type itself.
  timestamp: 2026-06-29

- hypothesis: The code argument is dropped/mangled by IPC or preload wiring.
  evidence: Verified end-to-end pass-through: SteamLogin/index.tsx:203 `window.api.steamSubmitGuard(guardCode)` → preload/api/steam.ts:6 `makeHandlerInvoker('steamSubmitGuard')` → preload/ipc.ts:16-17 `ipcRenderer.invoke(channel, ...args)` → main.ts:853-855 `addHandler('steamSubmitGuard', (event, code) => SteamUser.submitSteamGuardCode(code))` → user.ts:398 `session.submitSteamGuardCode(code)`. The string is passed verbatim at every hop.
  timestamp: 2026-06-29

- hypothesis: A premature 30s login-timeout fires before/while the user submits the code.
  evidence: For a pure EmailCode guard, steam-session's _processStartSessionResponse (LoginSession.js:401-435) does NOT start polling (no _doPoll in the EmailCode branch). _pollingStartedTime stays unset, so loginTimeout's clock only starts after submitSteamGuardCode → setImmediate(_doPoll). The user has unbounded time to enter the code. (Premature polling only happens for accounts with DeviceConfirmation/EmailConfirmation, which is not this account.)
  timestamp: 2026-06-29

- hypothesis: Race condition — handlers attached after the 'authenticated' event already fired.
  evidence: user.ts attaches once('authenticated'/'error'/'timeout') synchronously in the Promise executor immediately after `await session.submitSteamGuardCode(code)` resolves; the library's `setImmediate(() => this._doPoll())` runs on a later tick, so the handlers are in place before polling emits anything. Unit test user.test.ts:548-563 confirms the happy path resolves 'done'.
  timestamp: 2026-06-29

## Evidence

- timestamp: 2026-06-29
  checked: SteamLogin/index.tsx:387-401 (the SteamGuard code <input>)
  found: `type="text" inputMode="numeric" maxLength={5}`, onChange = `setGuardCode(e.target.value)` (no normalization), submit gated by `disabled={guardCode.length < 5}`. No `autoCapitalize`, no `text-transform: uppercase`, no `.toUpperCase()`/`.trim()` anywhere before submission. The field is shaped for a 5-DIGIT numeric code.
  implication: The entry layer assumes numeric codes and never normalizes case/shape for an alphanumeric email code.

- timestamp: 2026-06-29
  checked: steam-session guard-type enum + submit (EAuthSessionGuardType.js; LoginSession.js:605-618; AuthenticationClient.js:113-126)
  found: EmailCode=2, DeviceCode=3. The handler sends `code: details.authCode` verbatim — there is NO toUpperCase/trim/normalization anywhere in steam-session for the auth code (grep across dist/*.js confirms only base64 and cookie-domain string ops). An incorrect/expired email code makes UpdateAuthSessionWithSteamGuardCode return non-OK (InvalidLoginAuthCode=65), which sendRequest throws → user.ts:421 catch → `{status:'error'}` → UI "invalid code".
  implication: Whatever the user types is sent to Steam exactly as typed. The "invalid code" path is exactly what a code Steam considers wrong produces.

- timestamp: 2026-06-29
  checked: Unit tests (user.test.ts:541-578) and UAT truth text
  found: Every guard-submit fixture uses NUMERIC codes ('12345', '99999'); the UAT "truth" is worded "valid 5-DIGIT SteamGuard code". The EMAIL (alphanumeric) path has no test coverage and was never exercised before UAT.
  implication: The feature was designed/verified against numeric TOTP-style codes only. The alphanumeric email path is unimplemented-in-practice.

- timestamp: 2026-06-29
  checked: External corroboration (Steam community)
  found: Documented real-world pattern: Steam Guard emails alphanumeric (all-letter) codes while number-only login forms reject them. Steam email codes are 5 alphanumeric characters, presented uppercase.
  implication: A numeric-assuming entry path (or a mis-cased entry sent verbatim) is a known cause of valid email codes being rejected.

## Resolution

root_cause: |
  The SteamGuard code entry/submission path handles only numeric (TOTP-style) codes and does not correctly handle EMAIL Steam Guard codes, which are 5-character ALPHANUMERIC (uppercase letters + digits). The transport and library layers are provably correct: the entered string is passed verbatim through frontend → preload → IPC → backend → steam-session, and steam-session correctly auto-selects EAuthSessionGuardType.EmailCode and sends the code UNMODIFIED (no case/whitespace normalization anywhere in the stack). Because the GameLib guard input (SteamLogin/index.tsx:387-401) (a) advertises numeric entry via `inputMode="numeric"` and is framed as a "5-digit" field, and (b) performs NO uppercase normalization or trimming of the value before submission, an alphanumeric email code that is entered in the wrong case (or otherwise not in the exact uppercase form Steam expects) is forwarded verbatim and rejected by Steam as InvalidLoginAuthCode (65), surfacing as "invalid code". The email guard path was never implemented for alphanumeric input nor covered by tests (all fixtures and the UAT truth assume numeric 5-digit codes).
fix: ""  # find_root_cause_only — no fix applied
verification: ""
files_changed: []

  # Suggested fix direction (for gsd-planner --gaps):
  # 1. Treat the guard code as ALPHANUMERIC, not numeric:
  #    - Remove inputMode="numeric" (or set inputMode="text"); update label/instructions
  #      and the UAT truth wording away from "5-digit".
  #    - Normalize before submit: code.trim().toUpperCase() (and consider stripping spaces),
  #      both in the input handler and/or in SteamUser.submitSteamGuardCode().
  # 2. Make the error message guard-type aware ("Check your email or authenticator") instead
  #    of always saying "Check your authenticator".
  # 3. Add test coverage for an alphanumeric email code (e.g. 'KQM4F') through
  #    submitSteamGuardCode → authenticated, and a regression test asserting case/space
  #    normalization, so the EmailCode path is exercised, not just numeric '12345'.
  # 4. Confirm steam-session still auto-selects EmailCode (it does) — the fix belongs in the
  #    GameLib entry/normalization layer, not the library.
