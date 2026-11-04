/**
 * 60-15: compiled C driver test of gamelib_overlay_signal.h (parse, name
 * validation, notify state round trip, the WR-01 pid-carrying open state).
 * Darwin only.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

const HEADER = resolve(
  __dirname,
  '../../native/steam-bridge/helper/gamelib_overlay_signal.h'
)

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((res, reject) => {
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
    child.on('close', (code) => res({ code, stdout, stderr }))
  })
}

const describeDarwin = process.platform === 'darwin' ? describe : describe.skip

describeDarwin('gamelib_overlay_signal.h (60-15)', () => {
  it('passes every behavior line', async () => {
    const suffix = String(process.pid)
    const driver = `
#include <stdio.h>
#include <string.h>
#include "${HEADER}"
int main(void) {
  char buf[64];
  uint8_t on[2] = {1, 7}, off[1] = {0};
  printf("parse_null=%d\\n", gl_ovl_parse_active(NULL, 4));
  printf("parse_cub0=%d\\n", gl_ovl_parse_active(on, 0));
  printf("parse_off=%d\\n", gl_ovl_parse_active(off, 1));
  printf("parse_on=%d\\n", gl_ovl_parse_active(on, 2));
  printf("name_ok=%d\\n", gl_ovl_notify_name(buf, sizeof buf, "${suffix}"));
  printf("name=%s\\n", buf);
  printf("name_empty=%d\\n", gl_ovl_notify_name(buf, sizeof buf, ""));
  printf("name_empty_buf=[%s]\\n", buf);
  printf("name_alpha=%d\\n", gl_ovl_notify_name(buf, sizeof buf, "12a"));
  printf("name_long=%d\\n", gl_ovl_notify_name(buf, sizeof buf, "12345678901"));
  printf("name_null=%d\\n", gl_ovl_notify_name(buf, sizeof buf, NULL));
  printf("name_small=%d\\n", gl_ovl_notify_name(buf, 10, "${suffix}"));
  printf("name_small_buf=[%s]\\n", buf);
  printf("env_1=%d\\n", gl_ovl_enabled_from_env("1"));
  printf("env_11=%d\\n", gl_ovl_enabled_from_env("11"));
  printf("env_null=%d\\n", gl_ovl_enabled_from_env(NULL));
  gl_ovl_state s; memset(&s, 0, sizeof s);
  gl_ovl_notify_name(s.name, sizeof s.name, "${suffix}");
  int tok, chk;
  uint64_t st;
  notify_register_check(s.name, &tok);
  notify_check(tok, &chk); /* consume initial */
  printf("pid=%d\\n", (int)getpid());
  printf("open_state_7=%llu\\n", (unsigned long long)gl_ovl_open_state(7));
  printf("pub1=%d\\n", gl_ovl_publish(&s, 1));
  notify_get_state(tok, &st);
  printf("state_after_1=%llu\\n", (unsigned long long)st);
  notify_check(tok, &chk);
  printf("changed_1=%d\\n", chk);
  printf("pub0=%d\\n", gl_ovl_publish(&s, 0));
  notify_get_state(tok, &st);
  printf("state_after_0=%llu\\n", (unsigned long long)st);
  notify_check(tok, &chk);
  printf("changed_0=%d\\n", chk);
  gl_ovl_state b; memset(&b, 0, sizeof b);
  int taken = 0, i;
  for (i = 0; i < 400; i++) taken += gl_ovl_log_take(&b);
  printf("budget_off=%d\\n", taken);
  b.log = 1; taken = 0;
  for (i = 0; i < 400; i++) taken += gl_ovl_log_take(&b);
  printf("budget=%d\\n", taken);
  return 0;
}
`
    const dir = mkdtempSync(join(tmpdir(), 'gamelib-ovl-signal-src-'))
    const profile = createFakeHomeProfile({ prefix: 'gamelib-ovl-signal-' })
    try {
      const src = join(dir, 'driver.c')
      const bin = join(dir, 'driver')
      writeFileSync(src, driver)
      const env = profile.childEnv(process.env)
      const cc = await run('clang', ['-Wall', '-o', bin, src], env)
      expect(cc.stderr).toBe('')
      expect(cc.code).toBe(0)
      const out = await run(bin, [], env)
      expect(out.code).toBe(0)
      const kv = Object.fromEntries(
        out.stdout
          .trim()
          .split('\n')
          .map((l) => {
            const i = l.indexOf('=')
            return [l.slice(0, i), l.slice(i + 1)]
          })
      )
      expect(kv.parse_null).toBe('-1')
      expect(kv.parse_cub0).toBe('-1')
      expect(kv.parse_off).toBe('0')
      expect(kv.parse_on).toBe('1')
      expect(kv.name_ok).toBe('0')
      expect(kv.name).toBe(`com.gamelib.steambridge.overlay.${suffix}`)
      expect(kv.name_empty).toBe('-1')
      expect(kv.name_empty_buf).toBe('[]')
      expect(kv.name_alpha).toBe('-1')
      expect(kv.name_long).toBe('-1')
      expect(kv.name_null).toBe('-1')
      expect(kv.name_small).toBe('-1')
      expect(kv.name_small_buf).toBe('[]')
      expect(kv.env_1).toBe('1')
      expect(kv.env_11).toBe('0')
      expect(kv.env_null).toBe('0')
      expect(kv.pub1).toBe('0')
      // 60-REVIEW WR-01: open = (publisher pid << 8) | 1, closed = 0.
      expect(kv.open_state_7).toBe(String(7 * 256 + 1))
      expect(kv.state_after_1).toBe(String(Number(kv.pid) * 256 + 1))
      expect(kv.changed_1).toBe('1')
      expect(kv.pub0).toBe('0')
      expect(kv.state_after_0).toBe('0')
      expect(kv.changed_0).toBe('1')
      expect(kv.budget_off).toBe('0')
      expect(kv.budget).toBe('256')
    } finally {
      profile.dispose()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
