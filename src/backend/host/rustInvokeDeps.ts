import type { RequestRustInvoke } from '.'

/** The one-member slice a module takes when it only calls Rust over the boot's transport. */
export interface RustInvokeDeps {
  requestRustInvoke: RequestRustInvoke
}
