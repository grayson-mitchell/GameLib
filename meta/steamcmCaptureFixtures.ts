/**
 * Phase 79 plan 21: one-off maintainer tool that records the Tier 1 anonymous-PICS fixtures.
 * Run by hand: `pnpm steamcm-capture-fixtures`.
 *
 * For each public app it records (a) the raw PICS buffers the Rust CM client receives, through the
 * CLI-only `steamcm_capture_anon_pics` op, and (b) steam-user's own anonymous `getProductInfo`
 * output for the same app, so the Rust converters can be compared with the oracle (63 D-07).
 *
 * Safety: this script runs steam-user in-process under the operator's HOME, with `dataDirectory`
 * null so nothing is written, and it never signs in (anonymous logon only). Only public app data
 * is recorded; no account data exists in the output. The CLI child is fake-HOME isolated.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type SteamUserType from 'steam-user'

import { runSteamcmCliSync } from './gamelibSteamcmCli'

// steam-user reads files relative to its own directory, so it must not be bundled by esbuild:
// load it from node_modules at run time.
const SteamUser = createRequire(join(process.cwd(), 'package.json'))(
  'steam-user'
) as typeof SteamUserType

const APPS = [480, 1007, 232250, 220]
const FIXTURES = join(
  process.cwd(),
  'src-tauri',
  'crates',
  'gamelib-steamcm',
  'tests',
  'fixtures'
)

interface CapturedApp {
  appId: number
  changeNumber: number
  missingToken: boolean
  bufferBase64: string
}

async function steamUserAnon(): Promise<SteamUserType.ProductInfo> {
  const client = new SteamUser({ dataDirectory: null, enablePicsCache: false })
  try {
    await new Promise<void>((resolve, reject) => {
      client.once('loggedOn', () => resolve())
      client.once('error', reject)
      client.logOn({ anonymous: true })
    })
    return await client.getProductInfo(APPS, [], true)
  } finally {
    client.logOff()
  }
}

async function main(): Promise<void> {
  mkdirSync(join(FIXTURES, 'raw'), { recursive: true })
  const captured = runSteamcmCliSync('steamcm_capture_anon_pics', {
    apps: APPS
  }) as { ok: boolean; result?: { apps: CapturedApp[] } } & {
    apps?: CapturedApp[]
  }
  const apps = captured.result?.apps ?? captured.apps
  if (!apps) throw new Error('capture returned no apps')
  for (const a of apps) {
    writeFileSync(
      join(FIXTURES, 'raw', `app-${a.appId}.json`),
      JSON.stringify(a, null, 2) + '\n'
    )
  }

  const info = await steamUserAnon()
  const expectedPath = join(FIXTURES, 'expected.json')
  const expected = existsSync(expectedPath)
    ? (JSON.parse(readFileSync(expectedPath, 'utf-8')) as Record<
        string,
        unknown
      >)
    : {}
  for (const id of APPS) {
    expected[`anon_pics:${id}`] = JSON.parse(
      JSON.stringify((info.apps as Record<number, unknown>)[id])
    )
  }
  writeFileSync(expectedPath, JSON.stringify(expected, null, 2) + '\n')
  console.log(`recorded ${apps.length} apps`)
  process.exit(0)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
