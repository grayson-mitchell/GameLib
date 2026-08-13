/**
 * Source-text structural gate targeting the CALL SITE, not the registry (Task 1, plan 34.5-55).
 *
 * Same shape and same reasoning as `EosDeclineCallSiteGuard.test.ts` (34.5-48) -- see that
 * file's own header for the full defect-class rationale (a registry-shaped test structurally
 * cannot see a call site with no `.catch`). This gate closes the identical
 * dishonest-degradation defect for the SteamGridDB (5 channels) and winetricks (3 channels)
 * clusters, reading FIVE component sources instead of one.
 *
 * THE CENSUS CORRECTION THIS GATE ENCODES (F-34.5-G6-21)
 *
 * The fourth gate's own sweep command greps
 * `window\.api\.(steamgriddb|winetricksAvailable|winetricksInstall|winetricksInstalled)` --
 * but `winetricksAvailable` and `winetricksInstalled` are WIRE CHANNEL names, while the
 * frontend calls the PRELOAD API-METHOD names (`winetricksListAvailable`,
 * `winetricksListInstalled` -- `src/preload/api/wine.ts:15-16` maps one to the other). That
 * command can never match the two real call sites in `Winetricks/index.tsx`, and reports a
 * census of 8. The real census is 10 (`deferred-items.md` item 31). This gate matches on the
 * API-METHOD names for winetricks, not the channel names, so it can actually find its own
 * subject.
 *
 * Every positive assertion uses `toBe`/`toContain`, never a vacuous negative-regex assertion --
 * see `EosDeclineCallSiteGuard.test.ts`'s own header for why (7 such instances shipped in this
 * project before that rule was adopted).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  STEAMGRIDDB_CHANNELS,
  WINETRICKS_API_METHODS
} from 'frontend/helpers/declaredUnavailable'

const FILES = {
  steamGridDbApiKey: join(
    __dirname,
    '..',
    '..',
    'screens/Settings/components/SteamGridDbApiKey.tsx'
  ),
  sideloadDialog: join(
    __dirname,
    '..',
    '..',
    'screens/Library/components/InstallModal/SideloadDialog/index.tsx'
  ),
  editGameDialog: join(
    __dirname,
    '..',
    '..',
    'components/UI/EditGameDialog/index.tsx'
  ),
  steamGridDbPicker: join(
    __dirname,
    '..',
    '..',
    'components/UI/SteamGridDBPicker/index.tsx'
  ),
  winetricks: join(
    __dirname,
    '..',
    '..',
    'components/UI/Winetricks/index.tsx'
  )
} as const

/** Collapses every run of whitespace to a single space -- a whitespace WINDOW, not a line. */
function collapse(source: string): string {
  return source.replace(/\s+/g, ' ')
}

/**
 * The real, post-edit count of deferred SteamGridDB/winetricks call sites per file. Set by
 * direct recount after Tasks 2-3's edits (see the SUMMARY for the exact command and output).
 * The pre-edit and post-edit counts are identical -- this plan only WRAPS existing call sites,
 * adding and removing none, mirroring 34.5-48's own `EXPECTED_EOS_CALL_SITES` precedent.
 */
const EXPECTED_DEFERRED_CALL_SITES: Record<string, number> = {
  [FILES.steamGridDbApiKey]: 2,
  [FILES.sideloadDialog]: 1,
  [FILES.editGameDialog]: 1,
  [FILES.steamGridDbPicker]: 3,
  [FILES.winetricks]: 3
}

const TOTAL_EXPECTED_DEFERRED_CALL_SITES = Object.values(
  EXPECTED_DEFERRED_CALL_SITES
).reduce((sum, n) => sum + n, 0)

/** Same generous 200-collapsed-character window `EosDeclineCallSiteGuard.test.ts` uses. */
const CALL_SITE_WINDOW = 200

/** The one send-kind call site this gate exempts from the wrapper check. */
const SEND_KIND_EXEMPT_NAME = 'winetricksInstall'

/**
 * The literal guard token Task 3 introduces in `Winetricks/index.tsx` to gate the send-kind
 * `winetricksInstall` call behind the invoke-kind probes' own decline. Renaming it requires
 * updating this test in the same commit.
 */
const WINETRICKS_DECLINED_GUARD_TOKEN = 'WINETRICKS_DECLINED_GUARD'

interface CallSite {
  index: number
  name: string
}

function findDeferredCallSites(collapsed: string): CallSite[] {
  const patterns = [
    new RegExp(
      `window\\.api\\.steamgriddb\\.(${STEAMGRIDDB_CHANNELS.join('|')})`,
      'g'
    ),
    new RegExp(`window\\.api\\.(${WINETRICKS_API_METHODS.join('|')})`, 'g')
  ]
  const sites: CallSite[] = []
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(collapsed)) !== null) {
      sites.push({ index: match.index, name: match[1] })
    }
  }
  return sites.sort((a, b) => a.index - b.index)
}

describe('SteamGridDB/winetricks decline call-site gate', () => {
  const collapsedByFile: Record<string, string> = {}
  for (const path of Object.values(FILES)) {
    collapsedByFile[path] = collapse(readFileSync(path, 'utf-8'))
  }

  it('non-vacuity anchor: every file has at least one deferred call site, and the total is exactly 10', () => {
    let total = 0
    for (const [path, expected] of Object.entries(
      EXPECTED_DEFERRED_CALL_SITES
    )) {
      const count = findDeferredCallSites(collapsedByFile[path]).length
      expect(count).toBeGreaterThan(0)
      expect(count).toBe(expected)
      total += count
    }
    expect(total).toBeGreaterThan(0)
    expect(total).toBe(10)
    expect(TOTAL_EXPECTED_DEFERRED_CALL_SITES).toBe(10)
  })

  it('every invoke-kind call site is the call thunk of a callOrDeclare(...) invocation', () => {
    for (const path of Object.keys(EXPECTED_DEFERRED_CALL_SITES)) {
      const collapsed = collapsedByFile[path]
      const sites = findDeferredCallSites(collapsed)
      expect(sites.length).toBeGreaterThan(0)
      for (const site of sites) {
        if (site.name === SEND_KIND_EXEMPT_NAME) continue
        const windowStart = Math.max(0, site.index - CALL_SITE_WINDOW)
        const preceding = collapsed.slice(windowStart, site.index)
        expect(preceding).toContain('callOrDeclare(')
      }
    }
  })

  it('exactly one call site is the explicit, gated send-kind exemption (winetricksInstall)', () => {
    const winetricksCollapsed = collapsedByFile[FILES.winetricks]
    const sites = findDeferredCallSites(winetricksCollapsed)
    const exempt = sites.filter((s) => s.name === SEND_KIND_EXEMPT_NAME)
    expect(exempt.length).toBe(1)
    expect(winetricksCollapsed).toContain(WINETRICKS_DECLINED_GUARD_TOKEN)
  })

  it('each of the five files imports callOrDeclare from frontend/helpers/declaredUnavailable', () => {
    // A single named-import brace, not necessarily solo -- unlike AdvancedSettings.tsx (which
    // imports only `{ callOrDeclare }`), the SteamGridDB files also import the shared
    // feature/channel/deferral constants from the same module in the same import statement, so
    // an exact-literal match on the solo-import form would be a false negative here.
    const importPattern =
      /import \{[^}]*\bcallOrDeclare\b[^}]*\} from 'frontend\/helpers\/declaredUnavailable'/
    for (const path of Object.keys(EXPECTED_DEFERRED_CALL_SITES)) {
      expect(collapsedByFile[path]).toMatch(importPattern)
    }
  })

  describe('self-test (anti-vacuity, RED-proof precursors)', () => {
    it('the non-vacuity anchor fires on a synthetic source with fewer call sites', () => {
      const path = FILES.steamGridDbApiKey
      const source = readFileSync(path, 'utf-8')
      const regressed = collapse(
        source.replace('window.api.steamgriddb.setApiKey', 'window.api.noop')
      )
      const indices = findDeferredCallSites(regressed)
      expect(indices.length).not.toBe(EXPECTED_DEFERRED_CALL_SITES[path])
    })

    it('the call-site invariant fires on a synthetic bare, unwrapped SteamGridDB call', () => {
      const injected = collapse(
        'const x = async () => { await window.api.steamgriddb.hasApiKey() }'
      )
      const indices = findDeferredCallSites(injected)
      expect(indices.length).toBeGreaterThan(0)
      const [site] = indices
      const preceding = injected.slice(
        Math.max(0, site.index - CALL_SITE_WINDOW),
        site.index
      )
      expect(preceding).not.toContain('callOrDeclare(')
    })

    it('the exemption assertion fires when the guard token is absent', () => {
      const withoutGuard = collapsedByFile[FILES.winetricks].replace(
        new RegExp(WINETRICKS_DECLINED_GUARD_TOKEN, 'g'),
        'REMOVED_FOR_SELF_TEST'
      )
      expect(withoutGuard).not.toContain(WINETRICKS_DECLINED_GUARD_TOKEN)
    })
  })
})
