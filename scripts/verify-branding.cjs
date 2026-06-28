/**
 * verify-branding.cjs — GameLib identity smoke check
 *
 * Asserts all BRAND-01 identity facts across package.json, electron-builder.yml,
 * translation.json, index.html, and locked-untouchable identifiers.
 *
 * Usage: node scripts/verify-branding.cjs
 * Exit 0 = all checks pass (GREEN), Exit 1 = at least one check failed (RED).
 */

'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

let passed = 0
let failed = 0

function check(name, result) {
  if (result) {
    console.log(`  PASS  ${name}`)
    passed++
  } else {
    console.log(`  FAIL  ${name}`)
    failed++
  }
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
const pkg = require(path.join(ROOT, 'package.json'))
const translation = require(path.join(ROOT, 'public', 'locales', 'en', 'translation.json'))
const builderYml = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8')
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')

// ---------------------------------------------------------------------------
// Section 1: Package / distribution identity
// ---------------------------------------------------------------------------
console.log('\n--- Package / distribution identity ---')

check('package.json name === "gamelib"', pkg.name === 'gamelib')
check('package.json author.name === "GameLib"', pkg.author && pkg.author.name === 'GameLib')
check('package.json description includes "Steam"', typeof pkg.description === 'string' && pkg.description.includes('Steam'))
check('electron-builder.yml appId: com.gamelib.app', builderYml.includes('appId: com.gamelib.app'))
// Use regex to match standalone desktop entry line (avoids false-positive on "productName: GameLib")
check('electron-builder.yml Linux desktop Name: GameLib', /^\s+Name: GameLib\s*$/m.test(builderYml))

// ---------------------------------------------------------------------------
// Section 2: Display string identity (i18n values)
// ---------------------------------------------------------------------------
console.log('\n--- Display string identity ---')

const infoHeroicVersion =
  translation.info && translation.info.heroic && translation.info.heroic.version
check('translation.json info.heroic.version === "GameLib Version"', infoHeroicVersion === 'GameLib Version')

const heroicVersionSetting =
  translation.settings &&
  translation.settings.systemInformation &&
  translation.settings.systemInformation.heroicVersion
check(
  'translation.json settings.systemInformation.heroicVersion starts with "GameLib:"',
  typeof heroicVersionSetting === 'string' && heroicVersionSetting.startsWith('GameLib:')
)

// ---------------------------------------------------------------------------
// Section 3: Already-correct surfaces (must remain untouched)
// ---------------------------------------------------------------------------
console.log('\n--- Already-correct surfaces (regression guard) ---')

check('index.html contains <title>GameLib</title>', indexHtml.includes('<title>GameLib</title>'))

// ---------------------------------------------------------------------------
// Section 4: Already-correct surfaces extended (Task 3 additions)
// ---------------------------------------------------------------------------
console.log('\n--- Locked-untouchable identifiers (over-reach guard) ---')

check(
  'electron-builder.yml productName: GameLib (already correct)',
  builderYml.includes('productName: GameLib')
)

const utilsTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'utils.ts'), 'utf8')
check(
  "src/backend/utils.ts showAboutWindow applicationName: 'GameLib'",
  utilsTs.includes("applicationName: 'GameLib'")
)

const pathsTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'constants', 'paths.ts'), 'utf8')
check(
  "src/backend/constants/paths.ts appFolder join(configFolder, 'heroic') UNCHANGED",
  pathsTs.includes("join(configFolder, 'heroic')")
)

check(
  'electron-builder.yml protocols block still registers heroic scheme',
  builderYml.includes('schemes:') && builderYml.includes('heroic')
)

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.log('\nBranding verification FAILED — see FAIL lines above.')
  process.exit(1)
} else {
  console.log('\nBranding verification PASSED — GameLib identity confirmed.')
  process.exit(0)
}
