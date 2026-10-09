#!/usr/bin/env node
// G-48-11b strip harness generator (Phase 48 plan 13, evidence only).
//
// Builds ONE standalone page from the shipped stylesheets and focusRowOverflow.ts
// AT A GIVEN GIT REF, so a before-fix and an after-fix run are reproducible from
// commits. Never writes into src/. Output goes to --out (a scratchpad dir).
//
//   node build-harness.mjs --ref <git-ref> --out <dir> [--override <name>]
//
// Overrides (counterfactuals) are extra stylesheets appended AFTER the real
// ones, never a source edit. See OVERRIDES below.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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
const override = arg('--override', 'none')
if (!out) {
  console.error('usage: build-harness.mjs --ref <git-ref> --out <dir> [--override <name>]')
  process.exit(2)
}

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const repo = git(['rev-parse', '--show-toplevel']).trim()
const shortRef = git(['rev-parse', '--short', ref]).trim()
const show = (p) => git(['show', `${ref}:${p}`])

const LIB = 'src/frontend/screens/Library'
const FILES = {
  library: `${LIB}/index.css`,
  card: `${LIB}/components/GameCard/index.css`,
  strip: `${LIB}/components/FocusRowStrip/index.css`,
  overflow: `${LIB}/components/FocusRowStrip/focusRowOverflow.ts`
}

// Counterfactuals: each removes ONE suspected mechanism, nothing else.
const OVERRIDES = {
  none: '',
  // H1a: the list takes the block width (no intrinsic keyword).
  'cf-no-max-content': '.focusRowTrack .gameList { width: auto; }',
  // H1b: every item's intrinsic contribution is pinned to its flex basis.
  'cf-pin-item-width':
    '.focusRowTrack .gameList > * { width: var(--focus-row-card-width, 156px); }',
  // H1c: items contribute nothing intrinsic (size containment on the inline axis).
  'cf-contain-items':
    '.focusRowTrack .gameList > * { contain: inline-size; }',
  // H1d: the card art stops contributing its natural width.
  'cf-art-no-intrinsic':
    '.focusRowTrack .gameCard .gameImg { width: 0; min-width: 100%; }',
  // NEGATIVE CONTROL (not a fix candidate): drops the flex basis AND width so
  // items size to their content. Proves the harness can see an intrinsic-sizing
  // inflation of the list when one exists.
  'neg-control-content-sized':
    '.focusRowTrack .gameList > * { flex: 0 0 auto; width: auto; }'
}
if (!(override in OVERRIDES)) {
  console.error(`unknown override ${override}; known: ${Object.keys(OVERRIDES).join(', ')}`)
  process.exit(2)
}

// --- bundle focusRowOverflow.ts (the app's own functions) with the repo's esbuild
const work = mkdtempSync(join(tmpdir(), 'strip-harness-'))
try {
  const tsCopy = join(work, 'focusRowOverflow.ts')
  writeFileSync(tsCopy, show(FILES.overflow))
  const requireFromRepo = createRequire(join(repo, 'package.json'))
  const esbuild = requireFromRepo('esbuild')
  const bundled = esbuild.buildSync({
    entryPoints: [tsCopy],
    bundle: true,
    format: 'iife',
    globalName: 'FRO',
    write: false,
    target: 'es2019'
  }).outputFiles[0].text

  // --- solid grey PNG data URIs at a declared natural size (zlib, RGB)
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
    ihdr[8] = 8 // bit depth
    ihdr[9] = 2 // RGB
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
  const svgNoDim = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#555"/></svg>').toString('base64')
  const art = { '1x1': solidPng(1, 1), '600x900': solidPng(600, 900), 'svg-nodim': svgNoDim }

  // --- variants
  const variants = []
  for (const n of [14, 20])
    for (const contentWidth of [958, 462, 198])
      for (const cardState of ['placeholder', 'visible', 'lazy'])
        for (const artSize of ['1x1', '600x900', 'svg-nodim'])
          for (const title of ['short', 'long'])
            variants.push({ n, contentWidth, cardState, artSize, title })

  // --- custom properties the stylesheets read that affect box size
  const TOKENS = [
    [':root font-size', '16px', 'src/frontend/styles/_typography.scss:30'],
    ['--text-scale-ratio', '1.2', 'src/frontend/styles/_typography.scss:29'],
    ['--text-sm', 'calc(1rem / var(--text-scale-ratio))', 'src/frontend/styles/_typography.scss:34'],
    ['--text-md', 'calc(1rem)', 'src/frontend/styles/_typography.scss:35'],
    ['--semibold', '600', 'src/frontend/styles/_typography.scss:24'],
    ['--bold', '700', 'src/frontend/styles/_typography.scss:25'],
    ['--space-3xs', '0.25em', 'src/frontend/styles/_spacing.scss:3'],
    ['--space-2xs', '0.375em', 'src/frontend/styles/_spacing.scss:4'],
    ['--space-md', '1em', 'src/frontend/styles/_spacing.scss:7'],
    ['--space-3xl', '8.5em', 'src/frontend/styles/_spacing.scss:11'],
    ['--space-unit-fixed', '16px', 'src/frontend/styles/_spacing.scss:13'],
    ['--space-xs-fixed', 'calc(0.5 * var(--space-unit-fixed))', 'src/frontend/styles/_spacing.scss:15'],
    ['--space-md-fixed', 'calc(1 * var(--space-unit-fixed))', 'src/frontend/styles/_spacing.scss:17'],
    ['--focus-ring-width', '3px', 'src/frontend/themes.scss:91'],
    ['* { box-sizing }', 'border-box', 'src/frontend/App.css:14-16'],
    ['body { margin }', '0', 'src/frontend/styles/_spacing.scss:34-36']
  ]
  const rootDecls = TOKENS.filter(([k]) => k.startsWith('--'))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  const tokenComment = TOKENS.map(([k, v, s]) => `   ${k} = ${v}  (${s})`).join('\n')

  const css = [
    `/* ${FILES.library} @ ${shortRef} */\n${show(FILES.library)}`,
    `/* ${FILES.card} @ ${shortRef} */\n${show(FILES.card)}`,
    `/* ${FILES.strip} @ ${shortRef} */\n${show(FILES.strip)}`,
    `/* override: ${override} */\n${OVERRIDES[override]}`
  ].join('\n')

  const cfg = { ref: shortRef, override, art, variants }
  const pageScript = readFileSync(join(here, 'page-script.js'), 'utf8')

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<!-- G-48-11b strip harness. ref=${shortRef} override=${override}
   Custom properties defined below, with their source:
${tokenComment}
   Fonts: the platform default font stack (the app's webfonts are not loaded), so the
   long-title variants measure intrinsic title width with a fallback face. -->
<style>
:root {
  font-size: 16px;
${rootDecls}
}
* { box-sizing: border-box; }
body { margin: 0; width: 1600px; }
${css}
</style></head>
<body>
<div id="stage"></div>
<pre id="out"></pre>
<script>${bundled}</script>
<script>window.__CFG = ${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
<script>${pageScript}</script>
</body></html>
`
  mkdirSync(resolve(out), { recursive: true })
  const dest = join(resolve(out), `strip-harness-${shortRef}.html`)
  writeFileSync(dest, html)
  process.stdout.write(dest + '\n')
} finally {
  rmSync(work, { recursive: true, force: true })
}
