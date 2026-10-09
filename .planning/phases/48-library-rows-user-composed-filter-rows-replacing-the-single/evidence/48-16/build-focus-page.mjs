#!/usr/bin/env node
// G-48-12a focus-ring page generator (Phase 48 plan 16, evidence only).
//
// Builds standalone pages from the SHIPPED stylesheets (and, when it exists,
// the shipped src/frontend/helpers/inputModality.ts) AT A GIVEN GIT REF, so a
// before-fix and an after-fix run are reproducible from commits. Never writes
// into src/, and src/ never imports this file.
//
//   node build-focus-page.mjs --ref <git-ref> --out <dir> --override <name>
//
// Writes <dir>/focus-grid.html, <dir>/focus-list.html and <dir>/meta.json
// ({ ref, override, tracker }), then prints <dir> on stdout.
//
// Overrides are applied to the HARNESS COPY of the stylesheet only:
//   none                     the stylesheets exactly as committed
//   cf-no-stale-suppression  delete every rule whose selector contains
//                            `.listing:hover .gameCard:focus-within:not(:hover)`;
//                            asserts exactly 2 were removed (ring + scale)
//   cf-focus-visible         (F1, plan 48-16 Task 2) every selector containing
//                            `.listing:hover` and `:focus-within:not(:hover)`
//                            gains `:not(:has(:focus-visible))`; asserts 3
//                            selectors matched; the keyboard-mode tracker is
//                            NOT installed
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const ref = arg('--ref', 'HEAD')
const out = arg('--out')
const override = arg('--override', 'none')
const OVERRIDES = ['none', 'cf-no-stale-suppression', 'cf-focus-visible']
if (!out || !OVERRIDES.includes(override)) {
  console.error(
    'usage: build-focus-page.mjs --ref <git-ref> --out <dir> --override ' +
      OVERRIDES.join('|')
  )
  process.exit(2)
}

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const repo = git(['rev-parse', '--show-toplevel']).trim()
const shortRef = git(['rev-parse', '--short', ref]).trim()
const show = (p) => git(['show', `${ref}:${p}`])
const tryShow = (p) => {
  try {
    return execFileSync('git', ['show', `${ref}:${p}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return null
  }
}

const LIB = 'src/frontend/screens/Library'
const FILES = {
  library: `${LIB}/index.css`,
  card: `${LIB}/components/GameCard/index.css`,
  strip: `${LIB}/components/FocusRowStrip/index.css`,
  themes: 'src/frontend/themes.scss',
  spacing: 'src/frontend/styles/_spacing.scss',
  tracker: 'src/frontend/helpers/inputModality.ts'
}

// --- tokens: transcribed from the ref's themes.scss, never retyped ----------
const themes = show(FILES.themes)
const tokenDecl = (name) => {
  const m = themes.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!m) {
    console.error(`token ${name} not found in ${FILES.themes} @ ${shortRef}`)
    process.exit(3)
  }
  return `${name}: ${m[1].replace(/\s+/g, ' ').trim()};`
}
const focusTokens = [
  '--focus-ring-color',
  '--focus-ring-halo',
  '--focus-ring-width'
].map(tokenDecl)
// --focus-ring-fill is a multi-line color-mix(); read it up to its `;`
const fillM = themes.match(/--focus-ring-fill:\s*([\s\S]*?);/)
if (!fillM) {
  console.error('token --focus-ring-fill not found')
  process.exit(3)
}
focusTokens.push(`--focus-ring-fill: ${fillM[1].replace(/\s+/g, ' ').trim()};`)

const spacing = show(FILES.spacing)
const spacingTokens = [
  '--space-3xs',
  '--space-2xs',
  '--space-md',
  '--space-3xl',
  '--space-unit-fixed',
  '--space-xs-fixed',
  '--space-2xs-fixed',
  '--space-md-fixed'
].map((name) => {
  const m = spacing.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!m) {
    console.error(`token ${name} not found in ${FILES.spacing}`)
    process.exit(3)
  }
  return `${name}: ${m[1].trim()};`
})

// --- stylesheets + override (harness copy only) ----------------------------
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s) => s.replace(/\s+/g, ' ').trim()
let cardCss = show(FILES.card)
let overrideNote = 'none'
if (override !== 'none') {
  cardCss = stripComments(cardCss)
  const RULE = /([^{}]+)\{([^{}]*)\}/g
  if (override === 'cf-no-stale-suppression') {
    let removed = 0
    cardCss = cardCss.replace(RULE, (all, sel) => {
      if (norm(sel).includes('.listing:hover .gameCard:focus-within:not(:hover)')) {
        removed++
        return ''
      }
      return all
    })
    if (removed !== 2) {
      console.error(`cf-no-stale-suppression removed ${removed} rules, expected 2`)
      process.exit(4)
    }
    overrideNote = 'removed 2 .gameCard stale-suppression rules'
  } else {
    let matched = 0
    cardCss = cardCss.replace(RULE, (all, sel, body) => {
      const n = norm(sel)
      if (n.includes('.listing:hover') && n.includes(':focus-within:not(:hover)')) {
        matched++
        return `${n}:not(:has(:focus-visible)) {${body}}`
      }
      return all
    })
    if (matched !== 3) {
      console.error(`cf-focus-visible matched ${matched} selectors, expected 3`)
      process.exit(4)
    }
    overrideNote = 'appended :not(:has(:focus-visible)) to 3 selectors'
  }
}

const css = [
  `/* ${FILES.library} @ ${shortRef} */\n${show(FILES.library)}`,
  `/* ${FILES.card} @ ${shortRef} (override: ${override}) */\n${cardCss}`,
  `/* ${FILES.strip} @ ${shortRef} */\n${show(FILES.strip)}`,
  // Settles computed colours; changes no selector matching.
  `/* harness */\n*, *::before, *::after { transition: none !important; animation: none !important; }\n` +
    `.harnessSidebar { width: 200px; flex: 0 0 200px; background: #222; padding: 12px; min-height: 100vh; }\n` +
    `.harnessRoot { display: flex; width: 1600px; }\n`
].join('\n')

// --- tracker: the app's own module, bundled as an IIFE ---------------------
let tracker = 'absent'
let trackerScript = ''
const trackerSrc = tryShow(FILES.tracker)
if (override === 'cf-focus-visible') {
  tracker = 'disabled'
} else if (trackerSrc !== null) {
  const esbuild = createRequire(join(repo, 'package.json'))('esbuild')
  const bundled = esbuild.transformSync(trackerSrc, {
    loader: 'ts',
    format: 'iife',
    globalName: '__IM',
    target: 'es2019'
  }).code
  trackerScript =
    `<script>${bundled}</script>\n` +
    `<script>__IM.installKeyboardNavTracking()</script>`
  tracker = 'present'
}

// --- solid grey art ---------------------------------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const solidPng = (w, h, grey = 0x55) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, grey)])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return (
    'data:image/png;base64,' +
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0))
    ]).toString('base64')
  )
}
const ART = solidPng(173, 275)

// --- DOM: the visible branch of GameCard/index.tsx, same shape as 48-13 -----
const card = (i) => `
        <div><div><div class="gameCard" data-i="${i}">
          <a href="#fx${i}"><img class="gameImg" alt="cover" src="${ART}"><span class="gameTitle"><span>Fixture ${i}</span></span></a>
          <div class="icons"><button class="svg-button" type="button">a</button><button class="svg-button" type="button">b</button></div>
        </div></div></div>`
const row = (i) => `
        <div class="gameListItem" data-i="${i}">
          <a href="#fx${i}"><span class="gameTitle"><span>Fixture ${i}</span></span><span class="gameListInfo">1.0 GB</span><span class="runner">Other</span></a>
          <div class="icons"><button class="svg-button" type="button">a</button></div>
        </div>`
const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('')

const page = (layout) => `<!doctype html>
<html><head><meta charset="utf-8">
<!-- G-48-12a focus-ring ${layout} page. ref=${shortRef} override=${override} (${overrideNote}) tracker=${tracker}.
     Tokens transcribed from ${FILES.themes} / ${FILES.spacing} at the ref. -->
<style>
:root { font-size: 16px; }
* { box-sizing: border-box; }
body { margin: 0; width: 1600px; background: #111; color: #ddd;
  ${focusTokens.join('\n  ')}
  ${spacingTokens.join('\n  ')}
}
${css}
</style></head>
<body>
<div class="harnessRoot">
  <nav class="harnessSidebar"><button id="sidebarBtn" type="button">Sidebar</button></nav>
  <div class="listing">
    <h3 class="libraryHeader">Library</h3>
    <div class="harnessChips">chips</div>${
      layout === 'grid'
        ? `
    <div class="focusRowStrip"><div class="focusRowStrip__viewport"><div class="focusRowTrack">
      <div class="gameList" id="stripList">${seq(5, card)}
      </div></div></div></div>
    <div class="gameList" id="mainList">${seq(10, (i) => card(i + 5))}
    </div>`
        : `
    <div class="gameListLayout" id="mainList">${seq(10, row)}
    </div>`
    }
  </div>
</div>
${trackerScript}
</body></html>
`

mkdirSync(resolve(out), { recursive: true })
writeFileSync(join(resolve(out), 'focus-grid.html'), page('grid'))
writeFileSync(join(resolve(out), 'focus-list.html'), page('list'))
writeFileSync(
  join(resolve(out), 'meta.json'),
  JSON.stringify({ ref: shortRef, override, tracker })
)
process.stdout.write(resolve(out) + '\n')
