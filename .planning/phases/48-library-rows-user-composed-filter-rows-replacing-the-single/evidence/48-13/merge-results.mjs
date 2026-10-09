#!/usr/bin/env node
// Merge run objects (one JSON file per run) plus a meta file into one results file.
//   node merge-results.mjs <meta.json> <run1.json> [run2.json ...] > results.json
// meta.json carries { ref, reproduced, confirmedCause, introducedBy, ...extra }.
import { readFileSync } from 'node:fs'
const [metaPath, ...runPaths] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
const runs = runPaths.map((p) => JSON.parse(readFileSync(p, 'utf8')))
process.stdout.write(JSON.stringify({ ...meta, runs }) + '\n')
