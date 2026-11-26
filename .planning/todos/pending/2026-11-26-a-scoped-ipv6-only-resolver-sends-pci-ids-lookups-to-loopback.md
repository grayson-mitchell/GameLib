---
created: 2026-11-26T13:00:00.000Z
title: "A zone-scoped IPv6-only resolver sends the pci.ids lookups to loopback"
area: sysinfo
files:
  - src-tauri/crates/gamelib-info/src/sysinfo/dns.rs:227-238 (parse_resolv_conf drops fe80::1%en0-style addresses)
  - src-tauri/crates/gamelib-info/src/sysinfo/dns.rs:378-387 (SystemTxtResolver::lookup substitutes 127.0.0.1:53)
severity: minor
platform: any
ready: code
---

## Problem

`parse_resolv_conf` drops `fe80::1%en0`-style addresses (they fail `IpAddr::parse`), and `SystemTxtResolver::lookup`
then substitutes `127.0.0.1:53` when the list is empty. A machine whose only listed resolver is a zone-scoped
link-local address is sent to a loopback port nothing listens on, so every name fails with a connection-refused
`ServerFailed` and the GPU list comes out empty. Node's c-ares handled the scope.

Found by 88.1-REVIEW.md IN-02 (an info finding, not weighed by 88.1-VERIFICATION.md beyond the review text; none of it
affects a truth). Only a machine whose sole resolver is a zone-scoped link-local address is hit.

## Solution

Parse the zone (`SocketAddrV6::new(ip, 53, 0, scope_id)` with `if_nametoindex`), or distinguish "no `nameserver` lines"
(fall back to loopback) from "lines present but all skipped" (return `None` without querying).
