/**
 * Census for the per-domain IPC channel declarations (Phase 62 Plan 11, D-09/D-10/D-11).
 *
 * `src/common/types/ipc/<domain>.ts` declares the channels that
 * `src/backend/sidecar/<domain>FlowRegistration.ts` registers, and `ipc/index.ts` assembles the
 * four umbrella types as intersections of the per-domain parts. Nothing but this census stops a
 * channel drifting back into one file, or a part silently falling out of an intersection.
 *
 *   (a) PAIRING: every channel a FlowRegistration registers is declared in its paired domain file.
 *   (b) UNIQUENESS: per umbrella kind, a channel is declared in exactly one domain file.
 *   (c) COMPLETENESS: every part interface is named in the matching index intersection.
 *   (d) OWNER-LESS TRIPWIRE: declared channels with no FlowRegistration owner are an explicit,
 *       dated allowlist (push-only FrontendMessages, window controls, test stubs, main-process
 *       handlers registered through addHandler/addListener).
 *
 * Plain fs reads rooted at __dirname; no backend module is imported or executed.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const SIDECAR_DIR = join(__dirname, '..')
const IPC_DIR = join(__dirname, '..', '..', '..', 'common', 'types', 'ipc')
const TRANSPORT = join(
  __dirname,
  '..',
  '..',
  '..',
  'common',
  'types',
  'sidecarTransport.ts'
)

const KINDS = ['Sync', 'TestSync', 'Async', 'FrontendMessages'] as const
type Kind = (typeof KINDS)[number]
const UMBRELLA: Record<Kind, string> = {
  Sync: 'SyncIPCFunctions',
  TestSync: 'TestSyncIPCFunctions',
  Async: 'AsyncIPCFunctions',
  FrontendMessages: 'FrontendMessages'
}

// TestSync must be tested before Sync: `FooTestSync` also ends in `Sync`.
const DETECT_ORDER: readonly Kind[] = [
  'TestSync',
  'FrontendMessages',
  'Async',
  'Sync'
]

interface DomainPart {
  name: string
  kind: Kind
  keys: string[]
}

// Phase 62 Plan 11 (2026-11-06): initial census, 65 channels. Key is `<Kind>:<channel>`, value is
// the unpaired-or-paired domain file that declares it. A channel appears here exactly when no
// *FlowRegistration.ts registers it. Adding a registration for one of these, or declaring a new
// owner-less channel, must change this table in the same commit.
const NO_REGISTRATION_OWNER: Record<string, string> = {
  'Sync:setZoomFactor': 'window',
  'Sync:createNewWindow': 'testStubs',
  'Sync:clearDMFinished': 'testStubs',
  'Sync:connectivity-changed': 'testStubs',
  'Sync:set-connectivity-online': 'mainProcess',
  'Sync:minimizeWindow': 'window',
  'Sync:maximizeWindow': 'window',
  'Sync:unmaximizeWindow': 'window',
  'Sync:closeWindow': 'window',
  'Sync:setFullscreen': 'window',
  'TestSync:setLegendaryCommandStub': 'testStubs',
  'TestSync:resetLegendaryCommandStub': 'testStubs',
  'TestSync:setGogdlCommandStub': 'testStubs',
  'TestSync:resetGogdlCommandStub': 'testStubs',
  'TestSync:setNileCommandStub': 'testStubs',
  'TestSync:resetNileCommandStub': 'testStubs',
  'Async:updateAll': 'testStubs',
  'Async:isFullscreen': 'window',
  'Async:isFrameless': 'window',
  'Async:isMaximized': 'window',
  'Async:isMinimized': 'window',
  'Async:gamepadAction': 'testStubs',
  'Async:get-connectivity-status': 'mainProcess',
  'Async:getSignInProbeOutcomes': 'mainProcess',
  'FrontendMessages:gameStatusUpdate': 'appShell',
  'FrontendMessages:wineVersionsUpdated': 'wineTools',
  'FrontendMessages:showDialog': 'appShell',
  'FrontendMessages:changedDMQueueInformation': 'downloadQueue',
  'FrontendMessages:maximized': 'appShell',
  'FrontendMessages:unmaximized': 'appShell',
  'FrontendMessages:fullscreen': 'appShell',
  'FrontendMessages:openScreen': 'humble',
  'FrontendMessages:connectivity-changed': 'appShell',
  'FrontendMessages:launchGame': 'appShell',
  'FrontendMessages:installGame': 'appShell',
  'FrontendMessages:recentGamesChanged': 'appShell',
  'FrontendMessages:pushGameToLibrary': 'gog',
  'FrontendMessages:steamBottleSetupRequired': 'steam',
  'FrontendMessages:steamSetupDownloadProgress': 'steam',
  'FrontendMessages:steamBridgeSetupRequired': 'steam',
  'FrontendMessages:steamGoOfflineRequired': 'steam',
  'FrontendMessages:engineStateChanged': 'engine',
  'FrontendMessages:steamRequestNotice': 'steam',
  'FrontendMessages:gameSettingWriteFailed': 'appShell',
  'FrontendMessages:steamBridgeRouteNotice': 'steam',
  'FrontendMessages:steamBottleLaunchWaiting': 'steam',
  'FrontendMessages:steamClientSetupRequired': 'steam',
  'FrontendMessages:steamMetadataSyncing': 'steam',
  'FrontendMessages:steamSyncStatus': 'steam',
  'FrontendMessages:progressOfWinetricks': 'wineTools',
  'FrontendMessages:progressOfWineManager': 'appShell',
  'FrontendMessages:installing-winetricks-component': 'wineTools',
  'FrontendMessages:winetricksQueueChanged': 'wineTools',
  'FrontendMessages:logFileUploaded': 'logger',
  'FrontendMessages:logFileUploadDeleted': 'logger',
  'FrontendMessages:progressUpdate': 'steam',
  'FrontendMessages:metadataChanged': 'appShell',
  'FrontendMessages:crossoverIndexChanged': 'appShell',
  'FrontendMessages:runsForMeChanged': 'appShell',
  'FrontendMessages:humbleAuthState': 'humble',
  'FrontendMessages:signInProbeOutcomes': 'appShell',
  'FrontendMessages:humbleKeysUpdated': 'humble',
  'FrontendMessages:humbleSyncProgress': 'humble',
  'FrontendMessages:humbleSyncStateChanged': 'humble',
  'FrontendMessages:message': 'appShell'
}

/** Interface blocks named `<Domain><Kind>` in a domain file, with their top-level member keys. */
function parseDomainFile(source: string): DomainPart[] {
  const parts: DomainPart[] = []
  const re = /^export interface (\w+) \{\n([\s\S]*?)^\}/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const name = m[1]
    const kind = DETECT_ORDER.find((k) => name.endsWith(k))
    if (!kind) continue
    const keys: string[] = []
    for (const line of m[2].split('\n')) {
      const k = /^ {2}('[^']+'|[A-Za-z_]\w*)\??:/.exec(line)
      if (k) keys.push(k[1].replace(/'/g, ''))
    }
    parts.push({ name, kind, keys })
  }
  return parts
}

function sharedConstants(): Record<string, string> {
  const out: Record<string, string> = {}
  const src = readFileSync(TRANSPORT, 'utf-8')
  for (const m of src.matchAll(/export const ([A-Z][A-Z0-9_]*) = '([^']+)'/g)) {
    out[m[1]] = m[2]
  }
  return out
}

/** Channels registered through ipcMain.handle / ipcMain.on (literal or shared constant). */
function registeredChannels(
  source: string,
  constants: Record<string, string>
): string[] {
  const out: string[] = []
  const re = /ipcMain\.(?:handle|on)\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*)\s*,)/g
  for (const m of source.matchAll(re)) {
    const ch = m[1] ?? constants[m[2]]
    if (ch) out.push(ch)
  }
  return out
}

/** Channels the registration source registers that its domain parts do not declare. */
function undeclaredChannels(
  registrationSource: string,
  parts: DomainPart[],
  constants: Record<string, string>
): string[] {
  const declared = new Set(parts.flatMap((p) => p.keys))
  return registeredChannels(registrationSource, constants).filter(
    (c) => !declared.has(c)
  )
}

/** For each kind, channels declared in more than one domain file. */
function duplicateDeclarations(
  domains: Record<string, DomainPart[]>
): string[] {
  const seen = new Map<string, string[]>()
  for (const [domain, parts] of Object.entries(domains)) {
    for (const p of parts) {
      for (const key of p.keys) {
        const id = `${p.kind}:${key}`
        seen.set(id, [...(seen.get(id) ?? []), domain])
      }
    }
  }
  return [...seen].filter(([, d]) => d.length > 1).map(([id]) => id)
}

function domainSources(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync(IPC_DIR).filter(
    (f) => f.endsWith('.ts') && f !== 'index.ts'
  )) {
    out[f.replace(/\.ts$/, '')] = readFileSync(join(IPC_DIR, f), 'utf-8')
  }
  return out
}

function parsedDomains(): Record<string, DomainPart[]> {
  return Object.fromEntries(
    Object.entries(domainSources()).map(([d, s]) => [d, parseDomainFile(s)])
  )
}

function registrationFiles(): string[] {
  return readdirSync(SIDECAR_DIR)
    .filter((f) => f.endsWith('FlowRegistration.ts'))
    .sort()
}

describe('ipc per-domain declarations (D-09/D-10/D-11)', () => {
  const constants = sharedConstants()
  const domains = parsedDomains()

  it('(a) every channel a FlowRegistration registers is declared in its paired ipc/<domain>.ts', () => {
    const files = registrationFiles()
    expect(files.length).toBe(22)
    for (const f of files) {
      const domain = f.replace('FlowRegistration.ts', '')
      expect(Object.keys(domains)).toContain(domain)
      const source = readFileSync(join(SIDECAR_DIR, f), 'utf-8')
      const registered = registeredChannels(source, constants)
      expect(registered.length).toBeGreaterThan(0)
      // Shared-transport constants that are not part of the typed IPC contract are exempt
      // only when no domain declares them at all.
      const allDeclared = new Set(
        Object.values(domains).flatMap((ps) => ps.flatMap((p) => p.keys))
      )
      const mustPair = registered.filter((c) => allDeclared.has(c))
      expect(
        undeclaredChannels(source, domains[domain], constants).filter((c) =>
          mustPair.includes(c)
        )
      ).toEqual([])
    }
  })

  it('(b) per umbrella kind, a channel is declared in exactly one domain file', () => {
    expect(duplicateDeclarations(domains)).toEqual([])
    // Non-vacuity: the two legitimately dual-kind channels exist and are counted per kind.
    const all = Object.values(domains).flat()
    expect(
      all.filter((p) => p.kind === 'Async' && p.keys.includes('refreshLibrary'))
    ).toHaveLength(1)
    expect(
      all.filter(
        (p) =>
          p.kind === 'FrontendMessages' && p.keys.includes('refreshLibrary')
      )
    ).toHaveLength(1)
  })

  it('(c) every part interface is named in the matching index intersection, and nothing else is', () => {
    const index = readFileSync(join(IPC_DIR, 'index.ts'), 'utf-8')
    let total = 0
    for (const kind of KINDS) {
      const m = new RegExp(
        `export type ${UMBRELLA[kind]} =\\s*([\\s\\S]*?)\\n\\n|export type ${UMBRELLA[kind]} =\\s*([\\s\\S]*)$`
      ).exec(index)
      const named = (m?.[1] ?? m?.[2] ?? '')
        .split('&')
        .map((s) => s.trim())
        .filter(Boolean)
      const actual = Object.values(domains)
        .flat()
        .filter((p) => p.kind === kind)
        .map((p) => p.name)
      expect([...named].sort()).toEqual([...actual].sort())
      total += Object.values(domains)
        .flat()
        .filter((p) => p.kind === kind)
        .reduce((n, p) => n + p.keys.length, 0)
    }
    // 60 Sync + 6 TestSync + 186 Async + 42 FrontendMessages, as at the Plan 11 split; +1 Async (EngineAsync) and +1 FrontendMessages
    // (EngineFrontendMessages) in Phase 61 Plan 13.
    expect(total).toBe(296)
  })

  it('(d) the owner-less channel allowlist equals the computed set', () => {
    const registered = new Set<string>()
    for (const f of registrationFiles()) {
      for (const c of registeredChannels(
        readFileSync(join(SIDECAR_DIR, f), 'utf-8'),
        constants
      )) {
        registered.add(c)
      }
    }
    const computed: Record<string, string> = {}
    for (const [domain, parts] of Object.entries(domains)) {
      for (const p of parts) {
        for (const key of p.keys) {
          if (!registered.has(key)) computed[`${p.kind}:${key}`] = domain
        }
      }
    }
    expect(computed).toEqual(NO_REGISTRATION_OWNER)
    expect(Object.keys(NO_REGISTRATION_OWNER)).toHaveLength(65)
  })

  it('near-miss: (a) fails for a registration of an undeclared channel', () => {
    const parts = parseDomainFile(
      'export interface FooAsync {\n  known: () => void\n}\n'
    )
    const source = "ipcMain.handle('known', f)\nipcMain.handle('rogue', f)"
    expect(undeclaredChannels(source, parts, constants)).toEqual(['rogue'])
    expect(
      undeclaredChannels("ipcMain.on('known', f)", parts, constants)
    ).toEqual([])
  })

  it('near-miss: (b) fails for the same Async key declared in two domain files', () => {
    const a = parseDomainFile(
      "export interface AAsync {\n  'dup-key': () => void\n}\n"
    )
    const b = parseDomainFile(
      "export interface BAsync {\n  'dup-key': () => void\n}\n"
    )
    expect(duplicateDeclarations({ a, b })).toEqual(['Async:dup-key'])
    expect(duplicateDeclarations({ a })).toEqual([])
  })
})
