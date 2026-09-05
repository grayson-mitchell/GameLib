---
quick_id: 260905-qjf
slug: remove-humble-getaccountidentity-and-the
description: Remove `getAccountIdentity` and validation.ts's advisory call — dead against a route proven not to exist
created: 2026-09-05
completed: 2026-09-05
status: complete
---

# Summary — `getAccountIdentity` removed

Commit `34f1b398b`. 6 files, **37 insertions / 285 deletions**. The operator took the scope call
left open by [quick-260905-q4j](../260905-q4j-discharge-humble-user-info-404-todo-with/SUMMARY.md).

## Behaviour-preserving, and that is the point

`getAccountIdentity` was the **only writer** of `configStore.set('userData', …)`. Because
`/api/v1/user/info` never once resolved `ok` — 404 at Phase 10, re-confirmed live 2026-09-05 — that
write **never executed in the program's history**.

| Surface | Before | After |
|---|---|---|
| `HumbleUser.getUserDetails()` | `undefined` | `undefined` |
| `humbleGetUserInfo` IPC | `undefined` | `undefined` |
| `humbleAuthState.username` | `undefined` | `undefined` |
| login `settle({ status: 'done', username })` | `undefined` | `undefined` |

## The tests were asserting a fiction

The most interesting finding. Six assertions encoded behaviour production could never produce,
sustained entirely by `mockGetAccountIdentity.mockResolvedValue({ status: 'ok', data: { username:
'tester' } })` in `beforeEach`:

- **five** × `expect(result.username).toBe('tester')` — production always yielded `undefined`
- **one** × `expect(mockConfigStore.set).toHaveBeenCalledWith('userData', { username: 'tester' })`
  — a store write that never once happened

A green suite agreeing with a dead code path. They now assert `undefined`, which is what the code
has always actually done. **This is why the removal is worth more than the ~250 deleted lines**: the
suite was actively vouching for a capability the app never had.

## Coverage checked before deleting, not after

The deleted `describe` block also held the F-3 tests for `mapAxiosError`'s diagnostic-context
branch — a **shared** mechanism, so deleting them could have silently dropped coverage. Verified
first:

- `revealKey` retains it (positive assertion + the redaction assertion)
- `getGamekeys` retains the opt-out case ("no context ⇒ no diagnostic")
- After this removal the **axios-error + context** combination is *unreachable in production*:
  `revealKey` throws `HumbleTransportHttpError`, and `getGamekeys`/`getOrderDetail` pass no context

So the deleted tests covered nothing live.

## Removed

| File | What |
|---|---|
| `adapter.ts` | `getAccountIdentity`, `AccountIdentitySchema`, the unused `HumbleUserData` import, 2 enumerating comments |
| `validation.ts` | the advisory call, its no-cookie `not_attempted` entry, and `toEndpointResult`'s `opts`/advisory param (lost its only caller) |
| `common/types/humble.ts` | `HumbleValidationEndpointResult.advisory` — no writer left anywhere, no frontend consumer |
| `user.ts` | the best-effort post-login identity fetch; `username` is now a documented permanent `undefined` |
| tests | the `getAccountIdentity` describe block; the mock; the two identity-failure tests |

The validation report now carries exactly two endpoints. The `overall` verdict is unchanged — the
advisory result could never affect it by construction.

## Deliberately NOT removed — still the operator's call

`HumbleUserData`, the `userData` store key, `HumbleUser.getUserDetails()`, the `humbleGetUserInfo`
IPC channel + its sidecar flow, and the expiry-path `userData?.username` read. All five are
**byte-identical** in this commit (verified via `git status`). Their runtime behaviour is unchanged,
so leaving them is the pre-existing state, not a new defect — and deleting an IPC channel is an API
change with frontend reach that quick tasks on this project are known to slip past the IPC
inventory.

## Verification

- [x] Zero code references to `getAccountIdentity` / `AccountIdentitySchema` / `mockGetAccountIdentity`
- [x] `/api/v1/user/info` survives only in two removal-history comments
- [x] No `advisory` field declared without a writer
- [x] The five out-of-scope surfaces byte-identical
- [x] `tsc --noEmit` exit 0
- [x] `eslint` 0 errors (111 pre-existing `any` warnings in test files)
- [x] prettier clean across all six files
- [x] 16 Humble + `humbleFlows` suites / **571 tests** pass

Broader `src/backend src/common` run: 198/199 suites, 4601 tests. The single failure,
`lzmaNativeSeaRealBuild.test.ts`, **passes in isolation** (29s, one test at 18.6s) — a load-induced
flake in the full run, not a regression from this change, and confirmed by re-run rather than
asserted.

## Process note

Two guard assertions convicted correct output before landing: `assert 'advisory' not in s` and
`assert 'getAccountIdentity' not in s` both tripped on my **own replacement comments**, which
legitimately name the thing being removed. Fixed by asserting on syntax (`import { getAccountIdentity`,
`getAccountIdentity(`, `advisory:`) rather than on the bare word. The inverse of this project's
known "a raw-source gate is satisfied by the prose that names its subject" trap — here the prose
*failed* a removal check instead of passing one.
