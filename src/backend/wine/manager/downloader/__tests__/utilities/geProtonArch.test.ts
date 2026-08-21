import { fetchReleases } from '../../utilities'
import { axiosClient } from 'backend/utils'
import { VersionInfo } from 'common/types'

jest.mock('backend/logger')

// GE-Proton ships aarch64 & x86_64 assets in the same release. The asset
// order below is deliberately aarch64-LAST, which is the known-bad input:
// under the pre-fix "last matching asset wins" fallback, the x64 test
// resolves to the aarch64 build and fails.
const geProtonPayload = {
  data: [
    {
      tag_name: 'GE-Proton10-1',
      published_at: '2026-01-01T00:00:00Z',
      html_url:
        'https://github.com/GloriousEggroll/proton-ge-custom/releases/tag/GE-Proton10-1',
      assets: [
        {
          name: 'GE-Proton10-1.sha512sum',
          browser_download_url:
            'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1.sha512sum',
          size: 128
        },
        {
          name: 'GE-Proton10-1.tar.gz',
          browser_download_url:
            'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1.tar.gz',
          size: 500000000
        },
        {
          name: 'GE-Proton10-1-aarch64.sha512sum',
          browser_download_url:
            'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1-aarch64.sha512sum',
          size: 130
        },
        {
          name: 'GE-Proton10-1-aarch64.tar.gz',
          browser_download_url:
            'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1-aarch64.tar.gz',
          size: 480000000
        }
      ]
    }
  ]
}

const protonCachyOsPayload = {
  data: [
    {
      tag_name: 'proton-cachyos-10.0',
      published_at: '2026-01-01T00:00:00Z',
      html_url:
        'https://github.com/CachyOS/proton-cachyos/releases/tag/proton-cachyos-10.0',
      assets: [
        {
          name: 'proton-cachyos-10.0-x86_64.sha512sum',
          browser_download_url:
            'https://github.com/CachyOS/proton-cachyos/releases/download/proton-cachyos-10.0/proton-cachyos-10.0-x86_64.sha512sum',
          size: 128
        },
        {
          name: 'proton-cachyos-10.0-x86_64.tar.xz',
          browser_download_url:
            'https://github.com/CachyOS/proton-cachyos/releases/download/proton-cachyos-10.0/proton-cachyos-10.0-x86_64.tar.xz',
          size: 500000000
        }
      ]
    }
  ]
}

describe('Utilities - fetchReleases GE-Proton arch selection', () => {
  const originalArch = process.arch

  afterEach(() => {
    Object.defineProperty(process, 'arch', {
      value: originalArch,
      configurable: true
    })
  })

  test('x64: picks the non-aarch64 tar.gz and non-aarch64 sha512sum', async () => {
    Object.defineProperty(process, 'arch', {
      value: 'x64',
      configurable: true
    })
    axiosClient.get = jest.fn().mockResolvedValue(geProtonPayload)

    const releases = await fetchReleases({
      url: 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases',
      type: 'GE-Proton',
      count: 100
    })

    const release = releases.find(
      (r: VersionInfo) => r.version === 'GE-Proton10-1'
    )

    expect(release).toBeDefined()
    expect(release?.download).toBe(
      'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1.tar.gz'
    )
    expect(release?.checksum).toBe(
      'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1.sha512sum'
    )
  })

  test('arm64: picks the aarch64 tar.gz and aarch64 sha512sum', async () => {
    Object.defineProperty(process, 'arch', {
      value: 'arm64',
      configurable: true
    })
    axiosClient.get = jest.fn().mockResolvedValue(geProtonPayload)

    const releases = await fetchReleases({
      url: 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases',
      type: 'GE-Proton',
      count: 100
    })

    const release = releases.find(
      (r: VersionInfo) => r.version === 'GE-Proton10-1'
    )

    expect(release).toBeDefined()
    expect(release?.download).toBe(
      'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1-aarch64.tar.gz'
    )
    expect(release?.checksum).toBe(
      'https://github.com/GloriousEggroll/proton-ge-custom/releases/download/GE-Proton10-1/GE-Proton10-1-aarch64.sha512sum'
    )
  })

  test('regression guard: Proton-CachyOS still resolves via its existing x86_64 matchers', async () => {
    Object.defineProperty(process, 'arch', {
      value: 'x64',
      configurable: true
    })
    axiosClient.get = jest.fn().mockResolvedValue(protonCachyOsPayload)

    const releases = await fetchReleases({
      url: 'https://api.github.com/repos/CachyOS/proton-cachyos/releases',
      type: 'Proton-CachyOS',
      count: 100
    })

    const release = releases.find(
      (r: VersionInfo) => r.version === 'proton-cachyos-10.0'
    )

    expect(release).toBeDefined()
    expect(release?.download).toBe(
      'https://github.com/CachyOS/proton-cachyos/releases/download/proton-cachyos-10.0/proton-cachyos-10.0-x86_64.tar.xz'
    )
    expect(release?.checksum).toBe(
      'https://github.com/CachyOS/proton-cachyos/releases/download/proton-cachyos-10.0/proton-cachyos-10.0-x86_64.sha512sum'
    )
  })
})
