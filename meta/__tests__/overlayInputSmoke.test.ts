/**
 * 60-19 (G1): smoke proof of overlay_input.dylib (production fix, signal cb,
 * X-RELEASE+BLOCK per the 60-18 verdict). Fake images are named exactly as the
 * module matches them (`winemac.so`, `setactive.dylib`); a driver subclasses
 * NSApplication as WineApplication. macOS only.
 * This suite is desktop-interactive (warps the real cursor, opens windows, may
 * beep) and is skipped with a logged warning unless GAMELIB_DESKTOP_SMOKE=1 is
 * set: GAMELIB_DESKTOP_SMOKE=1 npx jest --selectProjects Meta --runTestsByPath meta/__tests__/overlayInputSmoke.test.ts
 * Every case needs a window
 * server: 60-REVIEW WR-05 decides that at collect time (launchctl managername
 * is Aqua), so a headless host reports the cases as skipped, and a host that
 * should have one but whose driver finds none fails instead of passing.
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'
import { buildOverlayInputCompileArgv } from '../buildSteamBridgeShims'

const DRIVER_SOURCE = `
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <string.h>
#import <stdio.h>
#import <dlfcn.h>
#import <notify.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <sys/wait.h>
#import <unistd.h>

extern CFDictionaryRef CGSessionCopyCurrentDictionary(void);

static void spin(double seconds) {
  CFRunLoopRunInMode(kCFRunLoopDefaultMode, seconds, false);
}

// WR-05: the real AppKit state the module must change, read back directly.
static void print_rect(const char *label, NSWindow *w) {
  NSRect r = ((NSRect (*)(id, SEL))objc_msgSend)(w, sel_registerName("mouseConfinementRect"));
  printf("%s=%g,%g,%g,%g\\n", label, r.origin.x, r.origin.y, r.size.width, r.size.height);
}

static void post_cb(const char *appid, uint64_t state) {
  char name[96];
  int token = 0;
  snprintf(name, sizeof(name), "com.gamelib.steambridge.overlay.%s", appid);
  notify_register_check(name, &token);
  notify_set_state(token, state);
  notify_post(name);
  spin(0.3);
  notify_cancel(token);
}

// WR-01: the helper's open state, (pid << 8) | 1 (gamelib_overlay_signal.h).
static uint64_t open_state(pid_t pid) {
  return ((uint64_t)(uint32_t)pid << 8) | 1u;
}

// argv: <appid> <winemac.so> <setactive.dylib|-> [--noclass] [--flood]
//       [--livepub | --deadpub]
int main(int argc, char **argv) {
  @autoreleasepool {
    const char *appid = argv[1];
    int noclass = 0, flood = 0, livepub = 0, deadpub = 0;
    for (int i = 4; i < argc; i++) {
      if (strcmp(argv[i], "--noclass") == 0) noclass = 1;
      if (strcmp(argv[i], "--flood") == 0) flood = 1;
      if (strcmp(argv[i], "--livepub") == 0) livepub = 1;
      if (strcmp(argv[i], "--deadpub") == 0) deadpub = 1;
    }
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
    if (strcmp(argv[3], "-") != 0) {
      if (dlopen(argv[3], RTLD_NOW | RTLD_GLOBAL) == NULL) { printf("setactive-dlopen-failed\\n"); return 1; }
    }
    void *wm = dlopen(argv[2], RTLD_NOW | RTLD_GLOBAL);
    if (wm == NULL) { printf("winemac-dlopen-failed %s\\n", dlerror()); return 1; }
    void (*wm_assoc)(int) = (void (*)(int))dlsym(wm, "wm_assoc");
    void (*wm_warp)(void) = (void (*)(void))dlsym(wm, "wm_warp");
    void (*wm_hide)(void) = (void (*)(void))dlsym(wm, "wm_hide");
    void (*wm_confine)(id, double, double, double, double) =
        (void (*)(id, double, double, double, double))dlsym(wm, "wm_confine");
    // A real window: open must clear its confinement, close must replay it.
    NSWindow *win = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 40, 40)
                                                styleMask:NSWindowStyleMaskBorderless
                                                  backing:NSBackingStoreBuffered
                                                    defer:NO];
    spin(0.4);
    wm_assoc(0);
    wm_hide();
    wm_confine(win, 1, 2, 30, 40);
    print_rect("rect_before", win);
    if (livepub) {
      // A live publisher (this process): the watch must never close.
      post_cb(appid, open_state(getpid()));
      spin(4.5);
    } else if (deadpub) {
      // A reaped child's pid: kill(pid, 0) is ESRCH, the watch must close.
      pid_t child = fork();
      if (child == 0) _exit(0);
      waitpid(child, NULL, 0);
      post_cb(appid, open_state(child));
      spin(4.5);
      printf("deadpub-waited\\n");
    } else {
      post_cb(appid, 1);
    }
    print_rect("rect_open", win);
    wm_assoc(0);
    wm_warp();
    wm_confine(win, 5, 6, 70, 80);
    print_rect("rect_deferred", win);
    if (flood) for (int i = 0; i < 500; i++) wm_assoc(0);
    (void)CGAssociateMouseAndMouseCursorPosition(false); // driver itself: forwarded
    post_cb(appid, 0);
    print_rect("rect_after", win);
    if (flood) {
      // WR-03: a second open/close after the flood must still be logged.
      post_cb(appid, 1);
      wm_warp();
      post_cb(appid, 0);
    }
    // Leave the user's mouse and cursor as we found them.
    ((void (*)(id, SEL, NSRect))objc_msgSend)(win, sel_registerName("setMouseConfinementRect:"), NSZeroRect);
    [win close];
    (void)CGAssociateMouseAndMouseCursorPosition(true);
    [NSCursor unhide];
    printf("done\\n");
  }
  return 0;
}
`

const WINEMAC_SOURCE = `
#include <CoreGraphics/CoreGraphics.h>
#include <objc/message.h>
#include <objc/runtime.h>
void wm_assoc(int a) { CGAssociateMouseAndMouseCursorPosition(a); }
void wm_warp(void) { CGWarpMouseCursorPosition(CGPointMake(10, 10)); }
void wm_hide(void) {
  ((void (*)(id, SEL))objc_msgSend)((id)objc_getClass("NSCursor"), sel_registerName("hide"));
}
void wm_confine(id w, double x, double y, double wd, double h) {
  ((void (*)(id, SEL, CGRect))objc_msgSend)(w, sel_registerName("setMouseConfinementRect:"),
                                            CGRectMake(x, y, wd, h));
}
`

const SETACTIVE_SOURCE = `
#include <stdio.h>
void np_overlay_shim_set_active(int a) { printf("set_active %d\\n", a); fflush(stdout); }
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

// These cases warp the real cursor, open windows and beep, so they are opt-in.
const desktopSmoke = process.env.GAMELIB_DESKTOP_SMOKE === '1'
const describeDarwin =
  process.platform === 'darwin' && desktopSmoke ? describe : describe.skip

if (process.platform === 'darwin' && !desktopSmoke) {
  console.warn(
    'overlay_input smoke: SKIPPED, desktop-interactive (warps the cursor, opens windows); set GAMELIB_DESKTOP_SMOKE=1 to run'
  )
}

// WR-05: an explicit, logged skip without a window server, never a silent pass.
function hasWindowServer(): boolean {
  if (process.platform !== 'darwin') return false
  const profile = createFakeHomeProfile({ prefix: 'gamelib-ovlin-ws-' })
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
const windowServer = desktopSmoke && hasWindowServer()
if (process.platform === 'darwin' && desktopSmoke && !windowServer) {
  console.warn(
    'overlay_input smoke: SKIPPED, no window server (launchctl managername is not Aqua)'
  )
}
const itWindowServer = windowServer ? it : it.skip

describeDarwin('overlay_input.dylib smoke (60-19, G1)', () => {
  jest.setTimeout(240_000)

  const slice = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  let tmp = ''
  let dylib = ''
  let driver = ''
  let serviceDriver = ''
  let winemac = ''
  let setactive = ''
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
    const profile = createFakeHomeProfile({ prefix: 'gamelib-ovlin-build-' })
    tmp = mkdtempSync(join(tmpdir(), 'ovlin-smoke-'))
    try {
      const baseEnv = profile.childEnv(process.env)
      dylib = join(tmp, 'overlay_input.dylib')
      const cc = buildOverlayInputCompileArgv(slice, dylib)
      const built = await run(cc.command, cc.args, baseEnv)
      if (built.code !== 0) {
        throw new Error(`overlay_input compile failed:\n${built.stderr}`)
      }
      const signed = await run('codesign', ['-fs', '-', dylib], baseEnv)
      expect(signed.code).toBe(0)

      const driverSrc = join(tmp, 'driver.m')
      driver = join(tmp, 'inputdriver')
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
      // Same binary under a Wine service executable name: must stay inactive.
      mkdirSync(join(tmp, 'svc'))
      serviceDriver = join(tmp, 'svc', 'explorer.exe')
      copyFileSync(driver, serviceDriver)

      // The fakes must carry the exact names the module matches on.
      for (const d of ['wm', 'sa']) mkdirSync(join(tmp, d))
      winemac = join(tmp, 'wm', 'winemac.so')
      setactive = join(tmp, 'sa', 'setactive.dylib')
      await buildDylib(WINEMAC_SOURCE, winemac, baseEnv)
      await buildDylib(SETACTIVE_SOURCE, setactive, baseEnv)
    } finally {
      profile.dispose()
    }
  })

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  async function runDriver(
    args: string[],
    bin: string = driver
  ): Promise<{ stdout: string; stderr: string }> {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-ovlin-smoke-' })
    try {
      const id = `${process.pid}${++counter}`
      const env = profile.childEnv({
        ...process.env,
        DYLD_INSERT_LIBRARIES: dylib,
        SteamAppId: id
      })
      const r = await run(bin, [id, ...args], env)
      if (r.code !== 0) {
        throw new Error(
          `driver ${args.join(' ')} exited ${r.code}:\n${r.stdout}${r.stderr}`
        )
      }
      return { stdout: r.stdout, stderr: r.stderr }
    } finally {
      profile.dispose()
    }
  }

  const requireExercised = (stdout: string): void => {
    if (stdout.includes('no-window-server')) {
      throw new Error(
        'launchctl reports Aqua but the driver found no window server: not exercised'
      )
    }
  }

  const countOf = (text: string, needle: string): number =>
    text.split(needle).length - 1

  itWindowServer(
    'releases on open, defers winemac re-capture, forwards others, replays once, blocks',
    async () => {
      const { stdout, stderr } = await runDriver([winemac, setactive])
      requireExercised(stdout)
      expect(countOf(stderr, 'overlay_input open')).toBe(1)
      // WR-05: the release itself. Every window's confinement was cleared, the
      // one recorded winemac hide was undone and associate(1) was issued.
      expect(stderr).toMatch(
        /overlay_input open windows=[1-9]\d* unhide=1 assoc=1 err=-?\d+/
      )
      // ...and the real window state agrees: winemac's rect was in force, open
      // cleared it, winemac's new rect while open was deferred (still clear), and
      // close replayed that latest rect.
      expect(stdout).toContain('rect_before=1,2,30,40')
      expect(stdout).toContain('rect_open=0,0,0,0')
      expect(stdout).toContain('rect_deferred=0,0,0,0')
      expect(stdout).toContain('rect_after=5,6,70,80')
      expect(stderr).toContain('overlay_input deferred CGAssociate')
      expect(stderr).toContain(
        'overlay_input deferred CGWarpMouseCursorPosition'
      )
      expect(stderr).toContain('overlay_input deferred setMouseConfinementRect')
      // The driver's own dissociate while open is forwarded, never reported deferred.
      expect(countOf(stderr, 'overlay_input deferred CGAssociate')).toBe(1)
      expect(countOf(stderr, 'overlay_input close')).toBe(1)
      // WR-03/WR-05: per-open deferred total (assoc + warp + rect) and the replay
      // of winemac's latest state: dissociated, one hide, the rect.
      expect(stderr).toContain(
        'overlay_input close deferred=3 assoc=0 hide=1 rect=replayed'
      )
      expect(stderr.indexOf('overlay_input close')).toBeGreaterThan(
        stderr.indexOf('overlay_input open')
      )
      expect(stdout.indexOf('set_active 1')).toBeGreaterThanOrEqual(0)
      expect(stdout.indexOf('set_active 0')).toBeGreaterThan(
        stdout.indexOf('set_active 1')
      )
    }
  )

  itWindowServer(
    'WR-01: a live publisher pid never closes the overlay by itself',
    async () => {
      const { stdout, stderr } = await runDriver([
        winemac,
        setactive,
        '--livepub'
      ])
      requireExercised(stdout)
      expect(stderr).not.toContain('overlay_input publisher gone')
      // Still open after two poll intervals: the later winemac call is deferred.
      expect(stderr).toContain(
        'overlay_input deferred CGWarpMouseCursorPosition'
      )
      expect(countOf(stderr, 'overlay_input close')).toBe(1)
    }
  )

  itWindowServer(
    'WR-01: a dead publisher pid closes once (set_active 0) without a close post',
    async () => {
      const { stdout, stderr } = await runDriver([
        winemac,
        setactive,
        '--deadpub'
      ])
      requireExercised(stdout)
      expect(stderr).toMatch(/overlay_input publisher gone pid=\d+/)
      const gone = stderr.indexOf('overlay_input publisher gone')
      expect(stderr.indexOf('overlay_input close')).toBeGreaterThan(gone)
      // The driver's later close post finds nothing open: still one close.
      expect(countOf(stderr, 'overlay_input close')).toBe(1)
      // Closed before the driver's own winemac calls: nothing deferred.
      expect(stderr).not.toContain('overlay_input deferred')
      expect(stdout.indexOf('set_active 0')).toBeGreaterThan(
        stdout.indexOf('set_active 1')
      )
      expect(stdout.indexOf('set_active 0')).toBeLessThan(
        stdout.indexOf('deadpub-waited')
      )
    }
  )

  itWindowServer(
    'logs set_active absent once and does not crash without the shim',
    async () => {
      const { stdout, stderr } = await runDriver([winemac, '-'])
      requireExercised(stdout)
      expect(countOf(stderr, 'overlay_input set_active absent')).toBe(1)
      expect(stderr).toContain('overlay_input close')
    }
  )

  itWindowServer('stays inactive without WineApplication, once', async () => {
    const { stdout, stderr } = await runDriver([winemac, '-', '--noclass'])
    requireExercised(stdout)
    expect(countOf(stderr, 'overlay_input inactive')).toBe(1)
    expect(stderr).not.toContain('overlay_input open')
  })

  itWindowServer(
    'stays inactive in a Wine service process (explorer.exe)',
    async () => {
      const { stdout, stderr } = await runDriver(
        [winemac, setactive],
        serviceDriver
      )
      requireExercised(stdout)
      expect(countOf(stderr, 'overlay_input inactive')).toBe(1)
      expect(stderr).not.toContain('overlay_input open')
      expect(stdout).not.toContain('set_active')
    }
  )

  itWindowServer(
    'caps deferred lines under 500 deferred calls and keeps every lifecycle line (WR-03)',
    async () => {
      const { stdout, stderr } = await runDriver([winemac, '-', '--flood'])
      requireExercised(stdout)
      const lines = stderr
        .split('\n')
        .filter((l) => l.startsWith('overlay_input'))
      const deferred = lines.filter((l) =>
        l.startsWith('overlay_input deferred ')
      )
      expect(deferred.length).toBe(32)
      expect(lines.length).toBeLessThanOrEqual(256 + 32)
      // Both cycles' lifecycle lines survive the flood; counts are per open.
      expect(
        lines.filter((l) => l.startsWith('overlay_input open '))
      ).toHaveLength(2)
      expect(
        lines.filter((l) => l.startsWith('overlay_input close deferred='))
      ).toEqual([
        'overlay_input close deferred=503 assoc=0 hide=1 rect=replayed',
        'overlay_input close deferred=1 assoc=0 hide=1 rect=replayed'
      ])
      expect(countOf(stderr, 'overlay_input set_active absent')).toBe(1)
    }
  )
})
