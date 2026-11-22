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
 *       handlers registered through addHandler/addListener). A channel in nativeChannels.json is
 *       owned by the Rust native router (Phase 83), so it is excluded rather than listed.
 *   (e) NATIVE DECLARATIONS: native.ts declares exactly the manifest's channels (Async for
 *       invoke, Sync for send), and no manifest channel is declared in any other domain file.
 *
 * Plain fs reads rooted at __dirname; no backend module is imported or executed.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { defined } from 'backend/testUtils/indexed'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  IPC_DIR,
  KINDS,
  parseDomainFile,
  sharedConstants,
  domainSources,
  nativeChannelNames,
  type DomainPart,
  type Kind
} from 'backend/testUtils/ipcDomainParse'

const SIDECAR_DIR = join(__dirname, '..')

const UMBRELLA: Record<Kind, string> = {
  Sync: 'SyncIPCFunctions',
  Async: 'AsyncIPCFunctions',
  FrontendMessages: 'FrontendMessages'
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
  'FrontendMessages:engineStateChanged': 'engine',
  'FrontendMessages:steamRequestNotice': 'steam',
  'FrontendMessages:steamAdoptionStatusChanged': 'steam',
  'FrontendMessages:gameSettingWriteFailed': 'appShell',
  'FrontendMessages:readOnlyStoresNotice': 'appShell',
  // Phase 82 Plan 06: backend-pushed removal-refusal notice; no *FlowRegistration owns a push.
  'FrontendMessages:removalRefusedNotice': 'appShell',
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

/** Channels registered through ipcMain.handle / ipcMain.on (literal or shared constant). */
function registeredChannels(
  source: string,
  constants: Record<string, string>
): string[] {
  const out: string[] = []
  const re =
    /(?:ipcMain|deps\.ipc)\.(?:handle|on)\(\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*)\s*,)/g
  for (const m of source.matchAll(re)) {
    const ch = m[1] ?? (m[2] === undefined ? undefined : constants[m[2]])
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

/**
 * Declared channels no FlowRegistration registers and no native manifest owns, keyed
 * `<Kind>:<channel>` -> domain file. A manifest-owned channel is owned by Rust, not owner-less.
 */
function ownerlessChannels(
  domains: Record<string, DomainPart[]>,
  registered: ReadonlySet<string>,
  native: ReadonlySet<string>
): Record<string, string> {
  const computed: Record<string, string> = {}
  for (const [domain, parts] of Object.entries(domains)) {
    for (const p of parts) {
      for (const key of p.keys) {
        if (!registered.has(key) && !native.has(key)) {
          computed[`${p.kind}:${key}`] = domain
        }
      }
    }
  }
  return computed
}

/**
 * Floors (D-05). Never lower: a parse miss must turn the census red, not shrink it.
 *
 * Phase 84 Plan 06 (2026-11-21): FILES_FLOOR 22 -> 21. The drop is the deliberate deletion of
 * `loggerFlowRegistration.ts` (a measured file, not a parse miss): its last two invokes moved to
 * the Rust native router, so the module registered nothing and was removed. The scan reads 21
 * `*FlowRegistration.ts` files, the same count as the on-disk listing, so the parse-miss margin is
 * unchanged. The declaration total stays 289 (the two channels moved from `logger.ts` into
 * `native.ts`).
 */
const FILES_FLOOR = 21
const DECLARATIONS_FLOOR = 284

/** Declared channels across every domain part, all kinds. */
function declarationTotal(domains: Record<string, DomainPart[]>): number {
  return Object.values(domains)
    .flat()
    .reduce((n, p) => n + p.keys.length, 0)
}

/**
 * The vacuous-scan guard shared by the real run and the negative cases below, so the negative
 * cases exercise the same code the census does.
 */
function checkCensusNotVacuous(scan: { files: number; total: number }): void {
  assertAtOrAboveFloor('ipcDomainCensus files', scan.files, FILES_FLOOR)
  assertAtOrAboveFloor(
    'ipcDomainCensus declarations',
    scan.total,
    DECLARATIONS_FLOOR
  )
}

describe('ipc per-domain declarations (D-09/D-10/D-11)', () => {
  const constants = sharedConstants()
  const domains = parsedDomains()

  it('(a) every channel a FlowRegistration registers is declared in its paired ipc/<domain>.ts', () => {
    const files = registrationFiles()
    assertAtOrAboveFloor('ipcDomainCensus files', files.length, FILES_FLOOR)
    expect(files.length).toBe(21) // 22 before 84-06 deleted loggerFlowRegistration.ts
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
        undeclaredChannels(
          source,
          defined(domains[domain], 'domain'),
          constants
        ).filter((c) => mustPair.includes(c))
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
    // Phase 72 Plan 09 (2026-11-08): -1 Sync (`removeFolder` deleted from shellFilesSyncArgs, D-09).
    // Phase 68 Plan 06: +1 FrontendMessages (readOnlyStoresNotice); owner-less allowlist 65 -> 66.
    // Phase 74 Plan 11: +1 Async (getSteamUpdateInfo in install.ts).
    // Quick 261122-rgi: +1 Async (getSteamOptInDlc in install.ts).
    // Quick 261116-vt7: -3 (steamGoOfflineRetry, steamGoOfflineCancel, FrontendMessages steamGoOfflineRequired); owner-less allowlist 66 -> 65.
    // Quick 261115-tk8 (6254354b2): -6 (openWeblate, openSupportPage, openDiscordLink, openGithubSponsorsPage,
    // openWikiLink, openReleases).
    // Quick 261117-p38 (481168a3c): +2 (the Launch without Steam channels in ipc/steam.ts).
    // Quick 261117-q1t: -1 (steamLaunchWithoutSteam removed; Play honours a game setting).
    // Phase 47 Plan 08: +1 getItadSteamGids, -1 getStoreSearchStoreMap (net 0).
    // Phase 47 Plan 12: +2 (itad.getKeyStatus, itad.setApiKey).
    // Phase 81 Plan 07: +1 Async (steamLaunchWithoutSteamOnce, the one-shot launch from the refused-restart notice).
    // Phase 81 Plan 08: +1 Async (steamAdoptionStatus, the game page's pending-adoption read).
    // Phase 81 Plan 08 task 2: +2 Async (steamAdoptionRestartNow, steamAdoptionOpenSteam).
    // Phase 81 Plan 09: +1 FrontendMessages (steamAdoptionStatusChanged, the live adoption status push); owner-less allowlist 65 -> 66.
    // Quick 261120-pp4: -2 (the bridge friend-list and invite channels, deleted with the custom invite picker).
    // Phase 82 Plan 06: +1 FrontendMessages (removalRefusedNotice, the guard refusal toast); owner-less allowlist 66 -> 67.
    // Phase 82 Plan 10: -2 TestSync (setGogdlCommandStub, resetGogdlCommandStub, the gogdl e2e stub deleted, D-19); owner-less allowlist 67 -> 65.
    // Phase 82 Plan 15: -2 TestSync (setLegendaryCommandStub, resetLegendaryCommandStub, the legendary e2e stub deleted, D-19); owner-less allowlist 65 -> 63.
    // Phase 82 Plan 15: -2 TestSync (setNileCommandStub, resetNileCommandStub, the nile e2e stub deleted, D-19); owner-less allowlist 63 -> 61.
    // That removed the last TestSync channel, so the TestSync kind left the census.
    // Phase 83 Plan 03 (2026-11-20): getHeroicVersion moved from appShell.ts to native.ts (NativeAsync), net 0.
    // Phase 84 Plan 06 (2026-11-21): getUploadedLogFiles and deleteUploadedLogFile moved from logger.ts (LoggerAsync, deleted) to native.ts (NativeAsync), net 0.
    // Phase 85 Plan 16 (2026-11-22): +1 NativeAsync (sidecar:store-fetch, now a native channel; it had no typed declaration before, only its sidecarInternal zod key, which is the renamed store:ts-fetch).
    // Phase 85 Plan 17 (2026-11-22): +1 NativeSync (storeSet, now a native channel; it had no typed declaration before, only its sidecarInternal zod key, which is the renamed store:ts-set).
    // Phase 85 Plan 17: +3 more (sidecar:store-set-checked NativeAsync, storeDelete and storeNew NativeSync), the same way.
    expect(total).toBe(295)
    // Floor (Phase 67): originally measured - 6. Re-measured at 290 after quick 261115-tk8's deliberate
    // six-channel deletion and quick 261117-p38's two added channels (288 + 2), so the floor moves
    // 290 -> 284 and the parse-miss margin stays the same 6.
    // A parse miss in either declaration form (interface or const-args) turns this red instead of
    // silently shrinking the census.
    checkCensusNotVacuous({ files: registrationFiles().length, total })
    expect(total).toBeGreaterThanOrEqual(DECLARATIONS_FLOOR)
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
    const computed = ownerlessChannels(
      domains,
      registered,
      nativeChannelNames()
    )
    expect(computed).toEqual(NO_REGISTRATION_OWNER)
    expect(Object.keys(NO_REGISTRATION_OWNER)).toHaveLength(61)
  })

  it('(d) near-miss: a manifest-owned channel leaves the computed owner-less set', () => {
    const fakeDomains: Record<string, DomainPart[]> = {
      fake: [
        { kind: 'Async', name: 'FakeAsync', keys: ['nativeOwned', 'orphan'] }
      ]
    }
    const none = ownerlessChannels(fakeDomains, new Set(), new Set())
    expect(none).toEqual({
      'Async:nativeOwned': 'fake',
      'Async:orphan': 'fake'
    })
    const withNative = ownerlessChannels(
      fakeDomains,
      new Set(),
      new Set(['nativeOwned'])
    )
    expect(withNative).toEqual({ 'Async:orphan': 'fake' })
  })

  it('(e) native.ts declares exactly the manifest channels by kind, and no other domain file declares one', () => {
    const manifest = JSON.parse(
      readFileSync(join(IPC_DIR, 'nativeChannels.json'), 'utf-8')
    ) as { channels: Record<string, { kind: 'invoke' | 'send' }> }
    const byKind = (kind: 'invoke' | 'send') =>
      Object.entries(manifest.channels)
        .filter(([, spec]) => spec.kind === kind)
        .map(([name]) => name)
        .sort()
    const declared = (kind: Kind) =>
      (domains['native'] ?? [])
        .filter((p) => p.kind === kind)
        .flatMap((p) => p.keys)
        .sort()
    expect(Object.keys(domains)).toContain('native')
    expect(declared('Async')).toEqual(byKind('invoke'))
    expect(declared('Sync')).toEqual(byKind('send'))
    expect(declared('FrontendMessages')).toEqual([])
    // Non-vacuity: the manifest names at least one channel, so the equalities above bind.
    expect(Object.keys(manifest.channels).length).toBeGreaterThan(0)
    const native = nativeChannelNames()
    const elsewhere = Object.entries(domains)
      .filter(([domain]) => domain !== 'native')
      .flatMap(([domain, parts]) =>
        parts
          .filter((p) => p.kind === 'Async' || p.kind === 'Sync')
          .flatMap((p) => p.keys)
          .filter((k) => native.has(k))
          .map((k) => `${domain}:${k}`)
      )
    expect(elsewhere).toEqual([])
  })

  it('parseDomainFile reads the const-args conversion form', () => {
    const parts = parseDomainFile(
      "export const fooSyncArgs = {\n  bar: z.tuple([]),\n  'baz-q': z.tuple([])\n}\n"
    )
    expect(parts).toEqual([
      { name: 'FooSync', kind: 'Sync', keys: ['bar', 'baz-q'] }
    ])
    const sat = parseDomainFile(
      'export const fooAsyncArgs = {\n  a: z.tuple([])\n} satisfies ArgsMap\n'
    )
    expect(sat).toEqual([{ name: 'FooAsync', kind: 'Async', keys: ['a'] }])
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

  describe('cannot pass vacuously (D-05)', () => {
    it('the real tree clears both floors', () => {
      expect(() =>
        checkCensusNotVacuous({
          files: registrationFiles().length,
          total: declarationTotal(domains)
        })
      ).not.toThrow()
    })

    it('fails on empty input: zero registration files and zero declarations', () => {
      expect(() => checkCensusNotVacuous({ files: 0, total: 0 })).toThrow(
        /ipcDomainCensus files/
      )
      expect(declarationTotal({})).toBe(0)
      expect(() =>
        checkCensusNotVacuous({
          files: FILES_FLOOR,
          total: declarationTotal({})
        })
      ).toThrow(/ipcDomainCensus declarations/)
    })

    it('fails on a single-file scan', () => {
      const [first] = Object.entries(domains)
      expect(first).toBeDefined()
      const one = Object.fromEntries([defined(first, 'first domain')])
      expect(() =>
        checkCensusNotVacuous({ files: 1, total: declarationTotal(one) })
      ).toThrow(/ipcDomainCensus files/)
    })

    it('fails on truncated input: all but the first domain dropped', () => {
      const [first] = Object.entries(domains)
      const truncated = Object.fromEntries([defined(first, 'first domain')])
      expect(() =>
        checkCensusNotVacuous({
          files: FILES_FLOOR,
          total: declarationTotal(truncated)
        })
      ).toThrow(/ipcDomainCensus declarations/)
    })

    it('fails on truncated input: about two thirds of the declarations survive', () => {
      const keep = Math.floor((declarationTotal(domains) * 2) / 3)
      expect(keep).toBeLessThan(DECLARATIONS_FLOOR)
      expect(() =>
        checkCensusNotVacuous({ files: FILES_FLOOR, total: keep })
      ).toThrow(/ipcDomainCensus declarations/)
    })

    it('fails when one declaration short of the floor (the adjacent boundary)', () => {
      expect(() =>
        checkCensusNotVacuous({
          files: FILES_FLOOR,
          total: DECLARATIONS_FLOOR - 1
        })
      ).toThrow(/ipcDomainCensus declarations/)
      expect(() =>
        checkCensusNotVacuous({ files: FILES_FLOOR, total: DECLARATIONS_FLOOR })
      ).not.toThrow()
    })
  })
})
