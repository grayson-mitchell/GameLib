---
spike: 074
name: rust-logon-friends-wrap
type: standard
validates: "Given Mac Steam freshly restarted with Friends signed in, when a Rust (steam-vent) client logs on to the same account inside the go-offline wrap and holds the session, then Friends stays signed in and the status stays changeable, with the Rust session alive"
verdict: VALIDATED (wrapped) + SURPRISE (unwrapped controls did not flip, for Rust or steam-user)
related: [046a, 046b, 046c, 071c, 072, 073]
tags: [rust, steam, macos, friends, offline-mode, steam-url, steam-vent, steam-user, live]
---

# Spike 074: Rust logon and the Mac Steam Friends wrap

## What This Validates

STEAM-STACK.md (reopened by Phase 54) says any authenticated steam-user CM logon signs Mac Steam's
Friends list out until Mac Steam restarts, and GameLib therefore wraps every authenticated logon in
`steam://open/gooffline` → logon → `goonline` (spikes 046a–c, debug
`friends-signout-steam-user.md`). A Rust CM client must keep that working. Method as 046b:
freshly restarted Mac Steam, Friends confirmed signed in by the operator, the session held for
≥30 s, then the operator checks Friends and changes status.

## How to Run

```bash
cargo build --release
V="$TMPDIR/gamelib-dev-secret-vault.json"
./target/release/spike-074-friends wrapped   "$V" 120   # -> out/run-wrapped.log
./target/release/spike-074-friends unwrapped "$V" 60    # control
node steam-user-unwrapped.mjs "$V"          # C1: GameLib's steam-user logon, unwrapped
node steam-user-unwrapped.mjs "$V" 203      # C2: same, clientOS 203 (not run, see trail)
```

The harness mirrors new `connection_log.txt` lines into its log, proves the session is alive every
20 s with a PICS access-token call, and watches for `ClientLoggedOff`. `runs/` holds the logs.

## Investigation Trail

1. **Baseline:** Mac Steam relaunched by the operator at 22:17:45 (after the 072/073 wrapped
   logons), Friends confirmed signed in.
2. **Wrapped Rust run (22:18:16):** `gooffline` → Mac Steam `LogOff()` … "not auto reconnecting
   due to user initiated logoff" in 0.26 s → steam-vent logon at 2.16 s → `goonline` → Mac Steam
   logon complete at 3.70 s (same process, same JWT). The Rust session stayed alive for 120 s
   (6/6 checks answered) with **no ClientLoggedOff**; both sessions coexisted. **Operator: Friends
   signed in, status changes.** PASS.
3. **Unwrapped Rust control (22:20:58):** steam-vent logon with Mac Steam online, held 60 s.
   Mac Steam's `connection_log` recorded **nothing**: its CM session never noticed. Rust session
   alive 3/3. **Operator: Friends still signed in, works.** Expected a sign-out; didn't happen.
4. **Hypothesis:** steam-vent's logon differs from steam-user's in fields the debug session
   never varied. It sends `client_os_type` 203 (not a valid EOSType; LinuxUnknown is -203), an
   empty machine name and no machine ID. steam-user sends the host OS (-102 here) and a machine
   ID. The debug session eliminated only `chat_mode`, `logonID` and `setPersona` 1/7.
5. **C1, positive control (22:24:08):** steam-user 5.3.0 with GameLib's production options
   (`autoRelogin: false, enablePicsCache: false`, `{ refreshToken }`), unwrapped, held 60 s, then
   `logOff()`. Mac Steam's log again recorded nothing. **Operator: Friends still signed in,
   works.** The flip **did not reproduce** with steam-user either.
6. **C2 skipped:** with C1 clean, an OS-type A/B can't show anything.

## Results

**Requirement met: a Rust logon inside the wrap keeps Mac Steam's Friends signed in and
changeable, with the Rust session alive alongside.** Nothing about the wrap is client-specific; it
is driven from Rust as easily as from Node.

**Surprise, which changes the premise:** on 2026-11-09, a *bare* authenticated logon
(logon → 60 s hold → logoff) does **not** sign Friends out, from either steam-vent or steam-user.
The debug session's flip (2026-10-24…27) came from GameLib's real session. Two explanations, not
yet separated:

- **Steam changed.** A Mac Steam or server update since late October.
- **The trigger is something after logon** that GameLib's sessions do and these harnesses don't:
  library refresh (`getUserOwnedApps`, PICS app/package info, licensed demos), persona fetches,
  or a longer-lived session. The debug log says the flip happened "at logon", but those logons
  were always followed by a library refresh within the same second.

**Signal for the build:** keep the wrap. It is proven harmless and works from Rust. Don't remove
it on this evidence. Separating the two explanations needs a follow-up: an unwrapped run of
GameLib's actual refresh sequence on a fresh Mac Steam. If that doesn't flip either, the
STEAM-STACK.md Phase 54 amendment, and the anonymous-by-default design it forced, should be
re-examined.
