#!/usr/bin/env node
// Phase 38 `38-S12` arming instrument, independent of the dialog.
// Read-only replica of `getSteamLibraries()` (src/backend/utils.ts:671-692) and
// `listSteamLibraryTargets()` (src/backend/storeManagers/steam/installLocation.ts:84-91).
// Prints paths only. Never reads or prints anything else from config.json or ~/.steam.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { parse } = require('@node-steam/vdf')

const configPath = path.join(os.homedir(), '.config', 'GameLib', 'config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const defaultSteamPath = config?.defaultSettings?.defaultSteamPath

if (defaultSteamPath === undefined) {
  console.log(
    'FAITHFUL REPLICA IMPOSSIBLE: defaultSettings.defaultSteamPath is absent (the runtime default is not read by this replica)'
  )
  process.exit(2)
}

const steamPath = defaultSteamPath.replaceAll("'", '')
const vdfFile = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')

const sentinel = '/usr/share/steam'
let candidates = [sentinel]
let branch

if (fs.existsSync(vdfFile)) {
  const json = parse(fs.readFileSync(vdfFile, 'utf-8'))
  if (!json.libraryfolders) {
    branch = 'UNFILTERED EARLY RETURN: vdf parsed but has no libraryfolders key'
  } else {
    const folders = Object.values(json.libraryfolders)
    candidates = [sentinel, ...folders.map((f) => f.path)]
    branch = 'PARSED: vdf has libraryfolders, candidates filtered by existsSync'
  }
} else {
  branch = 'UNFILTERED EARLY RETURN: vdf file does not exist'
}

console.log(`BRANCH: ${branch}`)

candidates.forEach((p, i) => {
  console.log(`${i} ${fs.existsSync(p) ? 'EXISTS' : 'MISSING'} ${p}`)
})

let filtered = candidates
if (branch.startsWith('PARSED')) {
  filtered = candidates.filter((p) => fs.existsSync(p))
} else {
  // Unfiltered early return: the sentinel alone, regardless of whether it exists.
  filtered = candidates
}

filtered.forEach((lib, index) => {
  const steamappsDir = path.join(lib, 'steamapps')
  let access = 'fail'
  try {
    fs.accessSync(steamappsDir)
    access = 'ok'
  } catch {
    access = 'fail'
  }
  const isPrimary = index === 0
  console.log(`PROBE ${steamappsDir} access=${access} primary=${isPrimary}`)
})

console.log(`FLATPAK_ID=${process.env.FLATPAK_ID ? 'set' : 'unset'}`)
console.log(`COUNT=${filtered.length}`)
process.exit(0)
