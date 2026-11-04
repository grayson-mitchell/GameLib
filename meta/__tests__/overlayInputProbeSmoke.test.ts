/**
 * 60-11 (G1): proves the diagnostic input probe loads, logs caller-attributed
 * cursor-API calls to a 0600 file, and does not change behaviour. macOS only.
 *
 * The unconditional assertions need no window server (CGAssociate... is logged
 * before the real call forwards, and the NSCursor swizzle is installed at load).
 * Only the NSCursor hide/unhide call assertion and the 60-17 experiment cases
 * need a GUI session. 60-REVIEW WR-05: that is decided at collect time
 * (launchctl managername is Aqua); without one those cases are reported as
 * skipped, and with one a driver that finds no window server fails the case.
 *
 * 60-17 extends it: the cb signal, caller-attributed renderer calls, the
 * interpose-visibility characterisation, image order, neutrality when the
 * experiment is unset, and the opt-in release / defer / replay experiment.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  mkdirSync,
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
#import <dlfcn.h>
#import <notify.h>
#import <objc/runtime.h>

extern CFDictionaryRef CGSessionCopyCurrentDictionary(void);

static void spin(double seconds) {
  CFRunLoopRunInMode(kCFRunLoopDefaultMode, seconds, false);
}

static void post_cb(const char *appid, int state) {
  char name[96];
  int token = 0;
  snprintf(name, sizeof(name), "com.gamelib.steambridge.overlay.%s", appid);
  notify_register_check(name, &token);
  notify_set_state(token, (uint64_t)state);
  notify_post(name);
  spin(0.3);
  notify_cancel(token);
}

// argv: --exp|--key <appid> <winemac.so> <setactive.dylib|-> [--noclass]
static int run_experiment(int argc, char **argv) {
  int key = strcmp(argv[1], "--key") == 0;
  const char *appid = argv[2];
  int noclass = argc > 5 && strcmp(argv[5], "--noclass") == 0;
  CFDictionaryRef session = CGSessionCopyCurrentDictionary();
  if (session == NULL) {
    printf("no-window-server\\n");
    return 0;
  }
  CFRelease(session);
  if (noclass) {
    [NSApplication sharedApplication];
  } else {
    Class c = objc_allocateClassPair([NSApplication class], "WineApplication", 0);
    objc_registerClassPair(c);
    [c sharedApplication];
  }
  if (strcmp(argv[4], "-") != 0) {
    if (dlopen(argv[4], RTLD_NOW | RTLD_GLOBAL) == NULL) { printf("setactive-dlopen-failed\\n"); return 1; }
  }
  void *wm = dlopen(argv[3], RTLD_NOW | RTLD_GLOBAL);
  if (wm == NULL) { printf("winemac-dlopen-failed %s\\n", dlerror()); return 1; }
  void (*wm_assoc)(int) = (void (*)(int))dlsym(wm, "wm_assoc");
  void (*wm_warp)(void) = (void (*)(void))dlsym(wm, "wm_warp");
  void (*wm_hide)(void) = (void (*)(void))dlsym(wm, "wm_hide");
  spin(0.4);
  wm_assoc(0);
  wm_hide();
  if (key) {
    for (int i = 0; i < 2; i++) {
      NSEvent *ev = [NSEvent keyEventWithType:NSEventTypeKeyDown
                                     location:NSZeroPoint
                                modifierFlags:NSEventModifierFlagShift
                                    timestamp:0
                                 windowNumber:0
                                      context:nil
                                   characters:@"\\t"
                  charactersIgnoringModifiers:@"\\t"
                                    isARepeat:NO
                                      keyCode:48];
      [NSApp sendEvent:ev];
      spin(0.3);
    }
  } else {
    post_cb(appid, 1);
    wm_assoc(0);
    wm_warp();
    (void)CGAssociateMouseAndMouseCursorPosition(false); // driver itself: must be forwarded
    post_cb(appid, 0);
  }
  // Leave the user's mouse and cursor as we found them.
  (void)CGAssociateMouseAndMouseCursorPosition(true);
  [NSCursor unhide];
  printf("exp-done\\n");
  return 0;
}

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
    if (argc > 1 && strcmp(argv[1], "--cb") == 0) {
      post_cb(argv[2], 1);
      post_cb(argv[2], 0);
      printf("cb-ok\\n");
      return 0;
    }
    if (argc > 2 && strcmp(argv[1], "--renderer") == 0) {
      void *h = dlopen(argv[2], RTLD_NOW);
      if (h == NULL) { printf("dlopen-failed %s\\n", dlerror()); return 1; }
      void (*trigger)(void) = (void (*)(void))dlsym(h, "trigger");
      if (trigger == NULL) { printf("no-trigger\\n"); return 1; }
      trigger();
      (void)CGAssociateMouseAndMouseCursorPosition(true);
      printf("renderer-ok\\n");
      return 0;
    }
    if (argc > 4 && (strcmp(argv[1], "--exp") == 0 || strcmp(argv[1], "--key") == 0)) {
      return run_experiment(argc, argv);
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

// WR-05: an explicit, logged skip without a window server, never a silent pass.
function hasWindowServer(): boolean {
  if (process.platform !== 'darwin') return false
  const profile = createFakeHomeProfile({ prefix: 'gamelib-ovlprobe-ws-' })
  try {
    const r = spawnSync('launchctl', ['managername'], {
      encoding: 'utf8',
      env: profile.childEnv(process.env),
      timeout: 10_000
    })
    return r.status === 0 && r.stdout.trim() === 'Aqua'
  } finally {
    profile.dispose()
  }
}
const windowServer = hasWindowServer()
if (process.platform === 'darwin' && !windowServer) {
  console.warn(
    'overlay input probe smoke: GUI cases SKIPPED, no window server (launchctl managername is not Aqua)'
  )
}
const itWindowServer = windowServer ? it : it.skip
const requireExercised = (stdout: string): void => {
  if (stdout.includes('no-window-server')) {
    throw new Error(
      'launchctl reports Aqua but the driver found no window server: not exercised'
    )
  }
}

const WINEMAC_SOURCE = `
#include <CoreGraphics/CoreGraphics.h>
#include <objc/message.h>
#include <objc/runtime.h>
void wm_assoc(int a) { CGAssociateMouseAndMouseCursorPosition(a); }
void wm_warp(void) { CGWarpMouseCursorPosition(CGPointMake(10, 10)); }
void wm_hide(void) {
  ((void (*)(id, SEL))objc_msgSend)((id)objc_getClass("NSCursor"), sel_registerName("hide"));
}
`

const SETACTIVE_SOURCE = `
#include <stdio.h>
void np_overlay_shim_set_active(int a) { printf("set_active %d\\n", a); fflush(stdout); }
`

const RENDERER_PLAIN_SOURCE = `
#include <CoreGraphics/CoreGraphics.h>
void trigger(void) { CGAssociateMouseAndMouseCursorPosition(1); }
`

const RENDERER_INTERPOSE_SOURCE = `
#include <CoreGraphics/CoreGraphics.h>
static CGError renderer_assoc(boolean_t c) { return CGAssociateMouseAndMouseCursorPosition(c); }
__attribute__((used)) static struct { const void *r; const void *o; } renderer_interpose
    __attribute__((section("__DATA,__interpose"))) = {
      (const void *)renderer_assoc, (const void *)CGAssociateMouseAndMouseCursorPosition };
void trigger(void) { CGAssociateMouseAndMouseCursorPosition(1); }
`

describeDarwin('overlay input probe smoke (60-11, 60-17, G1)', () => {
  jest.setTimeout(240_000)

  const slice = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  let tmp = ''
  let probe = ''
  let driver = ''
  let winemac = ''
  let setactive = ''
  let rendererPlain = ''
  let rendererInterpose = ''
  let counter = 0

  async function buildDylib(
    source: string,
    out: string,
    env: NodeJS.ProcessEnv
  ): Promise<void> {
    const src = out.replace(/\.[^./]+$/, '') + '.c'
    writeFileSync(src, source)
    const r = await run(
      'clang',
      [
        '-arch',
        slice,
        '-dynamiclib',
        '-framework',
        'CoreGraphics',
        '-framework',
        'AppKit',
        '-o',
        out,
        src
      ],
      env
    )
    if (r.code !== 0) throw new Error(`dylib compile failed:\n${r.stderr}`)
  }

  beforeAll(async () => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-probe-build-' })
    tmp = mkdtempSync(join(tmpdir(), 'probe-smoke-'))
    try {
      const baseEnv = profile.childEnv(process.env)
      probe = join(tmp, 'overlay_input_probe.dylib')
      const cc = buildOverlayInputProbeCompileArgv(slice, probe)
      const built = await run(cc.command, cc.args, baseEnv)
      if (built.code !== 0) {
        throw new Error(`probe compile failed:\n${built.stderr}`)
      }
      const signed = await run('codesign', ['-fs', '-', probe], baseEnv)
      expect(signed.code).toBe(0)

      const driverSrc = join(tmp, 'driver.m')
      driver = join(tmp, 'probedriver')
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

      // The fakes must carry the exact names the probe matches on.
      for (const d of ['wm', 'sa', 'plain', 'interpose']) {
        mkdirSync(join(tmp, d))
      }
      winemac = join(tmp, 'wm', 'winemac.so')
      setactive = join(tmp, 'sa', 'setactive.dylib')
      rendererPlain = join(tmp, 'plain', 'gameoverlayrenderer.dylib')
      rendererInterpose = join(tmp, 'interpose', 'gameoverlayrenderer.dylib')
      await buildDylib(WINEMAC_SOURCE, winemac, baseEnv)
      await buildDylib(SETACTIVE_SOURCE, setactive, baseEnv)
      await buildDylib(RENDERER_PLAIN_SOURCE, rendererPlain, baseEnv)
      await buildDylib(RENDERER_INTERPOSE_SOURCE, rendererInterpose, baseEnv)
    } finally {
      profile.dispose()
    }
  })

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  async function runDriver(
    args: string[],
    extraEnv: Record<string, string> = {}
  ): Promise<{ code: number | null; stdout: string; log: string }> {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-probe-smoke-' })
    try {
      const logPath = join(tmp, `probe-${counter++}.log`)
      const env = profile.childEnv({
        ...process.env,
        DYLD_INSERT_LIBRARIES: probe,
        GAMELIB_OVERLAY_PROBE_LOG: logPath,
        ...extraEnv
      })
      const r = await run(driver, args, env)
      if (r.code !== 0) {
        throw new Error(
          `driver ${args.join(' ')} exited ${r.code}:\n${r.stdout}${r.stderr}`
        )
      }
      let log = ''
      try {
        log = readFileSync(logPath, 'utf8')
      } catch {
        // no log written
      }
      return { code: r.code, stdout: r.stdout, log }
    } finally {
      profile.dispose()
    }
  }

  it('loads, hooks, and logs caller-attributed cursor calls', async () => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-probe-smoke-' })
    try {
      const logPath = join(tmp, 'probe-base.log')
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
      expect(load).toContain('c_hooks=10')
      const assoc = log
        .split('\n')
        .find((l) => l.includes('CGAssociateMouseAndMouseCursorPosition'))
      expect(assoc).toBeDefined()
      expect(assoc).toContain('arg=1')
      expect(assoc).toContain('caller=probedriver')
      expect(statSync(logPath).mode & 0o777).toBe(0o600)
      expect(log).toContain('image overlay_input_probe.dylib order=')
      // Neutral when the experiment is unset.
      expect(log).not.toContain('experiment')
      expect(log).not.toContain('deferred')

      const second = await run(driver, ['--cursor'], env)
      if (second.code !== 0) {
        throw new Error(
          `driver --cursor exited ${second.code}:\n${second.stderr}`
        )
      }
      if (!windowServer) {
        console.warn('NSCursor hook call SKIPPED: no window server')
      } else {
        requireExercised(second.stdout)
        const after = readFileSync(logPath, 'utf8')
        expect(after).toContain('NSCursor-hide')
        expect(after).toContain('NSCursor-unhide')
      }
    } finally {
      profile.dispose()
    }
  })

  it('observes cb active=1 then active=0', async () => {
    const id = `${process.pid}${++counter}`
    const { log } = await runDriver(['--cb', id], { SteamAppId: id })
    const one = log.indexOf('signal cb active=1')
    const zero = log.indexOf('signal cb active=0')
    expect(one).toBeGreaterThanOrEqual(0)
    expect(zero).toBeGreaterThan(one)
    expect(log).not.toContain('experiment')
    expect(log).not.toContain('deferred')
  })

  it('attributes calls from a plain gameoverlayrenderer.dylib and logs image order', async () => {
    const { log } = await runDriver(['--renderer', rendererPlain])
    expect(log).toContain('caller=gameoverlayrenderer.dylib')
    expect(log).toContain('image gameoverlayrenderer.dylib order=')
  })

  it('characterises whether the probe sees a renderer carrying its own interpose', async () => {
    const { log } = await runDriver(['--renderer', rendererInterpose])
    const seen = log.includes('caller=gameoverlayrenderer.dylib')
    console.log(`interpose-visibility: ${seen ? 'seen' : 'unseen'}`)
    expect(log).toContain('image gameoverlayrenderer.dylib order=')
  })

  describe('release-on-open experiment (60-17)', () => {
    itWindowServer(
      'cb:release releases, defers winemac re-capture, forwards others, replays once',
      async () => {
        const id = `${process.pid}${++counter}`
        const { stdout, log } = await runDriver(['--exp', id, winemac, '-'], {
          SteamAppId: id,
          GAMELIB_OVERLAY_RELEASE_EXPERIMENT: 'cb:release'
        })
        requireExercised(stdout)
        const lines = log.split('\n')
        expect(log).toContain('experiment open source=cb action=release')
        expect(log).toMatch(/experiment release assoc=1 windows=\d+ unhide=1/)
        expect(
          lines.some(
            (l) =>
              l.includes('CGAssociateMouseAndMouseCursorPosition') &&
              l.includes('caller=experiment')
          )
        ).toBe(true)
        expect(log).toContain(
          'deferred CGAssociateMouseAndMouseCursorPosition caller=winemac.so'
        )
        expect(log).toContain(
          'deferred CGWarpMouseCursorPosition caller=winemac.so'
        )
        // The driver's own dissociate while open is forwarded, not deferred.
        expect(
          lines.some(
            (l) =>
              l.includes('CGAssociateMouseAndMouseCursorPosition') &&
              l.includes('caller=probedriver') &&
              l.includes('arg=0')
          )
        ).toBe(true)
        expect(
          lines.filter(
            (l) => l.includes('deferred') && l.includes('probedriver')
          )
        ).toHaveLength(0)
        const closes = lines.filter((l) => l.includes('experiment close'))
        expect(closes).toHaveLength(1)
        expect(closes[0]).toMatch(
          /reason=signal replay assoc=0 rect=none hide=1/
        )
      }
    )

    itWindowServer(
      'cb:release+block drives set_active 1 on open and 0 on close',
      async () => {
        const id = `${process.pid}${++counter}`
        const args = ['--exp', id, winemac, setactive]
        const env = {
          SteamAppId: id,
          GAMELIB_OVERLAY_RELEASE_EXPERIMENT: 'cb:release+block'
        }
        const { stdout, log } = await runDriver(args, env)
        requireExercised(stdout)
        expect(stdout.indexOf('set_active 1')).toBeGreaterThanOrEqual(0)
        expect(stdout.indexOf('set_active 0')).toBeGreaterThan(
          stdout.indexOf('set_active 1')
        )
        expect(log).toContain('experiment open source=cb action=release+block')

        const absent = await runDriver(['--exp', id, winemac, '-'], env)
        expect(absent.log).toContain('experiment set_active absent')
      }
    )

    itWindowServer(
      'stays inactive without the WineApplication class',
      async () => {
        const id = `${process.pid}${++counter}`
        const { stdout, log } = await runDriver(
          ['--exp', id, winemac, '-', '--noclass'],
          { SteamAppId: id, GAMELIB_OVERLAY_RELEASE_EXPERIMENT: 'cb:release' }
        )
        requireExercised(stdout)
        expect(
          log.split('experiment inactive reason=no-wineapp').length - 1
        ).toBe(1)
        expect(log).not.toContain('experiment open')
        expect(log).not.toContain('deferred')
      }
    )

    it('rejects an invalid experiment value and stays neutral', async () => {
      const { log } = await runDriver([], {
        GAMELIB_OVERLAY_RELEASE_EXPERIMENT: 'bogus'
      })
      expect(log).toContain('experiment off reason=invalid')
      expect(log).not.toContain('experiment open')
    })

    itWindowServer(
      'key:release toggles open then close on two Shift+Tab presses',
      async () => {
        const { stdout, log } = await runDriver(['--key', '1', winemac, '-'], {
          GAMELIB_OVERLAY_RELEASE_EXPERIMENT: 'key:release'
        })
        requireExercised(stdout)
        expect(log.split('signal key shift+tab').length - 1).toBe(2)
        expect(log).toContain('experiment open source=key')
        expect(log).toContain('experiment close reason=signal')
      }
    )
  })
})
