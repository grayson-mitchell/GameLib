/**
 * Quick 261107-8yq. Holds `cargo clippy --all-targets` warnings in src-tauri
 * at a per-lint EQUALITY ceiling, Phase 62 ratchet style: a lint's count
 * rising fails ("new warning(s)"), and a count falling fails too ("lower the
 * ceiling in this commit"), so the committed ceiling always equals the real
 * count. It is shrink-only per lint: fixing one warning while adding a
 * different one cannot net to green. There is no --update flag: ceilings move
 * by hand in the same commit that removes warnings.
 *
 * Both `darwin` and `win32` are measured natively and committed, and the CI
 * clippy steps run on both matrix legs of rust-test.yml. Each leg's runner has
 * the same triple as its measuring machine: macos-latest is
 * aarch64-apple-darwin, as on the measuring Mac, and windows-latest is
 * x86_64-pc-windows-msvc, as on the operator's Windows box, so a local native
 * measurement predicts CI. cfg-gated code differs per OS, so ceilings are
 * keyed by process.platform. A ceiling is never guessed or measured
 * cross-target: an equality ceiling fails in both directions, so a wrong
 * guess would put a red leg on main. linux has no map because rust-test.yml
 * has no Linux leg (its caveat (a)).
 *
 * The toolchain is pinned (CLIPPY_TOOLCHAIN, equal to the version in
 * .github/workflows/rust-test.yml) because new clippy releases add and
 * re-tune lints, which would turn main red with no repo change. Bumping the
 * pin means changing both places and re-measuring BOTH ceiling maps in the
 * same commit, each natively on its own OS.
 *
 * It reads a saved `--message-format=json` stream instead of spawning cargo:
 * that keeps it pure and testable, and a fake HOME would hide ~/.cargo and
 * ~/.rustup anyway. A crash cannot look like a pass: the stream must hold a
 * build-finished success:true line and a gamelib-shell compiler-artifact.
 *
 * Local usage:
 *   cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > /tmp/c.json && node ../meta/clippyRatchet.cjs /tmp/c.json --list
 *
 * Plain CommonJS, node: builtins only.
 */

'use strict'

const fs = require('node:fs')

const CLIPPY_TOOLCHAIN = '1.99.1'

// Per-lint ceilings, each at its exact measured count (deduplicated across
// the bin and test targets by code + primary span + message). A lint that
// reaches 0 is deleted from the map.
const CLIPPY_CEILINGS = {
  // 2026-11-07 quick-261107-8yq: measured 23 unique warnings (38 raw) on
  // rustc 1.99.1 / clippy 0.1.99, aarch64-apple-darwin.
  // 2026-11-07 quick-261107-uh4: needless_borrow fell 2 -> 0 (intervening
  // commits; CI run 42417450472 on 4422ba2f3, macos-latest), entry deleted;
  // darwin not re-measured locally.
  darwin: {
    'clippy::doc_lazy_continuation': 5,
    'clippy::type_complexity': 2,
    'clippy::unnecessary_to_owned': 2,
    'clippy::cloned_ref_to_slice_refs': 2,
    non_snake_case: 2,
    dead_code: 1,
    'clippy::incompatible_msrv': 1,
    'clippy::match_like_matches_macro': 1,
    'clippy::manual_hash_one': 1,
    'clippy::useless_conversion': 1,
    'clippy::bool_comparison': 1,
    'clippy::needless_borrows_for_generic_args': 1,
    'clippy::if_same_then_else': 1
  },
  // 2026-11-07 quick-261107-uh4: measured natively on the operator's Windows 11
  // box, rustc 1.99.1 / clippy 0.1.99, x86_64-pc-windows-msvc (the same triple
  // as GitHub windows-latest), `cargo +1.99.1 clippy --workspace
  // --all-targets`: 27 unique warnings after the generator fix, re-measured
  // after regeneration. 2026-11-08 phase 71 wave 1: unused_imports fell 2 -> 0
  // on the windows-latest leg (CI run 42445149648) after the dispatcher
  // handlers moved to their domain modules; entry deleted. The 17 index-0 accessor (get_first) warnings were
  // removed at the generator, so they have no entry.
  win32: {
    'clippy::doc_lazy_continuation': 5,
    dead_code: 5,
    'clippy::type_complexity': 2,
    'clippy::unnecessary_to_owned': 2,
    'clippy::cloned_ref_to_slice_refs': 2,
    non_snake_case: 2,
    'clippy::incompatible_msrv': 1,
    'clippy::match_like_matches_macro': 1,
    'clippy::manual_hash_one': 1,
    'clippy::useless_conversion': 1,
    'clippy::needless_borrows_for_generic_args': 1,
    'clippy::if_same_then_else': 1
  }
}

/**
 * Pure: parses a cargo JSON message stream. Non-JSON lines are ignored.
 * @param {string} jsonText
 */
function tally(jsonText) {
  const result = {
    finished: false,
    success: false,
    artifactSeen: false,
    counts: {},
    sites: []
  }
  const seen = new Set()
  for (const line of jsonText.split('\n')) {
    let j
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    if (!j || typeof j !== 'object') continue
    if (j.reason === 'build-finished') {
      result.finished = true
      result.success = j.success === true
    } else if (j.reason === 'compiler-artifact') {
      if (j.target && j.target.name === 'gamelib-shell') {
        result.artifactSeen = true
      }
    } else if (j.reason === 'compiler-message') {
      const m = j.message
      if (!m || m.level !== 'warning') continue
      const span = (m.spans || []).find((s) => s.is_primary)
      if (!span && !m.code) continue
      const code = m.code ? m.code.code : '(uncoded)'
      const site = {
        code,
        file: span ? span.file_name : undefined,
        line: span ? span.line_start : undefined,
        col: span ? span.column_start : undefined,
        message: m.message
      }
      const key = [code, site.file, site.line, site.col, site.message].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      result.counts[code] = (result.counts[code] || 0) + 1
      result.sites.push(site)
    }
  }
  return result
}

/**
 * Pure: returns failure strings.
 * @param {ReturnType<typeof tally>} t
 * @param {Record<string, number> | undefined} ceilings
 * @param {string} platform
 * @returns {string[]}
 */
function evaluate(t, ceilings, platform) {
  const failures = []
  if (!t.finished) {
    failures.push(
      'No build-finished line in the cargo stream (clippy crashed or output truncated).'
    )
  } else if (!t.success) {
    failures.push(
      'build-finished reported success:false (clippy or the build failed).'
    )
  }
  if (!t.artifactSeen) {
    failures.push(
      'No gamelib-shell compiler-artifact in the cargo stream (scope collapsed or stream empty).'
    )
  }
  if (!ceilings) {
    failures.push(
      `No measured clippy baseline for ${platform}; ceilings exist for ${Object.keys(CLIPPY_CEILINGS).join(', ')} (measure natively on that OS, then add a map).`
    )
    return failures
  }
  const lints = new Set([...Object.keys(t.counts), ...Object.keys(ceilings)])
  for (const lint of [...lints].sort()) {
    const count = t.counts[lint] || 0
    const ceiling = ceilings[lint]
    if (ceiling === undefined) {
      failures.push(
        `${count} new warning(s) for ${lint}, which has no ceiling (run with --list).`
      )
    } else if (count > ceiling) {
      failures.push(
        `${count - ceiling} new warning(s) for ${lint}: ${count} found, ceiling is ${ceiling} (run with --list).`
      )
    } else if (count < ceiling) {
      failures.push(
        `${lint} has ${count} warning(s), below its ceiling ${ceiling}: lower ${lint} to ${count} in this commit.`
      )
    }
  }
  return failures
}

function main() {
  const argv = process.argv.slice(2)
  const list = argv.includes('--list')
  const pi = argv.indexOf('--platform')
  const platform = pi >= 0 ? argv[pi + 1] : process.platform
  const file = argv.find(
    (a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1)
  )
  if (!file) {
    console.error(
      'usage: clippyRatchet.cjs <path-to-json> [--list] [--platform <p>]'
    )
    process.exit(1)
  }
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`cannot read ${file}: ${e.message}`)
    process.exit(1)
  }
  const t = tally(text)
  const ceilings = CLIPPY_CEILINGS[platform]
  const names = new Set([
    ...Object.keys(t.counts),
    ...Object.keys(ceilings || {})
  ])
  for (const lint of [...names].sort()) {
    const c = ceilings && ceilings[lint] !== undefined ? ceilings[lint] : '-'
    console.log(`${lint}: ${t.counts[lint] || 0} (ceiling ${c})`)
  }
  if (list) {
    for (const s of t.sites) {
      console.log(`${s.file}:${s.line}:${s.col} ${s.code} ${s.message}`)
    }
  }
  const failures = evaluate(t, ceilings, platform)
  if (failures.length === 0) {
    console.log(`PASS (${platform}, toolchain ${CLIPPY_TOOLCHAIN})`)
    return
  }
  for (const f of failures) console.error(`FAIL: ${f}`)
  process.exit(1)
}

module.exports = { evaluate, tally, CLIPPY_CEILINGS, CLIPPY_TOOLCHAIN }

if (require.main === module) main()
