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

/** Locates the seeding effect's early-return guard STATEMENT — the `if (...)
 * return` whose condition mentions `enginesFetched` — so the RACE spec can
 * assert the settle flag is consulted IN THAT GUARD, not merely present
 * somewhere in the file.
 *
 * 34.13 review C-12: this used to search line-by-line, which made it a
 * hostage to line length. The guard was 84 columns wide (one of the concrete
 * prettier violations C-12 cited); running `prettier --write` on the file
 * reflowed it across four lines and the gate failed with "guard line not
 * found" — a formatter, not a behaviour change, breaking a behaviour gate.
 * Whitespace is collapsed first so the gate measures the STATEMENT. */
function findSeedingGuardStatement(source: string): string {
  const flattened = source.replace(/\s+/g, ' ')
  const match = flattened.match(/if \([^)]*enginesFetched[^)]*\) return/)
  if (!match) {
    throw new Error(
      'seeding effect guard statement (if (... enginesFetched ...) return) not found'
    )
  }
  return match[0]
}

/**
 * Slices out `handleConfirm`'s body so the C-02 gate below measures THAT
 * handler and not the file's other, correctly-guarded promises (the poll's
 * `.catch`, the persisted-lookup's `.catch`). Bounded by the next top-level
 * `const handleDone`, which immediately follows it.
 */
function sliceHandleConfirm(source: string): string {
  const start = source.indexOf('const handleConfirm')
  const end = source.indexOf('const handleDone', start)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('sliceHandleConfirm: handleConfirm body not locatable')
  }
  return source.slice(start, end)
}

/**
 * 34.13 review C-02, as a THROWING helper driven against known-bad inputs
 * DERIVED FROM THE REAL SOURCE.
 *
 * `steamBottleProvision` is `ipcRenderer.invoke` under Electron and the
 * sidecar transport under Tauri; both REJECT on a backend throw or a dead
 * channel. Unguarded, that leaves `phase === 'provisioning'` forever: the
 * banner reads "Setting up Steam..." with no error and no retry affordance,
 * because "Try again" only exists in the `error` phase. WR-03 fixed the 3s
 * poll's rejection and left this one, which is where the wedge actually
 * lives.
 */
function assertProvisionRejectionIsTerminal(handleConfirmBody: string) {
  if (!handleConfirmBody.includes('steamBottleProvision(')) {
    throw new Error(
      'assertProvisionRejectionIsTerminal: handleConfirm no longer calls steamBottleProvision('
    )
  }
  if (!/\btry\b/.test(handleConfirmBody)) {
    throw new Error(
      'assertProvisionRejectionIsTerminal: the provision await has no try/catch -- a rejected provision pins the wizard in the provisioning phase forever'
    )
  }
  if (!/\bcatch\b/.test(handleConfirmBody)) {
    throw new Error(
      'assertProvisionRejectionIsTerminal: no catch clause -- see above'
    )
  }
  // A catch that does not reach a TERMINAL phase is the same wedge with
  // extra steps.
  const catchBody = handleConfirmBody.slice(handleConfirmBody.indexOf('catch'))
  if (!catchBody.includes("setPhase('error')")) {
    throw new Error(
      "assertProvisionRejectionIsTerminal: the catch clause does not reach setPhase('error') -- the wizard still has no terminal state on a rejected provision"
    )
  }
}

describe('C-02: a rejected steamBottleProvision reaches a terminal phase', () => {
  it('the real handleConfirm satisfies the contract', () => {
    expect(() =>
      assertProvisionRejectionIsTerminal(sliceHandleConfirm(stripped))
    ).not.toThrow()
  })

  it('RED: a known-bad input DERIVED FROM THE REAL SOURCE by removing the try/catch keywords is rejected -- this is the pre-fix shape', () => {
    const body = sliceHandleConfirm(stripped)
    const knownBad = body.replace(/\btry\b/g, '').replace(/\bcatch\b/g, '')
    expect(knownBad).not.toBe(body)
    expect(() => assertProvisionRejectionIsTerminal(knownBad)).toThrow(
      /no try\/catch/
    )
  })

  it("RED: a catch clause that does not reach setPhase('error') is rejected", () => {
    const body = sliceHandleConfirm(stripped)
    // Delete only the setPhase('error') that follows the catch keyword.
    const catchIndex = body.indexOf('catch')
    const knownBad =
      body.slice(0, catchIndex) +
      body.slice(catchIndex).replaceAll("setPhase('error')", '')
    expect(knownBad).not.toBe(body)
    expect(() => assertProvisionRejectionIsTerminal(knownBad)).toThrow(
      /no terminal state/
    )
  })

  it('the JSX attribute does not float the handler promise', () => {
    expect(stripped).toMatch(/onClick=\{\(\) => void handleConfirm\(\)\}/)
  })
})

/** Slices the status-poll effect (the one containing `steamBottleStatus`)
 * out of the flattened source, bounded by its own dependency array, so the
 * C-05 gate measures THAT effect's deps and not another's. */
function slicePollEffect(source: string): string {
  const flattened = source.replace(/\s+/g, ' ')
  const marker = flattened.indexOf('steamBottleStatus')
  if (marker === -1) {
    throw new Error('slicePollEffect: the status poll is gone')
  }
  const start = flattened.lastIndexOf('useEffect(', marker)
  const end = flattened.indexOf('}, [', marker)
  if (start === -1 || end === -1) {
    throw new Error('slicePollEffect: could not bound the poll effect')
  }
  // Include the dependency array itself.
  return flattened.slice(start, flattened.indexOf(']', end) + 1)
}

describe('C-05: the provisioning poll cannot outlive the surface', () => {
  const pollEffect = slicePollEffect(stripped)

  it('the poll effect is keyed on isOpen as well as phase', () => {
    // The component never unmounts (App.tsx mounts it permanently and
    // `isOpen: false` only returns null), and `phase` resets on OPEN, never
    // on close -- so `[phase]` alone left the 3s interval armed for the rest
    // of the app's life after the user clicked "Done".
    expect(pollEffect).toMatch(/\}, \[\s*isOpen,\s*phase\s*\]/)
  })

  it('the poll effect early-returns when the surface is closed', () => {
    expect(pollEffect).toMatch(/if \(\s*!isOpen \|\| phase !== 'provisioning'/)
  })

  it('RED: the pre-fix dependency array DERIVED FROM THE REAL SOURCE fails both obligations', () => {
    const knownBad = slicePollEffect(
      stripped
        .replace(
          "if (!isOpen || phase !== 'provisioning')",
          "if (phase !== 'provisioning')"
        )
        .replace('}, [isOpen, phase])', '}, [phase])')
    )
    expect(knownBad).not.toBe(pollEffect)
    expect(knownBad).not.toMatch(/\}, \[\s*isOpen,\s*phase\s*\]/)
    expect(knownBad).not.toMatch(
      /if \(\s*!isOpen \|\| phase !== 'provisioning'/
    )
  })
})

describe('C-06: the session reset clears the engine-list guard too', () => {
  const sessionReset = (() => {
    const flattened = stripped.replace(/\s+/g, ' ')
    const start = flattened.indexOf("setPhase('consent')")
    const end = flattened.indexOf('}, [isOpen, appName])', start)
    if (start === -1 || end === -1) {
      throw new Error('C-06: session reset effect not locatable')
    }
    return flattened.slice(start, end)
  })()

  it.each([
    'setEnginesFetched(false)',
    'setWineVersionList([])',
    'setWineVersion(undefined)',
    'setPersistedLookupSettled(false)'
  ])(
    'the reset clears "%s" -- session 2 must not seed from session 1 state',
    (setter) => {
      expect(sessionReset).toContain(setter)
    }
  )

  it('RED: dropping the engine-list resets from a copy DERIVED FROM THE REAL SOURCE makes the gate fail', () => {
    const knownBad = sessionReset
      .replace('setEnginesFetched(false)', '')
      .replace('setWineVersionList([])', '')
    expect(knownBad).not.toBe(sessionReset)
    expect(knownBad).not.toContain('setEnginesFetched(false)')
    expect(knownBad).not.toContain('setWineVersionList([])')
  })
})

describe('C-03: the wizard never submits an engine its own D-16 filter rejects', () => {
  const handleConfirm = sliceHandleConfirm(stripped)

  it('the provision payload routes wineVersion through resolveSubmittedBottleEngine', () => {
    expect(handleConfirm).toMatch(
      /wineVersion:\s*resolveSubmittedBottleEngine\(wineVersion\)/
    )
  })

  it('the bare state variable is NOT handed to steamBottleProvision', () => {
    // The pre-fix shape was the shorthand property `wineVersion` on its own
    // line inside the payload literal. `wineVersion,` / `wineVersion }` are
    // the two ways that shorthand can appear; neither may survive.
    expect(handleConfirm).not.toMatch(/wineVersion\s*[,}]/)
  })
})

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

  it('D-15 RACE: the seeding effect does not run before the lookup settles', () => {
    const guard = findSeedingGuardStatement(stripped)
    // The settle-flag identifier must appear IN the guard statement itself —
    // a flag that is set but never consulted in the guard is the vacuous
    // version of this gate.
    expect(guard).toMatch(/persistedLookupSettled/)
  })

  it('RED: the RACE gate rejects a guard DERIVED FROM THE REAL SOURCE with the settle flag removed', () => {
    // Derived from the real source, whitespace-insensitively so a prettier
    // reflow of the guard cannot turn this proof vacuous (the failure mode
    // C-12 produced for the gate above).
    const knownBad = stripped.replace(/\|\|\s*!persistedLookupSettled/, '')
    expect(knownBad).not.toBe(stripped)
    expect(findSeedingGuardStatement(knownBad)).not.toMatch(
      /persistedLookupSettled/
    )
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
