import { fixAsarPath, publicDir } from 'backend/constants/paths'
import type { ProcessRunner } from 'backend/process/types'
import { join } from 'path'
import { gte as semverGte } from 'semver'

const vulkanHelperBin = fixAsarPath(
  join(publicDir, 'bin', process.arch, process.platform, 'vulkan-helper')
)

type VulkanVersion = [maj: number, min: number, patch: number]

// Research A1: unmeasured; the helper enumerates the Vulkan instance, so the bound is generous.
const VULKAN_PROBE_TIMEOUT_MS = 10_000

export interface VulkanDeps {
  runner: Pick<ProcessRunner, 'run'>
}

/**
 * Vulkan helper probes on the process runner. The two memos are closure state of the
 * instance (D-15), so a failed probe is remembered for the life of the instance only.
 */
export function createVulkan(deps: VulkanDeps) {
  // The stdout of a probe, or '' when it failed to spawn, timed out or exited non-zero.
  const probe = async (arg: string): Promise<string> => {
    try {
      const r = await deps.runner.run(vulkanHelperBin, [arg], {
        timeoutMs: VULKAN_PROBE_TIMEOUT_MS
      })
      if (r.timedOut || r.code !== 0) return ''
      return r.stdout
    } catch {
      return ''
    }
  }

  let instanceVersion: Promise<string> | null = null
  let physicalVersions: Promise<string> | null = null

  /**
   * @returns The version of the installed Vulkan API interface, or `false` if
   * unsupported. <br>
   * Note that this is the interface version, not the version a user's GPU(s)
   * support. For that, see {@link getSupportedVulkanVersions}
   */
  async function getInstanceVersion(): Promise<VulkanVersion | false> {
    instanceVersion ??= probe('instance-version')
    try {
      return JSON.parse(await instanceVersion) as VulkanVersion
    } catch {
      return false
    }
  }

  /**
   * @returns A list of device names and their supported Vulkan versions
   */
  async function getSupportedVulkanVersions(): Promise<
    [name: string, version: VulkanVersion][]
  > {
    physicalVersions ??= probe('physical-versions')
    try {
      const output = JSON.parse(await physicalVersions) as Array<{
        name: string
        major: number
        minor: number
        patch: number
      }>
      return output.map(({ name, major, minor, patch }) => [
        name,
        [major, minor, patch]
      ])
    } catch {
      return []
    }
  }

  async function getNvngxPath(): Promise<string> {
    return (await probe('nvapi-path')).trim()
  }

  /**
   * Helper function to detect if any GPU in the system supports a specified Vulkan version
   * @returns The name of first the adapter supporting the target version, or `false` if none do
   */
  async function anyGpuSupportsVersion(
    targetVersion: VulkanVersion
  ): Promise<string | false> {
    for (const [name, supported] of await getSupportedVulkanVersions()) {
      if (semverGte(supported.join('.'), targetVersion.join('.'))) {
        return name
      }
    }
    return false
  }

  return { getInstanceVersion, anyGpuSupportsVersion, getNvngxPath }
}
