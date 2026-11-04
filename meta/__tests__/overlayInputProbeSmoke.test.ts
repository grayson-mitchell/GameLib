/**
 * 60-11 (G1): proves the diagnostic input probe loads, logs caller-attributed
 * cursor-API calls to a 0600 file, and does not change behaviour. macOS only.
 *
 * The unconditional assertions need no window server (CGAssociate... is logged
 * before the real call forwards, and the NSCursor swizzle is installed at load).
 * Only the NSCursor hide/unhide call assertion is guarded by a GUI session check.
 */
import { spawn } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'
import { buildOverlayInputProbeCompileArgv } from '../buildSteamBridgeShims'

const DRIVER_SOURCE = `
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <string.h>
#import <stdio.h>

extern CFDictionaryRef CGSessionCopyCurrentDictionary(void);

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc > 1 && strcmp(argv[1], "--cursor") == 0) {
      CFDictionaryRef session = CGSessionCopyCurrentDictionary();
      if (session == NULL) {
        printf("no-window-server\\n");
        return 0;
      }
      CFRelease(session);
      [NSCursor hide];
      [NSCursor unhide];
      printf("cursor-ok\\n");
      return 0;
    }
    (void)CGAssociateMouseAndMouseCursorPosition(true);
    printf("assoc-ok\\n");
  }
  return 0;
}
`

function run(
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

const describeDarwin = process.platform === 'darwin' ? describe : describe.skip

describeDarwin('overlay input probe smoke (60-11, G1)', () => {
  jest.setTimeout(120_000)

  it('loads, hooks, and logs caller-attributed cursor calls', async () => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-probe-smoke-' })
    const tmp = mkdtempSync(join(tmpdir(), 'probe-smoke-'))
    try {
      const slice = process.arch === 'arm64' ? 'arm64' : 'x86_64'
      const probe = join(tmp, 'overlay_input_probe.dylib')
      const cc = buildOverlayInputProbeCompileArgv(slice, probe)
      const baseEnv = profile.childEnv(process.env)
      const built = await run(cc.command, cc.args, baseEnv)
      if (built.code !== 0) {
        throw new Error(`probe compile failed:\n${built.stderr}`)
      }
      const signed = await run('codesign', ['-fs', '-', probe], baseEnv)
      expect(signed.code).toBe(0)

      const driverSrc = join(tmp, 'driver.m')
      const driver = join(tmp, 'probedriver')
      writeFileSync(driverSrc, DRIVER_SOURCE)
      const dc = await run(
        'clang',
        [
          '-arch',
          slice,
          '-framework',
          'AppKit',
          '-framework',
          'CoreGraphics',
          '-framework',
          'Foundation',
          '-o',
          driver,
          driverSrc
        ],
        baseEnv
      )
      if (dc.code !== 0) {
        throw new Error(`driver compile failed:\n${dc.stderr}`)
      }

      const logPath = join(tmp, 'probe.log')
      const env = profile.childEnv({
        ...process.env,
        DYLD_INSERT_LIBRARIES: probe,
        GAMELIB_OVERLAY_PROBE_LOG: logPath
      })

      const first = await run(driver, [], env)
      if (first.code !== 0) {
        throw new Error(`driver exited ${first.code}:\n${first.stderr}`)
      }
      const log = readFileSync(logPath, 'utf8')
      expect(log).toContain('overlay_probe')
      const load = log.split('\n').find((l) => l.includes(' load '))
      expect(load).toBeDefined()
      const hooks = /objc_hooks=(\d+)/.exec(load ?? '')
      expect(Number(hooks?.[1])).toBeGreaterThanOrEqual(2)
      const assoc = log
        .split('\n')
        .find((l) => l.includes('CGAssociateMouseAndMouseCursorPosition'))
      expect(assoc).toBeDefined()
      expect(assoc).toContain('arg=1')
      expect(assoc).toContain('caller=probedriver')
      expect(statSync(logPath).mode & 0o777).toBe(0o600)

      const second = await run(driver, ['--cursor'], env)
      if (second.code !== 0) {
        throw new Error(
          `driver --cursor exited ${second.code}:\n${second.stderr}`
        )
      }
      if (second.stdout.includes('no-window-server')) {
        console.warn('NSCursor hook call not exercised: no window server')
      } else {
        const after = readFileSync(logPath, 'utf8')
        expect(after).toContain('NSCursor-hide')
        expect(after).toContain('NSCursor-unhide')
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      profile.dispose()
    }
  })
})
