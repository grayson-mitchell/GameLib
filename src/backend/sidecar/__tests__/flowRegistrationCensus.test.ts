/**
 * Anti-rot census for the sidecar's `*FlowRegistration.ts` modules
 * (IN-01, `34.2-REVIEW.md` round 1).
 *
 * IN-01 reported ONE stale channel count: `handlers.ts`'s call-site comment
 * for `registerGameDetailsFlows()` said "15 invoke-kind" against 16 invoke + 3
 * send. Counting the whole family found FIVE stale counts out of ten, plus
 * three stale `register*Flows()` docstrings (`appShell` 18 vs 19, `logger`
 * "the single `logError` channel" vs 6, `settings` "the two settings-read
 * invoke handlers" vs 12) and a `handlers.ts` module docstring still claiming
 * the four Phase 34.5 seams "register 0 channels today" when all four are
 * full. The review's own prescribed fix was itself wrong -- it said write
 * "18 (15 invoke + 3 send)", copying a number out of another stale comment
 * instead of counting.
 *
 * The fix was structural, and this file is the half that keeps it fixed:
 *
 *   1. Counts were REMOVED from `handlers.ts` entirely -- from the call-site
 *      comments and from its module docstring. That file had ten copies of a
 *      fact it does not own.
 *   2. Each count now lives in exactly ONE place: its own module's
 *      `register*Flows()` docstring.
 *   3. Gate 2 below re-derives every count from the actual `ipcMain.handle` /
 *      `ipcMain.on` calls and fails if a docstring disagrees.
 *
 * Why a hand-maintained EXPECTED table as well as the docstring check: the
 * docstring check only covers modules that make a claim, and it cannot notice
 * a whole module being added or deleted. The table is a deliberate tripwire --
 * adding or removing any channel anywhere reds Gate 1, which puts the author
 * in front of the docstring at the moment the count changes.
 *
 * Deliberately NOT attempted: parsing a count out of module-level prose. These
 * docstrings are long and cite phase numbers, `main.ts` line numbers, REQ IDs
 * and neighbouring modules' inventories; a generic "find the number near the
 * word channels" parser matches dozens of them per file and would be a noise
 * generator rather than a gate. Gate 2 reads one specific position instead:
 * the token immediately after `Registers` in the `register*Flows()` docstring.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const SIDECAR_DIR = join(__dirname, '..')
const HANDLERS = join(SIDECAR_DIR, 'handlers.ts')

/**
 * Actual registrations per module, counted from source. Update this table in
 * the SAME commit that adds or removes a channel -- and update that module's
 * `register*Flows()` docstring while you are here, which Gate 2 enforces.
 */
const EXPECTED: Record<string, { invoke: number; send: number }> = {
  // Phase 34.6 Plan 05 (2026-08-23): send 11 -> 12 -- frontendReady legitimately
  // registered as a new send-kind channel (D-11), invoke count unchanged.
  //
  // Phase 35 Plan 06 (2026-08-28): invoke 7 -> 8 -- `trayResolveRunner` (D-06),
  // called by the Rust shell rather than the renderer, resolving a bare appName
  // to its Runner for the tray's recent-game launch. This gate did its job: it
  // reddened the moment the channel landed unledgered, which is exactly the
  // tripwire the header describes. Send count unchanged.
  //
  // Quick 260902-wbd (2026-09-02): invoke 8 -> 9 -- `getLoginBackground`, the
  // Manage Accounts background picker's IPC read, backed by `appshell/themes.ts`.
  // Send count unchanged.
  'appShellFlowRegistration.ts': { invoke: 9, send: 12 },
  'clipboardFlowRegistration.ts': { invoke: 1, send: 2 },
  'dialogFlowRegistration.ts': { invoke: 1, send: 0 },
  'downloadQueueFlowRegistration.ts': { invoke: 1, send: 4 },
  'enrichmentFlowRegistration.ts': { invoke: 14, send: 0 },
  // Phase 34.6 Plan 08 (2026-08-24): new module — the 8 EOS overlay channels ported
  // byte-equivalently from eos_overlay/ipc_handler.ts (all invoke-kind, D-09).
  'eosOverlayFlowRegistration.ts': { invoke: 8, send: 0 },
  'gameDetailsFlowRegistration.ts': { invoke: 16, send: 3 },
  'humbleFlowRegistration.ts': { invoke: 15, send: 1 },
  // Phase 40 Plan 03 (D-11): invoke 4 -> 3, send 2 -> 1 -- `humbleGetLoginUserAgent`
  // (invoke-kind) and `humbleLoginNavigated` (send-kind) removed after a four-surface sweep
  // found zero remaining callers (see 40-CHANNEL-RECENSUS.md); their only renderer caller was
  // the deleted `<webview>`-era HumbleLoginSurface.
  'humbleLoginFlowRegistration.ts': { invoke: 3, send: 1 },
  // Phase 34.6 Plan 06 (2026-08-24): invoke 5 -> 7 -- moveInstall/importGame
  // ported byte-equivalently from main.ts (D-02); send count unchanged.
  'installFlowRegistration.ts': { invoke: 7, send: 0 },
  'loggerFlowRegistration.ts': { invoke: 3, send: 3 },
  'oauthLoginFlowRegistration.ts': { invoke: 1, send: 0 },
  'runnerAuthFlowRegistration.ts': { invoke: 10, send: 1 },
  // Phase 34.6 Plan 10 (2026-08-24): invoke 11 -> 14 -- getAchievements/getDefaultSavePath/
  // getPlaytimeFromRunner ported byte-equivalently from main.ts (D-14); send count unchanged.
  'runnerMiscFlowRegistration.ts': { invoke: 14, send: 0 },
  'settingsFlowRegistration.ts': { invoke: 11, send: 1 },
  'shellFilesFlowRegistration.ts': { invoke: 3, send: 17 },
  'shortcutsFlowRegistration.ts': { invoke: 4, send: 3 },
  'steamAuthFlowRegistration.ts': { invoke: 18, send: 1 },
  'steamFlowRegistration.ts': { invoke: 2, send: 0 },
  // Phase 40 Plan 05 (REQ-40-02/REQ-40-05): new module — the 9 in-app store-embed channels
  // (8 lifecycle/navigation invoke arms plus the unimplemented takeNavEvents invoke arm, D-25;
  // 1 send arm for the fire-and-forget bounds courier, D-18/D-29).
  'storeEmbedFlowRegistration.ts': { invoke: 9, send: 1 },
  // Phase 34.6 Plan 07 (2026-08-24): invoke 9 -> 12, send 0 -> 1 -- winetricksAvailable/
  // winetricksInstalled/runWineCommandForGame (invoke) and winetricksInstall (send, D-11)
  // ported byte-equivalently from tools/ipc_handler.ts (A-01/D-02).
  'wineToolsFlowRegistration.ts': { invoke: 12, send: 1 }
}

/**
 * Modules whose `register*Flows()` docstring deliberately states no total.
 * Listing them makes "no claim" a visible choice rather than an omission: a
 * module that quietly loses its count lands here only by someone editing this
 * list. `runnerAuth`/`shortcuts` have no docstring on the register function at
 * all; `steamAuth` describes its channels as named trios and `steamFlows`
 * names both of its handlers outright, so neither states a number.
 */
const NO_COUNT_CLAIM = new Set([
  'dialogFlowRegistration.ts',
  'runnerAuthFlowRegistration.ts',
  'shortcutsFlowRegistration.ts',
  'steamAuthFlowRegistration.ts',
  'steamFlowRegistration.ts',
  // Phase 34.6 Plan 07: this module's own `let registered = false` idempotence guard (added
  // Task 1, mirroring runnerAuth/shortcuts above) now sits between the docstring and
  // `export function registerWineToolsFlows`, breaking the docstring-adjacency
  // `registerFnDocstring()` requires -- same structural cause as the two entries above.
  'wineToolsFlowRegistration.ts'
])

const NUMBER_WORDS: Record<string, number> = {
  single: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20
}

function registrationFiles(): string[] {
  return readdirSync(SIDECAR_DIR)
    .filter((f) => f.endsWith('FlowRegistration.ts'))
    .sort()
}

function read(file: string): string {
  return readFileSync(join(SIDECAR_DIR, file), 'utf-8')
}

function countRegistrations(source: string): { invoke: number; send: number } {
  return {
    invoke: (source.match(/ipcMain\.handle\(\s*'/g) ?? []).length,
    send: (source.match(/ipcMain\.on\(\s*'/g) ?? []).length
  }
}

/**
 * The `/** ... *\/` block immediately preceding `export function register…`,
 * comment markers stripped and whitespace collapsed. Returns null when the
 * register function carries no docstring.
 */
export function registerFnDocstring(source: string): string | null {
  const fn = source.search(/export function register\w+/)
  if (fn === -1) return null
  const head = source.slice(0, fn)
  const blocks = head.match(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*$/)
  if (!blocks) return null
  return blocks[0].replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The count a docstring claims: the first token after `Registers`, skipping
 * the article forms these docstrings use. Returns null when that token is not
 * a number -- which is how "this module states no total" is detected rather
 * than assumed.
 */
export function claimedTotal(docstring: string): number | null {
  const m = docstring.match(
    /Registers\s+(?:the\s+|all\s+|this\s+(?:module|cluster|slice)'s\s+)?(\S+)/
  )
  if (!m) return null
  const token = m[1].toLowerCase().replace(/[^a-z0-9]/g, '')
  if (/^\d+$/.test(token)) return Number(token)
  return NUMBER_WORDS[token] ?? null
}

/**
 * A channel-count claim in prose, e.g. "the 15 send-kind shell/link-opener
 * channels". Used to keep counts OUT of `handlers.ts`.
 */
const COUNT_CLAIM = new RegExp(
  `\\b(?:the|all|these|exactly)\\s+(?:\\d+|${Object.keys(NUMBER_WORDS).join(
    '|'
  )})\\s+[^.\\n]{0,80}?channels?\\b`,
  'i'
)

/** The `//` comment block immediately above each `register*Flows()` call. */
function callSiteComments(): { call: string; comment: string }[] {
  const lines = readFileSync(HANDLERS, 'utf-8').split('\n')
  const out: { call: string; comment: string }[] = []
  lines.forEach((line, i) => {
    if (!/^register\w+\(/.test(line.trim())) return
    const block: string[] = []
    for (let j = i - 1; j >= 0 && lines[j].trimStart().startsWith('//'); j--) {
      block.unshift(lines[j].trimStart().slice(2).trim())
    }
    out.push({ call: line.trim(), comment: block.join(' ') })
  })
  return out
}

describe('sidecar flow-registration census (IN-01)', () => {
  // ── Gate 1: the table is the whole family, and it is accurate ──────────
  it('IN-01 the EXPECTED table names exactly the *FlowRegistration.ts modules on disk', () => {
    expect(registrationFiles()).toEqual(Object.keys(EXPECTED).sort())
  })

  it.each(registrationFiles())(
    'IN-01 %s registers exactly the invoke/send counts the table declares',
    (file) => {
      expect(countRegistrations(read(file))).toEqual(EXPECTED[file])
    }
  )

  // ── Gate 2: each module docstring's total matches its own registrations ─
  it.each(registrationFiles())(
    'IN-01 %s: the register*Flows() docstring total matches the actual registration count',
    (file) => {
      const source = read(file)
      const doc = registerFnDocstring(source)
      const { invoke, send } = countRegistrations(source)

      if (NO_COUNT_CLAIM.has(file)) {
        expect(doc === null || claimedTotal(doc) === null).toBe(true)
        return
      }

      expect(doc).not.toBeNull()
      expect(claimedTotal(doc as string)).toBe(invoke + send)
    }
  )

  // ── Gate 3: handlers.ts states no counts at all ────────────────────────
  //
  // This is the invariant the IN-01 fix established. handlers.ts owns none of
  // these numbers; every copy it carried was a second reader of a fact defined
  // elsewhere, and half of them had drifted. Scope is the comment block above
  // each register*Flows() call -- the file's module docstring is checked by
  // Gate 4 separately.
  it.each(callSiteComments().map((c) => [c.call, c.comment]))(
    'IN-01 handlers.ts call-site comment for %s states no channel count',
    (_call, comment) => {
      expect(comment).not.toMatch(COUNT_CLAIM)
    }
  )

  it('IN-01 handlers.ts module docstring states no channel count', () => {
    const source = readFileSync(HANDLERS, 'utf-8')
    const moduleDoc = source.slice(0, source.indexOf('import Store'))
    expect(moduleDoc).not.toMatch(COUNT_CLAIM)
  })

  // ── Anti-vacuity: prove each parser and matcher actually bites ──────────
  //
  // Every gate above is a "does NOT match" or an equality against a derived
  // number. Each one passes trivially if its parser silently returns nothing,
  // so each parser is exercised against a known-good and a known-bad input
  // here rather than trusted.
  describe('self-test', () => {
    it('the registration counter finds the family (>150 registrations, >=15 modules with at least one)', () => {
      const totals = registrationFiles().map((f) => {
        const { invoke, send } = countRegistrations(read(f))
        return invoke + send
      })
      expect(totals.reduce((a, b) => a + b, 0)).toBeGreaterThan(150)
      expect(totals.filter((t) => t > 0).length).toBeGreaterThanOrEqual(15)
    })

    it('registerFnDocstring returns real prose for a module known to have one, and null when the block is absent', () => {
      const doc = registerFnDocstring(read('gameDetailsFlowRegistration.ts'))
      expect(doc).toContain('Registers')
      expect(
        registerFnDocstring('export function registerNothing(): void {}')
      ).toBeNull()
    })

    it('claimedTotal reads numerals, number-words and "single", and returns null for a non-numeric token', () => {
      expect(claimedTotal('Registers the 19 game-details channels')).toBe(19)
      expect(claimedTotal('Registers the five install-slice handlers')).toBe(5)
      expect(claimedTotal("Registers this module's 20 shell channels")).toBe(20)
      expect(claimedTotal('Registers the single `x` handle channel')).toBe(1)
      expect(claimedTotal('Registers the QR-login trio')).toBeNull()
    })

    it('COUNT_CLAIM matches the exact wording IN-01 found, and does not fire on the wording that replaced it', () => {
      // The five stale claims, verbatim from handlers.ts before the fix.
      expect('the 18 app-shell channels (themes, version/changelog').toMatch(
        COUNT_CLAIM
      )
      expect(
        'the 15 invoke-kind game-details/settings/override channels'
      ).toMatch(COUNT_CLAIM)
      expect('the 15 send-kind shell/link-opener channels').toMatch(COUNT_CLAIM)
      expect('the single `logError` send channel, ported early').toMatch(
        COUNT_CLAIM
      )
      expect('the 10 library/sync + key-state Humble channels').toMatch(
        COUNT_CLAIM
      )

      // The count-free replacements, and a phase reference, must NOT fire --
      // a matcher that flagged "Phase 34.1 Plan 04" would be unusable here.
      expect('the app-shell channels').not.toMatch(COUNT_CLAIM)
      expect('Phase 34.2 Plan 06: the enrichment channels').not.toMatch(
        COUNT_CLAIM
      )
      expect('REQ-34.3-01/-02/-13: the shell/link-opener and').not.toMatch(
        COUNT_CLAIM
      )
    })

    it('callSiteComments finds every register*Flows() call with its comment block attached', () => {
      const sites = callSiteComments()
      expect(sites.length).toBeGreaterThanOrEqual(19)
      expect(sites.filter((s) => s.comment.length > 0).length).toBeGreaterThan(
        8
      )
    })
  })
})
