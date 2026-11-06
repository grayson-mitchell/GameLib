---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
reviewed: 2026-10-25T01:32:31Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/bridge_dispatch.h
  - meta/bridgeCensus.ts
  - meta/__tests__/bridgeCensus.test.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts
  - src/backend/storeManagers/steam/games.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 53: Gap-Closure Code Review Report (53-17..53-19)

**Reviewed:** 2026-10-25T01:32:31Z
**Depth:** standard (diff `e237b8c25..HEAD`, with full-file context; the generated `steam_api_shim.c` / `bridge_dispatch.h` were checked hunk by hunk against the generator)
**Files Reviewed:** 11
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

### Status of the 53-GAP-REVIEW findings

- **CR-01 (fixed, for the live case).** `SteamAPI_ISteamGameServer_GetPublicIP` now does four things in order in its fallback: a NULL guard on `ret`; dispatch of `ret == &g_steamgameserver012_instance` through `vt[36]`, which is the 012 vtable's `GetPublicIP` slot (confirmed at `steam_api_shim.c:19082`), returning the `uint32` in RAX; `return NULL` guards for the 014 and 015 instances; and only then the `memset`. Shim instances can no longer be zeroed. The generalisation in `emitHiddenFallback` is incomplete for return classes other than integer scalars (WR-01). The generated comment still says "not dispatched" (IN-01).
- **WR-02 (fixed).** `*pcbTicket` is now stored after the buffer decode as `min(declared, copied)`. It is 0 on every path where nothing was copied, including a short response and `pTicket == NULL`.
- **WR-03 (fixed).** `copyLen` is clamped to `cap - 1`, and the NUL is written only when `cap > 0`. The termination is still missing on the skip and failure paths (IN-02, latent).
- **WR-04 (fixed).** The helper `memset`s the scratch to `cap` after the capacity clamp and before the native call, in both generated dispatch cases.
- **WR-01 (fixed).** CALL, NOVER and HELLO are anchored to `^\[ts\]\s+CATEGORY` on attributed payloads. The formats match what `bridge_helper.c` actually emits (`logts` at `:217`; HELLO `:489`, NOVER `:554`, CALL `:585`), so genuine lines still match. `classifyBridgeEvidence`'s no-HELLO gate uses the anchored matcher too. One residual inconsistency is noted in IN-03.
- **WR-05 (fixed).** `relayLines` keeps a per-stream carry and flushes it once, on `end` or on the child's `close`. It adds no timers or handles, so the sidecar exit-by-drain contract is intact. `logts` always writes a newline to unbuffered stderr, so LISTEN discovery cannot stall on the carry.
- **WR-06 (fixed).** Newer files are appended in ascending mtime order.

### 53-19 (DLL override)

`runWineCommand` spawns without a shell, so the empty `/d ''` argument reaches `reg.exe` intact. The registry key and value match Arm B in `53-19-NVAPI.md`. The applier is awaited after known-fixes and before the monitor, and it cannot reject.

Its failure detection only checks a truthy `code`, so several real failure modes look like success (WR-02).

### Tests

The four suites pass (323 tests).

## Warnings

### WR-01: `emitHiddenFallback` dispatches a dropped RAX-form version without checking its return class

**File:** `meta/gen_vtables.ts:2021-2048` (`emitHiddenFallback`); the reference shape is the generated `steam_api_shim.c:24755-24763`

**Issue:** The only fail-closed check is `d.method.params.length > 0`. Every zero-parameter dropped version that is not hidden-pointer gets this emission:

```c
return (void *)(uintptr_t)((<slotC> (*)(void *))vt[slot])(ret);
```

That is correct only for integer/pointer scalars (`int32`, `int64`, `pointer`, `string`, `bool`), which covers today's single case, 012's `uint32`. Other return kinds go wrong as follows (`flatRetType`, `:1801-1827`):

- **`class` (small, RAX-sized struct):** `slotC` is `void *`. However, the generator's own non-hidden class dispatch passes a member-function sret, `vt[17])(self, &out, ...)`, because the vtable stub writes the struct through its second argument. The fallback passes no sret. The vtable stub then writes the struct through whatever is in RDX, which is an arbitrary memory write in the game process. CR-01 was exactly this class of bug, and the generator would reintroduce it silently.
- **`float` / `double`:** the value is converted to an integer and returned in RAX. The caller reads XMM0, so it gets garbage, and no error is raised.
- **`void`:** `(uintptr_t)(void-expr)` fails at C compile time. That is fail-closed, but only by accident and far from the cause.

None of these can be reached from today's manifests. But the function is documented as the universal fallback ("Hidden-pointer fallback guard is universal", 53-17-SUMMARY), and a future `FLAT_UNREPRESENTABLE_CASES` entry is exactly how one of these gets in. No test covers a zero-parameter `class`, `float` or `void` drop.

**Fix:** Fail closed on anything other than an integer-class scalar. The alternative is to emit the class form properly.

```ts
const r = flatRetType(d.method)
if (r.cls !== 'gpr' || d.method.returnKind === 'class') {
  throw new Error(
    `flat export ${d.triple}: dropped RAX-form version returns ${d.method.returnKind}; ` +
      `only integer/pointer scalars are dispatched from the hidden-pointer fallback (fail closed, 53-17)`
  )
}
```

To support `class` instead, emit `uint64_t out = 0; ((void * (*)(void *, void *))vt[slot])(ret, &out); return (void *)(uintptr_t)out;`. Add tests for zero-parameter `class` and `float` drops.

### WR-02: Override failures that carry no truthy exit code are logged as nothing, so the fix silently fails to apply

**File:** `src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts:62-74`

**Issue:** Success is inferred from `!result?.code`. `runWineCommand` (`src/backend/launcher.ts:1506-1508`) returns `{ stdout: '', stderr: 'Invalid wine' }` with **no `code`** when `validWine` fails. It resolves with `code === null` when the child is killed by a signal. Both cases pass the check, and nothing is logged.

When that happens, Overlooting launches without the override and faults at rip=0 before the shim. That is the 53-15 failure again, with no log line to tell it apart from "override applied but ineffective". It also lands directly on the 53-20 evidence that decides whether the row is "held back".

**Fix:** Treat anything other than an explicit `code === 0` as a failure, and include stderr in the warning:

```ts
if (result?.code !== 0) {
  logWarning(
    `Steam ${appId}: DLL override ${dll} did not confirm success (code=${String(result?.code)}, stderr=${(result?.stderr ?? '').slice(0, 200)})`,
    LogPrefix.Steam
  )
}
```

Optionally, log one `logInfo` on success, so the census can show that the override was in effect.

## Info

### IN-01: The generated comment and generator error text still say GameServer012 `GetPublicIP` is "not dispatched"

**File:** `meta/gen_vtables.ts:2132-2137` (excludedNote), `:2141-2145` (error text); generated `steam_api_shim.c:23498`
**Issue:** The shim still emits `/* not dispatched: SteamGameServer.GetPublicIP.SteamGameServer012 (unrepresentable register class) */` directly above a body that now dispatches it. The thrown message ("List the version(s) to leave undispatched in FLAT_UNREPRESENTABLE_CASES") is also no longer accurate for hidden-pointer exports, where a zero-parameter RAX drop is dispatched.
**Fix:** When `proto.hiddenSize !== null` and the dropped case is dispatched by `emitHiddenFallback`, emit `/* dispatched via ret-is-instance fallback: <triple> (RAX form) */`. Reword the error text to "List the version(s) that need a separate calling convention…".

### IN-02: A `char*` out-buffer is left unterminated on the skip and transport-failure paths

**File:** `meta/gen_vtables.ts:1568-1590` (decode), `:1525-1529` (`failZeroLines`)
**Issue:** The NUL is written only inside the successful-copy block. A short response, `retlen < respOff + copyLen`, or a transport failure leaves the caller's `char*` buffer unterminated. A caller that ignores the return value then reads garbage until some random NUL. This is latent, because no wired manifest has a `char*` out-buffer (only the `AbiExercise001` fixture).
**Fix:** In both the failure lines and the not-copied path, emit `if (<p> != NULL && cap_<p> > 0) <p>[0] = '\0';`.

### IN-03: HELLO acceptance differs between `hasHello` and `appLogSegmentFor`, and `HELPER_PREFIX` is not anchored to the logger header

**File:** `meta/bridgeCensus.ts:796`, `:834-838`, `:855-866`
**Issue:**
- `hasHello` goes through `attributeHelperLines`, which also accepts logger continuation lines after a prefix line. `appLogSegmentFor` accepts only lines that carry the prefix themselves. A HELLO payload on a continuation line passes the gate but yields no segment. The result is harmless (unverified), but the two definitions of "genuine HELLO" have drifted.
- `HELPER_PREFIX` matches `bridge helper [id]:` anywhere in a line. The new payload anchoring is therefore only as strong as that prefix. Any non-helper logger line that embeds other text containing `bridge helper [<id>]: [x] CALL …` is attributed. The other text could be a path or a title, for example. This is far-fetched today.

**Fix:** Have `appLogSegmentFor` and `hasHello` share one predicate. Anchor the prefix after the logger header, for example `^\(\d{1,2}:\d{2}:\d{2}\) \[[^\]]*\][^:]*:\s*bridge helper \[(\d+)\]:\s?`, adjusted to the logger's real format.

### IN-04: The override is keyed on a hard-coded exe basename that is never checked against the exe actually launched

**File:** `src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts:31-36`; `src/backend/storeManagers/steam/games.ts:3202-3214`
**Issue:** `AppDefaults\Overlooting.exe` only takes effect if the launched exe's basename is `Overlooting.exe`. If a game update renames the exe, or the launch config resolves a different one, the override becomes a silent no-op and the rip=0 fault returns with no diagnostic. `exePath` is available in `fireBridgeWineLaunch` but is not passed to the applier.
**Fix:** Pass `basename(exePath)` into `applyBridgeBottleDllOverrides`. Log a warning when it differs, case-insensitively, from `entry.exe`.

---

_Reviewed: 2026-10-25T01:32:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
