import { onTestOnly, type IpcRegistry } from 'backend/sidecar/ipcRegistry'
import { RunnerCommandStub } from 'common/types'

/*
 * Multiple parts of a command can be set for the stub to be able to stub
 * similar commands
 *
 * The first stub for which all commandParts are included in the executed
 * command will be selected. The stubs should be declared from more
 * precise to less precise to avoid unreachable stubs.
 *
 * We can stub a Promise<ExecResult> as a response, or stub stdout/stderr
 * values as an alternative to make the stubbing easier
 */
const defaultStubs: RunnerCommandStub[] = [
  {
    commandParts: ['--version'],
    stdout: '0.7.1'
  }
]

export interface GogdlStubs {
  /** Replaces the active stubs. */
  set(stubs: RunnerCommandStub[]): void
  /** Restores the default `--version` stub. */
  reset(): void
  /** The stubbed result for a command (first stub whose commandParts are all included). */
  run(command: string[]): Promise<{ stdout: string; stderr: string }>
}

export function createGogdlStubs(): GogdlStubs {
  let currentStubs = [...defaultStubs]
  return {
    set(stubs) {
      currentStubs = [...stubs]
    },
    reset() {
      currentStubs = [...defaultStubs]
    },
    async run(command) {
      const stub = currentStubs.find((stub) =>
        stub.commandParts.every((part) => command.includes(part))
      )

      if (stub?.response) return stub.response

      return Promise.resolve({
        stdout: stub?.stdout || '',
        stderr: stub?.stderr || ''
      })
    }
  }
}

// Add listeners to be called from e2e tests to stub the gogdl command calls. Registered
// once at boot (register-handlers), only when env.CI === 'e2e' (onTestOnly checks it).
export function registerGogdlStubListeners(
  ipc: Pick<IpcRegistry, 'on'>,
  env: Pick<NodeJS.ProcessEnv, 'CI'>,
  stubs: GogdlStubs
): void {
  onTestOnly(ipc, env, 'setGogdlCommandStub', (next) => {
    stubs.set(next)
  })
  onTestOnly(ipc, env, 'resetGogdlCommandStub', () => {
    stubs.reset()
  })
}
