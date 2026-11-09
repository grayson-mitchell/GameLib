// Maps Node's CM-side results (depot refs, content-server hosts, finalize policy) into the
// RustDepotJob wire shape. Never logs the job: it carries depot keys (T-73-51).

import { randomUUID } from 'node:crypto'
import type { ContentServerHostMeta } from '../depot/contentServers'
import type { DepotRefEntry } from '../depot/plan'
import type {
  RustDepotJob,
  RustDepotRef,
  RustFinalizeSpec,
  RustHostRef,
  RustJobMode
} from './types'

export interface ContentServerHosts {
  hosts: string[]
  weightedLoads: Map<string, number>
  hostMeta: Map<string, ContentServerHostMeta>
}

export function toRustHosts(h: ContentServerHosts): RustHostRef[] {
  return h.hosts.map((host) => {
    const meta = h.hostMeta.get(host)
    return {
      host,
      vhost: null,
      kind: meta?.type ?? null,
      httpsSupport: meta?.httpsSupport ?? null,
      // Same widened gate as decompress.ts wantsCdnAuthToken.
      useTokenAuth: meta?.usetokenauth === true || meta?.type === 'CDN',
      weightedLoad: h.weightedLoads.get(host) ?? null
    }
  })
}

/**
 * Rust takes a depot's array position as its appinfo rank, comparable within one owner app, so
 * depots are ordered by rank inside each owner group (groups keep first-appearance order).
 * Depots without a recovered rank follow, in input order.
 */
export function orderRefsForCollisions(refs: DepotRefEntry[]): DepotRefEntry[] {
  const owners: string[] = []
  for (const r of refs)
    if (!owners.includes(r.ownerAppId)) owners.push(r.ownerAppId)
  const out: DepotRefEntry[] = []
  for (const owner of owners) {
    const group = refs.filter((r) => r.ownerAppId === owner)
    const ranked = group
      .filter((r) => r.appinfoRank !== undefined)
      .sort((a, b) => (a.appinfoRank ?? 0) - (b.appinfoRank ?? 0))
    out.push(...ranked, ...group.filter((r) => r.appinfoRank === undefined))
  }
  return out
}

export function toRustDepotRefs(refs: DepotRefEntry[]): RustDepotRef[] {
  return orderRefsForCollisions(refs).map((r) => ({
    depotId: r.depotId,
    manifestId: r.gid,
    requestCode: null,
    key: r.key.toString('hex'),
    ownerAppId: r.ownerAppId,
    fromManifest: null
  }))
}

export function buildDepotJob(args: {
  appId: string
  mode: RustJobMode
  installRoot: string
  refs: DepotRefEntry[]
  hosts: ContentServerHosts
  finalize: RustFinalizeSpec | null
  selectPaths?: string[]
}): RustDepotJob {
  return {
    jobId: randomUUID(),
    mode: args.mode,
    appId: args.appId,
    installRoot: args.installRoot,
    depots: toRustDepotRefs(args.refs),
    hosts: toRustHosts(args.hosts),
    selectPaths: args.selectPaths ?? null,
    finalize: args.finalize,
    limits: null
  }
}
