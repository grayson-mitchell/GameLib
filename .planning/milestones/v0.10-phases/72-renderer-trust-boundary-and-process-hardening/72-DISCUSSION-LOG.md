# Phase 72: Renderer trust boundary and process hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 72-renderer-trust-boundary-and-process-hardening
**Areas discussed:** Dead sidecar handling, Open-path allow-list, Ordering vs Phases 66/71, Supply-chain CI & Windows

---

## Dead sidecar handling

| Option | Description | Selected |
|--------|-------------|----------|
| Surface, then offer restart | Blocking notice; Restart = full app relaunch, or Quit | ✓ |
| Auto-respawn in place | New sidecar, renderer reconnects; loses in-flight state silently | |
| Surface, then quit only | Tell and exit | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust native dialog | Works with a wedged renderer | ✓ |
| Renderer push + in-app UI | Themed, but depends on the renderer | |
| Both | Renderer modal with native fallback | |

| Option | Description | Selected |
|--------|-------------|----------|
| Log, flush, exit non-zero | Node guidance; triggers the dead-sidecar flow | ✓ |
| Keep log-only + renderer warning | | |
| Exit, with an allow-list of benign throws | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Generic message | | ✓ |
| Mention interrupted downloads | | |
| You decide | | |

**User's choice:** All recommended options.

---

## Open-path allow-list

| Option | Description | Selected |
|--------|-------------|----------|
| Both layers, Rust authoritative | Sidecar rejects early; parity test | ✓ |
| Rust only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Strict split | openExternalUrl URL-only; openFolder existing absolute path only | ✓ |
| Keep one function, add checks | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reveal files in Finder/Explorer | show_item_in_folder; never executes | ✓ |
| Reject non-directories | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Contain + awaitable delete | | ✓ |
| Contain + unref() timer | | |
| You decide | | |

**User's choice:** All recommended options.

---

## Ordering vs Phases 66/71

| Option | Description | Selected |
|--------|-------------|----------|
| 72 fixes pkill with minimal PID registry | Phase 66 absorbs later | ✓ |
| Defer to Phase 66 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 72 lands the Linux leg, first plan | 71 D-02 skips | ✓ |
| Leave to 71 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Whichever lands first, no gate | 72 creates shell_open.rs if needed | ✓ |
| Gate the Rust half on 71 | | |
| Edit in place in store_embed.rs | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Independent waves | Supply chain + Linux leg first | ✓ |
| Planner decides | | |

**User's choice:** All recommended options.

---

## Supply-chain CI & Windows

| Option | Description | Selected |
|--------|-------------|----------|
| CI audit + Dependabot security-only | Plus cargo deny | ✓ |
| CI audit only | | |
| Renovate | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Block high/critical, warn rest | | ✓ |
| Non-blocking | | |
| Block moderate+ | | |

| Option | Description | Selected |
|--------|-------------|----------|
| All highs + renderer moderates | | ✓ |
| Highs only | | |
| Everything | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Manual check on operator's PC | Windows UAT item | ✓ |
| Windows CI integration test | | |
| Both | | |

**User's choice:** All recommended options.

---

## Todo cross-reference

The clippy-ratchet Windows-leg todo was not folded. The operator will push after this discussion, run
that todo on their Windows PC, start planning 72 in parallel, and merge back at the first pause in
planning.

## Claude's Discretion

- Module names, the dialog wording, whether `unhandledRejection` is fatal, and the shapes of the
  token-store and PID-registry code.
- The capability trim, the dead `ipc_handler.ts` deletion and the fail-closed token store follow the
  CONCERNS recommendations without separate questions.

## Deferred Ideas

- CSP `img-src http:`, a sidecar→shell frame nonce, chmod on third-party auth files, logSecretGate
  wiring, and an RPC frame size cap.
