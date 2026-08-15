/**
 * Source-text structural gates for D-15's read half (34.13-09): the guided
 * `SteamBottleSetup` wizard seeding effect must consume the wine engine
 * persisted in `steamBottleConfigStore` (surfaced by 34.13-07's
 * `isSteamBottleEligible` verdict) instead of unconditionally re-deriving
 * one via `resolveSteamBottleEngine`.
 *
 * WHY A SOURCE-TEXT GATE, NOT A RENDER TEST
 *
 * `SteamBottleSetup.tsx` imports `'./SteamBottleSetup.scss'` at L17. Any test
 * that imports the component fails at that line before a single assertion
 * runs — this repo's frontend jest project has no jsdom / react-test-renderer
 * (see jest.config.js's own docstring). So this file never imports the
 * component: it reads the real source with `readFileSync`, strips comments
 * (so this plan's own explanatory prose — which necessarily NAMES
 * `resolveSteamBottleSeedEngine` and `isSteamBottleEligible` — cannot satisfy
 * a naive match), and asserts against the stripped text.
 *
 * What this proves: WIRING SHAPE only — that the right functions are called,
 * in the right guard, with the right identifiers. It does NOT prove the
 * effect actually seeds a real dialog at runtime. That live proof is owed to
 * 34.13-13's blocking manual gate (see `<manual_gate_handoff>` in
 * 34.13-09-PLAN.md) — a green run of this file is not a substitute.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const sourcePath = join(__dirname, '..', 'SteamBottleSetup.tsx')
const stripped = stripSourceComments(readFileSync(sourcePath, 'utf-8'))

/** Whole-identifier match — a longer identifier containing this one as a
 * substring (e.g. `resolveSteamBottleSeedEngine`) must NOT satisfy this. */
const OLD_DERIVATION_CALL = /(?<![A-Za-z])resolveSteamBottleEngine\(/g

/** Locates the seeding effect's early-return guard line — the line
 * containing `enginesFetched` inside a `return` guard — so spec (d) can
 * assert the settle flag is consulted ON THAT LINE, not merely present
 * somewhere in the file. */
function findSeedingGuardLine(source: string): string {
  const line = source
    .split('\n')
    .find((l) => /enginesFetched/.test(l) && /return/.test(l))
  if (!line) {
    throw new Error('seeding effect guard line (enginesFetched + return) not found')
  }
  return line
}

describe('SteamBottleSetup.tsx seeding wiring (D-15 read half, 34.13-09)', () => {
  it('D-15: the seeding effect calls resolveSteamBottleSeedEngine', () => {
    expect(stripped).toMatch(/resolveSteamBottleSeedEngine\(/)
  })

  it('D-15: the old single-source derivation is no longer called directly', () => {
    // Spec (a) above proves the new call exists; this proves the OLD call
    // form is gone. A substring-matching regex would report a false
    // failure here because the new name contains the old one.
    const matches = stripped.match(OLD_DERIVATION_CALL) ?? []
    expect(matches.length).toBe(0)
  })

  it('D-15: the component reads the persisted value over the real IPC channel', () => {
    // \s* tolerates the idiomatic multi-line `window.api\n  .method(...)`
    // chain style this file already uses elsewhere (e.g. getAlternativeWine).
    expect(stripped).toMatch(/window\.api\s*\.isSteamBottleEligible\(/)
  })

  it("D-15 RACE: the seeding effect does not run before the lookup settles", () => {
    const guardLine = findSeedingGuardLine(stripped)
    // The settle-flag identifier must appear ON the guard line itself — a
    // flag that is set but never consulted in the guard is the vacuous
    // version of this gate.
    expect(guardLine).toMatch(/persistedLookupSettled/)
  })

  it('D-15 LIVENESS: every terminal path settles', () => {
    const setterMatches = stripped.match(/setPersistedLookupSettled\(/g) ?? []
    // resolve, catch, and the deliberately-skipped fetch (no appName) — three
    // independent terminal paths, three setter call sites.
    expect(setterMatches.length).toBeGreaterThanOrEqual(3)
    expect(stripped).toMatch(/\.catch\(/)
  })

  it('D-15 does not use useAwaited for the verdict', () => {
    // Guards <verified_findings> item 1: useAwaited's [] dep list fires once
    // at mount, before any session (appName) exists — using it for the
    // verdict would fetch for the wrong game, exactly once, forever.
    const useAwaitedMatches = stripped.match(/useAwaited\(/g) ?? []
    expect(useAwaitedMatches.length).toBe(1)
  })

  it('17-06 regression guard: the bottle name is still the hardcoded dedicated constant', () => {
    expect(stripped).toMatch(/setCrossoverBottle\(DEFAULT_STEAM_BOTTLE_NAME\)/)
    // The verdict's bottleName field must not be CONSUMED here (property
    // access on the fetched verdict) — 34.13-10's read-only display owns
    // that, not this wizard (<verified_findings> item 5). Deliberately a
    // narrower `.bottleName` property-access match rather than a bare
    // `bottleName` substring match: the pre-existing, unrelated
    // `bottleName: crossoverBottle || undefined` object-literal KEY inside
    // `handleConfirm`'s steamBottleProvision payload (L133, predates this
    // plan) would otherwise false-positive this gate on both the RED and
    // GREEN runs — a bare substring match is over-broad for this file.
    expect(stripped).not.toMatch(/\.bottleName\b/)
  })

  it('session reset clears the seeded engine', () => {
    expect(stripped).toMatch(/setWineVersion\(undefined\)/)
  })

  it('D-15: the guided consent surface is NOT bypassed', () => {
    expect(stripped).toMatch(/steamBottleProvision\(/)
    expect(stripped).toMatch(/phase === 'consent'/)
  })
})
