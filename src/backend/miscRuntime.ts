/**
 * The boot-owned misc runtime (66.4-18, D-05).
 *
 * Three small long-tail owners that had a module-level variable each: the metadata-override
 * `metadataChanged` push (with its warn-once flag), the Mac architecture recovery prompt chain and
 * the ITAD 429 gate (Phase 47). Each lives in its own file's `createX()` closure; this bundle
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
import { createItadGate, type ItadGate } from './storeSearch/itadCache'

export interface MiscRuntime {
  /** The `metadataChanged` push of a game-metadata override write. */
  metadataOverrides: MetadataOverrides
  /** Serialises the Mac Windows-reinstall dialogs. */
  macArchPrompts: MacArchPromptChain
  /** The ITAD 429 gate + single-flight map (Phase 47): timestamp compare only, no timers. */
  itadGate: ItadGate
}

export interface MiscRuntimeDeps {
  /** Pushes `metadataChanged` to the renderer; absent in a test that does not observe it. */
  metadataChanged?: MetadataChangedNotifier
}

export function createMiscRuntime(deps: MiscRuntimeDeps): MiscRuntime {
  return {
    metadataOverrides: createMetadataOverrides({
      notify: deps.metadataChanged
    }),
    macArchPrompts: createMacArchPromptChain(),
    itadGate: createItadGate()
  }
}

/** What a consumer reads from the boot's misc runtime: exactly the members it uses. */
export interface MiscRuntimeSlice<K extends keyof MiscRuntime> {
  miscRuntime: Pick<MiscRuntime, K>
}
