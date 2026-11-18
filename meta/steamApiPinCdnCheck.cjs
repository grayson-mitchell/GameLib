/**
 * Quick 261119-a23 (todo 2026-11-17-ci-head-check-pinned-steam-api.md). The macOS bridge helper
 * loads a pinned `libsteam_api.dylib`, which GameLib fetches once from Valve's client-update CDN
 * and caches. If Valve stops serving the pinned package, a user with no cache lands UNPINNED and
 * nothing tells the maintainers. This script HEAD-checks the pinned package on every CDN host and
 * exits 0 if and only if at least one host answers 200 with a Content-Length equal to the pinned
 * size.
 *
 * Every value (package name, size, hosts) is READ from the Rust source at run time, so a pin bump
 * cannot leave this check stale. None of them is copied into this file or the workflow.
 *
 * Exit codes: 0 = at least one host passed. 1 = the CDN check failed. 2 = usage error, unreadable
 * pin file or unparseable pin (always before any request).
 *
 * Redirects are deliberately NOT followed. Production builds its reqwest client with
 * `redirect::Policy::none()` and treats every status other than 200 as a failure, so a CDN that
 * started redirecting would already break fresh installs; following the redirect here would keep
 * the check green while the app failed. The User-Agent is the production one.
 *
 * Local usage: pnpm check:steam-api-pin-cdn
 *
 * Plain CommonJS, node: builtins only.
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PIN_FILE = 'src-tauri/crates/gamelib-depot/src/steam_api_pin.rs'

/**
 * Read `{ package, packageSize, hosts }` out of the Rust source text.
 * Throws an Error naming the field it could not read.
 */
function parsePin(source) {
  const lines = source.split(/\r?\n/)

  const pinStarts = []
  lines.forEach((l, i) => {
    if (l.trim() === 'pub const PIN: SteamApiPin = SteamApiPin {')
      pinStarts.push(i)
  })
  if (pinStarts.length !== 1) {
    throw new Error(
      `PIN: expected exactly one \`pub const PIN\` block, found ${pinStarts.length} in steam_api_pin.rs`
    )
  }
  let end = -1
  for (let i = pinStarts[0] + 1; i < lines.length; i++) {
    if (lines[i].trim() === '};') {
      end = i
      break
    }
  }
  if (end === -1) throw new Error('PIN: unterminated block in steam_api_pin.rs')
  const block = lines
    .slice(pinStarts[0] + 1, end)
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('//'))

  const pkgLines = block.filter((l) => /^package\s*:/.test(l))
  if (pkgLines.length === 0)
    throw new Error('PIN.package: missing in steam_api_pin.rs')
  if (pkgLines.length > 1)
    throw new Error('PIN.package: duplicate in steam_api_pin.rs')
  const pkgMatch = /^package\s*:\s*"([^"]*)"\s*,$/.exec(pkgLines[0])
  if (!pkgMatch)
    throw new Error('PIN.package: not a string literal in steam_api_pin.rs')
  const pkg = pkgMatch[1]

  const sizeLines = block.filter((l) => /^package_size\s*:/.test(l))
  if (sizeLines.length === 0)
    throw new Error('PIN.package_size: missing in steam_api_pin.rs')
  if (sizeLines.length > 1)
    throw new Error('PIN.package_size: duplicate in steam_api_pin.rs')
  const sizeMatch = /^package_size\s*:\s*([0-9][0-9_]*)\s*,$/.exec(sizeLines[0])
  if (!sizeMatch)
    throw new Error('PIN.package_size: not a literal in steam_api_pin.rs')
  const packageSize = Number(sizeMatch[1].replace(/_/g, ''))
  if (!Number.isSafeInteger(packageSize) || packageSize <= 0)
    throw new Error(
      'PIN.package_size: not a positive integer in steam_api_pin.rs'
    )

  if (!/^[A-Za-z0-9._-]+$/.test(pkg))
    throw new Error(
      'PIN.package: contains characters outside [A-Za-z0-9._-] in steam_api_pin.rs'
    )
  if (!pkg.endsWith(`_${packageSize}`))
    throw new Error(
      'PIN.package: name does not end with _<package_size> in steam_api_pin.rs'
    )

  const hostDecls = []
  lines.forEach((l, i) => {
    if (/^\s*pub const CDN_HOSTS\s*:\s*\[&str;\s*\d+\]\s*=\s*\[/.test(l))
      hostDecls.push(i)
  })
  if (hostDecls.length !== 1)
    throw new Error(
      `CDN_HOSTS: expected exactly one declaration, found ${hostDecls.length} in steam_api_pin.rs`
    )
  const rest = lines.slice(hostDecls[0]).join('\n')
  const declMatch = /pub const CDN_HOSTS\s*:\s*\[&str;\s*(\d+)\]\s*=\s*\[/.exec(
    rest
  )
  const declared = Number(declMatch[1])
  if (declared < 1) throw new Error('CDN_HOSTS: declared length is 0')
  const afterOpen = rest.slice(declMatch.index + declMatch[0].length)
  const close = afterOpen.indexOf('];')
  if (close === -1) throw new Error('CDN_HOSTS: unterminated list')
  const body = afterOpen
    .slice(0, close)
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
  const hosts = []
  const leftover = body.replace(/"([^"]*)"/g, (_m, h) => {
    hosts.push(h)
    return ''
  })
  if (!/^[\s,]*$/.test(leftover))
    throw new Error('CDN_HOSTS: non-literal entry in host list')
  if (hosts.length !== declared)
    throw new Error(
      `CDN_HOSTS: declared length ${declared} but found ${hosts.length} entries`
    )
  for (const h of hosts) {
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
        h
      )
    )
      throw new Error(
        `CDN_HOSTS: entry is not a bare lowercase DNS name (host shape): ${JSON.stringify(h)}`
      )
  }

  return { package: pkg, packageSize, hosts }
}

function errorVerdict(err) {
  const cause = err && err.cause && err.cause.code
  const code = cause || (err && err.name) || 'Error'
  return `error-${String(code).replace(/[^A-Za-z0-9_.-]/g, '')}`
}

/**
 * HEAD every host in order (never stopping at the first pass).
 * Returns `{ ok, results }`.
 */
async function checkPin(pin, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const timeoutMs = options.timeoutMs || 20000
  const results = []
  for (const host of pin.hosts) {
    const url = `https://${host}/${pin.package}`
    let status = null
    let contentLength = null
    let verdict
    try {
      const res = await fetchImpl(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'user-agent': 'GameLib' },
        signal: AbortSignal.timeout(timeoutMs)
      })
      status = res.status
      contentLength = res.headers.get('content-length')
      if (status !== 200) verdict = `http-${status}`
      else if (contentLength === null) verdict = 'no-content-length'
      else if (contentLength !== String(pin.packageSize))
        verdict = `length-${contentLength}`
      else verdict = 'ok'
    } catch (err) {
      verdict = errorVerdict(err)
    }
    results.push({ host, url, status, contentLength, verdict })
  }
  return { ok: results.some((r) => r.verdict === 'ok'), results }
}

async function main() {
  let pin
  try {
    const file = path.resolve(process.cwd(), PIN_FILE)
    pin = parsePin(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    process.stderr.write(`::error::${err.message}\n`)
    process.exitCode = 2
    return
  }
  const result = await checkPin(pin)
  for (const r of result.results) {
    process.stdout.write(
      `${r.host}: ${r.verdict} (status ${r.status}, content-length ${r.contentLength})\n`
    )
  }
  if (result.ok) {
    process.stdout.write(
      `PASS: ${pin.package} (${pin.packageSize} bytes) served\n`
    )
  } else {
    process.stderr.write(
      '::error::Valve CDN does not serve the pinned libsteam_api package\n'
    )
    process.exitCode = 1
  }
}

module.exports = { PIN_FILE, parsePin, checkPin }

if (require.main === module) {
  main()
}
