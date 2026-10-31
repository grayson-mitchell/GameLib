/**
 * 55-04 (P55-3): behavioural proof of the generated callback registry.
 * The generator output is compiled on the host with ERRORCHECK mutexes, a
 * scripted transport and a fake clock, so "no lock held during Run" and
 * re-entrancy are exercised, not just pinned in source text.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import { generateCallbackRegistryC } from '../gen_vtables'

const HARNESS = join(__dirname, 'fixtures', 'callback_registry_harness.c')

const CASES = [
  'register_sets_flag_and_id',
  'unregister_clears',
  'gate_no_relay_ids',
  'dispatch_matching_only',
  'no_lock_held',
  'reentrant_handler',
  'cross_thread_unregister_waits',
  'reentrant_run_skipped',
  'no_target_counted',
  'throttle',
  'max_per_run',
  'backoff',
  'malformed',
  'capacity',
  'clear_all',
  'buffer_zeroed',
  'relay_1101_dispatch',
  'hold_1101_until_listener',
  'hold_dispatches_before_new_drain',
  'no_hold_168',
  'report_hook_unlocked',
  'relay_504_dispatch',
  'relay_1221_dispatch',
  'net_intercept_registry',
  'net_intercept_md',
  'cr_register_complete',
  'cr_failed_passed',
  'cr_late_register_hold',
  'cr_expiry_zeroed',
  'cr_unregister_race',
  'cr_no_lock_held',
  'cr_capacity',
  'cr_report_hook',
  'cr_rejects_malformed_and_168',
  'cr_held_capacity',
  'cr_max_per_run_and_backoff',
  'cr_buffer_zeroed',
  'md_broadcast',
  'md_callresult',
  'md_callresult_failed_flag',
  'md_callresult_wrong_id',
  'md_callresult_report',
  'relay_513_dispatch',
  'md_fifo_bounded',
  'md_runcallbacks_inert',
  'md_report',
  'utils_poll',
  'md_registry_unmatched_pollable',
  'mms_list_dispatch',
  'mms_rules_strings',
  'mms_unknown_handle_dropped',
  'mms_release_unmaps',
  'mms_details_slot',
  'mms_capacity',
  'mms_ping_terminal',
  'mms_malformed_ignored'
]

function spawnArgv(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('callback registry host harness (P55-3)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | undefined
  let run: { code: number | null; stdout: string; stderr: string }

  beforeAll(async () => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-cbregistry-' })
    writeFileSync(
      join(profile.root, 'gl_cb_registry.c'),
      generateCallbackRegistryC()
    )
    const exe = join(profile.root, 'cbreg')
    try {
      const cc = await spawnArgv(
        'clang',
        [
          '-std=c11',
          '-Wall',
          '-Werror',
          '-pthread',
          '-I',
          profile.root,
          '-o',
          exe,
          HARNESS
        ],
        profile.childEnv()
      )
      if (cc.code !== 0) {
        throw new Error(`harness compile failed:\n${cc.stderr}`)
      }
      run = await spawnArgv(exe, [], profile.childEnv())
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        skipReason = 'clang not found on PATH'
        console.warn(`callbackRegistryHost skipped: ${skipReason}`)
      } else {
        throw e
      }
    }
  }, 120_000)

  afterAll(() => {
    profile?.dispose()
  })

  for (const name of CASES) {
    it(`PASS ${name}`, () => {
      if (skipReason) return
      expect(run.stdout).toContain(`PASS ${name}\n`)
    })
  }

  it('harness exits 0 with no FAIL line', () => {
    if (skipReason) return
    expect(run.stdout).not.toContain('FAIL')
    expect(run.code).toBe(0)
  })
})
