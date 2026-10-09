#!/usr/bin/env node
// G-48-11c scroller harness generator (Phase 48 plan 17, evidence only).
//
// Builds ONE standalone page from the shipped stylesheets and focusRowOverflow.ts
// AT A GIVEN GIT REF, so the before-fix and after-fix runs are reproducible from
// commits. Never writes into src/. Output goes to --out (a scratchpad dir).
//
//   node build-scroller-page.mjs --ref <git-ref> --out <dir> [--extended]
//
// The page reproduces the app's scroller: div.App > main.content (the
// overflow-y: auto element, with the global 10px ::-webkit-scrollbar) >
// div.listing > [strip, main region]. page-script.js swaps the main region
// between a grid, FilterZeroResult and list layout and records the strip card
// width in each state. --extended adds states A7-A9 (Task 2).
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const ref = arg('--ref', 'HEAD')
const out = arg('--out')
const extended = process.argv.includes('--extended')
// main.content width: with the 10px bar the listing is 990, the grid content box
// 958 (5 columns); without the bar 968 (still 5 columns).
const CONTENT_WIDTH = 1000
if (!out) {
  console.error('usage: build-scroller-page.mjs --ref <git-ref> --out <dir> [--extended]')
  process.exit(2)
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const repo = git(['rev-parse', '--show-toplevel']).trim()
const shortRef = git(['rev-parse', '--short', ref]).trim()
const show = (p) => git(['show', `${ref}:${p}`])

const LIB = 'src/frontend/screens/Library'
const FILES = {
  app: 'src/frontend/App.css',
  scss: 'src/frontend/index.scss',
  library: `${LIB}/index.css`,
  card: `${LIB}/components/GameCard/index.css`,
  strip: `${LIB}/components/FocusRowStrip/index.css`,
  zero: `${LIB}/components/FilterZeroResult/index.scss`,
  overflow: `${LIB}/components/FocusRowStrip/focusRowOverflow.ts`
}

// The three global ::-webkit-scrollbar* rules, extracted from index.scss. A missing
// one means the instrument is wrong, so exit non-zero.
const scss = show(FILES.scss)
const bars = []
for (const sel of ['::-webkit-scrollbar', '::-webkit-scrollbar-track', '::-webkit-scrollbar-thumb']) {
  const m = scss.match(new RegExp('(^|\\n)' + sel.replace(/[-:]/g, (c) => '\\' + c) + '\\s*\\{[^}]*\\}'))
  if (!m) {
    console.error(`missing ${sel} block in ${FILES.scss} @ ${shortRef}`)
    process.exit(1)
  }
  bars.push(m[0].trim())
}

const work = mkdtempSync(join(tmpdir(), 'scroller-page-'))
try {
  const tsCopy = join(work, 'focusRowOverflow.ts')
  writeFileSync(tsCopy, show(FILES.overflow))
  const req = createRequire(join(repo, 'package.json'))
  const esbuild = req('esbuild')
  const sass = req('sass')
  const bundled = esbuild.buildSync({
    entryPoints: [tsCopy],
    bundle: true,
    format: 'iife',
    globalName: 'FRO',
    write: false,
    target: 'es2019'
  }).outputFiles[0].text
  const zeroCss = sass.compileString(show(FILES.zero)).css

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

  // Custom properties the stylesheets read that affect box size (transcribed as in
  // evidence/48-13), plus the few colours/sizes FilterZeroResult and the list use.
  const TOKENS = [
    ['--text-scale-ratio', '1.2', '_typography.scss:29'],
    ['--text-sm', 'calc(1rem / var(--text-scale-ratio))', '_typography.scss:34'],
    ['--text-md', 'calc(1rem)', '_typography.scss:35'],
    ['--text-lg', 'calc(1rem * var(--text-scale-ratio))', '_typography.scss:36'],
    ['--regular', '400', '_typography.scss:22'],
    ['--semibold', '600', '_typography.scss:24'],
    ['--bold', '700', '_typography.scss:25'],
    ['--space-3xs', '0.25em', '_spacing.scss'],
    ['--space-2xs', '0.375em', '_spacing.scss'],
    ['--space-sm', '0.75em', '_spacing.scss'],
    ['--space-md', '1em', '_spacing.scss'],
    ['--space-lg', '1.5em', '_spacing.scss'],
    ['--space-3xl', '8.5em', '_spacing.scss'],
    ['--space-unit-fixed', '16px', '_spacing.scss'],
    ['--space-xs-fixed', 'calc(0.5 * var(--space-unit-fixed))', '_spacing.scss'],
    ['--space-md-fixed', 'calc(1 * var(--space-unit-fixed))', '_spacing.scss'],
    ['--focus-ring-width', '3px', 'themes.scss:91'],
    ['--body-background', '#222', 'stand-in'],
    ['--text-default', '#eee', 'stand-in'],
    ['--text-secondary', '#aaa', 'stand-in'],
    ['--accent', '#4af', 'stand-in']
  ]
  const rootDecls = TOKENS.map(([k, v]) => `  ${k}: ${v};`).join('\n')

  // App.css minus its two font @imports (remote package URLs that do not exist here).
  const appCss = show(FILES.app).replace(/^@import .*;\s*$/gm, '')

  const cfg = { ref: shortRef, art: solidPng(600, 900), contentWidth: CONTENT_WIDTH }
  const pageScript = readFileSync(join(here, 'page-script.js'), 'utf8')

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<!-- G-48-11c scroller harness. ref=${shortRef}${extended ? ' extended' : ''}.
   Stylesheets: App.css, ${FILES.library}, ${FILES.card}, ${FILES.strip}, ${FILES.zero}
   (sass compileString), plus the three ::-webkit-scrollbar blocks from index.scss.
   Custom properties are transcribed; fonts are the platform default stack. -->
<style>
:root {
  font-size: 16px;
${rootDecls}
}
body { margin: 0; width: 1600px; }
${appCss}
${show(FILES.library)}
${show(FILES.card)}
${show(FILES.strip)}
${zeroCss}
/* index.scss ::-webkit-scrollbar blocks */
${bars.join('\n')}
</style></head>
<body>
<div id="stage"></div>
<script>${bundled}</script>
<script>window.__CFG = ${JSON.stringify(cfg)}; window.__EXTENDED = ${extended}</script>
<script>${pageScript}</script>
</body></html>
`
  mkdirSync(resolve(out), { recursive: true })
  const dest = join(resolve(out), `scroller-${shortRef}.html`)
  writeFileSync(dest, html)
  process.stdout.write(dest + '\n')
} finally {
  rmSync(work, { recursive: true, force: true })
}
