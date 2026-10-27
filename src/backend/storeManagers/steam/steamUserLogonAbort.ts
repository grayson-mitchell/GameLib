/**
 * Stops a steam-user client's authenticated logon wherever it is, so that it
 * never completes later on its own.
 *
 * debug/shutdown-mid-connect-logon-survives (Phase 54 live gate item 11,
 * 2026-10-28): `logOff()` alone is NOT enough while a logon is in flight.
 * steam-user 5.3.0 `_sendLogOn()` (components/09-logon.js) arms
 * `this._logonMsgTimeout`, a referenced 5 s timer whose handler calls
 * `_disconnect(true)` and `_enqueueLogonAttempt()`, which logs on again with
 * the saved refresh token after a 1 s backoff. Only `_handleLogOnResponse`
 * clears it, and `autoRelogin: false` does not gate it. A `logOff()` that lands
 * after ClientLogon is sent but before the response closes the socket, then
 * logs on again by itself about 6 s later, outside the go-offline wrap. In
 * the live run that logon landed 7 s after stdin EOF, with Mac Steam back
 * online, and held the sidecar open.
 *
 * steam-user has no public way to cancel a logon in progress, so this reaches
 * one internal, and only here. The timer is cleared BEFORE `logOff()`, so it is
 * gone even if `logOff()` throws. Everything else `logOff()` already handles:
 * it ends the connection and removes its listeners, cancels the reconnect and
 * backoff timers, and marks the connection closed, which a `_doConnection()`
 * still waiting on the CM list checks before it opens a socket. Verified
 * against the real library by `steamUserLogonAbort.test.ts`. If an upgrade
 * renames the field, that test fails.
 *
 * Throws whatever `logOff()` throws; callers keep their own try/catch.
 */
export function abortSteamUserLogon(client: { logOff(): void }): void {
  const internals = client as { _logonMsgTimeout?: unknown }
  const pending = internals._logonMsgTimeout
  if (pending !== undefined && pending !== null) {
    clearTimeout(pending as ReturnType<typeof setTimeout>)
    internals._logonMsgTimeout = undefined
  }
  client.logOff()
}
