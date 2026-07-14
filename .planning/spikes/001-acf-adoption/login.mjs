/**
 * Spike login — opens a scannable QR in the browser and waits for approval.
 *
 * Why not print the QR to the terminal? Tool output is only surfaced once the
 * command exits, so a terminal QR is never visible while it is still live — it
 * expires before it can be scanned. Rendering to a page and `open`ing it lets
 * the user scan at their own pace while this process waits in the background.
 *
 * Writes .token.json (GITIGNORED — a real credential; `rm .token.json` when done).
 */

import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import qrcode from 'qrcode-generator'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const TOKEN_FILE = new URL('./.token.json', import.meta.url).pathname
const QR_PAGE = new URL('./qr.html', import.meta.url).pathname

const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
session.loginTimeout = 300000

const { qrChallengeUrl } = await session.startWithQR()

const qr = qrcode(0, 'L')
qr.addData(qrChallengeUrl)
qr.make()

writeFileSync(
  QR_PAGE,
  `<!doctype html><meta charset="utf-8"><title>GameLib spike — Steam login</title>
<style>
  body{font-family:system-ui,sans-serif;background:#1b2838;color:#c7d5e0;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       min-height:100vh;margin:0;gap:1.25rem;text-align:center}
  .qr{background:#fff;padding:20px;border-radius:12px;line-height:0}
  h1{font-size:1.25rem;font-weight:600;margin:0}
  p{margin:0;opacity:.75;max-width:32rem;line-height:1.5}
  code{background:#0e1621;padding:.2rem .45rem;border-radius:4px;font-size:.85em}
</style>
<h1>Scan with the Steam mobile app</h1>
<p>Steam app → Steam Guard → the QR-scan icon (top right).</p>
<div class="qr">${qr.createSvgTag(6, 0)}</div>
<p>This grants the spike a Steam refresh token so it can read your license list —
the data needed to work out which DLC depots you own. The token is cached to
<code>.token.json</code> (gitignored). Delete it when you're done.</p>
<p>Expires in 5 minutes.</p>`
)

execFileSync('open', [QR_PAGE])
console.log('QR page opened in your browser. Waiting for approval (5 min)...')

try {
  const refreshToken = await new Promise((resolve, reject) => {
    session.once('authenticated', () => resolve(session.refreshToken))
    session.once('timeout', () => reject(new Error('timed out')))
    session.once('error', reject)
  })
  writeFileSync(TOKEN_FILE, JSON.stringify({ refreshToken }, null, 2))
  console.log('AUTH_OK — token cached.')
  process.exit(0)
} catch (err) {
  console.error(`AUTH_FAILED — ${err.message}`)
  process.exit(1)
}
