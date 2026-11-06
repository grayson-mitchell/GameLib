# Phase 57: Opt-in known-fix sharing via relay - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 57-opt-in-known-fix-sharing-via-relay
**Areas discussed:** Relay hosting & GitHub identity, PR vs issue and change shape, Consent & setting UX, Dedup/trust/abuse

---

## Relay hosting & GitHub identity

| Question | Options | Selected |
|---|---|---|
| Relay host | Cloudflare Workers / Vercel-Netlify function / Deno Deploy / You decide | Cloudflare Workers |
| GitHub auth | GitHub App / Fine-grained PAT / Bot account + PAT | GitHub App |
| Relay code location | This repo (`relay/`) / known-fixes repo / Own repo | This repo |
| Endpoint | Hard-coded URL constant / Custom domain / You decide | Hard-coded URL constant |

---

## PR vs issue, and change shape

| Question | Options | Selected |
|---|---|---|
| What the relay opens | PR with file written / Issue only / Issue + PR | PR with file written |
| Grouping | One PR per appId / One PR per report / Rolling batch PR | One PR per appId |
| Existing file with other keys | Merge key in / Skip | Merge key in |
| Removal report | PR removes only macArch / Issue / PR deletes whole file | PR removes only macArch |

---

## Consent & setting UX

| Question | Options | Selected |
|---|---|---|
| Consent prompt | No dialog, inline help / One-time dialog / Ask at first detection | No dialog |
| Location | General / Advanced / You decide | General |
| Feedback on send | Log line only / Toast / Log + sent-reports list | Log line only |
| Platforms | macOS only / All platforms | macOS only |

---

## Dedup, trust & abuse

| Question | Options | Selected |
|---|---|---|
| Client skip rule | Same key+value, any layer / Same key+value, remote only / Any file, any layer | Same key+value, any layer |
| PR threshold | One report / N independent reports | One report |
| Relay validation | Schema + allow-list + Steam appId check / Schema + allow-list only | Schema + allow-list + Steam appId check |
| Rate limit | Per-IP + global daily cap / Global cap only / Cloudflare built-in rules | Per-IP + global daily cap |
| Bundled-only removal | Open an issue / Drop, log on client | Open an issue |
| Sent marking & retry | Mark on 2xx, retry on next detection / Fire-and-forget / Persistent retry queue | Mark on 2xx (4xx also marked) |

---

## Claude's Discretion

- KV vs D1, exact rate-limit numbers, PR title/body/labels, setting persistence and copy, client timeout and hook placement.

## Deferred Ideas

- Sent-reports list in Settings; N-report threshold; other-platform detectors.
