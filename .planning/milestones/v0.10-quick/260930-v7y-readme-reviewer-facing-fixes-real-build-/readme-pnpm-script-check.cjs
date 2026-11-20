#!/usr/bin/env node
/*
 * Purpose: check that every `pnpm <name>` in markdown code spans and fenced blocks is a
 * package.json script or an allowlisted pnpm built-in. Serves quick task 260930-v7y.
 *
 * Usage (cwd at repo root): node readme-pnpm-script-check.cjs [path/to/file.md]   (default README.md)
 *
 * Exits 1 on any missing name, or when no names were found (so it cannot pass vacuously).
 */
const fs = require('fs')
const path = require('path')

const file = path.resolve(process.argv[2] || 'README.md')
const scripts = require(path.resolve('package.json')).scripts || {}
const BUILTINS = new Set(['install', 'exec'])
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

const FENCE = /^\s*(```|~~~)/
const codeChunks = []
let inFence = false

for (const line of lines) {
  if (FENCE.test(line)) {
    inFence = !inFence
    continue
  }
  if (inFence) {
    codeChunks.push(line)
    continue
  }
  for (const m of line.matchAll(/`([^`]+)`/g)) codeChunks.push(m[1])
}

const code = codeChunks.join('\n')
const results = new Map()

// The second word is only captured after `run`, on the same line. Capturing it unconditionally
// would swallow the next line's `pnpm` and hide that command from the check.
for (const m of code.matchAll(/\bpnpm[ \t]+([A-Za-z][\w:.-]*)(?:[ \t]+([A-Za-z][\w:.-]*))?/g)) {
  let name = m[1]
  if (name === 'run') {
    if (!m[2]) continue
    name = m[2]
  }
  if (results.has(name)) continue
  if (scripts[name] !== undefined) results.set(name, `OK ${name}`)
  else if (BUILTINS.has(name)) results.set(name, `OK ${name} (builtin)`)
  else results.set(name, `MISSING ${name}`)
}

let missing = 0
for (const line of results.values()) {
  console.log(line)
  if (line.startsWith('MISSING')) missing++
}
console.log(`checked=${results.size} missing=${missing}`)
process.exit(missing > 0 || results.size === 0 ? 1 : 0)
