/**
 * `pnpm pin:runner-digests` (D-10, 34.16-05). Fetches `SHA256SUMS-x64`,
 * `SHA256SUMS-arm64`, `BUILD-MANIFEST-x64.json` and `BUILD-MANIFEST-arm64.json`
 * from the `runners-onedir-macos` rolling release, validates every line and
 * every claim, and rewrites `meta/runnersOnedirDigests.json`'s six digests
 * and `runId` in one write.
 *
 * Purpose: hand-transcribing six 64-character hex strings out of a run log
 * is a transcription-risk ritual that has to be repeated after every
 * re-dispatch, because `gh release upload --clobber` invalidates all six
 * pins at once. This script makes it repeatable and captures provenance
 * rather than relying on it being remembered. A bot PR was considered and
 * rejected (34.16-CONTEXT.md D-10) — this is a developer-initiated action,
 * not a scheduled one.
 *
 * Never writes on a partial or failed read (T-34.16-19): all four remote
 * files are fetched and fully validated before any write; the write is a
 * single `writeFile` at the end, or none at all.
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

import { RELEASE_TAGS } from './releaseTags'

// GAMELIB_RUNNERS_REPO / RUNNERS_ONEDIR_TAG are re-declared here rather than
// imported from meta/downloadHelperBinaries.ts or meta/buildRunnersOnedir.ts
// -- both carry a module-bottom CLI entrypoint guard, and `node meta/runTs.cjs
// --bundle` co-bundles imports into one file, so importing either risks
// firing another script's main() from this process (see
// meta/buildRunnersOnedir.ts's own header note about the identical hazard).
// meta/downloadHelperBinaries.ts:62-69 documents the reason these two
// constants are hardcoded rather than derived from package.json's
// `repository` field, which still points at Heroic upstream, not
// gamelib/GameLib. Deliberately never sourced from an environment variable
// or an argv flag -- a parameterised source URL would make this script a
// supply-chain injection point.
const GAMELIB_RUNNERS_REPO = 'grayson-mitchell/GameLib'
const RUNNERS_ONEDIR_TAG = 'runners-onedir-macos'

const BASE_URL = `https://github.com/${GAMELIB_RUNNERS_REPO}/releases/download/${RUNNERS_ONEDIR_TAG}`

// Relative to the process's cwd (repo root -- every meta/ script is run via
// `pnpm <script>`), matching meta/downloadHelperBinaries.ts's own
// 'public/bin' convention. Deliberately NOT __dirname: `node meta/runTs.cjs
// --bundle` compiles this file into a private tmpdir before running it, so
// __dirname at runtime would point there, not at meta/.
const DIGESTS_PATH = join('meta', 'runnersOnedirDigests.json')

type Arch = 'x64' | 'arm64'

interface DigestsFile {
  _comment: string
  layout: string
  runId: string | null
  digests: Record<string, string>
}

export interface ParsedSumLine {
  digest: string
  filename: string
}

interface BuildManifest {
  runId: string | null
  [runner: string]: unknown
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'HeroicBinaryUpdater/1.0' }
  })
  if (response.status !== 200) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

/**
 * Parses a `SHA256SUMS-{arch}` text into one entry per line. Every line must
 * match `^[0-9a-f]{64}  \S+$` (64 lowercase hex chars, two spaces, a
 * filename with no whitespace) -- a line that does not throws, quoting the
 * offending line verbatim and naming which arch's file it came from.
 * Trailing blank lines are tolerated (the file's own final newline, or
 * more); an interior blank line is not -- it fails the same shape check on
 * its own line.
 */
export function parseSha256Sums(text: string, arch: Arch): ParsedSumLine[] {
  const lines = text.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.map((line) => {
    const match = line.match(/^([0-9a-f]{64}) {2}(\S+)$/)
    if (!match) {
      throw new Error(
        `Malformed SHA256SUMS-${arch} line: "${line}" -- expected the shape ` +
          `"<64 lowercase hex><two spaces><filename>"`
      )
    }
    return { digest: match[1], filename: match[2] }
  })
}

/**
 * Every parsed filename must already be a key of the loaded `digests`
 * object -- the script must be structurally incapable of inventing,
 * renaming or dropping a key (T-34.16-17). An unknown filename throws,
 * naming it and the arch.
 */
function assertKnownFilenames(
  parsed: ParsedSumLine[],
  existingKeys: string[],
  arch: Arch
): void {
  for (const { filename } of parsed) {
    if (!existingKeys.includes(filename)) {
      throw new Error(
        `Unknown filename "${filename}" in SHA256SUMS-${arch} -- it is not ` +
          `a key of meta/runnersOnedirDigests.json's "digests" object`
      )
    }
  }
}

/**
 * After both SHA256SUMS files are parsed, every existing digest key must be
 * covered by exactly one parsed line across both arches. A missing or
 * duplicated key throws, listing which.
 */
export function assertCoversAllKeys(
  parsed: ParsedSumLine[],
  existingKeys: string[]
): void {
  const counts = new Map<string, number>()
  for (const key of existingKeys) counts.set(key, 0)
  for (const { filename } of parsed) {
    counts.set(filename, (counts.get(filename) ?? 0) + 1)
  }
  const missing = existingKeys.filter((key) => (counts.get(key) ?? 0) === 0)
  const duplicated = existingKeys.filter((key) => (counts.get(key) ?? 0) > 1)
  if (missing.length > 0 || duplicated.length > 0) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`)
    if (duplicated.length > 0)
      parts.push(`duplicated: ${duplicated.join(', ')}`)
    throw new Error(
      `The fetched SHA256SUMS files do not cover the six tracked digest ` +
        `keys exactly once (${parts.join('; ')})`
    )
  }
}

/**
 * Both manifests' `runId` values must be non-null and equal. Both null
 * throws (nothing to record -- likely a local build). Unequal throws,
 * naming both values, because six digests spanning two runs cannot honestly
 * be attributed to one (T-34.16-18).
 */
function assertAgreedRunId(
  manifestX64: BuildManifest,
  manifestArm64: BuildManifest
): string {
  const x64RunId = manifestX64.runId
  const arm64RunId = manifestArm64.runId
  if (x64RunId === null && arm64RunId === null) {
    throw new Error(
      `Both BUILD-MANIFEST-x64.json and BUILD-MANIFEST-arm64.json report a ` +
        `null runId -- nothing to record. This usually means the fetched ` +
        `manifests came from a local build, not a CI run; dispatch ` +
        `build-runners-onedir-macos.yml before running pin:runner-digests.`
    )
  }
  if (x64RunId !== arm64RunId) {
    throw new Error(
      `BUILD-MANIFEST-x64.json and BUILD-MANIFEST-arm64.json disagree on ` +
        `runId (x64: ${x64RunId}, arm64: ${arm64RunId}) -- six digests ` +
        `spanning two runs cannot be attributed to one pin`
    )
  }
  // x64RunId === arm64RunId and the both-null case is handled above, so
  // this is a non-null string.
  return x64RunId as string
}

/**
 * A manifest `tag` disagreeing with the live `RELEASE_TAGS` value for that
 * runner is a provenance signal, not a second failure mode to debug --
 * `console.warn`s naming the runner, both values and the run id, then
 * continues.
 */
function warnOnTagDrift(
  arch: Arch,
  manifest: BuildManifest,
  runId: string
): void {
  const liveTags = RELEASE_TAGS as Record<string, string>
  for (const [runner, value] of Object.entries(manifest)) {
    if (runner === 'runId') continue
    const entry = value as { tag?: unknown }
    const liveTag = liveTags[runner]
    if (liveTag !== undefined && entry.tag !== liveTag) {
      console.warn(
        `BUILD-MANIFEST-${arch}.json's "${runner}" tag ("${String(entry.tag)}") ` +
          `does not match the live RELEASE_TAGS value ("${liveTag}") for run ` +
          `${runId} -- meta/releaseTags.ts may have moved since this run was ` +
          `dispatched`
      )
    }
  }
}

/**
 * Assembles the new tracked JSON object. `_comment` and `layout` are
 * carried forward verbatim from the currently-tracked file, never
 * regenerated -- this script changes digests, not shape, and neither key is
 * this script's to author. Key order (`_comment`, `layout`, `runId`,
 * `digests`) matches the tracked file's own order.
 */
export function buildPinnedJson(
  current: DigestsFile,
  digests: Record<string, string>,
  runId: string
): DigestsFile {
  return {
    _comment: current._comment,
    layout: current.layout,
    runId,
    digests
  }
}

export async function main(): Promise<void> {
  const currentText = await readFile(DIGESTS_PATH, 'utf-8')
  const current = JSON.parse(currentText) as DigestsFile
  const existingKeys = Object.keys(current.digests)

  const sumsX64Text = await fetchText(`${BASE_URL}/SHA256SUMS-x64`)
  const sumsArm64Text = await fetchText(`${BASE_URL}/SHA256SUMS-arm64`)
  const manifestX64Text = await fetchText(`${BASE_URL}/BUILD-MANIFEST-x64.json`)
  const manifestArm64Text = await fetchText(
    `${BASE_URL}/BUILD-MANIFEST-arm64.json`
  )

  const sumsX64 = parseSha256Sums(sumsX64Text, 'x64')
  const sumsArm64 = parseSha256Sums(sumsArm64Text, 'arm64')
  assertKnownFilenames(sumsX64, existingKeys, 'x64')
  assertKnownFilenames(sumsArm64, existingKeys, 'arm64')

  const allParsed = [...sumsX64, ...sumsArm64]
  assertCoversAllKeys(allParsed, existingKeys)

  const manifestX64 = JSON.parse(manifestX64Text) as BuildManifest
  const manifestArm64 = JSON.parse(manifestArm64Text) as BuildManifest
  const runId = assertAgreedRunId(manifestX64, manifestArm64)

  warnOnTagDrift('x64', manifestX64, runId)
  warnOnTagDrift('arm64', manifestArm64, runId)

  const digests: Record<string, string> = {}
  for (const { filename, digest } of allParsed) {
    digests[filename] = digest
  }

  const pinned = buildPinnedJson(current, digests, runId)
  await writeFile(DIGESTS_PATH, JSON.stringify(pinned, null, 2) + '\n')
}

// Guard main() so importing this module (e.g. from its jest suite) never
// performs any I/O. Mirrors meta/downloadHelperBinaries.ts's /
// meta/buildCrossoverIndex.ts's idiom (NOT meta/buildRunnersOnedir.ts's
// variant, which ANDs in an extra `--arch=` argv check that exists only to
// defuse a co-bundling collision this script does not have): this script is
// run via `node meta/runTs.cjs` (the meta/ convention), which DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite, so `JEST_WORKER_ID` (set by Jest for every worker) still reliably
// distinguishes "imported under test" from "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
