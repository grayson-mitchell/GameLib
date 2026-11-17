/**
 * Built-in theme token generator (Phase 64, D-10/D-11).
 *
 * Theme selectors only match `<body>` (`body.<key> {`), so a non-active
 * theme's values cannot be read at runtime. The gallery thumbnails and
 * Duplicate both need them as data: this script flattens each built-in theme
 * in `defaultThemes` to literal colours and writes
 * `src/frontend/customThemes/builtinTokens.generated.json`.
 *
 * Run with `pnpm gen:theme-tokens`. The generated file is COMMITTED;
 * `pnpm gen:theme-tokens --check` (and the drift test in
 * `customThemes/__tests__/builtinTokens.test.ts`) regenerates in memory and
 * fails on any difference. No child process is spawned.
 *
 * Imports below are relative on purpose: `meta/runTs.cjs` bundling does not
 * honour tsconfig baseUrl.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from '../src/backend/testUtils/stripSourceComments'
import { defaultThemes } from '../src/frontend/components/UI/ThemeSelector/themeLabels'
import { flattenBuiltinTheme } from '../src/frontend/customThemes/flatten'

const THEMES_REL = 'src/frontend/themes.scss'
const COLORS_REL = 'src/frontend/styles/_colors.scss'
const OUTPUT_REL = 'src/frontend/customThemes/builtinTokens.generated.json'
const REGEN_CMD = 'pnpm gen:theme-tokens'

function buildJson(): string {
  const read = (rel: string) =>
    stripSourceComments(readFileSync(join(process.cwd(), rel), 'utf8'))
  const themesScss = read(THEMES_REL)
  const colorsScss = read(COLORS_REL)
  const data: Record<string, Record<string, string>> = {}
  for (const key of Object.keys(defaultThemes)) {
    data[key] = flattenBuiltinTheme({ themesScss, colorsScss, key })
  }
  return JSON.stringify(data, null, 2) + '\n'
}

function main(): void {
  const out = join(process.cwd(), OUTPUT_REL)
  const next = buildJson()
  if (process.argv.slice(2).includes('--check')) {
    let current = ''
    try {
      current = readFileSync(out, 'utf8')
    } catch {
      // missing counts as stale
    }
    if (current !== next) {
      console.error(
        `::error::builtinTokens.generated.json is stale: run ${REGEN_CMD}`
      )
      process.exit(1)
    }
    console.log('builtinTokens.generated.json is up to date')
    return
  }
  writeFileSync(out, next)
  console.log(`wrote ${OUTPUT_REL}`)
}

// Guarded so the jest suite can import this module without running the CLI.
if (!process.env.JEST_WORKER_ID) main()
