/**
 * Quick task `260905-omc` (actions the F-9 todo,
 * `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`):
 * pins the WIRING that makes an abandoned sidecar invoke attributable to its channel.
 *
 * Why this file exists at all, given `src-tauri/src/main.rs` already carries cargo tests for
 * the same feature: those cover the pure helpers (`push_abandoned`, `abandoned_channel_for`,
 * `invoke_timeout_message`) and cannot reach the two CALL SITES that consume them — the reader
 * thread's late-response diagnostic and `invoke()`'s timeout branch — because both need a live
 * sidecar (a real `ChildStdin`/`Child`) to construct. Those helpers could therefore be perfect
 * and simultaneously unused, with every cargo test green. More pointedly: **this project's CI
 * runs no cargo step at all** (`.github/workflows/*.yml` contains neither `cargo test` nor
 * `cargo check`), so the cargo module is a manual gate. This file is the part that actually runs
 * on every push.
 *
 * What F-9 is, in one line: `[shell] response for unknown/timed-out id=1575 (dropped)` fired
 * live, and because the diagnostic named no channel, whether it co-occurred with a cookie
 * operation could not be settled afterwards. That answer is UNDETERMINED and stays UNDETERMINED
 * — this gate does not close F-9 and must not be read as closing it. It pins that the NEXT such
 * event names its channel instead of repeating the same dead end.
 *
 * COMMENT-STRIPPED, and that is load-bearing here specifically: the doc comments this task added
 * to `main.rs` quote the diagnostic format verbatim (including the pre-fix `id=N (dropped)` form,
 * to explain what changed). An unfiltered match would therefore pass on the explanatory prose
 * alone even if the real `eprintln!` were reverted — the exact "a RAW-source gate is satisfied by
 * the prose that names its subject" failure this project has already paid for. Presence
 * assertions run against stripped code; the stripper itself is self-tested below.
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

/**
 * Comment-stripped main.rs. Uses the shared stripper (block comments first, then whole-line
 * `//`/`///`/`//!` removal) rather than a hand-rolled pass, per that util's own instruction.
 */
function loadMainRsCode(source?: string): string {
  return stripSourceComments(source ?? loadMainRsRaw())
}

describe('comment-stripping is real for this gate (self-test)', () => {
  // A phrase that exists ONLY inside a doc comment added by this task, never in code.
  const COMMENT_ONLY_PHRASE = 'it makes the NEXT one answerable'

  test('a comment-only phrase is present in RAW source but absent after stripping', () => {
    // Presence precondition FIRST (the WR-09 lesson from `longRunningChannels.test.ts`): an
    // absence assertion alone would go on passing for entirely the wrong reason the moment
    // someone reworded or deleted the comment, because a phrase that no longer exists is
    // trivially absent from stripped output.
    expect(loadMainRsRaw()).toContain(COMMENT_ONLY_PHRASE)
    expect(loadMainRsCode()).not.toContain(COMMENT_ONLY_PHRASE)
  })

  test('the stripper removes a comment that NAMES this gate’s subject (synthetic)', () => {
    // Drives the same code path with synthetic input, proving the stripper would not let a
    // comment mentioning `channel={channel}` satisfy the presence assertions below.
    const synthetic = [
      '/// response for unknown/timed-out id={id} channel={channel} (dropped)',
      '/* record_abandoned(&id, &channel); */',
      'let real_code = 1;'
    ].join('\n')
    const stripped = loadMainRsCode(synthetic)

    expect(stripped).not.toContain('channel={channel}')
    expect(stripped).not.toContain('record_abandoned(&id, &channel)')
    expect(stripped).toContain('let real_code = 1;')
  })
})

describe('F-9: an abandoned invoke is attributable to its channel', () => {
  test('the late-response diagnostic names the channel, not just the id', () => {
    const code = loadMainRsCode()

    expect(code).toContain(
      'response for unknown/timed-out id={id} channel={channel} (dropped)'
    )
  })

  test('the pre-fix diagnostic form (id only, no channel) is gone from CODE', () => {
    const code = loadMainRsCode()

    // Guards the specific regression: reverting the `eprintln!` to the bare-id form. Asserted
    // against stripped code because main.rs's comments quote the old form deliberately, to
    // record what changed — so this must NOT be a raw-source assertion.
    expect(code).not.toContain(
      'response for unknown/timed-out id={id} (dropped)'
    )
  })

  test('BOTH abandonment branches record the id against its channel', () => {
    const code = loadMainRsCode()

    // Without this call the ring is never populated, every lookup returns `<unrecorded>`, and
    // the diagnostic is no more informative than the bare id it replaced -- i.e. the helpers
    // would be present, correct, unit-tested, and doing nothing.
    //
    // COUNTED, not `toContain`-ed. An earlier draft of this gate asserted only presence and was
    // hand-verified to stay GREEN (8/8) with the call deleted from the TIMEOUT branch, because
    // the disconnect branch's copy still satisfied it -- a `toContain` pin catches deletion of
    // every occurrence, never one of two. The timeout branch is precisely where F-9's own event
    // came from, so the blind spot was over the only case this gate exists for.
    const occurrences = code.match(/self\.record_abandoned\(&id, &channel\)/g)
    expect(occurrences).toHaveLength(2)
  })

  test('the recording sits in the timeout arm and the disconnect arm specifically', () => {
    const code = loadMainRsCode()

    // Pins WHICH branches, not just how many -- two copies in one arm would satisfy the count
    // above. Each assertion pairs the record call with the Err that identifies its arm.
    expect(code).toMatch(
      /self\.record_abandoned\(&id, &channel\);\s*Err\(invoke_timeout_message\(&channel\)\)/
    )
    expect(code).toMatch(
      /self\.record_abandoned\(&id, &channel\);\s*Err\("sidecar closed before responding"\.into\(\)\)/
    )
  })

  test('the pending table retains the channel alongside the sender', () => {
    const code = loadMainRsCode()

    // The root cause: `HashMap<String, Sender<...>>` discarded the channel name, so
    // `pending.remove(&id)` at the timeout destroyed the only record of what the id was.
    expect(code).toMatch(
      /pending:\s*Mutex<HashMap<String,\s*\(String,\s*Sender<Result<Value,\s*String>>\)>>/
    )
  })

  test('the bounded-invoke timeout error is produced by invoke_timeout_message', () => {
    const code = loadMainRsCode()

    expect(code).toContain('Err(invoke_timeout_message(&channel))')
    // And the bare, unattributable string it replaced is no longer constructed as an Err.
    expect(code).not.toContain('Err("sidecar invoke timed out".into())')
  })

  test('the abandoned ring is bounded by a declared cap', () => {
    const code = loadMainRsCode()

    const match = code.match(/const ABANDONED_IDS_CAP:\s*usize\s*=\s*(\d+);/)
    expect(match).not.toBeNull()
    // A cap that exists but is enormous would be a bound in name only.
    expect(Number(match![1])).toBeGreaterThan(0)
    expect(Number(match![1])).toBeLessThanOrEqual(1024)
    // And the eviction actually runs against that cap.
    expect(code).toContain('while ring.len() > ABANDONED_IDS_CAP')
  })
})
