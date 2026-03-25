# Threat Model — Mission Control

This document records the security threat model for Mission Control, including accepted risks and their mitigations.

## Accepted Risks and Mitigations

### B57/B71 — API Keys in Plaintext auth.json (ACCEPTED)

**Status:** Accepted risk
**Date:** 2026-03-24
**Behaviour:** POST /api/auth/login-api-key stores API keys in ~/.gsd/auth.json as plaintext JSON.

**Why not OS keychain:** The auth-api.ts handler runs inside the Bun HTTP server process, which is a child process spawned by Tauri. The Bun process does not have access to the Tauri IPC bridge (invoke/set_credential). Only code running inside the Tauri WebView (frontend JavaScript) can call invoke(). Routing API key storage through the frontend would require a round-trip: frontend -> server -> frontend -> Tauri IPC -> keychain, adding complexity disproportionate to the threat.

**Mitigations in place:**
- B16/B58: auth.json is created with mode 0o600 (owner read/write only) on every write via chmodSync
- **Windows note:** On Windows, `chmodSync(path, 0o600)` maps to NTFS ACLs. The effective protection depends on the NTFS ACL configuration, which by default grants the owning user read/write access only for files created in their home directory. The 0o600 permission call is best-effort on Windows — for elevated-privilege scenarios, the underlying NTFS ACL behavior provides equivalent protection in typical user-space home directory configurations.
- B50: HTTP API requires per-launch token, preventing remote access to the login-api-key endpoint
- B37: Host header validation restricts API access to 127.0.0.1:4200 and localhost:4200 (ALLOWED_HOSTS at server.ts:108-109). Note: localhost resolves via DNS, providing slightly wider surface for DNS rebinding than 127.0.0.1 alone. Both entries are required for cross-platform compatibility.
- The auth.json file is in the user's home directory (~/.gsd/), accessible only to the owning user

**Auth.json read paths (both must be updated in any migration):**
- `auth-api.ts` — primary auth handler (login, token storage, provider management)
- `classify-intent-api.ts:49` — reads auth.json directly to obtain API key for Haiku intent classification calls

**Residual risk:** A local process running as the same user can read auth.json. This is equivalent to reading the user's ~/.ssh/ or ~/.aws/ directories — accepted for a desktop application.

---

### B23 — dep_check Warning-Only for Unknown Bun Path (ACCEPTED)

**Status:** Accepted risk (PARTIAL behaviour by design)
**Date:** 2026-03-24
**Behaviour:** dep_check.rs logs a warning when Bun is found at a path not in the known-good list, but still allows execution to proceed.

**Rationale:** The absolute canonicalized path (resolve_bun_path in bun_manager.rs) prevents PATH hijack regardless of where Bun is installed. The warning alerts the user to an unusual installation location without blocking legitimate non-standard installs (e.g., nix, asdf, custom prefix). Blocking execution would create a poor UX for users with non-standard Bun installations.

**Mitigations in place:**
- B19: Bun is spawned with the absolute canonicalized path from resolve_bun_path(), not from PATH lookup
- B20/B21: Child environment is an explicit allowlist, not a parent clone — PATH manipulation has no effect
- The warning is logged so administrators can audit unexpected paths

**Residual risk:** If the absolute path points to a malicious binary at a non-standard location, execution proceeds. This requires the attacker to have already placed a binary on the filesystem (A-LOCAL threat), at which point they have equivalent access to the user's data directly.

---

### GAP-2 — /api/fs/list Full Filesystem Enumeration (ACCEPTED)

**Status:** Accepted risk
**Date:** 2026-03-25
**Behaviour:** The /api/fs/list endpoint allows browsing the entire filesystem, not just the home directory.

**Rationale:** Intentional UX design — the project picker requires full filesystem browsing to let users navigate to any project directory. Scoping to the home directory would break navigation for users with projects outside their home directory.

**Mitigations in place:**
- B50: Launch token required — /api/fs/list is behind the per-launch Bearer token guard
- B37: Host header validation restricts API access to 127.0.0.1:4200 and localhost:4200
- B38: WebSocket origin validation
- Endpoint is read-only (directory listing only, no write operations)

**Residual risk:** A local process with the launch token could enumerate the filesystem — equivalent to calling readdir() directly, which any same-user process can already do.

---

### GAP-3 — WebSocket Token in URL Query String (HISTORICAL)

**Status:** Resolved in phase 20.2.7
**Date:** 2026-03-25
**Behaviour:** Prior to phase 20.2.7, the WS launch token was passed as `?token=<value>` in the URL query string, making it visible in browser developer tools network tab, proxy logs, and Tauri WebView debug logs.

**Resolution:** Replaced with first-message handshake pattern in phase 20.2.7. Client connects without a token; server holds the connection in UNAUTHENTICATED state. Client sends `{ "type": "auth", "token": "..." }` as first WS message. Server validates the token, transitions to AUTHENTICATED, and subscribes to the appropriate topics. If token is invalid or absent after a 5-second timeout, server closes the connection with code 4001.

**Mitigations in place (post-fix):**
- Token never appears in URL query string or WebView logs
- B51: WS token validation enforced via first-message handshake
- B52: WS session isolation via TOPIC_PREFIX per windowId

**Residual risk:** None — token exposure via URL eliminated.

---

### GAP-9 — Rate Limiter Single Global Bucket (ACCEPTED)

**Status:** Accepted risk
**Date:** 2026-03-25
**Behaviour:** The rate limiter (B44) uses a single global bucket at 100 req/s, not a per-client bucket.

**Rationale:** All localhost traffic arrives from 127.0.0.1 — per-client bucketing is architecturally impossible here, as there is only one identifiable client address. The 100 req/s cap is intentional and sufficient for the single-user desktop application use case.

**Mitigations in place:**
- B44: 100 req/s global rate limit prevents runaway request floods
- Single-user application — one legitimate client by design
- Localhost-only binding (B37) — no external traffic

**Residual risk:** None meaningful. A local process could exhaust the rate limit for legitimate requests, but this is not a meaningful threat in a single-user desktop app.

---

### localhost:4200 DNS Rebinding Surface (ACCEPTED)

**Status:** Accepted risk
**Date:** 2026-03-25
**Behaviour:** ALLOWED_HOSTS includes `localhost:4200` alongside `127.0.0.1:4200`. Unlike 127.0.0.1 (which is a numeric IP address and cannot be DNS-rebound), `localhost` resolves via DNS, providing a slightly wider surface for DNS rebinding attacks.

**Rationale:** Both entries are needed for cross-platform compatibility — Windows environments commonly use `localhost` rather than `127.0.0.1` for loopback connections. Removing `localhost:4200` would break Windows installations.

**Mitigations in place:**
- B50: Per-launch token required for all API access — DNS rebinding alone is insufficient; attacker must also compromise the launch token
- B55: Origin validation
- B38: WebSocket origin validation

**Residual risk:** DNS rebinding attack requires both a DNS rebinding vector AND launch token compromise — the token is the true guard. Localhost DNS rebinding without token access yields nothing actionable.

---

## Future Architecture

### Tauri-Command-Based Auth Storage Migration

**Status:** Planned (not committed to timeline)
**Date:** 2026-03-25

**Current state:** API keys are stored in `~/.gsd/auth.json` as plaintext JSON (mode 0o600). Two components read this file directly:
- `auth-api.ts` — primary auth handler (login, token storage, provider management)
- `classify-intent-api.ts:49` — reads auth.json to obtain API key for Haiku intent classification calls

**Target architecture:** Move API key storage to Tauri IPC commands with OS keychain integration:
1. Frontend requests key via `invoke("get_credential", { key: "..." })`
2. Tauri Rust shell retrieves from OS keychain (already implemented for OAuth tokens via B71)
3. Frontend passes key to Bun server via secure internal channel
4. auth.json eliminated for API key storage

**Why not now:** The Bun server process is a child process of Tauri and does not have access to the Tauri IPC bridge (`invoke()`). Only code running inside the Tauri WebView (frontend JavaScript) can call `invoke()`. Routing API key storage through the frontend would require a round-trip architecture (frontend → server → frontend → Tauri IPC → keychain) adding complexity disproportionate to the current threat level.

**Trigger conditions:** This migration becomes warranted if:
- The application adds multi-user or networked features (threat model shifts from A-LOCAL to A-REMOTE)
- A security audit finds a credible local token escalation path beyond same-user equivalence
- The Tauri/Bun boundary evolves to support direct IPC access from child processes

**Impact of migration:** Both `auth-api.ts` and `classify-intent-api.ts:49` must be updated. Test coverage for both read paths exists in the regression test suite.
