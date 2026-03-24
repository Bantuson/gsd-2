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
- B37: Host header validation restricts API access to 127.0.0.1:4200 only
- The auth.json file is in the user's home directory (~/.gsd/), accessible only to the owning user

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
