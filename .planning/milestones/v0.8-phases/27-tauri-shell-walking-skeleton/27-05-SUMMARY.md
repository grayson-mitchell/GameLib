---
phase: 27-tauri-shell-walking-skeleton
plan: 05
subsystem: infra
tags: [tauri, sidecar, renderer, seam, checkpoint, human-verify, blank-screen]

# Dependency graph
requires:
  - phase: 27-tauri-shell-walking-skeleton (27-04)
    provides: "the two wired E2E flows (refreshLibrary read + launch action) against the real store-manager code"
provides:
  - "SEAM.md — the ported/stubbed/deferred boundary map + incremental-port checklist, now including the two load-bearing invariants the live run exposed"
  - "A rendering Tauri walking skeleton on real macOS (gate step 1 PASS)"
  - "UNPORTED_CHANNEL_MARKER contract (common/types/sidecarTransport.ts) — unported channels reject honestly but non-fatally"
affects: ["any future phase extending the Tauri seam", "whoever ports the safeStorage keyring (must read SEAM.md § safeStorage write-direction trap first)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope `window.api` consumers import `preload/tauriAttach` DIRECTLY rather than relying on the renderer entry's import order — Rollup's chunking reorders module evaluation across chunk boundaries, so only a real ES dependency edge guarantees ordering"
    - "Transport-level error classification (UNPORTED_CHANNEL_MARKER) instead of soft-resolving unimplemented channels — rejection semantics stay truthful, only the *reason* is tagged, so a walking skeleton with ~217 deferred endpoints stays usable without lying about what works"

key-files:
  created: []
  modified:
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
    - src/frontend/helpers/index.ts
    - src/frontend/helpers/electronStores.ts
    - src/frontend/bootErrorSurface.ts
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts

key-decisions:
  - "Gate steps 2 (sidecar-populated library) and 3 (steam:// launch) recorded as BLOCKED — out of scope, not defects. The safeStorage passthrough stub cannot decrypt a real Electron/Keychain-written refresh token, so the sidecar cannot authenticate; step 3 is downstream (empty library = no game to launch). User decision 2026-07-21: accept blocked and close, rather than expand scope into the keyring port."
  - "The one-line 'honest stub' stopgap (isEncryptionAvailable: () => false) was deliberately NOT applied — the keyring port is the real fix and SEAM.md is now the record. Documented rather than half-fixed."
  - "bootErrorSurface duplicates UNPORTED_CHANNEL_MARKER as a string literal instead of importing it: its zero-import property is what guarantees its handlers register before the errors they exist to catch, and this plan's own first bug proved how fragile import-order assumptions are under chunking."

requirements-completed: [REQ-27-06]
requirements-partial: [REQ-27-04, REQ-27-05]

# Metrics
duration: ~90min
completed: 2026-07-21
---

# Phase 27 Plan 05: Live macOS Verification + Seam Boundary Summary

Took the assembled walking skeleton from a silent blank window to a rendering native Tauri app on real macOS, by finding two genuine defects that every automated test had passed straight through — a Rollup chunk-ordering inversion that meant `window.api` was never attached, and an error surface that let a documented seam gap hijack the whole page. Gate steps 1 and 4 PASS; steps 2 and 3 are BLOCKED on the deliberately-deferred keyring, with the boundary (and a latent session-corruption trap) now documented in SEAM.md.

## Performance

- **Duration:** ~90 min (across the checkpoint's live-run cycles)
- **Completed:** 2026-07-21
- **Tasks:** 2 (1 auto, 1 blocking human-verify checkpoint)
- **Files modified:** 7

## Gate Results (Task 2 — human-verified on the developer's Apple-Silicon Mac)

| # | Step | Requirement | Verdict |
|---|------|-------------|---------|
| 1 | Native Tauri window renders the real GameLib UI | REQ-27-01 | **PASS** (after `9abffa1b` + `88239d65`) |
| 2 | Steam library populated by the live sidecar | REQ-27-04 | **BLOCKED** — deferred keyring (see below) |
| 3 | Real `steam://` handoff on Launch | REQ-27-05 | **BLOCKED** — downstream of step 2 (empty library, no game to click) |
| 4 | `npm start` Electron build still works | REQ-27-06 | **PASS** — additive/reversible invariant holds |

**Steps 2/3 blocked reason.** `pathShim` correctly resolves `userData` to the same folder Electron uses, so the sidecar reads the real config — but the existing Steam refresh token was encrypted by real Electron `safeStorage` (Keychain) and tagged `TOKEN_PREFIX`. The sidecar's stub `safeStorage` reports `isEncryptionAvailable() → true` (untrue) and "decrypts" via `buf.toString('utf-8')`, so `steam/user.ts`'s `decryptToken()` base64-decodes real ciphertext into garbage and authentication fails. Signing in fresh is separately impossible: the login channels are unported (27-04 wired only `refreshLibrary`, `launch`, and the store snapshot). This is SEAM.md § Stubbed's own deferred item (T-27-05, spike 011 already proved the real `keyring` crate path), not a defect in this plan's work. REQ-27-04/05 remain proven at the integration level by 27-04's `skeletonFlows.test.ts`; only the live confirmation is deferred.

## Accomplishments

- **`SEAM.md` (Task 1)** — the ported/stubbed/deferred boundary with the four wired channels named, the ~217-endpoint backlog ranked by spike 009's 16-API touch counts, and a 5-step incremental-port checklist. Extended after the live run with a "Load-Bearing Invariants" section and the corrected `safeStorage` entry.
- **Blank screen fixed (gate step 1)** — `window.api` attachment converted from an ordering convention into a real ES dependency edge.
- **Skeleton made usable despite ~217 unported endpoints** — unported-channel rejections are now classified rather than fatal.
- **Latent session-corruption trap documented** — see Issues Encountered; it cannot fire today but is a live trap for the next porter.

## Task Commits

1. **Task 1: Author the seam-boundary document** - `820207f6` (docs)
2. **Task 2 (live-run fixes):** `58da2685`, `e5215856`, `1597f048` (earlier attempts), then `9abffa1b` (attach ordering — the actual root cause), `88239d65` (unported-channel classification), `1a2397ec` (SEAM.md findings)

## Files Created/Modified

- `.planning/phases/.../SEAM.md` - boundary map; + load-bearing invariants, corrected safeStorage entry
- `src/frontend/helpers/index.ts` - imports `preload/tauriAttach` directly (module-scope `window.api.readConfig` consumer)
- `src/frontend/helpers/electronStores.ts` - same, for module-scope `window.api.storeNew` constructor calls
- `src/frontend/bootErrorSurface.ts` - skips marker-tagged seam gaps; never clobbers an already-mounted app
- `src/common/types/sidecarTransport.ts` - adds `UNPORTED_CHANNEL_MARKER`
- `src/backend/sidecar/sidecarRpc.ts` - tags handler-missing responses with it
- `src/backend/sidecar/__tests__/bootstrap.test.ts` - regression test for the tagged rejection

## Decisions Made

- Steps 2/3 accepted as BLOCKED rather than expanding scope into the keyring port (user decision, 2026-07-21). The alternative considered and declined was porting Electron's macOS `safeStorage` scheme into the sidecar (Keychain key via `security find-generic-password`, AES-128-CBC) — real work, belongs in its own slice.
- The "honest stub" one-liner was not applied, to avoid a half-fix that would mask the deferred item; SEAM.md carries the record instead.
- `bootErrorSurface` keeps its zero-import property at the cost of a duplicated string literal.

## Deviations from Plan

**1. [Rule 3 - Blocking] `window.api` never attached in the built bundle — silent blank window**
- **Found during:** Task 2, live run (step 1 failed with a blank page; devtools showed `TypeError: undefined is not an object (evaluating 'window.api.readConfig')` as the *first* console entry, with no `[GameLib] tauriAttach evaluating` line above it)
- **Issue:** `preload/tauriAttach.ts` must assign `window.api` before any module reading it at module scope (`frontend/helpers/index.ts`'s `const readFile = window.api.readConfig`; `electronStores.ts`'s `storeNew` constructor calls). Declaring it the first import of `index.tsx` governs MODULE order, but Rollup's CHUNK order is what executes: it inlined `tauriAttach` into the entry chunk while `helpers/index.ts` landed in a shared chunk the entry chunk imports — and an imported chunk evaluates fully before the importing chunk's own module bodies. The attach ran second. The resulting throw happened inside the module graph and surfaced as a rejected dynamic import, which `bootErrorSurface` cannot catch, so there was no on-page diagnostic either. The three earlier fix commits (`58da2685`, `e5215856`, `1597f048`) tuned `isTauri()` detection, which was never the problem — the module simply never ran.
- **Fix:** both module-scope consumers now `import '../../preload/tauriAttach'` themselves. Module↔dependency evaluation order is spec-fixed regardless of chunking.
- **Verification:** emitted bundle inspected — attach marker at offset 25913, first `.api.readConfig` access at 26293 (attach first). `tsc` clean; live run renders the real UI.
- **Committed in:** `9abffa1b`

**2. [Rule 3 - Blocking] A documented seam gap hijacked the entire page**
- **Found during:** Task 2, live run (after fix 1, the page showed `GameLib renderer bootstrap error (unhandledrejection): No handler registered for channel 'getUploadedLogFiles'`)
- **Issue:** much of the frontend invokes IPC at module scope with an uncaught `.then()` (here `frontend/state/UploadedLogFiles.ts:9`). Under Electron those can never reject — every handler exists. Against the skeleton sidecar every unported channel rejects at boot, and `bootErrorSurface` painted the first one over the whole page. Since ~217 endpoints are deliberately unported, this made the skeleton unusable until the entire port was finished — defeating its purpose. Per-channel patching would have been the same trap.
- **Fix:** `sidecarRpc` tags handler-missing responses with `UNPORTED_CHANNEL_MARKER`; `bootErrorSurface` warns and continues for those, and never clobbers an already-mounted app. Rejection semantics unchanged (`ok: false`, promise still rejects) — only the reason is classified.
- **Verification:** regression test added (unported invoke rejects AND carries the tag); suites 4/4, tests 15/15 (was 14).
- **Committed in:** `88239d65`

**3. [Scope] Files modified beyond the plan's declared `files_modified`**
- The plan declared only `SEAM.md`. Both blocking fixes above necessarily touched renderer and sidecar source. Consistent with the three pre-existing `fix(27-05)` commits, and with 27-02/27-03/27-04's own precedent of fixing "worked on paper, would have broken for real" gaps found at the checkpoint. No feature scope was added.

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking) + 1 scope note
**Impact on plan:** the plan's own must-have — "a native Tauri window rendering the real GameLib UI" — was false before these fixes and true after. Neither is a workaround; both replace an assumption that does not survive a real build with a mechanism that does.

## Issues Encountered

- **Latent session-corruption trap (documented, not triggered).** The sidecar and Electron share one store by design. Under the current `safeStorage` stub, a future login channel's `encryptToken()` would write `TOKEN_PREFIX` + **plaintext**; Electron would then attempt a Keychain decrypt of plaintext, fail, and silently sign the user out of the real app. It cannot fire today (no login channel is registered), but the keyring must be ported BEFORE any token-writing channel is wired. Recorded prominently in SEAM.md § Stubbed.
- Three commits were spent on `isTauri()` detection before the live evidence (absence of the attach module's own first console line) identified chunk ordering as the real cause. The proof-of-execution marker added in an earlier attempt is what ultimately made the diagnosis unambiguous — worth keeping.

## Known Stubs

- `safeStorage` passthrough — now known to block Steam sign-in in the read direction, not merely "unexercised". Highest-value next port (SEAM.md § Deferred, priority 5 in the ranked table but priority 1 in practice for making the skeleton real).

## User Setup Required

None.
