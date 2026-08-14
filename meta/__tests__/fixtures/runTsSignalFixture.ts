/**
 * Phase 34.9 gap cycle 4, quick task 260814-u2u. Long-lived entry that
 * meta/__tests__/runTsSignals.test.ts spawns through the REAL
 * meta/runTs.cjs wrapper (never a replica). Prints exactly one ready line
 * carrying its own pid and __dirname -- once esbuild bundles this with
 * `--bundle --platform=node`, __dirname resolves at runtime to the
 * wrapper's private `gamelib-runts-*` tmpdir, which is how the test learns
 * the exact directory and the exact child PID by identity, not by a
 * pattern guess. Then stays alive on a heartbeat until a 20s deadline so
 * the test has time to signal it. Installs NO signal handler of its own --
 * the wrapper's forwarding behaviour is what is under test here, not this
 * fixture's.
 */
console.log(`runts-fixture: ready pid=${process.pid} dir=${__dirname}`)

const deadline = Date.now() + 20000
const interval = setInterval(() => {
  if (Date.now() > deadline) {
    clearInterval(interval)
    return
  }
  console.log('runts-fixture: heartbeat')
}, 250)
