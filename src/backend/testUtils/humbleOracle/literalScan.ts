/**
 * The capture-time literal scan for the one real Humble recording (94-10, D-05, T-94-19).
 *
 * The recorder's redaction removes what it can recognise (cookies, CSRF values, gamekeys, key
 * values, email shapes, account-name fields). It cannot know the operator's own account name when
 * that name shows up somewhere with no field name around it (a greeting in an HTML page, a title).
 * So at capture time the operator hands the two literal values to the test through the environment,
 * and every file the capture wrote is searched for them. The values live in the process
 * environment for that one command and are never written to a file; a finding names the file and
 * which value matched (`account` or `email`), never the value itself.
 *
 * Matching is case-insensitive. An email matches as a substring (its own shape is distinctive). An
 * account name matches as a whole token, not inside a longer run of letters and digits, so a short
 * handle does not light up on every word that contains it. Both are also tried percent-encoded,
 * because a request target or a `Referer` carries them that way.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

export interface LiteralToScan {
  /** What a finding calls the value: `account` or `email`. Never the value. */
  label: string
  value: string
  /** `token`: not inside a longer run of letters and digits. `substring`: anywhere. */
  match: 'token' | 'substring'
}

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function variants(value: string): string[] {
  const encoded = encodeURIComponent(value)
  return encoded === value ? [value] : [value, encoded]
}

function patternFor(literal: LiteralToScan): RegExp {
  const alternatives = variants(literal.value).map(escapeRegExp).join('|')
  return literal.match === 'token'
    ? new RegExp(`(?<![A-Za-z0-9])(?:${alternatives})(?![A-Za-z0-9])`, 'i')
    : new RegExp(alternatives, 'i')
}

/** The literals the environment supplied, in a fixed order; unset or blank ones are absent. */
export function literalsFrom(
  account: string | undefined,
  email: string | undefined
): LiteralToScan[] {
  const out: LiteralToScan[] = []
  if (account !== undefined && account.trim().length > 0) {
    out.push({ label: 'account', value: account.trim(), match: 'token' })
  }
  if (email !== undefined && email.trim().length > 0) {
    out.push({ label: 'email', value: email.trim(), match: 'substring' })
  }
  return out
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/**
 * Every `rel/path: <label>` under `root` whose bytes contain one of `literals`. A root that does
 * not exist yields no findings and no files. Reads every file as UTF-8 (an invalid byte becomes U+FFFD, so a binary body cannot
 * throw) and a non-ASCII name still matches.
 */
export function scanForLiterals(
  root: string,
  literals: readonly LiteralToScan[]
): { files: number; findings: string[] } {
  let files: string[]
  try {
    files = walk(root)
  } catch {
    return { files: 0, findings: [] }
  }
  const findings: string[] = []
  const patterns = literals.map((literal) => ({
    label: literal.label,
    pattern: patternFor(literal)
  }))
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(root, file).split('\\').join('/')
    for (const { label, pattern } of patterns) {
      if (pattern.test(text)) findings.push(`${rel}: ${label}`)
    }
  }
  return { files: files.length, findings }
}
