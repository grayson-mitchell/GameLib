/**
 * Quick task `261001-p0s` (closes
 * `.planning/todos/pending/2026-10-01-keyring-rpc-arms-are-success-silent-and-eprintln-based.md`):
 * pins that all four keyring RPC dispatch arms (`keyring_get`, `keyring_set`, `keyring_delete`,
 * `keyring_available`) route every diagnostic through `shell_diag()` rather than a bare
 * `eprintln!`, and that `keyring_get`/`keyring_set`/`keyring_delete` each carry a success-path
 * emission line naming a closed-set `outcome=` token.
 *
 * Modeled directly on `shellDiagPersistence.test.ts`'s structure (same self-test, same
 * comment-stripping discipline, same counted-not-`toContain`-ed assertions) — this project's CI
 * runs no cargo step at all, so this file is the part that actually runs on every push.
 *
 * `keyring_available` is a DELIBERATE scope extension beyond the originating todo's three named
 * arms (get/set/delete): it gets the `shell_diag()` routing conversion but NEVER a success-token
 * emission, because its probe account is never a real slot-scoped outcome worth a
 * `KeyringOutcome` token. That asymmetry is itself pinned below (the `keyring_available`
 * sub-slice must carry zero `keyring_outcome_message(` calls) so a future edit cannot silently
 * widen it into looking like the other three arms.
 *
 * LOCKED, never re-openable here: nothing in this file, and nothing it pins in `main.rs`, may log
 * a secret or a Keychain-retrieved value. The channel, the allowlisted account, and a closed-set
 * `outcome=` token are the only things a keyring diagnostic line may carry.
 *
 * COMMENT-STRIPPED for every assertion below, same reasoning as the sibling gate: the doc
 * comments Task 1 added to `main.rs` quote the exact shapes this gate matches, so an unfiltered
 * match would pass on explanatory prose alone even if the real call sites were reverted.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from '../testUtils/stripSourceComments'

const MAIN_RS_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'src',
  'main.rs'
)

function loadMainRsRaw(): string {
  return readFileSync(MAIN_RS_PATH, 'utf-8')
}

/** Comment-stripped main.rs, via the shared stripper — never a hand-rolled pass. */
function loadMainRsCode(source?: string): string {
  return stripSourceComments(source ?? loadMainRsRaw())
}

/**
 * Slices the comment-stripped source from the `"keyring_get" => {` arm head through (but not
 * including) the next `"dialog_open" => {` arm head — the four keyring arms sit contiguously in
 * that span, with `dialog_open` as the first unrelated arm immediately after. Asserts both
 * markers occur exactly once first: a region extractor built on a marker that could occur twice
 * would silently slice the wrong span the moment either text shifted.
 */
function extractKeyringArmRegion(code: string): string {
  const startMarker = '"keyring_get" => {'
  const endMarker = '"dialog_open" => {'

  const startOccurrences = code.split(startMarker).length - 1
  const endOccurrences = code.split(endMarker).length - 1
  expect(startOccurrences).toBe(1)
  expect(endOccurrences).toBe(1)

  const startIdx = code.indexOf(startMarker)
  const endIdx = code.indexOf(endMarker)
  expect(startIdx).toBeGreaterThanOrEqual(0)
  expect(endIdx).toBeGreaterThan(startIdx)

  return code.slice(startIdx, endIdx)
}

describe('comment-stripping is real for this gate (self-test)', () => {
  // Doc-comment phrase Task 1 added on keyring_get's match block, quoted here and present ONLY
  // inside that comment — never in code.
  const PHRASE = 'the Ok arm is split on'

  test('the rationale phrase is present in RAW source but absent after stripping', () => {
    // Presence precondition FIRST — see shellDiagPersistence.test.ts's identical reasoning.
    expect(loadMainRsRaw()).toContain(PHRASE)
    expect(loadMainRsCode()).not.toContain(PHRASE)
  })
})

describe('keyring arm region: zero bare eprintln!, 14 shell_diag(, 5 keyring_outcome_message(', () => {
  test('no bare eprintln! remains in the keyring arm region', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    const occurrences = region.match(/eprintln!/g)
    expect(occurrences).toBeNull()
  })

  test('shell_diag( occurs exactly 14 times — COUNTED, not toContain-ed', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    const occurrences = region.match(/shell_diag\(/g)
    expect(occurrences).toHaveLength(14)
  })

  test('keyring_outcome_message( occurs exactly 5 times — COUNTED, not toContain-ed', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    const occurrences = region.match(/keyring_outcome_message\(/g)
    expect(occurrences).toHaveLength(5)
  })

  test('all four arm labels are present in the region', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    expect(region).toContain('"keyring_get" => {')
    expect(region).toContain('"keyring_set" => {')
    expect(region).toContain('"keyring_delete" => {')
    expect(region).toContain('"keyring_available" => {')
  })
})

describe('keyring_available gets conversion only — never a success-token emission', () => {
  test('the keyring_available sub-slice carries zero keyring_outcome_message( calls', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())
    const availableIdx = region.indexOf('"keyring_available" => {')
    expect(availableIdx).toBeGreaterThanOrEqual(0)

    const availableSubSlice = region.slice(availableIdx)
    const occurrences = availableSubSlice.match(/keyring_outcome_message\(/g)
    expect(occurrences).toBeNull()
  })

  test('the keyring_available sub-slice still routes through shell_diag at least once', () => {
    // Non-vacuity control for the assertion above: a sub-slice extraction bug that silently
    // returned an empty string would also report zero keyring_outcome_message( calls, for the
    // wrong reason entirely.
    const region = extractKeyringArmRegion(loadMainRsCode())
    const availableIdx = region.indexOf('"keyring_available" => {')
    const availableSubSlice = region.slice(availableIdx)

    const occurrences = availableSubSlice.match(/shell_diag\(/g)
    expect(occurrences).not.toBeNull()
    expect(occurrences!.length).toBeGreaterThan(0)
  })
})

describe('byte-stability of the shared failure/warning message literals', () => {
  test('the "keyring {channel}" literal prefix occurs exactly 9 times', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    const occurrences = region.match(/keyring \{channel\}/g)
    expect(occurrences).toHaveLength(9)
  })

  test('exactly 3 distinct failure/warning message literals exist', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    // "keyring {channel} failed: {e:?}" (6x: set x2, delete x2, available x2)
    expect(region.match(/keyring \{channel\} failed: \{e:\?\}/g)).toHaveLength(
      6
    )
    // "keyring {channel} failed: {e}" (1x: keyring_get's final Err(e) arm)
    expect(region.match(/keyring \{channel\} failed: \{e\}/g)).toHaveLength(1)
    // the timeout message (1x: keyring_get's timeout arm)
    expect(
      region.match(
        /keyring \{channel\} timed out after \{KEYRING_READ_TIMEOUT:\?\}/g
      )
    ).toHaveLength(1)
    // the keyring_available WARNING message (1x)
    expect(
      region.match(/keyring \{channel\}: WARNING -- a value exists/g)
    ).toHaveLength(1)
  })
})

describe('double-prefix guard: no shell_diag call in the keyring region passes a literal beginning with [shell] ', () => {
  const DOUBLE_PREFIX_RE = /shell_diag\(\s*(?:&format!\(\s*)?"\[shell\]/

  test('the guard passes against the real keyring arm region', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())

    expect(region).not.toMatch(DOUBLE_PREFIX_RE)
  })

  test('the guard is non-vacuous: a synthetic positive control DOES match', () => {
    expect('shell_diag(&format!("[shell] doubled"))').toMatch(DOUBLE_PREFIX_RE)
  })
})

describe('leak-shape guard: no shell_diag call carries a secret-bearing identifier', () => {
  // Scans each shell_diag( call site's own argument list (up to its balancing close paren) for
  // the two identifiers that denote a real secret/value payload in this file: `secret` (the
  // caller-supplied plaintext in keyring_set) and `get_password` (the raw Keychain read call).
  // A call site carrying either would mean a secret-shaped value reached a log line.
  function shellDiagArgSlices(region: string): string[] {
    const slices: string[] = []
    const callRe = /shell_diag\(/g
    let match: RegExpExecArray | null
    while ((match = callRe.exec(region)) !== null) {
      const openIdx = match.index + match[0].length - 1
      let depth = 1
      let i = openIdx + 1
      while (i < region.length && depth > 0) {
        if (region[i] === '(') depth++
        if (region[i] === ')') depth--
        i++
      }
      slices.push(region.slice(openIdx + 1, i - 1))
    }
    return slices
  }

  test('every shell_diag( call site in the keyring region is free of `secret` and `get_password`', () => {
    const region = extractKeyringArmRegion(loadMainRsCode())
    const slices = shellDiagArgSlices(region)

    // Non-vacuity precondition: there really are 14 call sites to scan, matching the count
    // pinned above, so an extraction bug that silently returned zero slices is caught here
    // rather than passing the forbidden-identifier check for the wrong reason.
    expect(slices).toHaveLength(14)

    for (const slice of slices) {
      expect(slice).not.toMatch(/\bsecret\b/)
      expect(slice).not.toMatch(/\bget_password\b/)
    }
  })

  test('non-vacuity control: the scanner DOES flag a synthetic call site carrying `secret`', () => {
    const synthetic =
      'shell_diag(&format!("keyring {channel} leaked: {secret}"));'
    const slices = shellDiagArgSlices(synthetic)

    expect(slices).toHaveLength(1)
    expect(slices[0]).toMatch(/\bsecret\b/)
  })
})

describe("KeyringOutcome and its two pure helpers' contracts", () => {
  test('the KeyringOutcome enum carries exactly the four closed variants', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /enum KeyringOutcome\s*\{\s*Found,\s*Absent,\s*Stored,\s*Deleted,\s*\}/
    )
  })

  test('keyring_outcome_message signature is pinned', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /fn keyring_outcome_message\(\s*channel: &str,\s*account: &'static str,\s*outcome: KeyringOutcome,\s*\) -> String/
    )
  })

  test('keyring_get_outcome signature is pinned and classifies on Value::is_null only', () => {
    const code = loadMainRsCode()

    expect(code).toMatch(
      /fn keyring_get_outcome\(value: &Value\) -> KeyringOutcome \{/
    )
    expect(code).toMatch(/value\.is_null\(\)/)
  })

  test("each outcome's token literal is pinned", () => {
    const code = loadMainRsCode()

    expect(code).toContain('KeyringOutcome::Found => "found"')
    expect(code).toContain('KeyringOutcome::Absent => "absent"')
    expect(code).toContain('KeyringOutcome::Stored => "stored"')
    expect(code).toContain('KeyringOutcome::Deleted => "deleted"')
  })
})

describe('RED-proof: this gate fails against pre-Task-1 source', () => {
  test('the pre-Task-1 keyring_get arm (bare eprintln!, no outcome helpers) fails every count assertion', () => {
    // A hand-reconstructed slice of the pre-Task-1 `keyring_get` arm, byte-identical to the form
    // the originating todo measured (`src-tauri/src/main.rs:6471-6488` at `5485e0200`) — not a
    // live git-stash round-trip, since this file did not exist before Task 1 to stash against.
    const preTask1Region = `
        "keyring_get" => {
            let account = keyring_account(keyring_slot_arg(args, 0))?;
            let result = bounded_keyring_read(KEYRING_READ_TIMEOUT, move || {
                let outcome =
                    Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.get_password());
                keyring_get_result(outcome)
            });
            if let Err(ref e) = result {
                if e == "keyring:timeout" {
                    eprintln!(
                        "[shell] keyring {channel} timed out after {KEYRING_READ_TIMEOUT:?} (worker thread abandoned, not cancelled -- see KEYRING_READ_TIMEOUT's doc comment)"
                    );
                } else {
                    eprintln!("[shell] keyring {channel} failed: {e}");
                }
            }
            result
        }
        "dialog_open" => {`

    const eprintlnOccurrences = preTask1Region.match(/eprintln!/g)
    const shellDiagOccurrences = preTask1Region.match(/shell_diag\(/g)
    const outcomeMessageOccurrences = preTask1Region.match(
      /keyring_outcome_message\(/g
    )

    expect(eprintlnOccurrences).not.toBeNull()
    expect(eprintlnOccurrences!.length).toBe(2)
    expect(shellDiagOccurrences).toBeNull()
    expect(outcomeMessageOccurrences).toBeNull()

    // Explicitly: none of these match what the live gates above require (0 / 14 / 5).
    expect(eprintlnOccurrences!.length).not.toBe(0)
    expect(shellDiagOccurrences?.length ?? 0).not.toBe(14)
    expect(outcomeMessageOccurrences?.length ?? 0).not.toBe(5)
  })
})
