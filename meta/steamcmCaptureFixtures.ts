/**
 * Phase 79 plan 21 (trimmed in 79-42): one-off maintainer tool that records raw anonymous-PICS
 * fixtures. Run by hand: `pnpm steamcm-capture-fixtures`.
 *
 * For each public app it records the raw PICS buffers the Rust CM client receives, through the
 * CLI-only `steamcm_capture_anon_pics` op, into `fixtures/raw/`. The npm oracle half was
 * removed with the npm package: `fixtures/expected.json` is now the committed reference and is
 * not re-recorded here. The raw capture stays so new public-app fixtures can still be added.
 *
 * Safety: anonymous logon only; only public app data is recorded and no account data exists in
 * the output. The CLI child is fake-HOME isolated.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runSteamcmCliSync } from './gamelibSteamcmCli'

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

function main(): void {
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

  console.log(`recorded ${apps.length} apps`)
  process.exit(0)
}

try {
  main()
} catch (e: unknown) {
  console.error(e)
  process.exit(1)
}
