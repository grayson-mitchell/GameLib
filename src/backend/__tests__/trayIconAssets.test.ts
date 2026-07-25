/**
 * Phase 34.1 gap-closure (GAP-1 / D-11): asserts the dark and light tray icon PNG assets
 * are actually byte-distinct.
 *
 * Every existing tray-icon-swap test (appShellFlows.test.ts:697,708, tauriShellSource.test.ts:
 * 103-104, tray_icon.test.ts:277,282) asserts on the SELECTOR -- the boolean flag, the
 * include_bytes! path string, the file path returned by getIcon() -- never on the PAYLOAD.
 * Each proves the two branches are distinguished; none proves the two images differ.
 *
 * As of this writing `public/icon-dark.png` and `public/icon-light.png` are byte-identical
 * (md5 e754404b2dfd8cb4181a20555175bb47, both 2129 bytes), and the `@2x`/`@3x` pairs are
 * likewise identical. This is a tracked artwork defect
 * (.planning/todos/pending/tray-dark-light-icons-are-identical.md, `needs: artwork`), NOT a
 * code defect, and fixing the PNGs is out of scope for this gap-closure pass.
 *
 * This test is therefore written honestly against the CURRENT (defective) assets and marked
 * `it.failing` so it reports as a passing "known failure" today, while still gating the day
 * someone replaces the artwork: flip every `it.failing` below to `it` once the todo lands,
 * and the suite will tell you immediately if the fix didn't actually change the bytes.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC_DIR = join(__dirname, '..', '..', '..', 'public')

function loadAsset(filename: string): Buffer {
  return readFileSync(join(PUBLIC_DIR, filename))
}

describe('tray icon dark/light asset distinctness (REQ-34.1-07, GAP-1 / D-11)', () => {
  // KNOWN FAILING as of 2026-07-25 -- see
  // .planning/todos/pending/tray-dark-light-icons-are-identical.md ("needs: artwork").
  // The dark and light PNGs are byte-identical, making the tray-color setting a visual
  // no-op. Flip `it.failing` -> `it` once the artwork is replaced; if this then fails,
  // the artwork fix didn't actually change the bytes.
  it.failing('icon-dark.png and icon-light.png are NOT byte-identical', () => {
    const dark = loadAsset('icon-dark.png')
    const light = loadAsset('icon-light.png')
    expect(dark.equals(light)).toBe(false)
  })

  it.failing('icon-dark@2x.png and icon-light@2x.png are NOT byte-identical', () => {
    const darkPath = join(PUBLIC_DIR, 'icon-dark@2x.png')
    const lightPath = join(PUBLIC_DIR, 'icon-light@2x.png')
    // Guard: only assert on these variants if they actually exist on disk.
    expect(existsSync(darkPath)).toBe(true)
    expect(existsSync(lightPath)).toBe(true)
    const dark = readFileSync(darkPath)
    const light = readFileSync(lightPath)
    expect(dark.equals(light)).toBe(false)
  })

  it.failing('icon-dark@3x.png and icon-light@3x.png are NOT byte-identical', () => {
    const darkPath = join(PUBLIC_DIR, 'icon-dark@3x.png')
    const lightPath = join(PUBLIC_DIR, 'icon-light@3x.png')
    expect(existsSync(darkPath)).toBe(true)
    expect(existsSync(lightPath)).toBe(true)
    const dark = readFileSync(darkPath)
    const light = readFileSync(lightPath)
    expect(dark.equals(light)).toBe(false)
  })
})
