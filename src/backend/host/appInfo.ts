/**
 * App name, version, user agent and packaged flag (D-66.3-01). Pure: no module state.
 */

// Static import, same pattern `utils/systeminfo/heroicVersion.ts` uses: `npm_package_version`
// is UNSET in the packaged SEA sidecar binary, so reading it would report '0.0.0'.
import pkgJson from '../../../package.json'

export interface AppInfo {
  name: string
  version: string
  userAgentFallback: string
  isPackaged: boolean
}

// `standardBrowserUserAgent()` (backend/humble/userAgent.ts) regex-extracts a `(<platform>)`
// token and a `Chrome/<version>` token from this string, so it is shaped to match that happy
// path. It DELIBERATELY carries no `Electron/x.y.z` token: the function exists to strip that
// token so Google's SSO does not fingerprint an embedded browser. Chrome/142.0.7444.52 is the
// Chromium build of the pinned electron@41.1.1. The platform token follows `platform`.
function buildUserAgentFallback(platform: NodeJS.Platform): string {
  const chromeVersion = '142.0.7444.52'
  const platformToken =
    platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${platformToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
}

export function resolveAppInfo(deps: {
  platform: NodeJS.Platform
  osRelease: string
  isPackaged: boolean
}): AppInfo {
  return {
    name: 'GameLib',
    version: pkgJson.version ?? '0.0.0',
    userAgentFallback: buildUserAgentFallback(deps.platform),
    isPackaged: deps.isPackaged
  }
}
