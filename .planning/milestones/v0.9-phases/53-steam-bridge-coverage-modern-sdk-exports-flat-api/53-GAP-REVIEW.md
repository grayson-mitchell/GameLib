---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
reviewed: 2026-10-25T00:09:49Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - meta/gen_vtables.ts
  - meta/bridgeCensus.ts
  - meta/extractProtonInventory.ts
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
  - src/backend/storeManagers/steam/bridge/managedImports.ts
  - src/backend/storeManagers/steam/bridge/peSteamDrm.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - meta/sdk/wire-policy.json
  - meta/__tests__/bridgeCensus.test.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/extractProtonInventory.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/peSteamDrm.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
status: issues_found
---

# Phase 53: Gap-Closure Code Review Report (53-10..53-16)

**Reviewed:** 2026-10-25T00:09:49Z
**Depth:** standard (diff `7aa9a4c57..HEAD`, with full-file context; generated `steam_api_shim.c` / `bridge_dispatch.h` spot-checked where a generator change could produce a wrong stub)
**Files Reviewed:** 20
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

### Status of the prior 53-REVIEW findings

- **CR-01 (fixed).** `isHiddenPointerFlatReturn` and `isRaxStructSize` select the Win64 hidden-pointer form for 16/20/40-byte returns. The generated output has the right shape: `void * SteamAPI_ISteamInput_GetAnalogActionData(void *ret, void *self, ...)` forwards `(self, ret, ...)` to the member slot and returns `ret`. The 2-byte `GetDigitalActionData` stays on the RAX path, with a member-function sret on the vtable side, which matches the MSVC rule.
- **WR-01 (fixed).** The vtable stubs `memset(sretOut, 0, structSize)` and return `sretOut`.
- **WR-07 (fixed).** An unsized class return now fails closed.
- **WR-08 (fixed).** The Friends018 `_ret` params were re-extracted, and `validateManifest` now rejects a leading `_ret` on any x64 manifest.
- **WR-02, WR-04, WR-05, WR-06 (fixed correctly).**
- **WR-03 (fixed on both sides).** The relay change is in `helperProcess.ts`; the census change is in `attributeHelperLines`.
- **IN-01 (partly fixed).** See IN-03 below.
- **IN-02 and IN-04 (fixed).**
- **Prior IN-03 (`bridgeScan.ts`) not checked.** That file is not in this scope.

### New defects

The gap work introduced one memory-corruption path: the "not dispatched" exclusion for `GameServer012.GetPublicIP`.

It also weakened the census evidence regex. The new regex lets game-supplied version strings forge CALL, HELLO and NOVER evidence.

The new out-buffer marshalling (53-14) is mostly sound:
- the helper clamps capacity to the scratch buffer;
- the native size argument is pulled back to that capacity;
- the shim never copies more than the caller's own capacity.

It still has three edge defects:
- out-length consistency;
- a latent NUL-terminator overflow;
- a latent stale-buffer leak.

## Critical Issues

### CR-01: The 012 exclusion of the hidden-pointer `GetPublicIP` export writes 20 bytes over the shim's own `g_steamgameserver012_instance`

**File:** `meta/gen_vtables.ts:1661-1667` (FLAT_UNREPRESENTABLE_CASES), `:2050-2099` (exclusion plus fallback); generated `native/steam-bridge/generated/steam_api_shim.c:23491-23504`

**Issue:** `SteamGameServer012` is newly served on x64 (`shimCoverage.ts`, 53-12). Its `GetPublicIP` returns a plain `uint32` in RAX. In the SDK generation that 012 belongs to, the flat function was `uint32 SteamAPI_ISteamGameServer_GetPublicIP(intptr_t instancePtr)`, so a caller built against that SDK puts **self in RCX**. The shared export the generator now emits is:

```c
void * SteamAPI_ISteamGameServer_GetPublicIP(void *ret, void *self) {
  if (self == (void *)&g_steamgameserver014_instance) { ... }
  if (self == (void *)&g_steamgameserver015_instance) { ... }
  memset(ret, 0, 20);
  return ret;
}
```

For a 012-era caller:
1. `ret` is `&g_steamgameserver012_instance`, and `self` is whatever is in RDX.
2. Neither branch matches, so the fallback zeroes 20 bytes starting at the 012 instance. That includes its vtable pointer, and probably the bytes after it, because an instance object is typically one pointer wide.
3. The function returns the instance address as the "IP".
4. Every later call through that instance runs `*(vfn **)self`, which is now NULL, and crashes inside the shim.

The comment says "012's vtable proxy is still served; only the shared flat export leaves 012 undispatched". In fact, "undispatched" here means a write through the caller's first argument. More generally, any `FLAT_UNREPRESENTABLE_CASES` exclusion where the dropped version uses the RAX convention and the kept versions use the hidden pointer has the same fallback hazard. No test covers it.

**Fix:** In the hidden-pointer fallback, never write through `ret` when it is a known shim instance, and dispatch the dropped RAX-convention version through RCX. For example, in `emitFlatExports` when `proto.hiddenSize !== null && dropped.length > 0`:

```c
  /* 012-era callers pass self in RCX (uint32 return in RAX) */
  if (ret == (void *)&g_steamgameserver012_instance) {
    vfn *vt = *(vfn **)ret;
    return (void *)(uintptr_t)((uint32_t (*)(void *))vt[<012 slot>])(ret);
  }
```

At minimum, emit `if (<ret is any g_*_instance>) return NULL;` before the `memset`. Add a gen_vtables test that asserts the excluded version's instance is guarded in the generated body.

## Warnings

### WR-01: The census CALL regex is no longer anchored, so game-supplied version strings in FWD and NOVER lines can forge CALL, HELLO and NOVER evidence

**File:** `meta/bridgeCensus.ts:858` (`findGameCalls`), `:874-878` (`findNover`), `:832-835` (`appLogSegmentFor`); sources in `native/steam-bridge/helper/bridge_helper.c:553-554` and `bridge_dispatch.h` FWD lines

**Issue:** The old regex required `bridge helper [id]:\s*\[ts\]\s+CALL`, so CALL had to be the line's category. The new one is `/\]\s+CALL\s+([A-Za-z0-9_]+\.[A-Za-z0-9_]+)/` and matches anywhere in the payload.

The helper logs game-controlled strings in two places:
- `NOVER  flat lookup ver=%s served=no` (REPORT_VERSION);
- `FWD CreateInterface ver=%s ...` (and the forwarded ISteamClient lookups).

`sanitize_ver` and `bd_fwd_sanitize` only replace non-printable bytes. `]`, spaces and `.` pass through, so `x] CALL SteamUser021.GetSteamID` reaches the log intact. Two such strings produce two distinct "calls", one of which is an identity call. That turns a Godot, GameMaker or unknown title `verified` with no real dispatch. This is exactly the D-53-13 "helper-originated lines never count" property the new code claims to keep.

The same weakness affects two other regexes:
- `findNover`'s `/\bNOVER\b/` fires on a FWD line whose version contains `NOVER ver=X`, which gives Unity a false `init-failed`.
- `appLogSegmentFor`'s HELLO regex can be steered by a version string containing `HELLO shim attached appid=<id>`.

**Fix:** Match the category position on the attributed payload, not a substring:

```ts
const call = /^\[[^\]]*\]\s+CALL\s+([A-Za-z0-9_]+\.[A-Za-z0-9_]+)\s*$/
const isNover = (l: string) => /^\[[^\]]*\]\s+NOVER\s+flat lookup ver=/.test(l)
const hello = new RegExp(`^\\[[^\\]]*\\]\\s+HELLO\\s+shim attached appid=${appid}(?![0-9])`)
```

In `appLogSegmentFor`, apply the HELLO match per line, after the `bridge helper [id]: ` prefix. Add a census test with a FWD or NOVER line carrying an injected `] CALL X.Y`.

### WR-02: The shim reports `*pcbTicket` independently of the bytes it actually copied

**File:** `meta/gen_vtables.ts:1536-1566` (emitVtableStub decode); generated `steam_api_shim.c:729-746`, `:11525-11542`

**Issue:** `lenParam` (53-14) ties `pcbTicket` to `pTicket` on the helper side only. The shim decodes the out-value first and stores it unconditionally. Then it copies the buffer only when `pTicket != NULL && retlen >= respOff + copyLen`, and clamps the copy to `cap_pTicket`. This causes three problems:
- A short or malformed response, or a skipped copy, leaves `*pcbTicket` claiming N bytes that were never written. The game then submits N bytes of uninitialised buffer as an auth ticket.
- If the response is shorter than `respOff + 4`, `*pcbTicket` is not touched at all. The caller's garbage survives even though `failZeroLines` exists precisely to stop "a stale/garbage length" being read. Only total transport failure zeroes it.
- `*pcbTicket` is never clamped to `copyLen`, which is the only length the shim can vouch for.

**Fix:** For an out-buffer with `lenParam`, write the length param after the buffer decode:

```c
uint32_t copied = 0;
/* ... buffer decode sets copied = copyLen on a successful memcpy ... */
if (pcbTicket != NULL) *pcbTicket = (outVal < copied) ? outVal : copied;
```

Zero it on every path where the buffer is not copied.

### WR-03: The `char*` out-buffer NUL terminator writes one byte past the caller's capacity

**File:** `meta/gen_vtables.ts:1553-1560`

**Issue:** 53-14 added `if (copyLen > cap_X) copyLen = cap_X;` and labels it "never write past the caller's own capacity (T-53-56)". For `p.type === 'char*'` the generator still emits `p[copyLen] = '\0'`. When `copyLen == cap`, that writes `p[cap]`, one byte out of bounds. With `cap == 0` (negative or zero size), it writes `p[0]` into a zero-length buffer. No current wire manifest has a `char*` out-buffer, so this is latent. The first one added, for example a `GetCurrentBetaName`-style method, ships an off-by-one stack or heap write.

**Fix:**

```ts
...(nulTerminate
  ? [`    if (copyLen >= cap_${p.name}) copyLen = cap_${p.name} ? cap_${p.name} - 1 : 0;`]
  : []),
// and only terminate when cap_${p.name} > 0
```

Add a generator test on a `char*` out-buffer fixture.

### WR-04: Helper out-buffer without `lenParam` returns `cap` bytes of a never-cleared static buffer

**File:** `meta/gen_vtables.ts:2947-2956`, `:3103-3114`

**Issue:** The helper-owned `static uint8_t <flat>_<p>_buf[BD_WIRE_OUT_BUFFER_MAX_BYTES]` is never zeroed. When `lenParam` is absent, `outLen = cap` and the whole capacity is sent back. That includes bytes the native call did not write: leftovers from earlier calls of the same method, such as a previous ticket, or zeros on the first call. `assertDispatchable` accepts an out-buffer with no `lenParam`, so this is reachable for the next out-buffer method anyone wires. The bytes cross a trust boundary into the game process.

**Fix:** Either `memset(<buf>, 0, cap)` before the native call, or make `assertDispatchable` require `lenParam` (or a NUL-terminated `char*` with a strlen-derived length) for dispatchable out-buffers.

### WR-05: Per-chunk splitting still loses CALL and HELLO lines that straddle a `data` boundary

**File:** `src/backend/storeManagers/steam/bridge/helperProcess.ts:295-316`

**Issue:** The comment says a line split across chunks "is logged as two prefixed fragments, which is acceptable: each fragment carries the appid". It is not acceptable for the census. `[ts] CALL   SteamUser021.GetSteamID` split as `[ts] CA` and `LL Steam...` matches neither the CALL nor the HELLO regex, so the evidence is lost silently. `handleStderrLine` also receives both fragments, so a split `LISTEN` line breaks port discovery. That parsing problem was already there before this change, but the new code claims to address chunking and does not.

**Fix:** Keep a per-stream carry-over buffer, emit only complete lines, and flush the remainder on `close`:

```ts
let carry = ''
child.stderr?.on('data', (d: Buffer) => {
  const parts = (carry + d.toString()).split('\n'); carry = parts.pop() ?? ''
  for (const line of parts) { /* log + handleStderrLine */ }
})
```

### WR-06: `appLogSegmentFor` drops evidence written after a log rotation

**File:** `meta/bridgeCensus.ts:826-846`, `:1488-1513` (collectEvidence)

**Issue:** The segment is the newest file that contains a HELLO, sliced from the last HELLO to the end of that file. If `gamelib.log` rotates mid-session, the HELLO sits in `gamelib.log.1` and every later CALL is in `gamelib.log`. `gamelib.log` has no HELLO, so it is skipped, and the segment stops at the rotation point. A title that really launched and made identity calls after rotation reads `unverified`.

**Fix:** After choosing the HELLO file, append the text of every newer file (by mtime) to the segment. The newer files cannot contain a later HELLO for this appid, otherwise they would have been chosen.

## Info

### IN-01: The out-buffer guard reuses an error message that says "'out-value'"

**File:** `meta/gen_vtables.ts:2808-2819`
**Issue:** `hasOutValue` now includes `out-buffer`, but the thrown message still says "with an 'out-value' param". The comment at `:2920` ("value / in-string only -- assertDispatchable above refuses out-value/out-buffer") is now false too.
**Fix:** Rename the flag to `hasOutParam`, mention both kinds in the message, and update the `:2920` comment.

### IN-02: `helperTrailingNullArgs` always types the extra native params as `const void *`

**File:** `meta/gen_vtables.ts:3183-3195`; `meta/extractProtonInventory.ts:569-572`
**Issue:** Nothing checks that the native function's missing trailing params are pointers. `helperNativeArgs < params.length` is also ignored silently, which hides a policy and manifest mismatch.
**Fix:** In `applyWirePolicy`, throw when `missing < 0`. Document, or record in the policy, that the trailing params are pointer-class.

### IN-03: The T-52-09 comment is still detached from `sanitize_ver`

**File:** `native/steam-bridge/helper/bridge_helper.c:431-434`
**Issue:** A blank line now separates the comment from the function. The prior IN-01 is only half fixed.
**Fix:** Remove the blank line.

### IN-04: A test insertion split an existing comment block in `helperProcess.test.ts`

**File:** `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts:586-587`
**Issue:** The new WR-03 tests were inserted between the first line of the `// ── Invariant (D-51-01 assumption_delta_decision, Task 2): the singleton` comment and the rest of it. That leaves an orphaned line above the new tests, and the continuation now sits above the wrong test.
**Fix:** Move the new tests above line 586.

### IN-05: The `(size < 0)` capacity guard is tautological for unsigned `sizeParam` types

**File:** `meta/gen_vtables.ts:1069`
**Issue:** For a `uint32` size param, `(x < 0)` is always false and triggers `-Wtype-limits`. Today's `cbMaxTicket` is `int32`, so this is fine for now.
**Fix:** Emit the negative check only when `sizeParam`'s type is signed.

### IN-06: The section span now ignores `SizeOfRawData` when `VirtualSize > SizeOfRawData`

**File:** `src/backend/storeManagers/steam/bridge/managedImports.ts:116-120`, `peSteamDrm.ts:153-157`, `:312-317`
**Issue:** The 53-15 change correctly stops an oversized raw span (Godot `pck`) from shadowing later sections. However, an RVA in the uninitialised tail (`SizeOfRawData <= rva - va < VirtualSize`) still maps to `rawPtr + delta`, which reads the next section's file bytes instead of zeros. This behaviour was already there; the new code does not change it.
**Fix:** In the RVA-to-offset helpers, return null when `rva - va >= sizeOfRawData`.

---

_Reviewed: 2026-10-25T00:09:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
