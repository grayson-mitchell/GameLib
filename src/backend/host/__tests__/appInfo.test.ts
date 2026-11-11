import { resolveAppInfo } from '../appInfo'
import pkgJson from '../../../../package.json'

describe('resolveAppInfo', () => {
  it('returns name, version and packaged flag', () => {
    const info = resolveAppInfo({
      platform: 'darwin',
      osRelease: '24.0.0',
      isPackaged: true
    })
    expect(info.name).toBe('GameLib')
    expect(info.version).toBe(pkgJson.version ?? '0.0.0')
    expect(info.isPackaged).toBe(true)
  })

  it.each([
    ['darwin', 'Macintosh; Intel Mac OS X 10_15_7'],
    ['win32', 'Windows NT 10.0; Win64; x64'],
    ['linux', 'X11; Linux x86_64']
  ] as const)(
    'builds the %s user agent without an Electron token',
    (platform, token) => {
      const { userAgentFallback } = resolveAppInfo({
        platform,
        osRelease: '',
        isPackaged: false
      })
      expect(userAgentFallback).toBe(
        `Mozilla/5.0 (${token}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.52 Safari/537.36`
      )
      expect(userAgentFallback).not.toContain('Electron')
    }
  )
})
