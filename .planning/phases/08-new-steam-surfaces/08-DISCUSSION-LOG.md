# Phase 8: New Steam Surfaces - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 8-new-steam-surfaces
**Areas discussed:** Uninstalled Steam games in Console, Console launch feedback for Steam, Steam store tab scope & login warning, Store URL region & language

---

## Uninstalled Steam games in Console

| Option | Description | Selected |
|--------|-------------|----------|
| Show all owned; install → Steam client | Steam games appear like Epic/GOG (all owned). Not-installed → InstallOverlay hands off to Steam client via `steam://install/{appId}`. | ✓ |
| Show only installed Steam games | Steam games appear in Console only if already installed. No install-from-Console path. | |
| Show all owned; no-op / disabled install | Show all owned, but not-installed shows a message pointing to library/Steam — no `steam://install` handoff. | |

**User's choice:** Show all owned; install → Steam client
**Notes:** Consistent with how the library grid treats Steam.

### Follow-up — Install UX after firing steam://install

| Option | Description | Selected |
|--------|-------------|----------|
| Fire & close with a brief notice | Open `steam://install`, show "Opening Steam to install…", dismiss to grid. ACF poller updates the card. | ✓ |
| Fire & stay, poll for install state | Keep overlay up showing "Installing via Steam…" until ACF poller reports installed. | |
| Reuse existing InstallOverlay as-is | Only wire the handoff; planner decides copy/behavior. | |

**User's choice:** Fire & close with a brief notice

---

## Console launch feedback for Steam

| Option | Description | Selected |
|--------|-------------|----------|
| Show 'Launched in Steam', auto-dismiss | Fire `steam://rungameid`, show brief "Launched in Steam" confirmation, auto-dismiss. | ✓ |
| Mirror managed-launch overlay | Same "Launching…" overlay as other runners (risks hanging — Steam sends no running/quit). | |
| Fire & immediately dismiss | Open `steam://rungameid`, close overlay right away, no launch state shown. | |

**User's choice:** Show 'Launched in Steam', auto-dismiss
**Notes:** Honest about the fire-and-forget handoff; avoids pretending to track a process GameLib can't see.

---

## Steam store tab scope & login warning

| Option | Description | Selected |
|--------|-------------|----------|
| Pure WebView, no LoginWarning | Plain WebView at store.steampowered.com, skip LoginWarning, no injected buttons. | |
| WebView + keep a login-style notice | Show WebView + one-time notice that browsing is view-only. | |
| WebView, let user log into Steam web | Plain WebView; persist Steam web session (own partition) for personalized store pages. | ✓ |

**User's choice:** WebView, let user log into Steam web
**Notes:** Persistence is essentially free — WebView already uses `partition={persist:${store}}`, so `persist:steam` gives a durable session. Still no GameLib integration; LoginWarning is not wired for Steam.

---

## Store URL: region & language

| Option | Description | Selected |
|--------|-------------|----------|
| Plain URL + persist last-visited | Load `store.steampowered.com/` (Steam geolocates); persist last-visited via existing `last-url-{store}`. | ✓ |
| Plain URL, no persistence | Always load store.steampowered.com fresh; no last-url memory. | |
| Append language/country params | Build URL with UI language / country code like Epic's `/{lang}/`. | |

**User's choice:** Plain URL + persist last-visited
**Notes:** Least code; matches Steam's own region/account behavior.

---

## Claude's Discretion

- Exact submenu ordering of the Steam item in the Stores submenu.
- Precise copy and auto-dismiss timing for the "Opening Steam to install…" and "Launched in Steam" notices.

## Deferred Ideas

- In-store "install in GameLib" injection — out of scope (browse-only).
- GameLib-managed Steam downloads — out of scope; Steam owns Steam downloads.
- Language/country URL params for the Steam store — considered and rejected in favor of Steam geolocation.
