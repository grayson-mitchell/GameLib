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

// Read a file as UTF-8, but record a clean FAIL (instead of throwing an
// uncaught stack trace) if the file is missing — a missing surface should
// register as a branding failure, not crash the gate. (WR-03)
function readText(absPath, label) {
  try {
    return fs.readFileSync(absPath, 'utf8')
  } catch {
    check(`readable: ${label || absPath}`, false)
    return ''
  }
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
const pkg = require(path.join(ROOT, 'package.json'))
const translation = require(
  path.join(ROOT, 'public', 'locales', 'en', 'translation.json')
)
const builderYml = readText(
  path.join(ROOT, 'electron-builder.yml'),
  'electron-builder.yml'
)
const indexHtml = readText(path.join(ROOT, 'index.html'), 'index.html')

// ---------------------------------------------------------------------------
// Section 1: Package / distribution identity
// ---------------------------------------------------------------------------
console.log('\n--- Package / distribution identity ---')

check('package.json name === "gamelib"', pkg.name === 'gamelib')
check(
  'package.json author.name === "GameLib"',
  pkg.author && pkg.author.name === 'GameLib'
)
check(
  'package.json description includes "Steam"',
  typeof pkg.description === 'string' && pkg.description.includes('Steam')
)
check(
  'electron-builder.yml appId: com.gamelib.app',
  builderYml.includes('appId: com.gamelib.app')
)
// Use regex to match standalone desktop entry line (avoids false-positive on "productName: GameLib")
check(
  'electron-builder.yml Linux desktop Name: GameLib',
  /^\s+Name: GameLib\s*$/m.test(builderYml)
)

// ---------------------------------------------------------------------------
// Section 2: Display string identity (i18n values)
// ---------------------------------------------------------------------------
console.log('\n--- Display string identity ---')

const infoHeroicVersion =
  translation.info && translation.info.heroic && translation.info.heroic.version
check(
  'translation.json info.heroic.version === "GameLib Version"',
  infoHeroicVersion === 'GameLib Version'
)

const heroicVersionSetting =
  translation.settings &&
  translation.settings.systemInformation &&
  translation.settings.systemInformation.heroicVersion
check(
  'translation.json settings.systemInformation.heroicVersion starts with "GameLib:"',
  typeof heroicVersionSetting === 'string' &&
    heroicVersionSetting.startsWith('GameLib:')
)

// ---------------------------------------------------------------------------
// Section 3: Already-correct surfaces (must remain untouched)
// ---------------------------------------------------------------------------
console.log('\n--- Already-correct surfaces (regression guard) ---')

check(
  'index.html contains <title>GameLib</title>',
  indexHtml.includes('<title>GameLib</title>')
)

// ---------------------------------------------------------------------------
// Section 4: Already-correct surfaces extended (Task 3 additions)
// ---------------------------------------------------------------------------
console.log('\n--- Locked-untouchable identifiers (over-reach guard) ---')

check(
  'electron-builder.yml productName: GameLib (already correct)',
  builderYml.includes('productName: GameLib')
)

const utilsTs = readText(
  path.join(ROOT, 'src', 'backend', 'utils.ts'),
  'src/backend/utils.ts'
)
check(
  "src/backend/utils.ts showAboutWindow applicationName: 'GameLib'",
  utilsTs.includes("applicationName: 'GameLib'")
)

const pathsTs = readText(
  path.join(ROOT, 'src', 'backend', 'constants', 'paths.ts'),
  'src/backend/constants/paths.ts'
)
check(
  "src/backend/constants/paths.ts appFolder join(configFolder, 'heroic') UNCHANGED",
  pathsTs.includes("join(configFolder, 'heroic')")
)

check(
  'electron-builder.yml protocols block registers gamelib scheme',
  builderYml.includes('schemes:') && builderYml.includes('gamelib')
)

// ---------------------------------------------------------------------------
// Section 5: Phase 5 surfaces (BRAND-02, BRAND-03, BRAND-04, APP-01)
// ---------------------------------------------------------------------------
console.log(
  '\n--- Phase 5: tray, log paths, config paths, presence, changelog ---'
)

const trayTs = readText(
  path.join(ROOT, 'src', 'backend', 'tray_icon', 'tray_icon.ts'),
  'src/backend/tray_icon/tray_icon.ts'
)
check(
  "tray_icon.ts setToolTip('GameLib')",
  trayTs.includes("setToolTip('GameLib')")
)
check(
  "tray_icon.ts no setToolTip('Heroic')",
  !trayTs.includes("setToolTip('Heroic')")
)

const loggerPathsTs = readText(
  path.join(ROOT, 'src', 'backend', 'logger', 'paths.ts'),
  'src/backend/logger/paths.ts'
)
check(
  "logger/paths.ts no 'Heroic' in path strings",
  !loggerPathsTs.includes("'Heroic'") &&
    !loggerPathsTs.includes("'Heroic Games Launcher'")
)

check(
  "constants/paths.ts heroicInstallPath uses 'GameLib'",
  pathsTs.includes("join(userHome, 'Games', 'GameLib')")
)
check(
  "constants/paths.ts no 'Games', 'Heroic' path",
  !pathsTs.includes("'Games', 'Heroic'")
)

const configTs = readText(
  path.join(ROOT, 'src', 'backend', 'config.ts'),
  'src/backend/config.ts'
)
check(
  "config.ts wineCrossoverBottle default is 'GameLib'",
  configTs.includes("wineCrossoverBottle: 'GameLib'")
)

const presenceTs = readText(
  path.join(ROOT, 'src', 'backend', 'storeManagers', 'gog', 'presence.ts'),
  'src/backend/storeManagers/gog/presence.ts'
)
check(
  "presence.ts application_type is 'GameLib' not 'Heroic Games Launcher'",
  !presenceTs.includes("'Heroic Games Launcher'")
)

check("utils.ts no 'via Heroic on'", !utilsTs.includes("'via Heroic on '"))
check(
  'utils.ts Discord versionText uses GameLib',
  utilsTs.includes('`GameLib ${app.getVersion()}`')
)

check(
  "utils.ts no D-05 Rosetta 'Heroic will maybe not work probably!'",
  !utilsTs.includes("'Heroic will maybe not work probably!'")
)
check(
  "utils.ts no D-05 Rosetta 'restart Heroic.'",
  !utilsTs.includes('restart Heroic.')
)
check(
  'utils.ts no D-05 writeConfig "? \'Heroic\' :"',
  !utilsTs.includes("? 'Heroic' :")
)

const changelogPath = path.join(ROOT, 'public', 'changelog.json')
check('public/changelog.json exists', fs.existsSync(changelogPath))
check(
  'getCurrentChangelog reads local file not GitHub API',
  utilsTs.includes('readFileSync') && !utilsTs.includes('GITHUB_API/tags/')
)

// About panel website + updater changelog link must point at GameLib, not Heroic
check(
  'utils.ts About website is GameLib repo',
  utilsTs.includes("website: 'https://github.com/grayson-mitchell/GameLib'")
)
check(
  'utils.ts About website not heroicgameslauncher.com',
  !utilsTs.includes('heroicgameslauncher.com')
)

const updaterTs = readText(
  path.join(ROOT, 'src', 'backend', 'updater.ts'),
  'src/backend/updater.ts'
)
check(
  'updater.ts changelog link points at GameLib releases',
  updaterTs.includes('grayson-mitchell/GameLib/releases')
)
check(
  'updater.ts changelog link not Heroic releases',
  !updaterTs.includes('Heroic-Games-Launcher/HeroicGamesLauncher/releases')
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
