// Scores a uia_dump.ps1 capture against the two content-light catalogue strings (38-S16/38-S14,
// sitting 13). Exact string equality only -- never "looks the same".
// usage: node uia_score.cjs <uia.json> <expected: off|on>
const fs = require('fs')
const path = require('path')
const [file, expectedBranch] = process.argv.slice(2)
const cat = require(path.resolve(__dirname, '../../../public/locales/en/gamelib.json'))
const off = cat.steam.install.contentLightNotice
const on = cat.steam.install.contentLightSingleLibraryNotice
const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
const nodes = [].concat(JSON.parse(raw).nodes)

const eqOff = nodes.filter((n) => n.name === off)
const eqOn = nodes.filter((n) => n.name === on)
// Substring hits catch a notice split across nodes, or wrapped in a larger name.
const subOff = nodes.filter((n) => n.name && n.name !== off && n.name.includes(off.slice(0, 40)))
const subOn = nodes.filter((n) => n.name && n.name !== on && n.name.includes(on.slice(0, 40)))
console.log(`CATALOG_OFF_LEN=${off.length} CATALOG_ON_LEN=${on.length}`)
console.log(`EXACT_OFF=${eqOff.length} EXACT_ON=${eqOn.length} PARTIAL_OFF=${subOff.length} PARTIAL_ON=${subOn.length}`)

// Where the notice sits: the notice node and its ancestors (the depth walk is pre-order).
const hit = eqOff[0] || eqOn[0]
if (hit) {
  const i = nodes.indexOf(hit)
  const chain = []
  let want = hit.d - 1
  for (let j = i - 1; j >= 0 && want >= 0; j--) {
    if (nodes[j].d === want) {
      chain.push(nodes[j])
      want--
    }
  }
  console.log(`NOTICE type=${hit.type} cls=${JSON.stringify(hit.cls)} rect=${hit.x},${hit.y} ${hit.w}x${hit.h}`)
  chain.slice(0, 8).forEach((a) =>
    console.log(`  ANCESTOR d=${a.d} type=${a.type} cls=${JSON.stringify(a.cls)} name=${JSON.stringify((a.name || '').slice(0, 60))} rect=${a.x},${a.y} ${a.w}x${a.h}`)
  )
  // Everything drawn inside the dialog's box: find the nearest ancestor that looks like the dialog.
  const dlg = chain.find((a) => /dialog/i.test(a.type) || /dialog|modal/i.test(a.cls || '')) || chain[chain.length - 1]
  if (dlg && dlg.w) {
    const inside = nodes.filter(
      (n) => n.name && n.x != null && n.x >= dlg.x && n.y >= dlg.y && n.x + n.w <= dlg.x + dlg.w + 1 && n.y + n.h <= dlg.y + dlg.h + 1 && !n.off
    )
    console.log(`DIALOG type=${dlg.type} cls=${JSON.stringify(dlg.cls)} rect=${dlg.x},${dlg.y} ${dlg.w}x${dlg.h}`)
    const seen = new Set()
    for (const n of inside) {
      const k = `${n.type}|${n.name}`
      if (seen.has(k)) continue
      seen.add(k)
      console.log(`  IN_DIALOG type=${n.type} cls=${JSON.stringify(n.cls)} name=${JSON.stringify(n.name.slice(0, 90))}`)
    }
  }
}
const pass =
  expectedBranch === 'off'
    ? eqOff.length >= 1 && eqOn.length === 0 && subOn.length === 0
    : eqOn.length >= 1 && eqOff.length === 0 && subOff.length === 0
console.log(`COPY_${expectedBranch.toUpperCase()}=${pass ? 'PASS' : 'FAIL'}`)
