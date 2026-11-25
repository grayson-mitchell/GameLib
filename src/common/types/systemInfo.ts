/**
 * @file The system-information shapes the renderer's Settings screen reads. `getSystemInfo` is a native
 * channel answered by the Rust `info` slice (`gamelib-info`'s `sysinfo`), whose serde output is the
 * authority for these shapes; they live in `common` so the renderer imports them without reaching into
 * `backend/`.
 */

type GPUInfo = {
  // The PCI device ID of the graphics card (hexadecimal)
  deviceId: string
  // The PCI vendor ID of the graphics card (hexadecimal)
  vendorId: string
  // The PCI sub-device ID of the graphics card (hexadecimal)
  subdeviceId?: string
  // The PCI sub-vendor ID of the graphics card (hexadecimal)
  subvendorId?: string
  // If the device has an entry in `pci.ids`, this is its name
  deviceString?: string
  // If the vendor has an entry in `pci.ids`, this is their name
  vendorString?: string
  // On Windows: The version of the GPU driver (formatted as nicely as possible)
  // On Linux:   The driver in use (nvidia/nouveau; amdgpu/radeon/etc.)
  driverVersion?: string
}

type SteamDeckInfo =
  | { isDeck: true; model: string; mode: 'game' | 'desktop' }
  | { isDeck: false; model?: undefined }

export interface SystemInformation {
  CPU: {
    model: string
    cores: number
  }
  memory: {
    used: number
    total: number
    usedFormatted: string
    totalFormatted: string
  }
  GPUs: GPUInfo[]
  OS: {
    platform: string
    name: string
    version: string
  }
  steamDeckInfo: SteamDeckInfo
  isFlatpak: boolean
  isAppImage: boolean
  softwareInUse: {
    heroicVersion: string
    legendaryVersion: string
    gogdlVersion: string
    cometVersion: string
    nileVersion: string
  }
}
