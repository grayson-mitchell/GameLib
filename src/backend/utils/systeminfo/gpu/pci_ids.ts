/**
 * Contains helper functions to work with the `pci.ids` file
 * ({@link https://pci-ids.ucw.cz})
 */
import { resolveTxt } from 'dns'
import { promisify } from 'util'
import CacheStore from 'backend/cache'
import type { StoreRoot } from 'backend/stores/storeRoot'

import type { PartialGpuInfo } from './index'
import type { GPUInfo } from '../index'

const resolveTxtAsync = promisify(resolveTxt)

type DeviceNameCacheKey =
  | `${string}_${string}_${string}_${string}` // DeviceSubID_VendorSubID_DeviceID_VendorID
  | `${string}_${string}` // DeviceID_VendorID

/** The two pci.ids lookup caches. On-disk names `pci_ids_device` / `pci_ids_vendor` are fixed. */
export interface PciIdCaches {
  deviceNameCache: CacheStore<string, DeviceNameCacheKey>
  vendorNameCache: CacheStore<string, string>
}

export function createPciIdCaches(deps: { root: StoreRoot }): PciIdCaches {
  const deviceNameCache = new CacheStore<string, DeviceNameCacheKey>(
    'pci_ids_device',
    60 * 24 * 7,
    { root: deps.root, kind: 'cache' }
  ) // 7 days
  const vendorNameCache = new CacheStore<string, string>(
    'pci_ids_vendor',
    60 * 24 * 7,
    { root: deps.root, kind: 'cache' }
  )
  return { deviceNameCache, vendorNameCache }
}

async function pciIdDnsQuery(pre: string): Promise<string | false> {
  const records: string[][] = await resolveTxtAsync(
    `${pre}.pci.id.ucw.cz`
  ).catch(() => [])
  return records[0]?.[0]?.replace(/^i=/, '') ?? false
}

async function lookupDeviceString(
  { deviceNameCache }: PciIdCaches,
  vendorId: string,
  deviceId: string,
  subvendorId?: string,
  subdeviceId?: string
): Promise<string | false> {
  async function lookupKey(key: DeviceNameCacheKey): Promise<string | false> {
    const cached = deviceNameCache.get(key)
    if (cached) return cached

    const result = await pciIdDnsQuery(key.replaceAll('_', '.'))
    if (result) deviceNameCache.set(key, result)
    return result
  }

  if (!subvendorId || !subdeviceId) return lookupKey(`${deviceId}_${vendorId}`)

  // If we have a subdevice and subvendor ID, try getting a name with them first
  const resultWithSubIDs = await lookupKey(
    `${subdeviceId}_${subvendorId}_${deviceId}_${vendorId}`
  )
  if (resultWithSubIDs) return resultWithSubIDs

  // If there's no name for this specific subdevice and subvendor ID, try
  // with just the device and vendor ID
  const resultWithoutSubIDs = await lookupKey(`${deviceId}_${vendorId}`)
  // Update the cache entry with subIDs, to avoid re-requesting them all the
  // time
  if (resultWithoutSubIDs)
    deviceNameCache.set(
      `${subdeviceId}_${subvendorId}_${deviceId}_${vendorId}`,
      resultWithoutSubIDs
    )
  return resultWithoutSubIDs
}

async function lookupVendorString(
  { vendorNameCache }: PciIdCaches,
  vendorId: string
): Promise<string | false> {
  const cached = vendorNameCache.get(vendorId)
  if (cached) return cached

  const result = await pciIdDnsQuery(vendorId.replaceAll('_', '.'))
  if (result) vendorNameCache.set(vendorId, result)
  return result
}

async function populateDeviceAndVendorName(
  caches: PciIdCaches,
  partialGpus: PartialGpuInfo[]
): Promise<GPUInfo[]> {
  const fullGpuInfo: GPUInfo[] = []
  for (const gpu of partialGpus) {
    const vendorId = gpu.vendorId.toLowerCase()
    const deviceId = gpu.deviceId.toLowerCase()
    const subvendorId = gpu.subvendorId?.toLowerCase()
    const subdeviceId = gpu.subdeviceId?.toLowerCase()

    const deviceString = await lookupDeviceString(
      caches,
      vendorId,
      deviceId,
      subvendorId,
      subdeviceId
    )
    const vendorString = await lookupVendorString(caches, vendorId)
    if (!deviceString || !vendorString) continue

    fullGpuInfo.push({
      ...gpu,
      deviceString,
      vendorString
    })
  }
  return fullGpuInfo
}

export { populateDeviceAndVendorName }
