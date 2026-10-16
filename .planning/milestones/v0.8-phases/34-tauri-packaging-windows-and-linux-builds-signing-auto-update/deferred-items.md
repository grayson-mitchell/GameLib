# Deferred Items — Phase 34

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(pre-existing issues in files untouched by the current plan are not auto-fixed).

## 34-01: Pre-existing `library.ts` leaked-timer jest crash

**Found during:** Task verification (`pnpm test:ci` full-suite run).

**Symptom:** After the full backend jest suite completes (all suites report PASS/FAIL and their
assertions finish), a leftover `setTimeout` from `pollInstallOnce` fires after test teardown and
throws `TypeError: Cannot read properties of undefined (reading 'map')` at
`src/backend/storeManagers/steam/library.ts:1153` (`readAcfState` → `getSteamLibraries()` resolved
`undefined`, called post-mock-teardown), crashing the Node process with exit code 1.

**Scope:** Confirmed unrelated to this plan — `library.ts` is not in `files_modified` for 34-01,
the crash reproduces identically with or without the four new Wave-0 test files present (verified
by running `src/backend`'s jest project directly), and it already exists as a documented,
previously-known issue (project memory: "known separate library.ts leaked-timer jest exit-1",
first noted 2026-07-19 in the Steam install slow-start outcome entry).

**Action:** Not fixed (out of scope, Rule 1/3 do not apply — this is a pre-existing issue in a
file this plan never touches). No regression introduced by 34-01. Left for a future
plan/debug session that owns `library.ts`'s timer lifecycle.

## 34-REVIEW WR-04: null CSP + withGlobalTauri + broad opener:default (deferred)

**Found during:** `/gsd-code-review 34` (`34-REVIEW.md`, 2026-07-24).

**Symptom:** `src-tauri/tauri.conf.json` sets `security.csp: null`, disabling CSP for the webview,
combined with `withGlobalTauri: true` and an `opener:default` capability grant in
`capabilities/default.json` — any future renderer-side XSS from network-supplied store/game
metadata would have materially higher impact than under a baseline CSP.

**Scope:** Pre-existing since Phase 27 (commit `83dc57a7`), not introduced by Phase 34. It touches
the renderer and needs its own live retest cycle (a real CSP can break webview asset/API loading
in ways only a running app reveals).

**Action:** DEFERRED by explicit user decision (GAP-D-01) when authorizing this gap cycle. Not
folded into 34-08..34-11. Suggested remedy from the review, recorded so it need not be
re-derived: define a real CSP (e.g. `default-src 'self'; img-src 'self' data: https:; connect-src
'self' https:`) tuned to the renderer's actual needs, and reassess whether `opener:default`'s
full command set is needed by renderer JS directly or can be narrowed the way
`shell:allow-execute` was scoped to the sidecar in 34-05.

## 34-REVIEW IN-01: sidecarSeaFsShim.ts system.pem match is looser than necessary (deferred)

**Found during:** the same review.

**Symptom:** `meta/sidecarSeaFsShim.ts:46-48`'s `isSteamSystemPemPath` matches ANY path ending in
`system.pem`, broader than its documented intent (`@doctormckay/steam-crypto`'s bundled Steam
public key). If another bundled module ever read a same-named file at a different path, the shim
would silently substitute the wrong bytes.

**Scope:** Build-time only, inside a controlled/trusted build step — not attacker-reachable input.
Practical risk low (Info severity).

**Action:** DEFERRED by explicit user decision (GAP-D-01). Suggested remedy: tighten to
`path.includes('@doctormckay/steam-crypto') && path.endsWith('system.pem')`, or the exact
resolved path if it proves stable across esbuild bundling.

## Phase 34 close-out: the live tag-push gate is the only remaining step

With CR-01, CR-02, WR-01, WR-02, and WR-03 closed by plans 34-08 through 34-11, the sole
remaining Phase 34 item is 34-07's deferred `checkpoint:human-verify` live `v*` tag-push gate
(REQ-34-04 live proof + REQ-34-09), whose full six-step repro procedure is recorded verbatim in
`34-07-SUMMARY.md`.

This gap cycle UN-BLOCKS that gate: before these fixes the `x86_64-apple-darwin` leg would have
failed or shipped a wrong-arch sidecar (CR-01) and the `windows-latest` leg had no `.ico` (CR-02),
so a live run would have burned a tag on a known-broken matrix.

Do NOT create a duplicate live-gate plan — 34-07 already owns it and is intentionally deferred by
the user.
