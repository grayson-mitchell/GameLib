#!/usr/bin/env node
/*
 * Purpose: check that every internal #anchor link in a markdown file resolves to a
 * GitHub-style heading slug. Serves quick task 260930-v7y.
 *
 * Usage (cwd at repo root): node readme-anchor-check.cjs [path/to/file.md]   (default README.md)
 *
 * Exits 1 on any dead link, or when no internal links were found (so it cannot pass vacuously).
 */
const fs = require('fs')
const path = require('path')

const file = path.resolve(process.argv[2] || 'README.md')
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

const FENCE = /^\s*(```|~~~)/
const headings = []
const targets = new Set()
let inFence = false

for (const line of lines) {
  if (FENCE.test(line)) {
    inFence = !inFence
    continue
  }
  if (inFence) continue

  if (/^#{1,6}\s+/.test(line)) {
    headings.push(line.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, ''))
  }

  for (const m of line.matchAll(/\]\(#([^)\s]*)\)/g)) targets.add(m[1])
  for (const m of line.matchAll(/href="#([^"]*)"/g)) targets.add(m[1])
}

function slug(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-_]/gu, '')
    .replace(/ /g, '-')
}

const seen = new Map()
const slugs = new Set()
for (const h of headings) {
  const base = slug(h)
  const n = seen.get(base) || 0
  seen.set(base, n + 1)
  slugs.add(n === 0 ? base : `${base}-${n}`)
}

let dead = 0
for (const raw of targets) {
  let t = raw
  try {
    t = decodeURIComponent(raw)
  } catch {
    /* keep raw */
  }
  if (slugs.has(t)) {
    console.log(`OK #${t}`)
  } else {
    console.log(`DEAD #${t}`)
    dead++
  }
}
console.log(`headings=${headings.length} links=${targets.size} dead=${dead}`)
process.exit(dead > 0 || targets.size === 0 ? 1 : 0)
