---
quick_id: 260905-qjf
slug: remove-humble-getaccountidentity-and-the
date: 2026-09-05
description: "Remove `getAccountIdentity` and validation.ts's advisory call — dead against a route proven not to exist"
status: planned
---

# Quick Task 260905-qjf — remove `getAccountIdentity`

Operator decision 2026-09-05, taking the scope call left open by
[quick-260905-q4j](../260905-q4j-discharge-humble-user-info-404-todo-with/SUMMARY.md): *"remove
getAccountIdentity and the validation.ts advisory call."*

`/api/v1/user/info` is not a route on Humble's API and never has been — 404 (hard failure, every
attempt) at Phase 10, and a control-verified live probe on 2026-09-05 confirmed the same bare
232-byte framework 404 against a session proven live by a 200 on the sibling path.

## The removal is behaviour-preserving, and that is the point

`getAccountIdentity` was the **only writer** of `configStore.set('userData', …)`. Because the
endpoint never once answered `ok`, that write **never executed** in the program's history. Every
downstream reader has therefore always seen `undefined`:

| Surface | Before | After |
|---|---|---|
| `HumbleUser.getUserDetails()` | `undefined` | `undefined` |
| `humbleGetUserInfo` IPC | `undefined` | `undefined` |
| `humbleAuthState.username` | `undefined` | `undefined` |
| login `settle({ status: 'done', username })` | `undefined` | `undefined` |

The frontend already never relies on `username`: `10-VALIDATION.md` Fix 2 threaded `isLoggedIn`
through `GlobalState` *because* the tile could never get a username. Nothing user-visible changes.

## Tasks

### Task 1 — `adapter.ts`: delete the function and its schema
- `getAccountIdentity` (L570–612) and `AccountIdentitySchema` (L117–127); both blank-line delimited.
- Drop `HumbleUserData` from the L5 import (its only two uses are inside the deleted function).
- Fix the two comments (L159, L400) that enumerate `getGamekeys/getOrderDetail/getAccountIdentity`.

### Task 2 — `validation.ts` + `common/types/humble.ts`: drop the advisory endpoint
- Remove the import, the `getAccountIdentity` call + `endpoints.push` (L56–61), and the
  `/api/v1/user/info` `not_attempted` entry in the no-cookie branch (L32–37).
- `toEndpointResult`'s `opts?: { advisory?: boolean }` loses its only caller → remove the parameter.
- `HumbleValidationEndpointResult.advisory?: boolean` then has no writer anywhere → remove the field.
  Grep-confirmed: no frontend consumer.
- Update the doc comment naming the three adapter functions.

### Task 3 — `user.ts`: drop the best-effort identity block
- Remove the `getAccountIdentity` import and the post-login `try/catch` identity fetch.
- `username` is now permanently `undefined` at the login-completion site. Keep the field explicit at
  both emit sites (`humbleAuthState` and `settle`) with a comment saying why it is always undefined,
  rather than silently dropping it from the payload — the field is part of `HumbleAuthState` and a
  reader should learn *why* it is never populated.

### Task 4 — tests
- `adapter.test.ts`: the `describe('getAccountIdentity')` block.
- `user.test.ts`: the `getAccountIdentity` mock and the two tests asserting identity-failure paths.

## Deliberately NOT removed — reported to the operator, not decided here

`HumbleUserData`, the `userData` store key, `HumbleUser.getUserDetails()`, the `humbleGetUserInfo`
IPC channel + its sidecar flow, and the expiry-path `userData?.username` read.

**Why the line is drawn here:** removing the writer changes none of their runtime behaviour — they
have always returned `undefined`. Leaving them is the *pre-existing* state, not a new defect.
Deleting an IPC channel is an API change with frontend reach, and quick tasks on this project are
known to escape the IPC-inventory discipline. That is a separate, operator-owned call.

## Success criteria

- [ ] Zero references to `getAccountIdentity` / `AccountIdentitySchema` in `src/`
- [ ] `/api/v1/user/info` appears nowhere in `src/` except as removal-history prose
- [ ] `validation.ts` reports exactly two endpoints; `overall` logic unchanged
- [ ] No `advisory` field left unset-but-declared
- [ ] The five out-of-scope surfaces are byte-identical
- [ ] `tsc --noEmit`, prettier, eslint clean; Humble + `humbleFlows` suites green
