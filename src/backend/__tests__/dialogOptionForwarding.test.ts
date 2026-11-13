/**
 * Quick task 260902-8wc. Pins the three fixes that close the residue of the folded todo
 * `2026-08-24-opendialog-is-missing-from-long-running-channels-...`:
 *
 *  1. `main.rs`'s `dialog_open` arm honours the caller's `title` / `defaultPath` / `filters`
 *     rather than reading `properties` and discarding the rest.
 *  2. `sidecarRpc.ts`'s `UNBOUNDED_RUST_CHANNELS` covers all three human-gated dialog channels,
 *     not just `dialog_open`.
 *  3. No frontend file calls `window.api.openDialog` directly — every call site goes through
 *     the total `useOpenDialog` hook, so a rejected picker can never be an unhandled rejection.
 *
 * Item 1 of that todo (`openDialog` on `LONG_RUNNING_CHANNELS`) is NOT pinned here — it shipped
 * in Phase 35 plan 07 and is already covered by `longRunningChannels.test.ts`.
 *
 * Every source-shape assertion below carries a SELF-TEST that feeds the matcher the pre-fix text
 * and requires it to fail. A gate whose vocabulary was never measured against a known-bad input
 * is not evidence, and this repo has repeatedly shipped ones that convict correct code or
 * acquit broken code.
 */
import {
  readHandlerBody,
  readTauriShellProductionSource
} from 'backend/testUtils/tauriShellSource'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from '../testUtils/stripSourceComments'
import { defined } from './helpers/defined'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SIDECAR_RPC_PATH = join(
  REPO_ROOT,
  'src',
  'backend',
  'sidecar',
  'sidecarRpc.ts'
)
const FRONTEND_ROOT = join(REPO_ROOT, 'src', 'frontend')

/** Dispatcher variant -> `rpc_<wire>` handler for the three dialog channels (Phase 71 D-04). */
const DIALOG_VARIANT_TO_WIRE = {
  DialogOpen: 'dialog_open',
  DialogMessage: 'dialog_message',
  DialogSave: 'dialog_save'
} as const

/**
 * Returns the body of the `rpc_<channel>` handler the dispatcher arm delegates to. The arm itself
 * is a one-line call, so the router line must exist exactly once, and `readHandlerBody` throws on
 * a missing, duplicated or empty handler, so this cannot pass on an empty body.
 */
function extractMatchArm(source: string, channel: string): string {
  const entry = Object.entries(DIALOG_VARIANT_TO_WIRE).find(
    ([, wire]) => wire === channel
  )
  if (!entry) throw new Error(`no dialog variant maps to "${channel}"`)
  const router = source.match(
    new RegExp(
      `^ {8}RustInvokeChannel::${entry[0]} => rpc_${channel}\\(.*\\),$`,
      'gm'
    )
  )
  if (router?.length !== 1) {
    throw new Error(`router line for "${channel}" not found exactly once`)
  }
  return readHandlerBody(source, channel)
}

describe('main.rs dialog_open arm forwards the caller options (quick task 260902-8wc)', () => {
  const arm = extractMatchArm(
    stripSourceComments(readTauriShellProductionSource()),
    'dialog_open'
  )

  test('reads the `title` key and applies it via set_title', () => {
    expect(arm).toContain('options.title')
    expect(arm).toContain('set_title')
  })

  test('reads the `defaultPath` key and applies it via set_directory', () => {
    expect(arm).toContain('options.default_path')
    expect(arm).toContain('set_directory')
  })

  test('reads the `filters` key and applies them via add_filter', () => {
    expect(arm).toContain('options.filters')
    expect(arm).toContain('add_filter')
  })

  test('still honours `properties` — the pre-existing WR-01 behaviour is not regressed', () => {
    expect(arm).toContain('options')
    expect(arm).toContain('.properties')
    expect(arm).toContain('openDirectory')
    expect(arm).toContain('openFile')
  })

  // Phase 67 (D-13): the wire keys are read by the generated `DialogOpenArgs`, so the key names
  // live there (serde renames) and the arm must go through it.
  test('the arm reads its options through the generated DialogOpenArgs, whose wire keys are title/defaultPath/properties/filters', () => {
    expect(arm).toContain('DialogOpenArgs::from_args(args)')
    const contract = readFileSync(
      join(REPO_ROOT, 'src-tauri', 'src', 'ipc_contract.rs'),
      'utf-8'
    )
    const struct = contract.slice(
      contract.indexOf('pub(crate) struct DialogOpenArgs {'),
      contract.indexOf('impl DialogOpenArgs')
    )
    expect(struct).toContain('#[serde(rename = "defaultPath")]')
    for (const field of ['title', 'properties', 'filters']) {
      expect(struct).toContain(`pub(crate) ${field}:`)
    }
  })

  // The extractor must read the WHOLE arm. `defaultPath` handling sits inside a nested
  // `if let` + `if`/`else`, so a brace-naive extractor would stop short and these assertions
  // would fail for the wrong reason -- or, worse, a future regression inside a nested block
  // would go unseen.
  test('the extractor reads past nested blocks, not just to the first inner brace', () => {
    expect(arm).toContain('blocking_pick_folder')
    expect(arm).toContain('blocking_pick_file')
  })

  // SELF-TEST: the exact pre-fix arm body. Every assertion above must fail against it,
  // otherwise this gate would pass on the very code it exists to outlaw.
  const PRE_FIX_ARM = [
    '            let wants_file = args',
    '                .first()',
    '                .and_then(|v| v.get("properties"))',
    '                .and_then(|v| v.as_array())',
    '                .map(|props| {',
    '                    let has_dir = props.iter().any(|p| p.as_str() == Some("openDirectory"));',
    '                    let has_file = props.iter().any(|p| p.as_str() == Some("openFile"));',
    '                    has_file && !has_dir',
    '                })',
    '                .unwrap_or(false);',
    '            let picked = if wants_file {',
    '                app.dialog().file().blocking_pick_file()',
    '            } else {',
    '                app.dialog().file().blocking_pick_folder()',
    '            };',
    '            match picked {',
    '                Some(path) => Ok(Value::String(path.to_string())),',
    '                None => Ok(Value::Null),',
    '            }'
  ].join('\n')

  test('self-test: the pre-fix arm satisfies NONE of the three option assertions', () => {
    expect(PRE_FIX_ARM).not.toContain('options.title')
    expect(PRE_FIX_ARM).not.toContain('set_title')
    expect(PRE_FIX_ARM).not.toContain('options.default_path')
    expect(PRE_FIX_ARM).not.toContain('set_directory')
    expect(PRE_FIX_ARM).not.toContain('options.filters')
    expect(PRE_FIX_ARM).not.toContain('add_filter')
  })

  test('self-test: the pre-fix arm DOES satisfy the properties assertion, so the gate discriminates rather than rejecting everything', () => {
    expect(PRE_FIX_ARM).toContain('"properties"')
    expect(PRE_FIX_ARM).toContain('openDirectory')
  })

  // `buttonLabel` is deliberately NOT forwarded: tauri-plugin-dialog 2.7.2's FileDialogBuilder
  // has no confirm-button-label setter. Pinning its ABSENCE would be pinning a limitation of a
  // third-party crate, which is not this gate's business -- but the arm must keep SAYING why,
  // so the next reader does not re-derive it or "fix" it with a method that does not exist.
  test('the arm documents why buttonLabel is not forwarded', () => {
    const raw = readTauriShellProductionSource()
    expect(raw).toContain('buttonLabel')
    expect(raw).toMatch(/tauri-plugin-dialog 2\.7\.2/)
  })
})

describe('sidecarRpc UNBOUNDED_RUST_CHANNELS covers every human-gated dialog channel', () => {
  const code = stripSourceComments(readFileSync(SIDECAR_RPC_PATH, 'utf-8'))
  const match = code.match(
    /const UNBOUNDED_RUST_CHANNELS[^=]*=\s*\[([\s\S]*?)\]/
  )
  if (!match) {
    throw new Error('UNBOUNDED_RUST_CHANNELS array not found in sidecarRpc.ts')
  }
  const members = defined(match[1], 'array members')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const EXPECTED = [
    'RUST_DIALOG_OPEN',
    'RUST_DIALOG_MESSAGE',
    'RUST_DIALOG_SAVE',
    // Phase 73 plan 12 (D-06): a depot download job runs for minutes to hours, so it is
    // deliberately unbounded too. Not a dialog channel; listed here so EXTENSION stays a
    // reviewed decision.
    'RUST_DEPOT_JOB_RUN',
    // Phase 75 plan 19 (D-03): the no-download finalize walks the whole install tree to
    // measure SizeOnDisk, which scales with the game, not a clock. Also not a dialog channel.
    'RUST_DEPOT_FINALIZE'
  ]

  test('contains exactly the three dialog channels plus the two depot channels', () => {
    // Set equality AND length, not `toContain`: `toContain` catches deletion but is blind to
    // EXTENSION, and an unrelated channel silently acquiring an unbounded timeout is exactly
    // as much of a defect as a dialog channel losing one.
    expect(new Set(members)).toEqual(new Set(EXPECTED))
    expect(members).toHaveLength(EXPECTED.length)
  })

  test('each expected member is imported, so the array cannot reference an undefined binding', () => {
    for (const member of EXPECTED) {
      expect(code).toMatch(
        new RegExp(
          `import[\\s\\S]*?${member}[\\s\\S]*?from 'common/types/sidecarTransport'`
        )
      )
    }
  })

  // SELF-TEST: the pre-fix single-member list must fail the equality assertion.
  test('self-test: the pre-fix one-member list does NOT satisfy the membership assertion', () => {
    const preFix = ['RUST_DIALOG_OPEN']
    expect(new Set(preFix)).not.toEqual(new Set(EXPECTED))
  })

  // SELF-TEST: a FOURTH, unrelated member must also fail -- proving the gate is bidirectional.
  test('self-test: an extra unrelated member also fails, so the gate is not one-directional', () => {
    const overreach = [...EXPECTED, 'RUST_KEYRING_GET']
    expect(new Set(overreach)).not.toEqual(new Set(EXPECTED))
    expect(overreach).not.toHaveLength(EXPECTED.length)
  })
})

describe('every frontend openDialog call site goes through the total useOpenDialog hook', () => {
  const HOOK_RELATIVE = join('hooks', 'useOpenDialog.ts')

  function collectSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue
        collectSourceFiles(full, acc)
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        acc.push(full)
      }
    }
    return acc
  }

  // Enumerated by scanning the tree, never from a hardcoded list: a NEW unguarded call site is
  // precisely the regression this gate exists to catch, and a fixed list would be blind to it.
  const files = collectSourceFiles(FRONTEND_ROOT)

  test('the scan actually found the frontend tree (guards against a silently empty census)', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.endsWith(HOOK_RELATIVE))).toBe(true)
  })

  test('no frontend file outside the hook calls window.api.openDialog directly', () => {
    const offenders = files
      .filter((file) => !file.endsWith(HOOK_RELATIVE))
      .filter((file) =>
        stripSourceComments(readFileSync(file, 'utf-8')).includes(
          'window.api.openDialog'
        )
      )
      .map((file) => file.slice(REPO_ROOT.length + 1))

    expect(offenders).toEqual([])
  })

  test('every file that calls openDialog(...) imports the hook', () => {
    const unguarded = files
      .filter((file) => !file.endsWith(HOOK_RELATIVE))
      .filter((file) => {
        const code = stripSourceComments(readFileSync(file, 'utf-8'))
        return /\bopenDialog\(/.test(code) && !code.includes('useOpenDialog')
      })
      .map((file) => file.slice(REPO_ROOT.length + 1))

    expect(unguarded).toEqual([])
  })

  test('the census is non-vacuous: the known call sites are actually seen', () => {
    const callers = files
      .filter((file) => !file.endsWith(HOOK_RELATIVE))
      .filter((file) =>
        /\bopenDialog\(/.test(stripSourceComments(readFileSync(file, 'utf-8')))
      )
      .map((file) => file.slice(REPO_ROOT.length + 1))

    // Five files, seven calls: GameSubMenu (moveInstall + changeInstallPath) and
    // SideloadDialog (local image + run-exe) carry two each, the other three one apiece.
    expect(callers).toHaveLength(5)
    expect(callers).toEqual(
      expect.arrayContaining([
        join(
          'src',
          'frontend',
          'components',
          'UI',
          'PathSelectionBox',
          'index.tsx'
        ),
        join('src', 'frontend', 'screens', 'Game', 'GameSubMenu', 'index.tsx'),
        join(
          'src',
          'frontend',
          'screens',
          'Settings',
          'components',
          'CustomWineProton.tsx'
        ),
        join(
          'src',
          'frontend',
          'screens',
          'Settings',
          'components',
          'Tools',
          'index.tsx'
        ),
        join(
          'src',
          'frontend',
          'screens',
          'Library',
          'components',
          'InstallModal',
          'SideloadDialog',
          'index.tsx'
        )
      ])
    )
  })

  test('the hook is total: it catches, logs, surfaces a dialog, and resolves false', () => {
    const hook = readFileSync(join(FRONTEND_ROOT, HOOK_RELATIVE), 'utf-8')
    const code = stripSourceComments(hook)
    expect(code).toContain('catch')
    expect(code).toContain('window.api.logError')
    expect(code).toContain('showDialogModal')
    expect(code).toContain('return false')
    // It must not re-throw: a rethrow would reinstate the unhandled rejection this whole
    // change exists to remove, while leaving every assertion above green.
    expect(code).not.toMatch(/\bthrow\b/)
  })
})
