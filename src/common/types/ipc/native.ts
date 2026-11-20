/**
 * Typing-only declarations for the channels the Rust native router owns (Phase 83, D-01), the
 * ones listed in `nativeChannels.json`. There is no zod here: the Rust serde args type is the
 * schema authority for a native channel (D-07), and the manifest's valid/invalid vectors pin it.
 *
 * The keys below must equal the manifest's channels by kind (`ipcDomainCensus` test (e)): invoke
 * channels in `NativeAsync`, send channels in a `NativeSync` added with the first native send.
 */
export interface NativeAsync {
  getHeroicVersion: () => string
}
