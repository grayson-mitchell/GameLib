/**
 * Dev sidecar bundle (`pnpm build:sidecar`). Phase 47 D-01: applies the
 * `__ITAD_API_KEY__` define (fed from `ITAD_API_KEY`) so the dev bundle matches
 * the SEA bundle built by `buildSidecarSea.ts`. The key value is never logged.
 *
 * Spawns esbuild only (never the sidecar), so the fake-HOME convention does
 * not apply here.
 */
import {
  itadKeyDefineFlag,
  resolveEsbuildCli,
  spawnArgv
} from './esbuildWorkerBundleShared'

export function buildSidecarArgv(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): { command: string; args: string[] } {
  const esbuildCli = resolveEsbuildCli()
  const flags = [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--packages=external',
    '--outfile=build/main/sidecar.js',
    'src/sidecar/index.ts',
    itadKeyDefineFlag(env)
  ]
  if (platform === 'win32') {
    return { command: process.execPath, args: [esbuildCli, ...flags] }
  }
  return { command: esbuildCli, args: flags }
}

async function main(): Promise<void> {
  const { command, args } = buildSidecarArgv()
  const result = await spawnArgv(command, args)
  if (result.code !== 0) {
    // stderr only, never the argv (it carries the define value).
    console.error(result.stderr)
    process.exit(1)
  }
}

if (!process.env.JEST_WORKER_ID) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'build failed')
    process.exit(1)
  })
}
