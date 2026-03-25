# PR Security Context

> Reference document for the Mission Control PR.
> Previous PRs were closed due to security concerns — this document provides the full remediation history,
> threat model, accepted risks, and gap closure roadmap.
>
> **Security phases completed:** 20.2.3 → 20.2.4 → 20.2.5 → 20.2.6 → 20.2.7 (in progress)
> **Current posture:** 64/64 B-matrix behaviours GREEN. All post-audit findings resolved. 3 residual gaps queued.

---

## Security Work Completed

Three consecutive security phases were executed before this PR:

### Phase 20.2.3 — Security Hardening & PR Check Validation
- Implemented B19-B24 (T-EXEC-01): Bun spawned with absolute canonicalized path; child env is explicit allowlist via `env_clear()`; `kill-port` and `git-api` use `execFile` with array args (no shell)
- Implemented B33-B42 (T-NET-01/T-NET-02): Proxy allowlist for external hosts/ports; blocked local ports (Postgres, Redis, MongoDB, etc.); X-Forwarded-* header stripping; 10 MB body cap; NDJSON 1 MB line cap
- Rewrote Nyquist tests from source-inspection to holistic HTTP behaviour tests

### Phase 20.2.4 — Threat Model Driven Security Remediation
- Implemented all T-FILE-01/02/03 (B1-B18): `validatePath` with `realpathSync` + `path.sep` containment; `validateSegment` for slice/milestone/task IDs; `path.basename` on asset uploads; `validateProjectName` and `validateSlug` on workspace/worktree APIs; atomic `freePort` via socket bind (eliminates kill-then-sleep TOCTOU)
- Implemented T-EXEC-02 (B25-B32): DOMPurify added to `CodeExplorer.tsx` and `InlineReadPanel.tsx`; `tauri.conf.json` CSP changed from `unsafe-inline` to `nonce`-based; secondary window capability file created; iframe sandbox attributes added
- Implemented T-AUTH-01 (B50-B56): Per-launch `LAUNCH_TOKEN` via `crypto.randomUUID()`; Bearer token middleware on all `/api/*` routes; WebSocket token auth; WS session isolation via `TOPIC_PREFIX + windowId`; startup token single-use endpoint; CORS OPTIONS before route handlers
- Implemented T-AUTH-02 (B57-B64): Auth session cap (100); rate limiting (100 req/s); window pool cap (10); `withRefreshLock` mutex for concurrent token refresh; generic error messages (no cause leakage); `validateOAuthUrl` enforces `https://` only; `Url::parse` in Rust for `open_external`
- Implemented T-CRED-01 (B71-B77): `require_main_window()` Rust guard on `set_credential`, `delete_credential`, `get_credential`, `restart_bun`; `App.tsx` trust failure now fails closed (`needs_trust`, not `trusted`); fetch monkey-patch handles `Headers` instance and array forms; CI pubkey verification before build

### Phase 20.2.5 — Security Behaviour Closure
- Closed all 53 FAIL + 11 PARTIAL behaviours from the post-20.2.4 audit
- Final verification: **64/64 behaviours GREEN**
- Additional closures: B52 WS session isolation (TOPIC_PREFIX per windowId with passing isolation test); B62 logout clears OS keychain via `invoke('delete_credential')` per key; B57/B71 and B23 formally accepted in THREAT-MODEL.md

### Phase 20.2.6 — Post-Audit Security Remediation
- A parallel 4-auditor review (without B-matrix context) surfaced ~20 findings; 15 were false alarms or accepted risks; 4 were actionable
- **FS-9:** Fixed Windows regex typo `/s+/` → `/\s+/` in `kill-port.ts:21` — PID parsing from `netstat -ano` now works correctly on Windows
- **API-6:** Fixed null/empty Host header bypass — `if (host && ...)` → `if (!host || ...)` at `server.ts:129`. Missing `Host` now returns 400 instead of bypassing the DNS rebinding guard
- **API-4:** Fixed `POST /api/trust` path traversal — added `.gsd` suffix check + `path.resolve()` normalization before `writeTrustFlag()` at `server.ts:402-405`
- **FE-5/FE-6:** Replaced raw `DOMPurify.sanitize()` with the project's hardened `sanitizeHtml()` wrapper in `CodeExplorer.tsx` and `InlineReadPanel.tsx` (explicit ALLOWED_TAGS/ALLOWED_ATTR allowlist)
- Regression tests: 8/8 pass in `tests/security-audit-remediation.test.ts`

---

## Threat Model

Full model: `.planning/THREAT-MODEL.md`

**Threat actors in scope:** A-LOCAL (same-user local process), A-NET-LOCAL (adjacent network device)
**Threat actors out of scope:** A-REMOTE — server binds `127.0.0.1` only

**Attack surface:**
| Vector | Mitigation | Status |
|--------|-----------|--------|
| Remote network attacker | Server binds to `127.0.0.1` only — no network exposure | ✓ |
| DNS rebinding | Host header validated against `ALLOWED_HOSTS` (`127.0.0.1:4200` + `localhost:4200`); null/missing Host → 400 (fixed 20.2.6) | ✓ |
| Malicious project files (.gsd/) | `sanitizeHtml()` wrapper (explicit allowlist) + CSP `script-src 'self' 'nonce-...'` (no unsafe-inline) | ✓ |
| XSS to Tauri IPC | Credential commands guarded by `require_main_window()` in Rust; secondary window capability file excludes credential plugins | ✓ |
| Path traversal | `realpathSync` + `path.sep` containment on file APIs; `validateSegment` on IDs; `.gsd` suffix check on trust endpoint | ✓ |
| Command injection | All process spawning uses `execFile` with array args, `shell: false` | ✓ |
| Supply-chain / PATH hijack | Bun spawned with absolute canonicalized path; child env rebuilt from explicit allowlist | ✓ |
| Unauthenticated API access | Per-launch Bearer token required on all `/api/*` routes | ✓ |
| Session cross-contamination | WebSocket topics scoped per `windowId` via `TOPIC_PREFIX` | ✓ |
| WS token in URL query string | Accepted risk; first-message handshake migration planned in 20.2.7 | Queued |
| IPC from secondary windows | `require_main_window()` on credential + restart commands; 3 non-credential commands missing guard (Fix 1 in 20.2.7) | Queued |
| `/api/project/switch` path scope | Accepted risk with launch-token guard; home-dir confinement planned in 20.2.7 | Queued |
| Local same-user attacker | Accepted risk (equivalent access to `~/.ssh`, `~/.aws`) | Accepted |

**Accepted (architectural constraints — will not change):**
- TLS for localhost — no benefit against same-user attacker; self-signed cert UX is worse
- Rate limiter single bucket — all localhost traffic arrives from `127.0.0.1`; per-client bucketing impossible
- Unrestricted FS enumeration via `/api/fs/list` — intentional UX for project picker; behind launch token
- B23 dep_check warning-only — absolute canonicalization prevents PATH hijack; blocking breaks nix/asdf installs

---

## Accepted Risks

Formally documented in `.planning/THREAT-MODEL.md`:

### API Keys in Plaintext auth.json (B57/B71)
**Accepted.** The Bun server process cannot call Tauri IPC (keychain) — it runs as a child process
and has no access to the `invoke()` bridge. Routing through the frontend would add a round-trip and
disproportionate complexity.
**Mitigations:** `auth.json` created with `mode 0o600`; per-launch token prevents remote access;
localhost binding. `auth.json` is consumed by `auth-api.ts` and `classify-intent-api.ts`.
**Residual risk:** Same-user local process can read `~/.gsd/auth.json` — equivalent to reading
`~/.ssh/` or `~/.aws/credentials`.
**Future path:** Long-term, API key storage should migrate to Tauri commands with OS keychain
integration. Not in scope for current work.

### dep_check Warning-Only for Non-Standard Bun Path (B23)
**Accepted.** Blocking execution would break users with non-standard Bun installations (nix, asdf).
Absolute canonicalization in `bun_manager.rs` already prevents PATH hijack regardless of where Bun
is installed. The warning is logged so administrators can audit unexpected paths.

---

## Gap Closure — Completed (Phase 20.2.6) and Queued (Phase 20.2.7)

### Completed in Phase 20.2.6

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| FS-9 | Low | `kill-port.ts` Windows regex `/s+/` — PID parsing silently failed on all Windows `netstat` output | Changed to `/\s+/` at `kill-port.ts:21` |
| API-6 | Low | Empty/missing `Host` header bypassed DNS rebinding guard (`if (host && ...)` — null is falsy) | Changed to `if (!host \|\| ...)` at `server.ts:129` |
| API-4 | Medium | `POST /api/trust` called `writeTrustFlag(body.dir)` directly, bypassing `.gsd` suffix check and path normalization that `registerTrustRoutes` enforces | Added suffix + normalize validation at `server.ts:402-405` |
| FE-5/FE-6 | Low | `CodeExplorer.tsx` and `InlineReadPanel.tsx` called raw `DOMPurify.sanitize()` with no config, bypassing the explicit tag/attr allowlist in `sanitize-html.ts` | Replaced with `sanitizeHtml()` from the hardened wrapper in both files |

### Queued in Phase 20.2.7

| ID | Severity | Finding | Planned Fix |
|----|----------|---------|------------|
| GAP-7 | Medium | `install_update` / `check_for_updates` lack `require_main_window()` — secondary window can trigger app restart | Add `require_main_window(&window)?;` as first line of both handlers |
| GAP-1 | Medium | `/api/project/switch` accepts any filesystem path — no home-dir confinement beyond launch token | Add `path.startsWith(homedir())` guard before `access()` check |
| GAP-5 | Low | `reveal_path` lacks `require_main_window()` — secondary window can open arbitrary dirs in file manager | Add `require_main_window(&window)?;` |
| GAP-6 | Low | `open_new_window` lacks `require_main_window()` — secondary window can spawn windows | Add `require_main_window(&window)?;` |
| GAP-3 | Low | WS token passed as `?token=` URL query string — visible in browser devtools and proxy logs | Migrate to first-message handshake: connect unauthenticated, send `{type:"auth",token:"..."}` as first WS message |

---

## Why Most Audit Findings Were Not Actionable

A 4-auditor parallel security review was run without B-matrix context. Of ~20 findings raised:
- **~15** were false alarms, accepted risks, or intentional design decisions
- **1** was a better-practice improvement (FE-5/FE-6 DOMPurify wrapper)
- **3** were genuine new gaps (FS-9, API-4, API-6) — all resolved in phase 20.2.6

Representative false alarms (showing why B-matrix context matters):
- **FE-2 ("proxy preserves CSP is a vulnerability")** — B39 *explicitly requires* CSP not be stripped. The auditor found the correct fixed state and raised it as a new finding.
- **FE-1 ("iframe sandbox voids itself")** — B32 was "no sandbox at all." The fix added the attribute. `allow-same-origin` + DOMPurify + CSP is the verified B25-B32 posture.
- **AUTH-4 ("plaintext auth.json")** — B57/B71 accepted risk, formally documented in THREAT-MODEL.md.
- **API-1 ("global rate bucket")** — B44 verified. Single bucket is inherent to localhost architecture.

This is expected. Security auditors without project context will re-raise accepted trade-offs. The
B-matrix and THREAT-MODEL.md are the authoritative references for what is intentional.

---

## Hardening Architecture — How the Layers Work Together

For reviewers evaluating the security posture holistically:

```
[Tauri WebView] → CSP (nonce-based, no unsafe-inline) → DOMPurify (explicit allowlist)
     ↓ invoke()
[Tauri Rust shell] → require_main_window() → OS keychain (credentials only)
     ↓ child process spawn
[Bun HTTP server] → per-launch Bearer token → host header validation → rate limiter
     ↓ handlers
[File APIs] → validatePath (realpathSync + sep containment)
[Exec APIs] → execFile with array args (shell: false)
[Proxy APIs] → host/port allowlist (no SSRF to local services)
[Trust API] → .gsd suffix check + path normalization
[WS server] → per-launch token + per-window topic isolation
```

No single layer is the only defence. The depth is intentional and tested.
