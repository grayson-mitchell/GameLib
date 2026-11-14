/**
 * Source gates for the game page's A-prime card (quick 261114-1fi, sketch 008).
 *
 * The left column is one scroll area above a docked footer that holds the
 * action bar and the status line, so Play and the status line can never be
 * pushed down or clipped. There is no jsdom / CSS engine in this jest project:
 * these gates prove the SOURCE says so, not that a browser lays it out so --
 * that is the operator check (plan Task 3).
 *
 * Both files are read through `stripSourceComments`, so a comment that merely
 * names a forbidden pattern cannot satisfy or trip a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const read = (name: string) =>
  stripSourceComments(readFileSync(join(__dirname, '..', name), 'utf8'))

const css = read('index.css')
const tsx = read('index.tsx')

/** Brace-counted body of the block starting at `start`'s first `{`. */
function bodyAt(source: string, start: number): string {
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error('unterminated block')
}

/** Body of the FIRST textual `selector {`. */
function firstBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`selector ${selector} not found`)
  return bodyAt(css, start)
}

/** Bodies of EVERY textual `selector {`. */
function allBlocks(selector: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = css.indexOf(`${selector} {`, from)
    if (start === -1) return out
    out.push(bodyAt(css, start))
    from = start + selector.length
  }
}

/** Depth-0 declarations of `prop` in a block body (nested rules excluded). */
function depthZero(body: string, prop: string): string[] {
  const out: string[] = []
  const pattern = new RegExp(String.raw`^\s*${prop}\s*:\s*([\s\S]+)$`)
  let depth = 0
  let buf = ''
  for (const ch of body) {
    if (ch === '{') {
      depth++
      buf = ''
    } else if (ch === '}') {
      depth--
      buf = ''
    } else if (ch === ';' && depth === 0) {
      const m = pattern.exec(buf)
      if (m && m[1] !== undefined) out.push(m[1].trim().replace(/\s+/g, ' '))
      buf = ''
    } else if (depth === 0) {
      buf += ch
    }
  }
  return out
}

describe('GamePage/index.css: grid and single scroller (D-01, D-02, D-09)', () => {
  it('L1: the grid is 3fr 2fr and no longer names a header area', () => {
    expect(firstBlock('.gameConfigContainer')).toMatch(
      /grid-template-columns:\s*3fr 2fr/
    )
    expect(css).not.toMatch(/grid-template-areas:[^;]*header/)
  })

  it('L2: no container-height queries, sticky, header-row wrappers or hard-coded outline grey', () => {
    expect(css).not.toMatch(/main-info-wrapper/)
    expect(css).not.toMatch(/position:\s*sticky/)
    expect(css).not.toMatch(/topRowWrapper/)
    expect(css).not.toMatch(/topRowWapperInner/)
    expect(css).not.toMatch(/#8a8a8a/i)
  })

  it('L4: only .mainInfoScroll scrolls inside the left card', () => {
    expect(firstBlock('.summary')).not.toMatch(/overflow/)
    const wrappers = allBlocks('.mainInfoWrapper')
    expect(wrappers.length).toBeGreaterThan(0)
    for (const body of wrappers) {
      expect(body).not.toMatch(/overflow-y:\s*auto/)
    }
    expect(firstBlock('.mainInfoScroll')).toMatch(/overflow-y:\s*auto/)
  })

  it('L5: the dock is a non-shrinking row painted with the plain panel token', () => {
    const dock = firstBlock('.actionDock')
    expect(dock).toMatch(/flex:\s*none/)
    expect(depthZero(dock, 'background-color')).toEqual([
      'var(--body-background)'
    ])
  })
})

describe('GamePage/index.css: important-info banner (D-04)', () => {
  it('L3: the banner is a theme-token warning stripe with no hard-coded black', () => {
    const banner = firstBlock('.wikiLink')
    expect(banner).not.toMatch(/black/)
    expect(banner).toMatch(/var\(--status-warning\)/)
    expect(banner).toMatch(/var\(--text-default\)/)
  })
})

describe('GamePage/index.tsx: card structure (D-02, D-03, D-04, D-06)', () => {
  const at = (needle: string): number => {
    const i = tsx.indexOf(needle)
    if (i === -1) throw new Error(`${needle} not found in index.tsx`)
    return i
  }
  const inOrder = (needles: string[]): void => {
    const positions = needles.map(at)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  }

  it('L6: the scroll area precedes the dock, and Back sits on the art band above the body', () => {
    inOrder(['className="mainInfoScroll"', 'className="actionDock"'])
    inOrder([
      'className="gameArtBand"',
      'className="backButton"',
      'className="mainInfoBody"'
    ])
  })

  it('L6: the body reads meta, title, notices, description, time played', () => {
    inOrder([
      'className="mainInfoBody"',
      'className="gameMeta"',
      '<h1',
      '<EngineNotices',
      '{wikiLink}',
      '<Description',
      '<TimeContainer',
      'className="actionDock"'
    ])
  })

  // Operator UAT 2026-11-14: install status reads ABOVE the action bar.
  it('L6: the dock reads status, then primary button, launch select, spacer, gear, dots', () => {
    inOrder([
      'className="actionDock"',
      '<GameStatus',
      'className="buttons"',
      '<MainButton',
      '<LaunchOptionSelector',
      'className="actionDockSpacer"',
      '<SettingsButton',
      '<DotsMenu'
    ])
  })

  it('L6: exactly one DotsMenu and no header row', () => {
    expect(tsx.match(/<DotsMenu/g) ?? []).toHaveLength(1)
    expect(tsx).not.toMatch(/topRowWrapper/)
  })
})
