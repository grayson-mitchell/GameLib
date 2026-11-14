/**
 * Phase 47 D-01..D-03: built-in IsThereAnyDeal key resolution.
 * Precedence: GAMELIB_ITAD_API_KEY (runtime env) > key baked at build time via
 * the esbuild `__ITAD_API_KEY__` define. Returns null when neither is set so
 * the adapter can raise notConfigured. Never logs the key.
 */
declare const __ITAD_API_KEY__: string | undefined

export type ItadBuiltInKey = { key: string; source: 'env' | 'baked' }

// typeof guard: the identifier does not exist under jest / unbundled runs.
function bakedItadKey(): string {
  return typeof __ITAD_API_KEY__ === 'string' ? __ITAD_API_KEY__ : ''
}

export function resolveBuiltInItadKey(
  env: NodeJS.ProcessEnv = process.env
): ItadBuiltInKey | null {
  const fromEnv = (env.GAMELIB_ITAD_API_KEY ?? '').trim()
  if (fromEnv) return { key: fromEnv, source: 'env' }
  const baked = bakedItadKey().trim()
  if (baked) return { key: baked, source: 'baked' }
  return null
}
