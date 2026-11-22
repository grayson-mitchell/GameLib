/**
 * The boot-owned misc runtime (66.4-18, D-05).
 *
 * Two small long-tail owners that had a module-level variable each: the metadata-override
 * `metadataChanged` push (with its warn-once flag) and the Mac architecture recovery prompt chain.
 * (The third, the ITAD 429 gate, moved to Rust with the store search in Phase 86, 86-17: it is
 * `gamelib-info`'s `InfoCtx::itad_gate`.) Each lives in its own file's `createX()` closure; this bundle
 * builds one of each, once per boot, in the 'misc-runtime' boot step, and consumers reach it through
 * `MiscRuntimeSlice` (D-01).
 *
 * Construction allocates a resolved promise and closures: no I/O, no timer, no
 * handle (sidecar exit contract). The metadata push notifier is a constructor dependency.
 */
import {
  createMetadataOverrides,
  type MetadataChangedNotifier,
  type MetadataOverrides
} from './gamedetails/overrides'
import {
  createMacArchPromptChain,
  type MacArchPromptChain
} from './macArch/recovery'
import type { RustInvokeDeps } from './host/rustInvokeDeps'

export interface MiscRuntime {
  /** The `metadataChanged` push of a game-metadata override write. */
  metadataOverrides: MetadataOverrides
  /** Serialises the Mac Windows-reinstall dialogs. */
  macArchPrompts: MacArchPromptChain
  /**
   * The sidecar -> Rust request leg of this boot (86-18). It rides here only because the enrichment
   * registration, which `sidecar/handlers.ts` feeds with this bundle, has no other member that holds
   * it, and the GOG discounts resolver (`info/discounts.ts`) needs it. OWED: once `handlers.ts` can
   * pass `requestRustInvoke` to `registerEnrichmentFlows` directly, take it off this bundle.
   */
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
}

export interface MiscRuntimeDeps extends RustInvokeDeps {
  /** Pushes `metadataChanged` to the renderer; absent in a test that does not observe it. */
  metadataChanged?: MetadataChangedNotifier
}

export function createMiscRuntime(deps: MiscRuntimeDeps): MiscRuntime {
  return {
    metadataOverrides: createMetadataOverrides({
      notify: deps.metadataChanged
    }),
    macArchPrompts: createMacArchPromptChain(),
    requestRustInvoke: deps.requestRustInvoke
  }
}

/** What a consumer reads from the boot's misc runtime: exactly the members it uses. */
export interface MiscRuntimeSlice<K extends keyof MiscRuntime> {
  miscRuntime: Pick<MiscRuntime, K>
}
