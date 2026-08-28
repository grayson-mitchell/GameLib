/**
 * The SINGLE dev-vs-packaged derivation for the sidecar process.
 *
 * Extracted here by Phase 35 plan 04 (D-14/D-19 half (b)) out of
 * `humbleFlowRegistration.ts`, where it had lived since Phase 34.4 plan 05.
 * It was moved rather than copied so that all THREE of its consumers —
 * `humbleFlowRegistration.ts`'s `humbleRunValidation` gate, `devSecretVault.ts`'s
 * fail-closed guardrail (c), and `electronStub.ts`'s `app.isPackaged` getter —
 * are callers of ONE function and never independent derivations of the same
 * fact. Two derivations that can drift apart is a latent bypass of a
 * fail-closed security guard (T-35-11), not untidiness: the moment
 * `app.isPackaged` answers "not packaged" while `isPackagedSidecar()` answers
 * "packaged", one of the two answers is unlocking something.
 *
 * `humbleFlowRegistration.ts` re-exports this symbol rather than keeping a
 * copy, so any caller the extraction's grep did not find still resolves.
 *
 * REJECTED ALTERNATIVE — a build-time stamped constant (e.g. a `define` or a
 * generated `const IS_PACKAGED = true`). It is faster and statically
 * analysable, and it FAILS OPEN: any build path that forgets to stamp it
 * reports "not packaged", which unlocks `devSecretVault.ts`'s plaintext dev
 * vault inside a shipped binary (T-35-12). The runtime `node:sea` probe below
 * fails CLOSED instead — its `catch` returns `true`. Do not "optimise" this
 * into a constant.
 *
 * Worker-thread safety was MEASURED, not assumed, before `app.isPackaged` was
 * added as the third caller: `35-PREFLIGHT.md` OQ-1 records `main=false
 * worker=false` in a dev run and `main=true worker=true` in the real SEA
 * binary — disposition `AGREES`. `isSea()` does not depend on which thread
 * asks (T-35-13).
 */

/**
 * Whether this sidecar process is a packaged Node Single Executable
 * Application (SEA), as opposed to the plain dev script run under `node`
 * (Phase 34.4 Plan 05, REQ-34.4-08).
 *
 * Resolves the `humbleRunValidation` dev-vs-packaged divergence that reusing
 * Electron's negated `app` "already packaged" flag guard verbatim cannot:
 * `electronStub`'s `app` shim (see `./electronStub.ts`) hardcoded that same
 * flag to `false` always until Phase 35 plan 04, so that guard would always
 * pass and register this dev-only trigger in every Tauri build. `main.rs`
 * confirms there is no env var or CLI flag distinguishing the two spawn paths
 * (`use_dev_sidecar()` L737-739 reduces to `cfg!(debug_assertions)`; neither
 * `spawn_sidecar_dev()` L745-767 nor `spawn_sidecar_packaged()` L775-800 calls
 * `.env(...)`) — so this cannot be resolved through a spawn-time environment
 * signal without a Rust change.
 *
 * The genuine Node-only signal used instead: the packaged sidecar is built
 * by `package.json`'s `build:sidecar-sea` script as a Node SEA binary, while
 * the dev sidecar is `build:sidecar`'s plain `build/main/sidecar.js` run
 * under `node`. `require('node:sea').isSea()` distinguishes them with zero
 * Rust change and zero new dependency — `node:sea` is a Node builtin;
 * esbuild's `--packages=external` leaves it as a plain builtin require (this
 * is NOT the alias/relative `sync-require-alias-unresolved-in-build`
 * hazard). Empirically verified at plan/execution time on this machine's
 * Node (v26.2.0): `typeof require('node:sea').isSea === 'function'`, and it
 * returns `false` under the dev sidecar entry (`node build/main/sidecar.js`)
 * — see 34.4-05-SUMMARY.md for the recorded check.
 *
 * Guarded: an older or unavailable Node runtime must not throw at
 * registration time. On any failure to determine, choose the SAFE default —
 * treat the build as packaged (i.e. do NOT register the dev-only channel) —
 * and log the fallback once, mirroring `electronStub.ts`'s own "fails loudly
 * with a clear log line" house style (D-09/D-06).
 *
 * Exported (34.5 gap cycle 4 plan 36) so `devSecretVault.ts`'s production-refusal guardrail can
 * REUSE this exact fail-closed detector rather than re-deriving a second copy — see that
 * module's own header for why a second copy is the exact hazard this avoids.
 *
 * The warning text below still names `humbleFlowRegistration` and
 * `humbleRunValidation`. That is deliberate and NOT a stale reference: the
 * body was moved byte-for-byte, and `humbleFlows.test.ts`'s fallback-logging
 * assertion pins the `node:sea unavailable` substring. Rewording it is a
 * behaviour change to a log a test reads, so it was left alone.
 */
export function isPackagedSidecar(): boolean {
  try {
    // node:sea is a Node builtin; a guarded runtime require (not a relative/alias
    // path) is the deliberate mechanism here, not an oversight. See the
    // docstring above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeSea = require('node:sea') as { isSea: () => boolean }
    return nodeSea.isSea()
  } catch (err) {
    console.warn(
      '[humbleFlowRegistration] node:sea unavailable -- defaulting humbleRunValidation to PACKAGED (dev-only channel NOT registered):',
      err
    )
    return true
  }
}
