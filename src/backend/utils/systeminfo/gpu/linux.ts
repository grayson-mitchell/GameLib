import { logWarning, LogPrefix } from 'backend/logger'
import { genericSpawnWrapper, type ProbeDeps } from '../../os/processes'

import type { PartialGpuInfo } from './index'

/**
 * Parses the output of `lspci -mm -v -n -k` into GPU entries, in lspci's bus
 * order. Records are separated by blank lines; non-GPU records and records
 * with malformed ids are dropped.
 */
function parseLspciGpus(stdout: string): PartialGpuInfo[] {
  // PCI display classes: VGA compatible, 3D controller, display controller (other)
  const gpuClasses = ['0300', '0302', '0380']
  const isHex4 = (value: string) => /^[0-9a-f]{4}$/i.test(value)
  const gpus: PartialGpuInfo[] = []

  for (const record of stdout.split(/\r?\n\s*\r?\n/)) {
    const fields = new Map<string, string>()
    for (const line of record.split(/\r?\n/)) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
    }

    const cls = fields.get('Class')?.toLowerCase()
    const vendor = fields.get('Vendor')
    const device = fields.get('Device')
    if (!cls || !gpuClasses.includes(cls)) continue
    if (!vendor || !device || !isHex4(vendor) || !isHex4(device)) continue

    const gpu: PartialGpuInfo = {
      vendorId: vendor.toLowerCase(),
      deviceId: device.toLowerCase()
    }
    const svendor = fields.get('SVendor')
    const sdevice = fields.get('SDevice')
    const driver = fields.get('Driver')
    if (svendor && isHex4(svendor)) gpu.subvendorId = svendor.toLowerCase()
    if (sdevice && isHex4(sdevice)) gpu.subdeviceId = sdevice.toLowerCase()
    if (driver) gpu.driverVersion = driver
    gpus.push(gpu)
  }

  return gpus
}

/**
 * Strategy: one `lspci` call lists every display-class device with its
 * subsystem ids and kernel driver. Any failure (lspci missing, non-zero exit,
 * timeout) yields [] with a warning; this probe never throws.
 */
async function getGpuInfo_linux(deps: ProbeDeps): Promise<PartialGpuInfo[]> {
  try {
    const { stdout, exitCode, signalName } = await genericSpawnWrapper(
      deps,
      'lspci',
      ['-mm', '-v', '-n', '-k']
    )
    if (exitCode !== 0) {
      logWarning(
        ['Could not list GPUs: lspci exited with', exitCode, signalName],
        LogPrefix.Backend
      )
      return []
    }
    return parseLspciGpus(stdout)
  } catch (error) {
    logWarning(
      ['Could not list GPUs: lspci missing or failed:', String(error)],
      LogPrefix.Backend
    )
    return []
  }
}

export { getGpuInfo_linux, parseLspciGpus }
