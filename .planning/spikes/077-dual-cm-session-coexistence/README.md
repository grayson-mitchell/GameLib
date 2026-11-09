---
spike: 077
name: dual-cm-session-coexistence
type: standard
validates: "Given the sidecar's steam-user session and a Rust steam-vent session signed in with the same refresh token (Mac Steam online), when both stay logged on and make CM calls at once, then neither is kicked, or we learn which logon field keeps them apart"
verdict: VALIDATED (they collide: last logon wins with LogonSessionReplaced 34; a non-zero steam-user logonID keeps them apart)
related: [071c, 073, 074, 075]
tags: [rust, steam, cm, steam-vent, steam-user, session, logonid, sidecar-retirement, live]
---

# Spike 077: Can a steam-user session and a steam-vent session share one account?

## What This Validates

Given the sidecar's steam-user session and a Rust steam-vent session on the same refresh token
(Mac Steam online), when both stay logged on and make CM calls, then neither is kicked, or we
learn which logon field keeps them apart.

This matters because the CM-client slice of the migration will replace steam-user piece by piece.
If one piece moves to Rust while another stays in Node, GameLib runs two authenticated sessions
for one account at once. Spikes 071–076 only ever held one GameLib-side session (074's
coexistence was Rust + **Mac Steam**, which identifies itself differently).

## Research

- steam-user `logOn` docs and `components/09-logon.js:70-89`: `logonID` becomes
  `obfuscated_private_ip.v4`, default **0**. The docs say a second logon from the same public IP
  with the same logonID kicks the first with `LogonSessionReplaced`.
- Production `user.ts:885` calls `client.logOn({ refreshToken })`, which has **no logonID, so it sends 0**.
- steam-vent `a9e8164` `src/session.rs:197-215` hard-codes `ip.set_v4(0)` in `login()` (and
  `anonymous()`), with no setter, so changing it means patching the crate.
- Mac Steam sends its real obfuscated private IP, which is why it never collides with either
  client (074, and every arm here: its `connection_log` stayed silent).

## How to Run

```bash
CARGO_TARGET_DIR=$PWD/target cargo build --release
./arm.sh <arm> <first-spec> <second-spec> [gap_s] [hold_s]
#   spec: su:<logonID> | su:anon (steam-user, production options) | vent (steam-vent, ip 0)
SPIKE_KEEP_PINGING=1 ./arm.sh ...   # vent keeps calling after a kick
```

The first session starts, the second starts `gap_s` later, and each proves it is alive every 10 s
with a PICS access-token call. Kicks are logged from steam-user's `error` (eresult) and
steam-vent's `CMsgClientLoggedOff` subscription. `runs/<arm>/merged.log` interleaves both
timelines plus Mac Steam's `connection_log` for the arm. No go-offline wrap: each arm holds
40–60 s and 075 showed unwrapped is safe. Mac Steam's log is the oracle and stayed silent in
every arm.

## Investigation Trail

1. **P1 positive control: steam-user(0) then steam-user(0).** The first session got `error eresult 34
   (LogonSessionReplaced)` at 10:16:35.436, 19 ms *before* the second's `loggedOn`. The oracle works.
2. **P2 negative control: steam-user(0) and steam-user(770077).** Both alive for the full hold
   (4 + 3 calls answered). Only the logonID differs, so it alone separates sessions.
3. **A: production steam-user(0), then steam-vent.** steam-user was **kicked with 34** at the instant
   steam-vent logged on; steam-vent then stayed alive 3/3. This is the failure the migration would hit.
4. **B: steam-vent, then steam-user(0).** steam-vent got `ClientLoggedOff eresult 34`, 88 ms after
   steam-user's logon. Symmetric: **the last logon wins**, whichever client it is.
5. **C: steam-user(770077), then steam-vent(0).** Both alive for the full hold (4 + 3). **Changing the
   Node side alone is enough**; steam-vent needs no patch for the mixed period.
6. **B′: after a kick, does an unsubscribed steam-vent caller notice?** Every later `job()` fails
   fast with `Trying to work with closed connection`. It doesn't hang, and no call is answered after
   the kick. But that error doesn't carry the reason. Only a `CMsgClientLoggedOff`
   subscription says "replaced (34)" rather than "network dropped".
7. **D: two anonymous steam-user sessions, both 0.** Each got its own anonymous SteamID
   (`[a:1:3258004718]`, `[a:1:2602889490]`) and both lived. Anonymous sessions never collide, so the
   always-on anonymous client and any Rust anonymous client are safe together.
8. Production already tolerates a 34 on a *replaced* client of its own (`user.ts:79-86`, from the
   34.9 live gate) and classes 34 as not-a-credential-problem (`user.ts:536`). So a kick shows as a
   dropped session, not as "sign in again". That is quieter, but it would still fail whatever
   the kicked session was doing (refresh, redeem, depot key).

## Results

**VALIDATED. The two clients collide, and the fix is one option.** steam-user (production, logonID 0)
and steam-vent (`obfuscated_private_ip` hard-coded 0) on the same account and public IP kick each
other with `LogonSessionReplaced` (34). The later logon always wins. Session identity is
(account, public IP, `obfuscated_private_ip`); client library, OS type and machine name don't
matter. A non-zero `logonID` on steam-user lets both live side by side (arm C, full hold, every
call answered). Anonymous sessions never collide. Mac Steam was never affected.

**Signal for the build:**

- Before any authenticated Rust CM session ships next to the sidecar's, give the steam-user client a
  **non-zero `logonID`** (`user.ts:885`). One line; arm C proves it.
- Two authenticated **Rust** sessions in one GameLib would need a steam-vent patch to set
  `obfuscated_private_ip` (no API today). Prefer one shared Rust session instead.
- Rust callers must subscribe to `CMsgClientLoggedOff` for the whole session life: after a kick,
  calls only say "closed connection".
- **Inferred, not tested (one machine):** because identity includes the public IP and production
  always sends 0, two GameLib installs **on the same LAN/NAT** signed in to one account already kick
  each other today. A random per-install `logonID`, persisted once, fixes both cases. Mac Steam
  itself is never at risk, since it sends its real private IP.
