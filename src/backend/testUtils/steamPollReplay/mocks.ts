/**
 * Steam poll parity harness: the shared mutable "world" and the module-mock factories the test
 * file wires with `jest.mock(path, () => jest.requireActual(<this module>).xxxMock())`.
 *
 * Imports nothing from the code under test (it is loaded from inside jest.mock factories).
 * Every mock is a plain function, never a jest.fn: the repo's jest config sets resetMocks.
 */
import * as fileSize from 'filesize'
import type { StreamRecord, TimelineAcfRecord } from './timeline'

type Platform = 'darwin' | 'win32' | 'linux'

export interface World {
  platform: Platform
  libraries: string[]
  /** `steamappsDir -> record|null`. */
  acf: Map<string, TimelineAcfRecord | null>
  running: number | null
  steamPids: number[] | null
  startTokens: Record<string, string> | null
  helper: { stdout: string; code: number | null }
  lipo: { stdout: string; code: number | null }
  nativeInFlight: boolean
  bridgeFinalized: boolean
  bridgeAllowlisted: boolean
  stream: StreamRecord[]
  bottleDir: string | undefined
  bridgeDir: string | undefined
}

/** Fresh state; the driver calls this at the start of every run. */
export function freshWorld(): World {
  return {
    platform: 'linux',
    libraries: [],
    acf: new Map(),
    running: 0,
    steamPids: [],
    startTokens: {},
    helper: { stdout: '', code: null },
    lipo: { stdout: '', code: 0 },
    nativeInFlight: false,
    bridgeFinalized: false,
    bridgeAllowlisted: false,
    stream: [],
    bottleDir: undefined,
    bridgeDir: undefined
  }
}

export const world: { current: World } = { current: freshWorld() }

const noop = (): void => undefined

export function loggerMock(): Record<string, unknown> {
  return {
    logDebug: noop,
    logInfo: noop,
    logError: noop,
    logWarning: noop,
    LogPrefix: new Proxy({}, { get: (_t, name) => String(name) })
  }
}

export function environmentMock(): Record<string, unknown> {
  return {
    get isMac() {
      return world.current.platform === 'darwin'
    },
    get isWindows() {
      return world.current.platform === 'win32'
    },
    get isLinux() {
      return world.current.platform === 'linux'
    }
  }
}

export function utilsMock(): Record<string, unknown> {
  const getFileSize = fileSize.partial({ base: 2 }) as (arg: unknown) => string
  return {
    getSteamLibraries: () => Promise.resolve([...world.current.libraries]),
    getFileSize
  }
}

export function gracefulFsMock(): Record<string, unknown> {
  return {
    existsSync: () => true,
    readdirSync: () => [],
    readFileSync: () => '',
    statSync: () => ({ isDirectory: () => true })
  }
}

export function dialogMock(): Record<string, unknown> {
  return {
    notify: (_deps: unknown, n: { title: string; body: string }) => {
      const captured = takeLastTranslation()
      world.current.stream.push({
        notify: {
          title: n.title,
          body: n.body,
          ...(captured ?? {})
        }
      })
    }
  }
}

/** The i18next.t call that produced the notification body (captured by the driver's spy). */
export interface CapturedTranslation {
  key: string
  default?: string
  params?: Record<string, unknown>
}
const translations: CapturedTranslation[] = []
export function captureTranslation(c: CapturedTranslation): void {
  translations.push(c)
}
function takeLastTranslation(): CapturedTranslation | undefined {
  return translations.pop()
}
export function clearTranslations(): void {
  translations.length = 0
}

export function storesMock(): Record<string, unknown> {
  return {}
}

export function bottleMock(): Record<string, unknown> {
  return {
    getBottleSteamappsDir: (_paths: unknown, bottleName: string) =>
      bottleName === 'BRIDGE'
        ? world.current.bridgeDir
        : world.current.bottleDir
  }
}

export function bridgeBottleMock(): Record<string, unknown> {
  return {
    createDrmBridgeRunners: () => ({}),
    getBridgeBottleSettings: () => ({ wineCrossoverBottle: 'BRIDGE' }),
    listReadyBridgeBottleNames: () => [],
    resolveBridgeBottleName: () => 'BRIDGE'
  }
}

export function allowlistMock(): Record<string, unknown> {
  return {
    bridgeAllowlist: {
      has: () => world.current.bridgeAllowlisted,
      knownBadReason: () => undefined
    }
  }
}

export function steamClientProcessMock(): Record<string, unknown> {
  return {
    listSteamClientPids: () =>
      Promise.resolve(
        world.current.steamPids === null ? undefined : world.current.steamPids
      ),
    readSteamProcessStartTokens: (_deps: unknown, pids: number[]) => {
      const tokens = world.current.startTokens
      if (tokens === null) return Promise.resolve(undefined)
      const out = new Map<number, string>()
      for (const pid of pids) {
        const token = tokens[String(pid)]
        if (token !== undefined) out.set(pid, token)
      }
      return Promise.resolve(out)
    }
  }
}

/** Relocated effect: the Mac arch probe's verdict becomes a state record (R6). */
export function macArchMock(): Record<string, unknown> {
  return {
    verifyMacArchGroundTruth: (
      _deps: unknown,
      appId: string,
      _installPath: string,
      source: string
    ) => {
      if (source !== 'native' || world.current.platform !== 'darwin') {
        return Promise.resolve()
      }
      const { stdout, code } = world.current.lipo
      const archs = code === 0 ? stdout.trim().split(/\s+/).filter(Boolean) : []
      // Mirrors verdictFromArchs in backend/utils/macArch.
      const verdict =
        archs.length === 0
          ? null
          : archs.includes('x86_64') || archs.includes('arm64')
            ? '64'
            : archs.includes('i386')
              ? '32'
              : null
      if (verdict !== null) {
        world.current.stream.push({
          state: { kind: 'macArchVerdict', appId, verdict }
        })
      }
      return Promise.resolve()
    }
  }
}

/** Relocated effect: markSteamInstallIncomplete becomes the installIncomplete state record (R5). */
export function resumeBreadcrumbsMock(): Record<string, unknown> {
  return {
    markSteamInstallIncomplete: (_deps: unknown, appId: string) => {
      world.current.stream.push({
        state: { kind: 'installIncomplete', appId }
      })
    }
  }
}

/** Relocated effect: invalidateSteamUpdateState becomes the updateDone state record. */
export function updateDetectionMock(): Record<string, unknown> {
  return {
    invalidateSteamUpdateState: (_deps: unknown, appId: string) => {
      world.current.stream.push({
        state: { kind: 'updateDone', appId, completed: false }
      })
    }
  }
}

/** Relocated effect: clearForcedWindowsViaBottle becomes a state record. */
export function gameSessionStateMock(): Record<string, unknown> {
  return {
    clearForcedWindowsViaBottle: (_deps: unknown, appId: string) => {
      world.current.stream.push({
        state: { kind: 'forcedWindowsViaBottleCleared', appId }
      })
    }
  }
}
