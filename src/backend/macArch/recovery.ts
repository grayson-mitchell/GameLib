// Non-Steam (GOG, Epic) macOS 32-bit recovery: verdict record, post-install
// check, bounded load-time sweep and the "install the Windows version" accept
// flow. Detection and the dialog live in backend/utils/macArch.
//
// Sidecar exit contract (both halves, see Skill gamelib-conventions):
//  - Half 1: every timer created here is unref()'d, so none can hold the event
//    loop past stdin EOF.
//  - Half 2: in-flight work is bounded. At most ONE probe child is alive at a
//    time, each capped by the 5000 ms execFile timeout (lipo, then file). After
//    stdin EOF the next sweep step is only reachable through an unref'd timer,
//    so the loop drains once the single in-flight probe ends. Nothing is issued
//    synchronously at boot: the sweep starts after an unref'd 20 s timer.
//
// uninstaller, downloadqueue and storeManagers are imported lazily (await
// import()) to avoid a gog/legendary -> recovery -> storeManagers cycle.

import { dirname } from 'path'
import { isMac } from 'backend/constants/environment'
import {
  logInfo,
  logError,
  LogPrefix,
  RunnerToLogPrefixMap
} from 'backend/logger'
import {
  locateMachOCandidates,
  machOArchsOfAsync,
  promptMac32WindowsReinstall,
  verdictFromArchs
} from 'backend/utils/macArch'
import { macArchStore } from './electronStores'
import type { Runner } from 'common/types'

export const MAX_SWEEP_PROBES = 20
const SWEEP_START_DELAY_MS = 20_000

type Verdict = '32' | '64'

const keyOf = (runner: Runner, appName: string) => `${runner}:${appName}`
const prefixOf = (runner: Runner): LogPrefix =>
  RunnerToLogPrefixMap[runner] ?? LogPrefix.Backend

export function recordedMacArch(
  runner: Runner,
  appName: string
): Verdict | undefined {
  try {
    const verdicts = macArchStore.get('verdicts', {})
    return verdicts[keyOf(runner, appName)]?.mac_arch
  } catch {
    return undefined
  }
}

function record(runner: Runner, appName: string, mac_arch: Verdict) {
  const verdicts = { ...macArchStore.get('verdicts', {}) }
  verdicts[keyOf(runner, appName)] = { mac_arch, checkedAt: Date.now() }
  macArchStore.set('verdicts', verdicts)
}

// Serialises dialogs so two '32' verdicts never show concurrently.
let promptChain: Promise<void> = Promise.resolve()
function enqueuePrompt(task: () => Promise<void>) {
  promptChain = promptChain.then(task).catch(() => undefined)
}

interface CheckInstalledMacArchArgs {
  runner: Runner
  appName: string
  installPath: string
  executable?: string
  title?: string
  apply: (appName: string, verdict: Verdict) => void
  prompt: boolean
}

export async function checkInstalledMacArch(
  args: CheckInstalledMacArchArgs
): Promise<void> {
  const { runner, appName, installPath, executable, title, apply, prompt } =
    args
  if (!isMac) return
  const lp = prefixOf(runner)
  try {
    const candidates = locateMachOCandidates(installPath, executable, lp)
    if (!candidates.length) return
    const archs: string[] = []
    for (const c of candidates) archs.push(...(await machOArchsOfAsync(c)))
    const verdict = verdictFromArchs(archs)
    if (!verdict) return
    // Always overwrite: a fresh native install may be a newer build.
    record(runner, appName, verdict)
    apply(appName, verdict)
    logInfo(`macArch: ${appName} native build is ${verdict}-bit`, lp)
    if (verdict === '32' && prompt) {
      enqueuePrompt(() => offerWindowsReinstall(runner, appName, title))
    }
  } catch (e) {
    logError(`macArch: check failed for ${appName}: ${String(e)}`, lp)
  }
}

export async function offerWindowsReinstall(
  runner: Runner,
  appName: string,
  title?: string
): Promise<void> {
  const lp = prefixOf(runner)
  const { libraryManagerMap } = await import('backend/storeManagers')
  const manager = libraryManagerMap[runner]
  // GOG lowercases the platform itself, so one spelling serves every runner.
  const windowsPlatform = 'Windows'

  let info: unknown
  try {
    info = await manager.getInstallInfo(
      appName,
      windowsPlatform as never,
      {} as never
    )
  } catch {
    info = undefined
  }
  if (!info) {
    logInfo(
      `macArch: no Windows build available for ${appName}; native 32-bit install kept`,
      lp
    )
    return
  }

  if (!(await promptMac32WindowsReinstall(runner, title))) {
    logInfo(
      `macArch: user declined; native install kept (32-bit, unrunnable) for ${appName}`,
      lp
    )
    return
  }

  try {
    const before = manager.getGameInfo(appName)
    const oldInstallPath = before?.install?.install_path
    if (!oldInstallPath) {
      logError(`macArch: no install_path for ${appName}; cannot reinstall`, lp)
      return
    }
    const installLanguage = before?.install?.language
    const installDlcs = before?.install?.installedDLCs

    const { uninstallGameCallback } = await import('backend/utils/uninstaller')
    await uninstallGameCallback(
      undefined as never,
      appName,
      runner,
      false,
      false
    )

    const after = manager.getGameInfo(appName, true)
    if (after?.is_installed) {
      logError(
        `macArch: ${appName} is still installed after uninstall; Windows install not queued`,
        lp
      )
      return
    }

    const { addToQueue } = await import('backend/downloadmanager/downloadqueue')
    await addToQueue({
      type: 'install',
      addToQueueTime: Date.now(),
      startTime: 0,
      endTime: 0,
      params: {
        appName,
        runner,
        gameInfo: after?.title ? after : before,
        path: dirname(oldInstallPath),
        platformToInstall: windowsPlatform as never,
        installLanguage,
        installDlcs: installDlcs as never
      }
    })
    logInfo(`macArch: queued Windows install of ${appName}`, lp)
  } catch (e) {
    logError(
      `macArch: Windows reinstall failed for ${appName}: ${String(e)}`,
      lp
    )
  }
}

interface SweepCandidate {
  appName: string
  installPath: string
  executable?: string
  title?: string
}

export function scheduleMacArchSweep(
  runner: Runner,
  getCandidates: () => SweepCandidate[],
  apply: (appName: string, verdict: Verdict) => void
): void {
  if (!isMac) return

  const run = () => {
    let queue: SweepCandidate[]
    try {
      queue = getCandidates()
        .filter((c) => !recordedMacArch(runner, c.appName))
        .slice(0, MAX_SWEEP_PROBES)
    } catch {
      return
    }
    const next = async () => {
      const c = queue.shift()
      if (!c) return
      await checkInstalledMacArch({
        runner,
        appName: c.appName,
        installPath: c.installPath,
        executable: c.executable,
        title: c.title,
        apply,
        prompt: true
      })
      const t = setTimeout(() => void next(), 0)
      t.unref?.()
    }
    void next()
  }

  const start = setTimeout(run, SWEEP_START_DELAY_MS)
  start.unref?.()
}
