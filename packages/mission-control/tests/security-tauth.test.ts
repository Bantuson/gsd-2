/**
 * Nyquist security tests for T-AUTH-01, T-AUTH-02, and T-CRED-01 threat categories.
 *
 * Covers behaviours 50-64:
 *   T-AUTH-01 (B50-B56) — Per-launch bearer token, session ownership, crypto randomness, CORS
 *   T-CRED-01 (B57-B58) — No plaintext credentials in auth.json, correct file permissions
 *   T-AUTH-02 (B59-B64) — OAuth security (URL length, state nonce, session binding,
 *                          complete logout, error normalization, refresh mutex)
 *
 * These are RED-phase tests: all expected to FAIL until Wave 2/3 implements the behaviours.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SRC_DIR = resolve(import.meta.dir, "../src");
const SRC_TAURI_DIR = resolve(import.meta.dir, "../src-tauri/src");

function readSrc(relativePath: string): string {
  return readFileSync(resolve(SRC_DIR, relativePath), "utf-8");
}

function readTauriSrc(relativePath: string): string {
  return readFileSync(resolve(SRC_TAURI_DIR, relativePath), "utf-8");
}

/** Collect all TypeScript source files that write ~/.gsd/auth.json */
function readAuthRelatedSrcs(): string {
  const filesToCheck = [
    "server/auth-api.ts",
    "server.ts",
  ];
  let combined = "";
  for (const f of filesToCheck) {
    try {
      combined += readSrc(f);
    } catch {
      // file may not exist
    }
  }
  return combined;
}

// ---------------------------------------------------------------------------
// T-AUTH-01 — Authentication Enforcement (B50-B56)
// ---------------------------------------------------------------------------

describe("T-AUTH-01 — Authentication Enforcement", () => {
  it("B50: all HTTP endpoints require per-launch bearer token (missing/invalid returns 401)", () => {
    // source-inspect: server.ts must enforce Authorization: Bearer <token> on all routes.
    const serverSrc = readSrc("server.ts");

    // Must have authentication middleware / guard applied before route dispatch.
    const hasAuthCheck =
      serverSrc.includes("Authorization") ||
      serverSrc.includes("authorization") ||
      serverSrc.includes("Bearer") ||
      serverSrc.includes("bearer") ||
      serverSrc.includes("per-launch");

    const hasUnauthorizedReturn =
      serverSrc.includes("401") ||
      serverSrc.match(/Unauthorized/i) !== null;

    expect(hasAuthCheck).toBe(true);
    expect(hasUnauthorizedReturn).toBe(true);
  });

  it("B51: ws-server.ts validates per-launch token on WebSocket upgrade (rejects without token)", () => {
    // source-inspect: WebSocket upgrade must check the per-launch token.
    const wsSrc = readSrc("server/ws-server.ts");

    const hasTokenCheck =
      wsSrc.includes("token") ||
      wsSrc.includes("Bearer") ||
      wsSrc.includes("authorization") ||
      wsSrc.includes("Authorization") ||
      wsSrc.includes("per-launch");

    const hasRejection =
      wsSrc.includes("401") ||
      wsSrc.includes("403") ||
      wsSrc.match(/reject.*token/i) !== null ||
      wsSrc.match(/token.*missing/i) !== null;

    expect(hasTokenCheck).toBe(true);
    expect(hasRejection).toBe(true);
  });

  it("B52: ws-server.ts enforces session ownership (client for session A cannot target session B)", () => {
    // source-inspect: WS message handlers must verify session ownership before routing.
    const wsSrc = readSrc("server/ws-server.ts");
    const pipelineSrc = readSrc("server/pipeline.ts");
    const allSrc = wsSrc + pipelineSrc;

    // Must check that the WS client owns the session it is targeting.
    const hasOwnershipCheck =
      allSrc.includes("activeClient") ||
      allSrc.match(/session.*owner/i) !== null ||
      allSrc.match(/client.*session.*check/i) !== null ||
      allSrc.match(/ownership/i) !== null ||
      allSrc.match(/unauthorized.*session/i) !== null;

    // The session must be bound to the client that created it.
    const hasSessionBinding =
      allSrc.match(/session\.activeClient.*!==.*ws/i) !== null ||
      allSrc.match(/ws.*!==.*session\.activeClient/i) !== null ||
      allSrc.match(/session.*client.*mismatch/i) !== null ||
      allSrc.match(/cross.session/i) !== null;

    expect(hasOwnershipCheck).toBe(true);
    expect(hasSessionBinding).toBe(true);
  });

  it("B53: per-launch token uses crypto.randomUUID() — no Math.random() for token generation", () => {
    // source-inspect: server.ts and session-manager.ts must use cryptographic randomness for tokens.
    const serverSrc = readSrc("server.ts");
    const smSrc = readSrc("server/session-manager.ts");
    const allSrc = serverSrc + smSrc;

    // Must use cryptographic random — not Math.random().
    const usesCryptoRandom =
      allSrc.includes("crypto.randomUUID()") ||
      allSrc.includes("crypto.getRandomValues") ||
      allSrc.includes("randomUUID") ||
      allSrc.includes("getRandomValues");

    // Per-launch token specifically must NOT use Math.random().
    // Look for any token generation that uses Math.random.
    const perLaunchTokenLine = serverSrc
      .split("\n")
      .find(
        (line) =>
          (line.includes("token") || line.includes("Token")) &&
          line.includes("=") &&
          !line.includes("//")
      );

    if (perLaunchTokenLine) {
      expect(perLaunchTokenLine).not.toContain("Math.random");
    }

    expect(usesCryptoRandom).toBe(true);
  });

  it("B54: window IDs use crypto.randomUUID() — not Math.random()", () => {
    // source-inspect: window registration must use crypto.randomUUID() for window IDs.
    const serverSrc = readSrc("server.ts");
    const wsSrc = readSrc("server/ws-server.ts");
    const allSrc = serverSrc + wsSrc;

    // Check that window ID generation does NOT use Math.random().
    const windowIdLine = allSrc
      .split("\n")
      .find(
        (line) =>
          (line.toLowerCase().includes("windowid") || line.toLowerCase().includes("window_id")) &&
          line.includes("=") &&
          !line.includes("//")
      );

    if (windowIdLine) {
      expect(windowIdLine).not.toContain("Math.random");
      expect(windowIdLine).toContain("randomUUID");
    } else {
      // If no dedicated window ID generation line is found, verify the whole codebase uses crypto UUIDs.
      const usesMathRandom = allSrc.match(/windowId.*Math\.random/i) !== null;
      expect(usesMathRandom).toBe(false);

      // Must have crypto-based UUID generation somewhere for window IDs.
      const hasCryptoWindowId =
        allSrc.match(/randomUUID.*window/i) !== null ||
        allSrc.match(/window.*randomUUID/i) !== null ||
        allSrc.match(/crypto.*window/i) !== null;
      expect(hasCryptoWindowId).toBe(true);
    }
  });

  it("B55: server.ts rejects requests with non-matching Origin header", () => {
    // source-inspect: server.ts must validate Origin against tauri://localhost, file://, or absent.
    const serverSrc = readSrc("server.ts");

    const hasOriginValidation =
      serverSrc.includes("tauri://localhost") ||
      serverSrc.includes("file://") ||
      serverSrc.match(/[Oo]rigin.*reject/i) !== null ||
      serverSrc.match(/allowed.*[Oo]rigin/i) !== null ||
      serverSrc.match(/[Oo]rigin.*allow/i) !== null ||
      serverSrc.match(/cors.*origin/i) !== null;

    const rejectsInvalidOrigin =
      serverSrc.match(/[Oo]rigin.*403/s) !== null ||
      serverSrc.match(/403.*[Oo]rigin/s) !== null ||
      serverSrc.match(/[Oo]rigin.*400/s) !== null ||
      serverSrc.match(/400.*[Oo]rigin/s) !== null ||
      serverSrc.match(/forbidden.*[Oo]rigin/i) !== null;

    expect(hasOriginValidation).toBe(true);
    expect(rejectsInvalidOrigin).toBe(true);
  });

  it("B56: server.ts registers CORS preflight (OPTIONS) handlers BEFORE route handlers", () => {
    // source-inspect: OPTIONS handling must appear before route dispatch logic.
    const serverSrc = readSrc("server.ts");

    // Find the position of OPTIONS handling vs first API route.
    const optionsIndex = serverSrc.indexOf("OPTIONS");
    const firstApiRouteIndex = serverSrc.indexOf('pathname.startsWith("/api/');

    // OPTIONS check must appear before the first API route handler.
    expect(optionsIndex).toBeGreaterThanOrEqual(0);

    if (firstApiRouteIndex >= 0) {
      expect(optionsIndex).toBeLessThan(firstApiRouteIndex);
    }
  });
});

// ---------------------------------------------------------------------------
// T-CRED-01 — No Plaintext Credentials (B57-B58)
// ---------------------------------------------------------------------------

describe("T-CRED-01 — Credential Storage Security", () => {
  it("B57: auth.json does NOT store plaintext API key values (only non-secret metadata)", () => {
    // source-inspect: code that writes auth.json must not write raw API key values.
    const authSrc = readAuthRelatedSrcs();

    // AuthStorage.set() is the write path — check for explicit key value writing.
    // The auth.json file should only store provider metadata, not the key itself.
    const writesApiKeyDirectly =
      authSrc.match(/auth\.json.*key.*=.*["']/i) !== null ||
      authSrc.match(/writeFile.*key.*value/i) !== null;

    // The write must go through keychain (set_credential / keyring), not auth.json.
    const writesToKeychain =
      authSrc.includes("set_credential") ||
      authSrc.includes("keyring") ||
      authSrc.includes("keychain") ||
      authSrc.includes("setPassword") ||
      authSrc.match(/authStorage\.set\(.*\{.*type.*api_key/s) !== null;

    // Must NOT write plaintext key to auth.json.
    expect(writesApiKeyDirectly).toBe(false);
    // Must use keychain for actual secret storage.
    expect(writesToKeychain).toBe(true);
  });

  it("B58: auth.json is created with mode 0o600 (owner-read-write only)", () => {
    // source-inspect: writeFile/writeFileSync for auth.json must include { mode: 0o600 }.
    const authSrc = readAuthRelatedSrcs();

    const hasSecureMode =
      authSrc.includes("0o600") ||
      authSrc.includes("0600") ||
      authSrc.match(/writeFile.*auth.*0o600/s) !== null ||
      authSrc.match(/writeFileSync.*auth.*0o600/s) !== null ||
      authSrc.match(/mode.*0o600.*auth/s) !== null;

    const hasPermissionVerification =
      authSrc.match(/chmod.*auth\.json/i) !== null ||
      authSrc.match(/chown.*auth\.json/i) !== null ||
      authSrc.match(/stat.*auth\.json/i) !== null ||
      authSrc.match(/verify.*permission/i) !== null ||
      authSrc.includes("0o600");

    expect(hasSecureMode).toBe(true);
    expect(hasPermissionVerification).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-AUTH-02 — OAuth Security (B59-B61)
// ---------------------------------------------------------------------------

describe("T-AUTH-02 — OAuth Security", () => {
  it("B59: lib.rs OAuth deep link handler rejects URLs longer than 2048 characters", () => {
    // source-inspect: the deep link handler must enforce a URL length limit.
    const libSrc = readTauriSrc("lib.rs");

    const hasUrlLengthCheck =
      libSrc.includes("2048") ||
      libSrc.match(/url.*len.*2048/i) !== null ||
      libSrc.match(/2048.*url/i) !== null ||
      libSrc.match(/url_str\.len\(\).*>/i) !== null ||
      libSrc.match(/reject.*url.*length/i) !== null ||
      libSrc.match(/url.*too.*long/i) !== null;

    expect(hasUrlLengthCheck).toBe(true);
  });

  it("B60: lib.rs validates OAuth state nonce against stored nonce before accepting code", () => {
    // source-inspect: the OAuth callback must validate the state nonce to prevent CSRF.
    const libSrc = readTauriSrc("lib.rs");

    // Must check state parameter from URL against a stored nonce.
    const hasStateValidation =
      libSrc.match(/state.*nonce/i) !== null ||
      libSrc.match(/nonce.*state/i) !== null ||
      libSrc.match(/stored.*state/i) !== null ||
      libSrc.match(/state.*!=/i) !== null ||
      libSrc.match(/validate.*state/i) !== null ||
      libSrc.match(/verify.*state/i) !== null ||
      libSrc.match(/state.*mismatch/i) !== null;

    expect(hasStateValidation).toBe(true);
  });

  it("B61: authorization codes are bound to the initiating session (no cross-session injection)", () => {
    // source-inspect: auth session handling must bind the authorization code to the session.
    const authSrc = readSrc("server/auth-api.ts");

    // Must have session-to-code binding — not global code acceptance.
    const hasSessionBinding =
      authSrc.match(/session.*code/i) !== null ||
      authSrc.match(/code.*session/i) !== null ||
      authSrc.match(/sessionId.*code/i) !== null;

    const hasCrossSessionProtection =
      authSrc.match(/cross.*session/i) !== null ||
      authSrc.match(/session.*inject/i) !== null ||
      authSrc.match(/bind.*session/i) !== null ||
      authSrc.match(/session.*bound/i) !== null ||
      // The auth code resolver is accessed only through the session that started the flow.
      authSrc.match(/sessions\.get\(.*sessionId\)/i) !== null;

    expect(hasSessionBinding).toBe(true);
    expect(hasCrossSessionProtection).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-CRED-01 — Complete Logout (B62)
// ---------------------------------------------------------------------------

describe("T-CRED-01 — Complete Logout", () => {
  it("B62: logout flow clears ALL credentials (iterates all keys and deletes each)", () => {
    // source-inspect: logout must delete all stored credentials, not just the active provider.
    const authSrc = readSrc("server/auth-api.ts");
    const commandsSrc = readTauriSrc("commands.rs");

    // TypeScript logout path must call logout on all providers.
    const tsLogoutAll =
      authSrc.match(/clear_all_credentials/i) !== null ||
      authSrc.match(/authStorage\.list\(\)/i) !== null ||
      authSrc.match(/toLogout.*authStorage\.list/s) !== null ||
      authSrc.match(/for.*p.*of.*toLogout/s) !== null;

    // Rust side must have delete_credential capability for all keys.
    const rustDeleteAll =
      commandsSrc.includes("delete_credential") &&
      (commandsSrc.includes("ALLOWED_CREDENTIAL_KEYS") ||
        commandsSrc.match(/for.*key.*in.*ALLOWED/s) !== null);

    expect(tsLogoutAll).toBe(true);
    expect(rustDeleteAll).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-AUTH-02 — Error Normalization + Refresh Mutex (B63-B64)
// ---------------------------------------------------------------------------

describe("T-AUTH-02 — Error Normalization and Refresh Mutex", () => {
  it("B63: auth error handlers return a single generic error message (no leaking 'expired'/'invalid'/'missing')", () => {
    // source-inspect: auth error responses must not expose specific error causes.
    const authSrc = readSrc("server/auth-api.ts");

    // Must NOT return differentiated error messages revealing token state.
    const leaksExpired = authSrc.match(/["\'].*expired.*["\'].*status/i) !== null;
    const leaksInvalid = authSrc.match(/["\'].*invalid.*token.*["\'].*status/i) !== null;
    const leaksMissing = authSrc.match(/["\'].*missing.*token.*["\'].*status/i) !== null;

    // Must have a normalized error handler.
    const hasNormalizedError =
      authSrc.match(/generic.*error/i) !== null ||
      authSrc.match(/normalized.*error/i) !== null ||
      authSrc.match(/Authentication failed/i) !== null ||
      authSrc.includes("Unauthorized");

    // Error messages must not leak specific token failure causes.
    expect(leaksExpired).toBe(false);
    expect(leaksInvalid).toBe(false);
    expect(leaksMissing).toBe(false);
    expect(hasNormalizedError).toBe(true);
  });

  it("B64: token refresh uses mutex/lock or Promise-based deduplication to prevent concurrent refreshes", () => {
    // source-inspect: the token refresh code must prevent concurrent refresh calls.
    const authSrc = readSrc("server/auth-api.ts");
    const serverSrc = readSrc("server.ts");
    const allSrc = authSrc + serverSrc;

    const hasMutex =
      allSrc.includes("Mutex") ||
      allSrc.includes("mutex") ||
      allSrc.includes("lock") ||
      allSrc.match(/refresh.*mutex/i) !== null ||
      allSrc.match(/mutex.*refresh/i) !== null;

    const hasPromiseDedup =
      allSrc.match(/refresh.*Promise/s) !== null ||
      allSrc.match(/refreshPromise/i) !== null ||
      allSrc.match(/pending.*refresh/i) !== null ||
      allSrc.match(/refresh.*in.*progress/i) !== null ||
      allSrc.match(/isRefreshing/i) !== null ||
      allSrc.match(/refreshLock/i) !== null;

    // Must have either mutex OR promise-based deduplication.
    const hasRefreshProtection = hasMutex || hasPromiseDedup;
    expect(hasRefreshProtection).toBe(true);
  });
});
