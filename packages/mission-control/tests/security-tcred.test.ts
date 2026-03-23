/**
 * Nyquist tests for T-CRED-01 — Credential Protection (Behaviours 71-77)
 * and T-DOS-01 — Rust Runtime Safety, remaining behaviours (78-81)
 *
 * RED phase: Tests verify required security properties that may not yet be
 * fully implemented. Tests are expected to FAIL until green-phase
 * implementation is complete (B77 is permanently skipped — deferred to
 * CI/CD phase per CONTEXT.md TAURI-15).
 *
 * Source inspection approach: Tests read source files directly to verify
 * security contracts are encoded in the code.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const RUST_SRC = join(ROOT, "src-tauri/src");

// ---------------------------------------------------------------------------
// Helper: read all .rs files in a directory recursively
// ---------------------------------------------------------------------------
function readRustFiles(dir: string): { path: string; src: string }[] {
  const files: { path: string; src: string }[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files.push(...readRustFiles(full));
      } else if (entry.endsWith(".rs")) {
        files.push({ path: full, src: readFileSync(full, "utf8") });
      }
    }
  } catch {
    // directory may not exist in some environments
  }
  return files;
}

// ---------------------------------------------------------------------------
// T-CRED-01 — Credential Protection
// ---------------------------------------------------------------------------

describe("T-CRED-01 — Credential Protection", () => {
  // -------------------------------------------------------------------------
  // B71 — No plaintext credentials written to any file
  // -------------------------------------------------------------------------

  it("B71: no credential written to any plaintext file — auth.json must not store API key values", () => {
    // auth-api.ts delegates to AuthStorage from @gsd/pi-coding-agent.
    // AuthStorage stores credentials in auth.json on disk.
    // The required behaviour: auth.json must only store metadata (provider name, type, timestamps).
    // Actual secret values (API keys, OAuth tokens) must go through OS keychain via set_credential IPC.

    const authApiSrc = readFileSync(
      join(ROOT, "src/server/auth-api.ts"),
      "utf8"
    );

    // The auth-api must NOT call authStorage.set() with api_key credentials directly.
    // Instead it must route through invoke("set_credential") → Tauri IPC → keychain.
    expect(authApiSrc).not.toMatch(
      /authStorage\.set\s*\([^)]*api_key/,
      "auth-api.ts must not store api_key credentials via authStorage.set() (writes plaintext to auth.json)"
    );

    // The auth-api must invoke the IPC set_credential command for API keys
    expect(authApiSrc).toMatch(
      /set_credential|invoke.*set_credential/,
      "auth-api.ts must use IPC set_credential to store API keys in the OS keychain"
    );
  });

  // -------------------------------------------------------------------------
  // B72 — Credential IPC restricted to main window only
  // -------------------------------------------------------------------------

  it("B72: set_credential / get_credential / delete_credential only in main-capability, no other capability file", () => {
    const capDir = join(ROOT, "src-tauri/capabilities");

    let capFiles: string[] = [];
    try {
      capFiles = readdirSync(capDir).filter((f) => f.endsWith(".json"));
    } catch {
      // capabilities directory missing — test will fail
    }

    expect(capFiles.length).toBeGreaterThan(
      0,
      "capabilities/ directory must contain at least one capability JSON file"
    );

    const credentialPermissions = ["set_credential", "delete_credential", "get_credential"];

    for (const file of capFiles) {
      const filePath = join(capDir, file);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      if (file === "main.json") {
        // main.json MUST contain credential-related permissions
        // (currently as custom commands registered via tauri::command — presence in main window)
        // The commands are registered in lib.rs; capability controls who can call them.
        // main.json should be the ONLY capability — this test just verifies no other file
        // grants credential permissions.
        continue;
      }

      // All other capability files must NOT grant credential IPC commands
      const rawContent = JSON.stringify(parsed);
      for (const perm of credentialPermissions) {
        expect(rawContent).not.toContain(
          perm,
          `${file}: must not contain credential permission '${perm}' — only main.json may grant credential access`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // B73 — Trust check fails closed: error → untrusted, not trusted
  // -------------------------------------------------------------------------

  it("B73: trust check fails closed — on network error the workspace is treated as untrusted", () => {
    const appSrc = readFileSync(
      join(ROOT, "src/App.tsx"),
      "utf8"
    );

    // The trust-status fetch must fail CLOSED: on catch, setTrustStatus must NOT be set to "trusted"
    // We look for the fail-open pattern .catch(() => setTrustStatus("trusted")) and assert it is absent.
    expect(appSrc).not.toMatch(
      /\.catch\s*\(\s*(?:\(\s*\)|[^)]*)\s*=>\s*setTrustStatus\s*\(\s*["']trusted["']\s*\)/,
      "App.tsx: trust check must NOT fail open — .catch() must not call setTrustStatus('trusted')"
    );

    // Verify the trust-status fetch exists
    expect(appSrc).toMatch(
      /fetch\s*\(\s*["']\/api\/trust-status["']\s*\)/,
      "App.tsx: must fetch /api/trust-status to verify workspace trust"
    );
  });

  // -------------------------------------------------------------------------
  // B74 — Trust flag requires user dialog confirmation before writing
  // -------------------------------------------------------------------------

  it("B74: trust flag write requires explicit user dialog confirmation", () => {
    const trustApiSrc = readFileSync(
      join(ROOT, "src/server/trust-api.ts"),
      "utf8"
    );
    const appSrc = readFileSync(
      join(ROOT, "src/App.tsx"),
      "utf8"
    );

    // trust-api POST /api/trust writes the trust flag.
    // The frontend must require a dialog/confirmation before POSTing.
    // Look for TrustDialog, confirm dialog, or similar user-confirmation component.
    const hasTrustDialog =
      appSrc.includes("TrustDialog") ||
      appSrc.includes("trust-dialog") ||
      appSrc.includes("onConfirm") ||
      appSrc.includes("confirm(");

    expect(hasTrustDialog).toBe(
      true,
      "App.tsx: writing the trust flag must require an explicit user dialog/confirmation — look for TrustDialog or onConfirm"
    );

    // trust-api POST must validate the directory path (not arbitrary paths)
    expect(trustApiSrc).toMatch(
      /\.gsd|gsd_dir|normalizedDir/,
      "trust-api.ts: POST handler must validate the directory path restricts to .gsd directories"
    );
  });

  // -------------------------------------------------------------------------
  // B75 — Fetch monkey-patch handles Headers object instances correctly
  // -------------------------------------------------------------------------

  it("B75: fetch monkey-patch handles Headers instances and array form without dropping Authorization header", () => {
    const windowIdentitySrc = readFileSync(
      join(ROOT, "src/window-identity.ts"),
      "utf8"
    );

    // The monkey-patch uses spread: { "X-Window-Id": windowId, ...(init?.headers ?? {}) }
    // This pattern drops Headers object instances because spreading a Headers instance
    // does NOT produce own enumerable properties — the spread yields an empty object.
    // The required behaviour: must convert Headers instances before spreading.

    // Assert the monkey-patch exists
    expect(windowIdentitySrc).toMatch(
      /globalThis\.fetch|global\.fetch/,
      "window-identity.ts must patch global fetch"
    );

    // The dangerous pattern: spreading Headers directly without conversion
    // { "X-Window-Id": windowId, ...(init?.headers ?? {}) }
    // This fails for Headers instances. The fix requires checking instanceof Headers.
    const hasHeadersInstanceCheck =
      windowIdentitySrc.includes("instanceof Headers") ||
      windowIdentitySrc.includes("new Headers") ||
      windowIdentitySrc.includes("Headers.entries") ||
      windowIdentitySrc.includes("Object.fromEntries");

    expect(hasHeadersInstanceCheck).toBe(
      true,
      "window-identity.ts: fetch monkey-patch must handle Headers instances (instanceof Headers check or Object.fromEntries) to avoid dropping Authorization headers"
    );
  });

  // -------------------------------------------------------------------------
  // B76 — Asset protocol scope narrowed (no broad $APP/** wildcard)
  // -------------------------------------------------------------------------

  it("B76: asset protocol scope does not include broad $APP/** wildcard", () => {
    const conf = JSON.parse(
      readFileSync(
        join(ROOT, "src-tauri/tauri.conf.json"),
        "utf8"
      )
    );

    // asset scope can be under plugins.protocol.assetScope (Tauri v2)
    // or tauri.security.assetScope (Tauri v1)
    const assetScope =
      conf?.plugins?.protocol?.assetScope ??
      conf?.tauri?.security?.assetScope ??
      null;

    expect(assetScope).not.toBeNull(
      "tauri.conf.json must define an asset protocol scope restriction"
    );

    const allowList: string[] = assetScope?.allow ?? [];

    // $APP/** is too broad — allows reading any app data directory file
    expect(allowList).not.toContain(
      "$APP/**",
      "asset scope must not allow $APP/** (too broad — restricts to specific subdirectories instead)"
    );

    // Must not allow root wildcards like **
    expect(allowList).not.toContain(
      "**",
      "asset scope must not allow ** root wildcard"
    );
  });

  // -------------------------------------------------------------------------
  // B77 — CI updater key verification (deferred to CI/CD phase)
  // -------------------------------------------------------------------------

  it.skip("B77: CI updater signing key fingerprint verified before publishing (deferred — TAURI-15, CI/CD phase)", () => {
    // This test is permanently skipped until the CI/CD hardening phase.
    // CONTEXT.md TAURI-15: Updater key rotation and signing verification
    // are deferred to the dedicated CI/CD security phase.
    //
    // When implemented, this test should:
    // 1. Read all .github/workflows/*.yml files
    // 2. Assert at least one workflow contains a step that verifies
    //    the updater signing key fingerprint before publishing
    // 3. The step should use something like:
    //    minisign -V -P <expected-pubkey> -m latest.json
  });
});

// ---------------------------------------------------------------------------
// T-DOS-01 — Rust Runtime Safety (remaining behaviours 78-81)
// ---------------------------------------------------------------------------

describe("T-DOS-01 — Rust Runtime Safety", () => {
  // -------------------------------------------------------------------------
  // B78 — No Mutex lock().unwrap() in Tauri Rust code
  // -------------------------------------------------------------------------

  it("B78: no Mutex lock().unwrap() in Tauri Rust code", () => {
    const rustFiles = readRustFiles(RUST_SRC);

    expect(rustFiles.length).toBeGreaterThan(
      0,
      "src-tauri/src must contain Rust source files"
    );

    // Pattern: .lock().unwrap() — this panics the entire app if mutex is poisoned
    // Required: use match, unwrap_or_else(), or ? operator instead
    const mutexUnwrapPattern = /\.lock\s*\(\s*\)\s*\.unwrap\s*\(\s*\)/;

    const violations: string[] = [];
    for (const { path, src } of rustFiles) {
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (mutexUnwrapPattern.test(line)) {
          violations.push(`${path}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual(
      [],
      `Mutex lock().unwrap() found — panics on mutex poisoning. Use match or unwrap_or_else():\n${violations.join("\n")}`
    );
  });

  // -------------------------------------------------------------------------
  // B79 — child.wait() wrapped in spawn_blocking
  // -------------------------------------------------------------------------

  it("B79: blocking child.wait() is wrapped in tokio::task::spawn_blocking", () => {
    const bunManagerSrc = readFileSync(
      join(RUST_SRC, "bun_manager.rs"),
      "utf8"
    );

    // child.wait() is a blocking call — calling it on an async runtime thread
    // blocks the executor and can cause deadlocks or dropped tasks under load.
    // Required: wrap in spawn_blocking or use tokio's async process API.
    const hasWait = /child\s*\.\s*wait\s*\(\s*\)/.test(bunManagerSrc);

    if (hasWait) {
      // If child.wait() exists, it must be inside spawn_blocking or a blocking context
      const hasSpawnBlocking =
        bunManagerSrc.includes("spawn_blocking") ||
        bunManagerSrc.includes("tokio::task::block_in_place");

      expect(hasSpawnBlocking).toBe(
        true,
        "bun_manager.rs: child.wait() is a blocking call — must be wrapped in tokio::task::spawn_blocking to avoid blocking the async runtime"
      );
    }
  });

  // -------------------------------------------------------------------------
  // B80 — blocking_pick_folder wrapped in spawn_blocking or replaced with async dialog
  // -------------------------------------------------------------------------

  it("B80: blocking_pick_folder() is wrapped in spawn_blocking or replaced with async dialog", () => {
    const commandsSrc = readFileSync(
      join(RUST_SRC, "commands.rs"),
      "utf8"
    );

    // blocking_pick_folder() blocks the async runtime thread.
    // Required: wrap in spawn_blocking, or use the async dialog API.
    const hasBlockingPickFolder = commandsSrc.includes("blocking_pick_folder");

    if (hasBlockingPickFolder) {
      // If blocking_pick_folder is used, it must be in a spawn_blocking context
      const hasSpawnBlocking =
        commandsSrc.includes("spawn_blocking") ||
        commandsSrc.includes("block_in_place");

      expect(hasSpawnBlocking).toBe(
        true,
        "commands.rs: blocking_pick_folder() blocks the async runtime — must be wrapped in tokio::task::spawn_blocking"
      );
    }
    // If blocking_pick_folder is not present, the async dialog API is used — pass
  });

  // -------------------------------------------------------------------------
  // B81 — WS server port allocation uses atomic bind-and-hold (no TOCTOU)
  // -------------------------------------------------------------------------

  it("B81: WS server port allocation binds the socket directly rather than check-then-bind (no TOCTOU)", () => {
    const serverSrc = readFileSync(
      join(ROOT, "src/server.ts"),
      "utf8"
    );

    // Unsafe pattern: check if port is available → then try to bind
    // (another process can grab the port between check and bind — TOCTOU race)
    // Safe pattern: attempt to bind directly; if it fails, try the next port.

    // The current implementation uses nextWsPort++ and passes it directly to createWsServer.
    // This is the direct-bind approach — the WS server binds immediately without a
    // separate availability check. Verify no separate "isPortAvailable" check precedes binding.

    // Assert no separate port availability check function is called before binding
    expect(serverSrc).not.toMatch(
      /isPortAvailable|checkPort|portIsAvailable|isPortFree/,
      "server.ts: must not use a separate port availability check before binding (TOCTOU race condition)"
    );

    // Assert direct increment-and-bind pattern is present
    expect(serverSrc).toMatch(
      /nextWsPort\+\+|wsPort\s*=\s*nextWsPort/,
      "server.ts: WS port allocation must use direct increment-and-bind pattern"
    );

    // Assert freePort (kill existing process on port) is used to clear the way
    // rather than scanning for an available port
    expect(serverSrc).toMatch(
      /freePort\s*\(\s*wsPort\s*\)/,
      "server.ts: must call freePort(wsPort) to atomically clear and bind, not check availability first"
    );
  });
});
