# Phase 1: Steam Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 1-Steam Authentication
**Areas discussed:** Credential login flow, QR login placement, Account card design, Steam client gate

---

## Credential Login Flow

### Q1: UI structure for the multi-step credential + SteamGuard flow

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated screen | `/loginweb/steam` route matching existing pattern; native form stepping through credentials → SteamGuard code | ✓ |
| Modal / dialog | Modal layered over Manage Accounts, fields collapse/expand inline | |
| Inline in Login screen | Expand the Steam tile directly to show form fields | |

**User's choice:** Dedicated screen
**Notes:** Matches existing `/loginweb/gog`, `/loginweb/legendary`, `/loginweb/nile` pattern exactly.

### Q2: SteamGuard type support at launch

| Option | Description | Selected |
|--------|-------------|----------|
| Email code only | Single code input; same field works for TOTP (user reads from app). No toggle UI. | ✓ |
| Email + TOTP, user chooses | Toggle between email and authenticator on step 2 | |

**User's choice:** Email code only
**Notes:** TOTP toggle deferred — same code input field serves both without extra UI.

---

## QR Login Placement

### Q1: QR code prominence relative to credentials

| Option | Description | Selected |
|--------|-------------|----------|
| Two tabs, co-equal | `[QR Code]` and `[Username/Password]` tabs; both first-class | ✓ |
| QR primary, credentials secondary | QR shown by default; credentials behind "Sign in differently" | |
| Credentials primary, QR secondary | Form shown by default; QR behind "Show QR Code" link | |

**User's choice:** Two tabs, co-equal
**Notes:** Matches the passkey-vs-password model many modern apps use.

### Q2: QR code expiry behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-refresh | QR image silently regenerates on expiry (~30s); no user action needed | ✓ |
| Show "Refresh" button | Overlay button on expired QR; user clicks to regenerate | |

**User's choice:** Auto-refresh
**Notes:** Most polished experience for a QR-based flow.

---

## Account Card Design

### Q1: What to show in the Manage Accounts card

| Option | Description | Selected |
|--------|-------------|----------|
| Match existing pattern | Steam logo + display name + Logged in status + Log out button | ✓ |
| Display name + avatar | Avatar fetched from Steam CDN alongside display name | |

**User's choice:** Match existing pattern
**Notes:** Visual consistency across all platform cards is the priority.

---

## Steam Client Gate

### Q1: Response when Steam client isn't installed

| Option | Description | Selected |
|--------|-------------|----------|
| Warn on login attempt | Warning prompt with [Download Steam] button fires when "Add Steam Account" is clicked; Steam tile remains visible and clickable | ✓ |
| Hard block on Steam section | Steam tile greyed out with inline warning; user can't click it | |

**User's choice:** Warn once on login attempt
**Notes:** Less aggressive — still lets users see Steam as an option, just can't proceed without the client.

### Q2: Detection method for Steam client

| Option | Description | Selected |
|--------|-------------|----------|
| Check known filesystem paths | Platform-specific default paths (Linux/macOS/Windows). Fast, offline, no permissions. | ✓ |
| Try steam:// protocol and check response | Fragile on some platforms; can't distinguish not-installed from slow-launch | |

**User's choice:** Check known filesystem paths

---

## Claude's Discretion

- Error state messaging (network failures, wrong credentials, bad SteamGuard code) — follow existing GOG/Epic error patterns
- Loading/pending states during QR generation and credential submission — standard spinner pattern
- Exact visual layout of the two-tab login screen — match existing aesthetic

## Deferred Ideas

- Multi-account Steam support — single account at launch; multi-account is future work
- TOTP toggle UI — deferred until user demand; same code field handles TOTP at launch
- Token expiry notification — in REQUIREMENTS.md v2 backlog; not Phase 1
- Avatar display in account card — deferred to maintain platform card consistency
