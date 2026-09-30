---
created: 2026-10-01
title: 'The dev-secret-vault write log line is emitted identically by a clear, so a store and a wipe are indistinguishable in gamelib.log, and it nearly produced a false defect report'
found_during: closing debug/steam-token-survives-keychain (2026-10-01), filed by quick 261001-90h
severity: medium
platform: any
ready: code
area: observability
status: RESOLVED
resolved: 2026-10-01
files:
  - src/backend/sidecar/devSecretVault.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/sidecar/__tests__/devSecretVault.test.ts
---

## Mechanism

`devSecretVault.ts`'s own header names three guardrails: (a) opt-in via an exact
`GAMELIB_DEV_SECRET_VAULT === '1'` match, (b) a LOUD warning on every read/write naming only the
slot identifier, never the value, and (c) refused in a packaged build. Guardrail (b) is named,
tested, and declared non-negotiable — and it still cannot tell a credential store from a
credential wipe, which is the blind spot this todo records.

- `writeSlot()` (`devSecretVault.ts:164-169`) emits its log line unconditionally at line 165,
  through `logWarning`, naming the slot only: `[dev-secret-vault] write key=<slot>`.
- `clearSlot()` (`:175-177`) is a one-liner delegating to `writeSlot` with an empty-string value.
  Its own doc comment states plainly that a clear is "treated as a write for logging purposes" —
  so the collision is deliberate and documented, not an oversight. This is a design gap, not a
  bug.
- `DevVaultTokenStore.setToken()` (`:191-193`) and `clearToken()` (`:195-197`) therefore emit a
  byte-identical line for the Steam refresh-token slot.
- `DevVaultHumbleSecretStore.setSecret()` (`:214-216`) shares the same helper, and
  `clearSecrets()` (`:218-221`) clears both Humble slots, so a Humble disconnect emits two
  write-shaped lines.

For precision, and to keep this narrow and fair: `readSlot()` (`:156-160`) emits a distinct
read-shaped line at `:157` (`[dev-secret-vault] read key=<slot>`), so the vault already separates
reads from writes cleanly. The single indistinguishable pair is write-versus-wipe.

## How it misled a reading

This is the justification for filing at all. Reading a re-login that followed an external Steam
revocation, `gamelib.log` showed a vault write line for the Steam refresh-token slot at 06:12:10,
immediately followed by a Steam logout line at 06:12:10. That pair was read as a successful QR
login writing a token, immediately clobbered by a stale-token logout — a plausible race, and it
was very nearly reported to the operator as a real defect.

It is not a race. `SteamUser.logout()` at `src/backend/storeManagers/steam/user.ts:312-318` calls
`getTokenStore().clearToken()` at line 312, and only after that await resolves does it reach its
own `logInfo('Logging user out from Steam', ...)` line at `:318`. The vault-write-shaped line and
the logout line are one ordinary logout, in order — the "write" was `clearToken()`'s clear,
routed through the same log line a real token store would emit.

## Blast radius of a fix

`src/backend/sidecar/__tests__/devSecretVault.test.ts:349` pins the read-shaped line by string
equality (`message === '[dev-secret-vault] read key=steam-refresh-token'`). Verified at HEAD: no
equivalent equality assertion exists anywhere in that file for the write-shaped line — the write
path is exercised (it has to be, to reach the read tests' fixtures) but never pinned by string
match. A fix therefore has a small blast radius: no existing test asserts the exact write-line
text, so changing it does not require un-pinning anything.

## Scope

Bounded to dev-vault builds. The module is opt-in via an exact `GAMELIB_DEV_SECRET_VAULT` string
match on the value `1` (guardrail (a)) and is unreachable in a packaged build (guardrail (c)). No
shipped user is affected.

## Why medium

It demonstrably contaminated a diagnostic reading, and very nearly produced a false defect report.
The blast radius is bounded to dev-vault runs, and a workaround exists today — pair the line with
the adjacent Steam message to infer direction from context. Medium and not major because nothing
user-facing is broken and no measurement is silently wrong once the reader knows this limitation.

## Why `ready: code`

The change is a log-line edit plus a test update. Desk-ready: no live gate, no second machine.

## Direction, not decision

Two options, neither chosen here:

- Emit a distinct log line on the clear path (e.g. `[dev-secret-vault] clear key=<slot>`) instead
  of routing through `writeSlot`.
- Carry a direction token in the existing line (e.g. `[dev-secret-vault] write key=<slot>
  op=store|wipe`).

Whichever is chosen must preserve guardrail (b)'s absolute rule: only the slot name (and now,
potentially, a direction token) is ever logged — never the value, never a substring, never a
length.

## Cross-reference

See also
`.planning/todos/pending/2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md` —
the vault write line this todo describes is the first trace of any QR login anywhere in the log,
which is why that todo's gap is invisible and this one's line is ambiguous. The two gaps compound:
a failed QR attempt leaves nothing, and a successful one's first trace cannot be told apart from a
logout.

## Resolution (quick 261001-fz5, 2026-10-01)

**Direction chosen: Option B — a direction token on the existing line**, not a separate
`[dev-secret-vault] clear key=<slot>` line. Reason, in one sentence: Option A silently narrows the
established `grep 'dev-secret-vault] write'` habit — the only existing occurrences of `write
key=` in shipped source are this module's own doc comment and log call — so a wipe would quietly
stop matching that grep while it kept looking complete; Option B keeps the prefix stable, so the
existing grep still returns every mutation, with `grep 'op=wipe'` and `grep 'op=store'` available
as refinements.

**Lines now emitted**, replacing the single collision-prone
`[dev-secret-vault] write key=<slot>`:

- `[dev-secret-vault] write key=<slot> op=store` — `setToken`, `setSecret`, `setApiKey`.
- `[dev-secret-vault] write key=<slot> op=wipe` — `clearToken`, `clearSecrets` (both Humble
  slots), `clearApiKey`.

**How it is pinned.** `writeSlot()` (`devSecretVault.ts`) now takes a fourth, REQUIRED parameter
typed as the two-member string-literal union `WriteDirection = 'store' | 'wipe'`, supplied by the
caller and never derived from the value being written. Because the parameter is required and the
union is closed, `tsc` — not a grep — is what proves no direction-free `writeSlot` call site
survives; `pnpm codecheck` exits 0 with every call site updated. `clearSlot()` keeps its
`writeSlot(path, slot, '', 'wipe')` delegation, so the on-disk write for a clear is byte-for-byte
unchanged — pinned in `devSecretVault.test.ts` by reading the vault JSON off disk after a clear
and asserting the slot key is present and holds the empty string, plus a `statSync` mode-0600
check.

Four slots are now pinned by strict string equality in `devSecretVault.test.ts`, mirroring the
pre-existing read-line style at the equivalent assertion: the Steam slot's store line and wipe
line in one test; both Humble slots' (`sessionCookie`, `csrfToken`) wipe lines, plus their
present-and-empty on-disk state, in a second test; the SteamGridDB slot's wipe line in a third.
The Steam test also pins that the old direction-free form (`[dev-secret-vault] write
key=steam-refresh-token`, no `op=`) is no longer emitted by any path. The pre-existing leak-scan
test (`devSecretVault.test.ts`, the "NO logged argument leaks" test) was re-run **unmodified** and
stays green — it flattens every `logInfo`/`logWarning`/`logError` argument and scans for the
secret, every 3-character window of it, and its decimal length, so the new `op=` token was already
inside its scan surface by construction; nothing there needed to change.

**Deviation from the plan's assumed call site.** The plan assumed a getter importable from
`backend/steamgrid/secretStore` for the Task 2 SteamGridDB test. That assumption held exactly:
`getSteamGridDbSecretStore()` is exported from that module (verified live) and was imported
directly, reached the same way the neighbouring token/Humble tests reach their stores. No
deviation was needed here.

Guardrail (b)'s header text, `writeSlot`'s doc comment, and `clearSlot`'s doc comment were all
updated in the same commit to describe the new line shape, so none of the three certifies
behaviour the code has stopped having.

**Honest limits, at equal weight with the fix:**

1. Nothing in CI reads `gamelib.log`. This improvement is to a human reading path only — the pins
   prove the text is emitted correctly, not that any log-reading habit actually changed.
2. The cross-referenced sibling todo (a failed Steam QR login leaves no trace in `gamelib.log`) is
   untouched and stays open. The compounding gap this todo's "How it misled a reading" section
   describes is only half closed: a wipe is now unmistakable from a store, but a failed login
   attempt is still invisible.

The historical references to the old line text in `.planning/phases/34.5-.../34.5-36-PLAN.md`,
`.../34.5-40-PLAN.md`, and `.planning/STATE.md` were deliberately left as written — they are the
historical record of what was planned and filed then, not live specification.
