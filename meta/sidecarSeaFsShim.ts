/**
 * Phase 34 Plan 02 (D-06) -- Rule-1 fix, found by direct empirical test.
 *
 * `@doctormckay/steam-crypto` (a transitive `steam-user` dependency) reads
 * its bundled Steam "system" RSA public key with a runtime-computed path:
 * `require('fs').readFileSync(__dirname + '/system.pem')`
 * (node_modules/@doctormckay/steam-crypto/index.js, line 3, executed
 * unconditionally at module scope). Because the path is computed at
 * runtime (not a static `require('./system.pem')`), esbuild's bundler
 * cannot see it as an asset reference and cannot inline it -- fully
 * bundling this dependency for the SEA build (Rule-1 fix for
 * ERR_UNKNOWN_BUILTIN_MODULE, see buildSidecarSea.ts's file header)
 * otherwise crashes at startup with `ENOENT: system.pem` (there is no
 * real node_modules directory inside a compiled SEA executable).
 *
 * Fix: monkeypatch `fs.readFileSync` (injected via esbuild's `--inject`,
 * so this file's top-level code runs before any other bundled module) to
 * special-case a `system.pem`-suffixed path and return the certificate's
 * PUBLIC, well-known bytes directly -- Valve's Steam "system" public key
 * is a fixed, publicly-documented constant of the Steam protocol, safe to
 * inline verbatim (not a secret). Every other `readFileSync` call is
 * passed through to the real implementation, completely unmodified.
 */

// `require`, not `import * as`, deliberately -- CJS's `require('node:fs')`
// returns a mutable, singleton object reference shared by every other
// bundled module's own `require('node:fs')`/`require('fs')` call, so
// patching a property here is visible everywhere. An ESM
// `import * as fsModule from 'node:fs'` binding is read-only and cannot be
// reassigned (esbuild rejects `Imports are immutable in JavaScript`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsModule = require('node:fs') as typeof import('node:fs')

// Verbatim contents of node_modules/@doctormckay/steam-crypto/system.pem
// (Valve's public "system" RSA key -- part of the public Steam protocol).
const STEAM_SYSTEM_PEM = Buffer.from(
  '-----BEGIN PUBLIC KEY-----\r\n' +
    'MIGdMA0GCSqGSIb3DQEBAQUAA4GLADCBhwKBgQDf7BrWLBBmLBc1OhSwfFkRf53T\r\n' +
    '2Ct64+AVzRkeRuh7h3SiGEYxqQMUeYKO6UWiSRKpI2hzic9pobFhRr3Bvr/WARvY\r\n' +
    'gdTckPv+T1JzZsuVcNfFjrocejN1oWI0Rrtgt4Bo+hOneoo3S57G9F1fOpn5nsQ6\r\n' +
    '6WOiu4gZKODnFMBCiQIBEQ==\r\n' +
    '-----END PUBLIC KEY-----\r\n',
  'utf-8'
)

function isSteamSystemPemPath(path: unknown): boolean {
  return typeof path === 'string' && path.endsWith('system.pem')
}

const originalReadFileSync = fsModule.readFileSync

// @ts-expect-error -- narrowing an overloaded built-in signature is not
// worth reproducing here; behavior (not types) is what matters for this
// runtime patch, and the passthrough delegates untouched to the real
// implementation for every non-system.pem call.
fsModule.readFileSync = function patchedReadFileSync(
  path: unknown,
  ...rest: unknown[]
) {
  if (isSteamSystemPemPath(path)) {
    return STEAM_SYSTEM_PEM
  }
  // eslint-disable-next-line prefer-spread -- passthrough of an arbitrary,
  // untyped overloaded signature
  return originalReadFileSync.apply(fsModule, [path, ...rest])
}
