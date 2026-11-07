import { hasCapability } from 'common/storeCapabilities'
import type { InstallPlatform, Runner } from 'common/types'

// Phase 61 D-17: pure, stylesheet-free gating for the install-time Engine
// choice. Kept apart from the React components for the reason given at the top
// of engineFilter.ts (the jest config has no stylesheet transform).

/**
 * True when a non-Steam Windows install on macOS picks an engine instead of a
 * Wine build and a bottle. Steam (the bottle-runtime store) keeps its dialog.
 */
export function usesEngineChoiceForInstall(args: {
  platform: string | undefined
  runner: Runner | undefined
  platformToInstall: InstallPlatform | undefined
}): boolean {
  const { platform, runner, platformToInstall } = args
  if (platform !== 'darwin') return false
  if (platformToInstall !== 'Windows') return false
  if (!runner || hasCapability(runner, 'usesBottleRuntime')) return false
  return true
}

/** The CrossOver install-risk dialog applies when the engine may be CrossOver. */
export function installsViaCrossoverForEngine(id: string | undefined): boolean {
  return id === 'automatic' || id === 'crossover'
}

/** Legacy cannot be chosen for a new game (D-07, D-11, D-20). */
export function initialInstallEngine(defaultId: string | undefined): string {
  if (!defaultId || defaultId.startsWith('legacy:')) return 'automatic'
  return defaultId
}

/**
 * The config an engine-choice install writes: the engine id plus the bottle
 * name the backend computed (D-17). No wine build, prefix or picker value.
 */
export async function engineInstallConfig(args: {
  runner: Runner
  appName: string
  engineOverride: string
  getBottleName: (a: {
    runner: Runner
    appName: string
  }) => Promise<string | null | undefined>
}): Promise<{ engineOverride: string; wineCrossoverBottle?: string }> {
  const { runner, appName, engineOverride, getBottleName } = args
  const bottle = await getBottleName({ runner, appName })
  return {
    engineOverride,
    ...(bottle ? { wineCrossoverBottle: bottle } : {})
  }
}
