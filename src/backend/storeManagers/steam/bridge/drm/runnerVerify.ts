/**
 * Phase 65 plan 17: the runner marker, the ready-shape builder and the cheap
 * per-launch verify, split out of runnerClone.ts. `MTIME_PINNED_PATHS` lives
 * here with its back-edge user `verifyRunnerClone`. Imports runnerCrossover
 * and runnerEntitlements only; nothing here imports runnerClone.
 */
import { promises as fsp } from 'fs'
import { basename, join } from 'path'

import { defaultRunTool, type RunTool } from 'backend/engine/runTool'
import {
  DLL_REL,
  LOADER_REL,
  MAX_DLL_BYTES,
  MAX_LOADER_BYTES,
  MAX_NTDLL_BYTES,
  MAX_SO_BYTES,
  NTDLL_REL,
  RUNNER_TIMEOUTS,
  SO_REL,
  UNIX_DLL_REL,
  WIN_DLL_REL,
  WINELOADER_REL,
  errText,
  sha256File,
  statRegular,
  type CrossoverAllowed
} from './runnerCrossover'
import {
  DYLD_ENTITLEMENT,
  STOCK_LOADER_ENTITLEMENTS,
  dumpLoaderEntitlements
} from './runnerEntitlements'

// The post-clone mtime check and utimes restore are mandatory whatever cp did:
// a missing wine.inf mtime triggers a prefix update (56-01 contract).
export const MTIME_PINNED_PATHS: readonly string[] = [
  join('share', 'wine', 'wine.inf')
]
export const RUNNER_MARKER_FILE = 'gamelib-runner.json'

/** 56-10's `SteamclientLayerReady` is passed as is. */
export type RunnerComponentInput = {
  componentId: string
  files: {
    lsteamclientDll: string
    lsteamclientSo: string
    detourPayload: string
  }
}

export type RunnerReady = {
  crossoverBuild: string
  runnerDir: string
  cxRoot: string
  wrapperBin: string
  wineloaderBin: string
  wineserverBin: string
  windowsDllDir: string
  unixDllDir: string
  source: 'cache' | 'clone'
  cloneMethod?: 'cp -c' | 'cp -R'
  provenanceRemaining?: boolean
  /** Whether bin/wineloader carries the dyld entitlement (D-05, best effort). */
  wineloaderResigned?: boolean
  pruned: string[]
  pruneSkipped: string[]
}

export type RunnerVerifyExpect = {
  crossover: CrossoverAllowed
  component: RunnerComponentInput
}

export function readyFor(
  cxRoot: string,
  runnerDir: string,
  build: string,
  extra: Partial<RunnerReady>
): RunnerReady {
  return {
    crossoverBuild: build,
    runnerDir,
    cxRoot,
    wrapperBin: join(cxRoot, 'bin', 'wine'),
    wineloaderBin: join(cxRoot, 'bin', 'wineloader'),
    wineserverBin: join(cxRoot, 'bin', 'wineserver'),
    windowsDllDir: join(cxRoot, WIN_DLL_REL),
    unixDllDir: join(cxRoot, UNIX_DLL_REL),
    source: 'clone',
    pruned: [],
    pruneSkipped: [],
    ...extra
  }
}

/**
 * Marker schema 2 (D-05) adds wineloaderSha256 and wineloaderResigned. The bump
 * rebuilds every existing DRM clone once, which takes about 1 s on APFS and
 * refuses with "quit the game and retry" if the title is running.
 */
export type Marker = {
  schema: number
  crossoverBuild: string
  cleanNtdllSha256: string
  patchedNtdllSha256: string
  componentId: string
  lsteamclientDllSha256: string
  lsteamclientSoSha256: string
  loaderSha256: string
  wineloaderSha256: string
  wineloaderResigned: boolean
  cloneMethod?: string
  createdAt?: string
}

export const sec = (ms: number) => Math.floor(ms / 1000)

/**
 * The cheap per-launch verify (RESEARCH F8, D-10). Never throws.
 */
export async function verifyRunnerClone(
  runnerDir: string,
  expect: RunnerVerifyExpect,
  runTool: RunTool = defaultRunTool
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = (reason: string) => ({ ok: false as const, reason })
  try {
    const { crossover, component } = expect
    const cx = join(runnerDir, 'CrossOver')
    for (const d of [runnerDir, cx]) {
      const st = await fsp.lstat(d)
      if (st.isSymbolicLink() || !st.isDirectory()) {
        return bad(`${basename(d)} is not a real directory`)
      }
    }

    let marker: Marker
    try {
      marker = JSON.parse(
        await fsp.readFile(join(runnerDir, RUNNER_MARKER_FILE), 'utf8')
      ) as Marker
    } catch {
      return bad('marker unreadable')
    }
    if (!marker || marker.schema !== 2) return bad('marker schema mismatch')
    if (
      marker.crossoverBuild !== crossover.crossoverBuild ||
      marker.cleanNtdllSha256 !== crossover.cleanNtdllSha256 ||
      marker.patchedNtdllSha256 !== crossover.row.patchedSha256
    ) {
      return bad('marker does not match the installed CrossOver')
    }
    if (marker.componentId !== component.componentId) {
      return bad('marker component id differs')
    }

    const link = await fsp.lstat(join(cx, 'bin'))
    if (
      !link.isSymbolicLink() ||
      (await fsp.readlink(join(cx, 'bin'))) !== 'CrossOver-Hosted Application'
    ) {
      return bad('bin symlink missing or changed')
    }
    for (const b of ['wine', 'wineloader', 'wineserver']) {
      const st = await fsp.stat(join(cx, 'bin', b))
      if (!st.isFile() || (st.mode & 0o111) === 0) {
        return bad(`bin/${b} is not executable`)
      }
    }

    const ntdll = join(cx, NTDLL_REL)
    await statRegular(ntdll, MAX_NTDLL_BYTES)
    if ((await sha256File(ntdll)) !== crossover.row.patchedSha256) {
      return bad('ntdll.dll does not match the patched hash')
    }
    const orig = ntdll + '.gamelib-orig'
    await statRegular(orig, MAX_NTDLL_BYTES)
    if ((await sha256File(orig)) !== crossover.cleanNtdllSha256) {
      return bad('ntdll.dll.gamelib-orig does not match the clean hash')
    }

    const builtins: Array<[string, string, string, number]> = [
      [
        'lsteamclient.dll',
        DLL_REL,
        component.files.lsteamclientDll,
        MAX_DLL_BYTES
      ],
      ['lsteamclient.so', SO_REL, component.files.lsteamclientSo, MAX_SO_BYTES]
    ]
    const markerHash: Record<string, string> = {
      'lsteamclient.dll': marker.lsteamclientDllSha256,
      'lsteamclient.so': marker.lsteamclientSoSha256
    }
    for (const [name, rel, src, max] of builtins) {
      const path = join(cx, rel)
      try {
        await statRegular(path, max)
      } catch {
        return bad(`${name} missing or not a regular file`)
      }
      const h = await sha256File(path)
      if (h !== markerHash[name]) return bad(`${name} differs from marker`)
      let srcHash: string
      try {
        srcHash = await sha256File(src)
      } catch {
        return bad(`${name} component file unreadable`)
      }
      if (h !== srcHash) return bad(`${name} differs from the component`)
    }

    const loader = join(cx, LOADER_REL)
    await statRegular(loader, MAX_LOADER_BYTES)
    if ((await sha256File(loader)) !== marker.loaderSha256) {
      return bad('loader differs from marker')
    }

    const wineloader = join(cx, WINELOADER_REL)
    await statRegular(wineloader, MAX_LOADER_BYTES)
    if ((await sha256File(wineloader)) !== marker.wineloaderSha256) {
      return bad('wineloader differs from marker')
    }

    for (const rel of MTIME_PINNED_PATHS) {
      const a = await fsp.stat(join(cx, rel))
      const b = await fsp.stat(join(crossover.cxRoot, rel))
      if (sec(a.mtimeMs) !== sec(b.mtimeMs)) {
        return bad(`mtime of ${rel} differs from the installed copy`)
      }
    }

    const keys = await dumpLoaderEntitlements(
      runTool,
      loader,
      RUNNER_TIMEOUTS.codesign
    )
    if (!keys) return bad('loader entitlements unreadable')
    for (const k of [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT]) {
      if (!keys.includes(k)) return bad(`loader lacks entitlement ${k}`)
    }
    if (marker.wineloaderResigned === true) {
      const wkeys = await dumpLoaderEntitlements(
        runTool,
        wineloader,
        RUNNER_TIMEOUTS.codesign
      )
      if (!wkeys) return bad('wineloader entitlements unreadable')
      for (const k of [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT]) {
        if (!wkeys.includes(k)) return bad(`wineloader lacks entitlement ${k}`)
      }
    }
    return { ok: true }
  } catch (e) {
    return bad(errText(e))
  }
}
