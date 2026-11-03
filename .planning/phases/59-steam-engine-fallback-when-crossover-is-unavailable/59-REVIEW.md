---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
reviewed: 2026-11-03T00:00:00Z
depth: standard
scope: gap-closure round 4, plans 59-40 to 59-43 (git diff f333a61ba..HEAD per file; committed hunks only, the uncommitted games.ts install() openExternal hunk is excluded)
history: round 2 review (plans 59-24 to 59-30 plus 8e7f931f8 and f63afb1f3, diff 4cf305b51..HEAD) replaced by this round-4 review
files_reviewed: 12
files_reviewed_list:
  - src/backend/connectivityNow.ts
  - src/backend/online_monitor.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/storeManagers/steam/engine/engineDecision.ts
  - src/backend/storeManagers/steam/engine/offlineRefusal.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/__tests__/connectivityNow.test.ts
  - src/backend/__tests__/onlineMonitor.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
  - src/backend/storeManagers/steam/engine/__tests__/offlineRefusal.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 59: Code Review Report (gap-closure round 4)

**Reviewed:** 2026-11-03
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

_History: this file previously held the round-2 review (plans 59-24 to 59-30, diff
4cf305b51..HEAD). It now covers round 4 only._

## Summary

Round 4 adds a fresh connectivity check at Play (`connectivityNow.ts`), a monitor re-probe hook
(`recheckConnectivity`), an offline short-circuit to the stored launch target in
`resolveBridgeLaunchExe`, an `isCrossoverMissing` presence check, and a pure
`offlineLaunchCertainlyBlocked` predicate wired into `selectLaunchEngine`.

The pure parts are sound. `isCrossoverMissing` matches the two `missing` branches of
`preflightCrossover`. The predicate's `crossover-missing` arm matches `decideLaunchEngine`, whose
unhealthy branch always selects `d.pins.current`. The offline launch-target path persists nothing
and still goes through `sanitizeInstalldir`.

The main defect is in `checkConnectivityNow`. It short-circuits to `offline: true` whenever the
monitor is not `'online'`, and that includes `'check-online'`, which means "probing / unknown".
Round 4 creates that state itself through `recheckConnectivity`, and the monitor is also in it
during every boot probe. While it lasts, Play is treated as offline without asking the OS. That
breaks the module's own rule that unknown must never refuse, and it now gates the new
`crossover-missing` arm: the first-run "no CrossOver, download the built-in engine" path.

Sidecar exit contract: the new cap timer is `unref?.()`'d and cleared in `finally`. The re-probe
reuses the existing bounded ping loop (10 s axios timeout, unref'd retry timer). No new boot-time
in-flight work. One INFO note below covers the lookup that the cap abandons.

Known items, located but not re-filed:

- **G26** (no in-flight guard for concurrent same-appId launches): `launchBridgeGame()` at
  `games.ts:4835` has no guard. Round 4 widens the pre-flight window: `launchBridgeGameBody` now
  awaits `checkConnectivityNow` (up to the 1500 ms DNS cap) at `games.ts:4851`, before anything
  marks the launch as started, and `await isCrossoverMissing()` at `games.ts:4296` adds to it when
  offline.
- **G27** and **G28** are not re-filed.

## Critical Issues

### CR-01: `'check-online'` (unknown) is reported as offline, so an online Play can be refused

**File:** `src/backend/connectivityNow.ts:80-81` (consumed at `src/backend/storeManagers/steam/games.ts:4283-4300` and `src/backend/storeManagers/steam/bridge/launchTarget.ts:184`)

**Issue:** `if (!d.isOnline()) result = { offline: true, source: 'monitor' }`.
`isOnline()` is `status === 'online'` (`online_monitor.ts:270`), so `'check-online'` also
counts as offline. The OS is never asked in that state.

`'check-online'` is the monitor saying "I don't know yet":

1. **Boot.** `initOnlineMonitor` sets `'check-online'` and stays there until a probe answers.
   That can take up to 10 s, or much longer on a network where every probe fails, because the
   retry loop backs off by 5 s per attempt.
2. **After a recheck (new this round).** A fresh `no-interface`/`dns-failed` finding calls
   `recheckConnectivity`, which moves the monitor to `'check-online'`. When the network comes
   back, the monitor stays there until the next backoff tick (5, 10, 15 ... s) or the webview's
   DOM `online` event.

Any Play in either window gets `offline: true` without an OS check. The effects:

- **Wrong refusal.** On a machine without CrossOver, override `automatic`, with the current pin
  not installed, `offlineLaunchCertainlyBlocked` returns `crossover-missing`. The user sees
  "GameLib couldn't download its built-in engine (offline)", although the download would
  succeed. This is the first-run fallback path that phase 59 exists for.
- **Stale target.** `resolveBridgeLaunchExe` skips PICS and uses a possibly stale stored target.

This contradicts the header of `connectivityNow.ts` ("Any internal error is also not offline",
"a slow resolver must never cause a refusal") and the predicate's "only ever refuses when
certain" contract.

The test `connectivityNow.test.ts:62-68` encodes this behaviour: `isOnline: false` gives
`offline: true`. No test covers `'check-online'`.

**Fix:** Short-circuit only on a definite `'offline'`. Let `'check-online'` fall through to the
OS check.

```ts
// online_monitor.ts
export const getConnectivityStatus = () => status

// connectivityNow.ts
interface ConnectivityNowDeps {
  status(): ConnectivityStatus
  // ...
}
const st = d.status()
if (st === 'offline') {
  result = { offline: true, source: 'monitor' }
} else if (!hasRoutableAddress(d.networkInterfaces())) {
  if (st === 'online') d.onFreshOffline(reason, 'no-interface')
  result = { offline: true, source: 'no-interface' }
} else {
  /* DNS race as today; recheck only when st === 'online' (recheckConnectivity already no-ops otherwise) */
}
```

Add tests for `'check-online'` with a routable interface and a resolving lookup (expect
`offline: false`, `source: 'dns-ok'`), and for `'check-online'` with no interface (expect
offline).

## Warnings

### WR-01: Any DNS error for a single host is a definite "offline", with app-wide side effects

**File:** `src/backend/connectivityNow.ts:98-105`, `src/backend/online_monitor.ts:277-280`

**Issue:** Every rejection of `dns.promises.lookup('github.com')` is classified as
`offline: true`. That includes transient `EAI_AGAIN`/`ESERVFAIL` and a filtering resolver that
blocks github.com (Pi-hole, NextDNS, corporate DNS).

The monitor checks four hosts on purpose so that one blocked host does not read as offline (see
the comment at `online_monitor.ts:126-132`). This check uses one host and one attempt.

When the user is really online, a false `dns-failed` result has three side effects:

1. **Refusal.** The Play can be refused (CR-01's arms).
2. **Banner.** `recheckConnectivity` flips the app-wide status to `'check-online'`. The renderer
   then shows the OfflineMessage "Retrying..." banner.
3. **Sign-in probe pass.** When the ping answers, the transition back to `'online'` counts as an
   edge in `signInProbe/pass.ts:312-318`, which requests a full sign-in probe pass. This repeats
   on every Play while the condition lasts.

**Fix:**

- Treat only codes that mean "no resolver / no network" as offline, for example
  `ENOTFOUND`/`ECONNREFUSED` when `hasRoutableAddress` is borderline. Report `EAI_AGAIN` and
  `ESERVFAIL` as unknown (`offline: false`).
- Or resolve two of the monitor's hosts and call it offline only if both fail.
- Either way, keep `recheckConnectivity` for the definite case only.

### WR-02: The predicate misses a certain refusal under a CrossOver override when the current pin is installed

**File:** `src/backend/storeManagers/steam/engine/offlineRefusal.ts:38`

**Issue:** `if (input.currentPinInstalled) return { blocked: false }` runs before the arms, for
both overrides. The early return is right for `automatic`: an unhealthy CrossOver falls back to
the current pin, so the launch might start.

Under `override === 'crossover'`, `decideLaunchEngine` never selects the current pin (it returns
`crossover` or `unavailable`). So when the bottle's marker is a non-current pin (for example
`pinned:<previous>`) whose pin is absent, `restoreNeedsAbsentPin` is true. The restore cannot run
offline no matter whether the current pin is installed. The predicate returns `blocked: false`
and the launch waits out the probe and the failed restore download: the UAT 34 symptom G25 set
out to remove. The old G22 condition had the same gap, but the new predicate makes it the
documented contract. `offlineRefusal.test.ts` has no case for override `crossover` with
`currentPinInstalled: true` and `restoreNeedsAbsentPin: true`.

**Fix:**

```ts
if (input.crossoverMissing) {
  return input.override === 'automatic' && !input.currentPinInstalled
    ? { blocked: true, arm: 'crossover-missing' }
    : { blocked: false }
}
if (input.markerKind === 'non-crossover' && input.restoreNeedsAbsentPin) {
  // automatic + current pin installed: an unhealthy CrossOver can still fall back, so not certain
  if (input.override === 'automatic' && input.currentPinInstalled) return { blocked: false }
  return { blocked: true, arm: 'restore-needs-pin' }
}
return { blocked: false }
```

Add the missing table case.

### WR-03: A throwing `onFreshOffline` throws away a definite offline finding

**File:** `src/backend/connectivityNow.ts:83, 100, 115-116`

**Issue:** `d.onFreshOffline(...)` runs inside the outer `try`, before `result` is assigned. In
production it is `recheckConnectivity`, which calls `setStatus`, then `publish()`, then
`sendFrontendMessage`, then `pingSites()`. Unlike the emitter listeners, `publish` is not guarded.
If anything in that chain throws, the outer `catch` overwrites the finding with
`{ offline: false, source: 'error' }`. A side-effect failure turns a confirmed "no interface"
into "online", and the stale-online symptom G25 fixed comes back for that launch.

**Fix:** Assign `result` first, then call the hook in its own try/catch:

```ts
result = { offline: true, source: 'no-interface' }
try { d.onFreshOffline(reason, 'no-interface') } catch (e) { logWarning(...) }
```

## Info

### IN-01: A lookup abandoned at the cap keeps running

**File:** `src/backend/connectivityNow.ts:88-97`

**Issue:** `Promise.race` stops waiting at 1500 ms, but the `getaddrinfo` request stays queued
on the libuv threadpool and holds the event loop alive until the OS resolver gives up. That can
be tens of seconds against an unresponsive resolver. The work is bounded by the OS, happens at
Play rather than boot, and so does not break rule 2 of the sidecar exit contract. A quit right
after a slow-DNS Play can still delay sidecar exit past the cap. Each repeated Play during a
resolver stall also takes one of the 4 default threadpool slots, which the fs work in the same
launch also needs.

**Fix:** Use `dns.Resolver` with `timeout`/`tries` set and `resolver.cancel()` on timeout, or
note the bound in the module header.

### IN-02: Persistent host-only and VPN interfaces defeat the `no-interface` arm

**File:** `src/backend/connectivityNow.ts:54-70`

**Issue:** `hasRoutableAddress` counts every non-internal, non-link-local address. These all
survive Wi-Fi off:

- Tailscale/VPN `utun` addresses (100.64/10)
- `bridge100` (192.168.64.1, Virtualization.framework / Internet Sharing)
- Parallels/VMware `vnic`/`vmnet` addresses
- IPv6 ULA (fd00::/8)

On such Macs the decision falls to DNS, and a VPN's own resolver tends to hang rather than fail,
which gives `dns-timeout` and therefore "online". This is a deliberate fail-open, but it is not
documented and the UAT 34 environment would not show it.

**Fix:** Ignore `utun*`, `bridge*`, `vnic*`, `vmnet*` and fd00::/8, or record the limitation in
the header comment.

### IN-03: `OfflineRefusalInput.override` is typed `string`

**File:** `src/backend/storeManagers/steam/engine/offlineRefusal.ts:21`

**Issue:** The caller passes the result of `parseEngineOverride`. With a bare `string`, a typo
such as `'Automatic'` silently becomes "never refuse".

**Fix:** Type the field as `EngineOverride` from `./engineIds`.

### IN-04: The fresh check also runs for DRM-mode launches, which never read the refusal

**File:** `src/backend/storeManagers/steam/games.ts:4851`

**Issue:** `checkConnectivityNow` runs before the `wantsDrm` branch. On a DRM-mode launch its
result only feeds `resolveBridgeLaunchExe`, but a false `dns-failed` there still triggers
WR-01's app-wide recheck side effects. This is only a note: the stored-target shortcut makes the
check worth keeping for DRM launches too.

**Fix:** Nothing required. If WR-01 is fixed, this goes away.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
