/**
 * Dev sidecar bundle (`pnpm build:sidecar`). It carries no ITAD key define: the store search is Rust's
 * since Phase 86 (86-17, D-25), and the shell bakes the key at compile time (`option_env!`), so the
 * sidecar bundle never holds a key.
 *
 * Spawns esbuild only (never the sidecar), so the fake-HOME convention does
 * not apply here.
 */
import { resolveEsbuildCli, spawnArgv } from './esbuildWorkerBundleShared'

export function buildSidecarArgv(
  platform: NodeJS.Platform = process.platform
): {
  command: string
  args: string[]
} {
  const esbuildCli = resolveEsbuildCli()
  const flags = [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--packages=external',
    '--outfile=build/main/sidecar.js',
    'src/sidecar/index.ts'
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
    // stderr only, never the argv.
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
