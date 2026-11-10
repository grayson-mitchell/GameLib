/**
 * Launch notice theme-token gate (quick 261110-nwy, closing the todo
 * 2026-11-05-deeper-theming-of-launch-notice-toast).
 *
 * The Frontend jest project runs in a node environment with no CSS engine, so
 * this proves the SOURCE maps each toast part onto the per-theme tokens and
 * keeps the warning semantics (stripe and bar), not the rendered result.
 */
import { readFileSync } from 'fs'
import path from 'path'

import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const ROOT = path.resolve(__dirname, '../../../../../..')
const UI = 'src/frontend/components/UI'
const REGION = `${UI}/NoticeStack/index.scss`
const STEAM = `${UI}/SteamEngineLaunchNotice/index.scss`

const read = (rel: string) =>
  stripSourceComments(readFileSync(path.join(ROOT, rel), 'utf8'))

function ruleBody(text: string, selector: string): string {
  const start = text.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`rule not found: ${selector}`)
  const open = text.indexOf('{', start)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i)
  }
  throw new Error(`unterminated rule: ${selector}`)
}

const barUsesWarning = (steam: string) =>
  ruleBody(steam, '.steamEngineLaunchNoticeBar').includes(
    'background: var(--status-warning)'
  )

describe('launch notice theme tokens', () => {
  const region = read(REGION)
  const steam = read(STEAM)

  it('surface is the popover --background', () => {
    expect(ruleBody(region, '.noticeStackToast')).toMatch(
      /background:\s*var\(\s*--background,/
    )
  })

  it('frame precedes the warning stripe, which keeps --status-warning', () => {
    const body = ruleBody(region, '.noticeStackToast')
    const frame = body.search(
      /(^|\s)border:\s*1px solid var\(--input-background/
    )
    const stripe = body.indexOf('border-inline-start:')
    expect(frame).toBeGreaterThanOrEqual(0)
    expect(stripe).toBeGreaterThan(frame)
    expect(body).toMatch(/border-inline-start:[^;]*var\(--status-warning\)/)
  })

  it('countdown bar stays the warning colour', () => {
    expect(barUsesWarning(steam)).toBe(true)
  })

  it('title uses heading font and title colour', () => {
    const body = ruleBody(steam, '.steamEngineLaunchNoticeTitle')
    expect(body).toContain('var(--primary-font-family)')
    expect(body).toContain('var(--text-title, var(--text-default))')
  })

  it('icon takes the accent', () => {
    expect(ruleBody(steam, '.steamEngineLaunchNoticeIcon')).toMatch(
      /color:\s*var\(--accent\);/
    )
  })

  it('dismiss x falls back when --action-icon is unset', () => {
    expect(ruleBody(steam, '.steamEngineLaunchNoticeDismiss')).toMatch(
      /color:\s*var\(--action-icon,\s*var\(--text-secondary\)\)/
    )
  })

  it('uses no literal colours except the shadow rgba', () => {
    for (const text of [region, steam]) {
      expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text).not.toMatch(/\brgb\(/)
      const noShadow = text.replace(/box-shadow:[^;]*;/g, '')
      expect(noShadow).not.toMatch(/rgba\(/)
    }
  })

  it('self-test: the warning check bites on a mutated bar', () => {
    const mutated = steam.replace(
      'background: var(--status-warning)',
      'background: var(--accent)'
    )
    expect(mutated).not.toBe(steam)
    expect(barUsesWarning(mutated)).toBe(false)
  })
})
