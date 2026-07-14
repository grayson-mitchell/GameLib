/**
 * Spike auth — obtain a Steam refresh token via QR login.
 *
 * DELIBERATELY STANDALONE. GameLib's own refresh token is encrypted with
 * Electron's safeStorage (steam/user.ts:30) and can only be decrypted inside the
 * Electron main process. Rather than drag Electron into the spike — or worse,
 * print a decrypted production token to stdout — the spike does its own login.
 *
 * The token is cached to .token.json in this directory, which is GITIGNORED.
 * It is a real credential: delete it when you are done (`rm .token.json`).
 */

import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import qrcode from 'qrcode-generator'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import SteamUser from 'steam-user'

const TOKEN_FILE = new URL('./.token.json', import.meta.url).pathname

function printQR(url) {
  const qr = qrcode(0, 'L')
  qr.addData(url)
  qr.make()
  console.log(qr.createASCII(1, 1))
}

/** Returns a refresh token, from cache or via a fresh QR login. */
export async function getRefreshToken() {
  if (existsSync(TOKEN_FILE)) {
    const { refreshToken } = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'))
    if (refreshToken) return refreshToken
  }

  console.log('\nNo cached token. Starting Steam QR login.\n')
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
  session.loginTimeout = 300000 // 5 min — a 120s window expires before a human can scan

  const { qrChallengeUrl } = await session.startWithQR()

  console.log('Scan this with the Steam mobile app (Steam Guard → scan QR):\n')
  printQR(qrChallengeUrl)
  console.log(`If the QR will not scan, the challenge URL is:\n  ${qrChallengeUrl}\n`)
  console.log('Waiting for approval...\n')

  const refreshToken = await new Promise((resolve, reject) => {
    session.once('authenticated', () => resolve(session.refreshToken))
    session.once('timeout', () =>
      reject(new Error('QR login timed out (5 min) — re-run to get a fresh QR'))
    )
    session.once('error', reject)
  })

  writeFileSync(TOKEN_FILE, JSON.stringify({ refreshToken }, null, 2))
  console.log('✓ Authenticated. Token cached to .token.json (gitignored).\n')
  return refreshToken
}

/**
 * Connect an authenticated steam-user client and resolve once its license list
 * has arrived. The `licenses` event carries the user's package grants; app
 * ownership is derived from those packages (see ownedAppIds).
 */
export async function connectAuthenticated() {
  const refreshToken = await getRefreshToken()
  const client = new SteamUser()

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CM connect timed out (30s)')), 30000)
    let licenses = null
    let loggedOn = false

    const maybeDone = () => {
      if (loggedOn && licenses) {
        clearTimeout(timeout)
        resolve({ client, licenses })
      }
    }

    client.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    client.on('loggedOn', () => {
      loggedOn = true
      maybeDone()
    })
    client.on('licenses', (l) => {
      licenses = l
      maybeDone()
    })

    client.logOn({ refreshToken })
  })
}

/**
 * Resolve what the user owns, from their package licenses.
 *
 * Ownership is granted via PACKAGES: each license is a packageid, and each
 * package's packageinfo lists both the `appids` AND the `depotids` it grants.
 *
 * **`depotids` is the one that matters for install.** Spike 001 proved that
 * depot ownership — not any combination of `dlcappid` / `optional` /
 * `systemdefined` flags — is what decides whether Steam installs a depot. This
 * is the data an anonymous PICS connection cannot provide, and the reason the
 * first PICS-only selection rule failed on 10 of 11 games.
 */
export async function ownedIds(client, licenses) {
  const packageIds = licenses.map((l) => l.package_id)
  const info = await client.getProductInfo([], packageIds, true)

  const apps = new Set()
  const depots = new Set()
  for (const pkg of Object.values(info.packages ?? {})) {
    for (const appid of pkg.packageinfo?.appids ?? []) apps.add(Number(appid))
    for (const depotid of pkg.packageinfo?.depotids ?? []) depots.add(Number(depotid))
  }
  return { apps, depots }
}
