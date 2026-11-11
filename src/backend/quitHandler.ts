/**
 * Quit handler (Phase 66.1, MH-5): the body of the legacy `utils.handleExit`, with every
 * collaborator passed in. Tracked and long-lived children are torn down through the process
 * runner's tracked and long-lived registries.
 *
 * Value imports: none; every collaborator arrives as a dep.
 */
import type { ProcessRunner } from './process/types'

export interface QuitHandler {
  handleExit(): Promise<void>
}

interface QuitMessageBoxOptions {
  buttons: string[]
  cancelId: number
  message: string
  title: string
}

export interface QuitHandlerDeps {
  runner: Pick<ProcessRunner, 'killAllTracked' | 'teardownAll'>
  isLocked(): boolean
  isRunning(): boolean
  isBridgeHosting(): boolean
  showMessageBox(opts: QuitMessageBoxOptions): Promise<{ response: number }>
  t(key: string, fallback: string): string
  abortAll(): void
  releaseSteam(): Promise<void>
  deletePresence(): Promise<void>
  exit(): void
}

export function createQuitHandler(deps: QuitHandlerDeps): QuitHandler {
  async function handleExit(): Promise<void> {
    const isLocked = deps.isLocked()
    const isBridgeHosting = deps.isBridgeHosting()
    const isRunning = deps.isRunning()

    if (isLocked || isRunning || isBridgeHosting) {
      const { response } = await deps.showMessageBox({
        buttons: [deps.t('box.no', 'No'), deps.t('box.yes', 'Yes')],
        // CR-04: `cancelId` is LOAD-BEARING, not cosmetic. This dialog's sense is
        // INVERTED relative to every other `showMessageBox` caller in the codebase:
        // index 0 is the SAFE "No" and index 1 is the DESTRUCTIVE "Yes"
        // (killAllTracked() + callAllAbortControllers() +
        // app.exit(), i.e. killing an in-flight install/download). The sidecar's
        // `platformApi.showMessageBox` fail-safe default is
        // `options?.cancelId ?? (buttons.length ?? 1) - 1`, which without an explicit
        // cancelId evaluates to 1 here -- so ANY transport error or timeout on the
        // newly-sidecar-reachable `quit` path returned the DESTRUCTIVE answer. Declaring
        // cancelId: 0 restores the stub's documented fail-safe-to-decline property for
        // this caller. cancelId is ALSO the response for a dismissal (Esc / window close,
        // no button pressed) -- Electron's semantics, which the Tauri path only matches
        // since `dialog_message` began returning null for a dismissal (todo 2026-10-05
        // dialog-dismiss). Before that, a dismissal on Windows/Linux came back as
        // buttons[1], so Esc here meant "Yes, kill everything and quit".
        cancelId: 0,
        message:
          isBridgeHosting && !isLocked && !isRunning
            ? deps.t(
                'box.quit.bridgeHosting',
                'A game is running through the Steam bridge. Quitting GameLib ends any multiplayer session it is hosting. Quit anyway?'
              )
            : deps.t(
                'box.quit.message',
                'There are pending operations, are you sure?'
              ),
        title: deps.t('box.quit.title', 'Exit')
      })

      if (response === 0) {
        return
      }

      // Long-lived children (comet, the Steam bridge helper) go first, through their own
      // teardowns (stopBridgeHelper etc.): a raw SIGTERM from killAllTracked would bypass
      // them (A-WR-5, 66.1 review). Both quit paths now run the teardowns.
      deps.runner.teardownAll()

      // Phase 72 D-13: kill only the children this sidecar spawned (tracked PIDs),
      // never by name pattern. Includes tracked Wine children (games).
      deps.runner.killAllTracked()

      // Kill all child processes
      deps.abortAll()
    }

    // Routed-quit layer: log the CM client off and pay any owed Mac Steam goonline. It must finish
    // before app.exit(), which leads to shutdown_child()'s group SIGTERM within milliseconds.
    await deps.releaseSteam()
    await deps.deletePresence()

    // Quick task 260907-juv, Layer A: tear down every runner-registered long-lived child
    // (comet, the Steam bridge helper) gracefully before exiting. This is the ONLY quit
    // path this call can reach -- see the runner's long-lived registry docblock for why a
    // second, unconditional layer in the Rust shell is also required.
    deps.runner.teardownAll()

    deps.exit()
  }

  return { handleExit }
}
