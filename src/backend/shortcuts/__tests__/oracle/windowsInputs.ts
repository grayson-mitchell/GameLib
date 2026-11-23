/**
 * Input-only values for the Windows shortcut oracle (94-07). No expected value lives here.
 *
 * `REG_ENV` is the environment `readWindowsShellFolder` expands a `REG_EXPAND_SZ` value against
 * (`%USERPROFILE%`, `%ONEDRIVE%`). It is a lookup table for a pure expansion, NOT a child's environment,
 * and it is synthetic on purpose: a real or fake-HOME value would make the golden depend on the host
 * (the `win32.normalize` of a POSIX temp path is not a placeholder path). It sits in its own module
 * because `fakeHomeIsolation.test.ts` flags any file that both calls `.run(` and writes `USERPROFILE:`
 * as a hand-rolled spawn env, which this is not.
 */
export const REG_ENV: NodeJS.ProcessEnv = {
  USERPROFILE: 'Z:\\GameLibOracle\\Home',
  ONEDRIVE: 'Z:\\GameLibOracle\\OneDrive'
}
