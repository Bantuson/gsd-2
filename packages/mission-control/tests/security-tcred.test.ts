/**
 * Holistic behaviour tests for T-CRED-01 — Credential Protection (Behaviours 71-76)
 *
 * RED PHASE: B72 (secondary window cap), B73, B75, B76 expected to FAIL until Wave 5
 * GREEN (already passing): B74 (TrustDialog.tsx handleConfirm)
 *
 * Testing approach:
 * - B71: Observable check on auth.json filesystem state (no plaintext API keys)
 * - B72: Static config check on capability JSON files (permitted)
 * - B73: Import trust-api.ts isTrusted() and mock fetch to throw — assert fail-closed
 * - B74: Static config check on TrustDialog.tsx for handleConfirm (regression test)
 * - B75: Source inspection on window-identity.ts fetch monkey-patch header handling
 * - B76: Static config check on tauri.conf.json assetScope (permitted)
 */
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// T-CRED-01 — Credential Protection
// ---------------------------------------------------------------------------

describe("T-CRED-01 — Credential Protection", () => {
  // -------------------------------------------------------------------------
  // B71 — No plaintext API keys in auth.json (observable check on filesystem)
  // -------------------------------------------------------------------------

  it("B71: auth.json does not contain plaintext API key values", () => {
    const authJsonPath = resolve(process.env.HOME ?? "~", ".gsd", "auth.json");
    if (existsSync(authJsonPath)) {
      const authData = JSON.parse(readFileSync(authJsonPath, "utf8"));
      // Keys should be absent or be keychain references, not 40+ char raw strings
      const keychainIndicators = ["keychain", "credential_ref", "os_keychain"];
      const hasPlaintextKey = Object.values(authData).some(
        (v) =>
          typeof v === "string" &&
          v.length > 20 &&
          !keychainIndicators.some((k) => String(v).includes(k))
      );
      expect(hasPlaintextKey).toBe(false);
    } else {
      // No auth.json means no plaintext keys — pass
      expect(true).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // B72 — Credential IPC commands restricted to main window only
  // (static config check on capability JSON files — permitted)
  // -------------------------------------------------------------------------

  it("B72: credential IPC commands (set_credential, get_credential, delete_credential) appear only in main.json, not in secondary capability files", () => {
    const capDir = resolve(import.meta.dir, "../src-tauri/capabilities");

    let capFiles: string[] = [];
    try {
      capFiles = readdirSync(capDir).filter((f: string) => f.endsWith(".json"));
    } catch {
      // capabilities directory might not be readable — will fail on next assertion
    }

    expect(capFiles.length).toBeGreaterThan(
      0,
      "capabilities/ directory must contain at least one capability JSON file"
    );

    const credentialPermissions = [
      "set_credential",
      "get_credential",
      "delete_credential",
    ];

    for (const file of capFiles) {
      if (file === "main.json") {
        // main.json MUST contain credential-related permissions
        const mainContent = readFileSync(resolve(capDir, file), "utf8");
        const rawContent = JSON.stringify(JSON.parse(mainContent));
        // main.json must grant at least one credential command
        const hasAnyCredPerm = credentialPermissions.some((perm) =>
          rawContent.includes(perm)
        );
        expect(hasAnyCredPerm).toBe(
          true,
          `main.json must grant credential permissions (set_credential, get_credential, delete_credential) — currently missing`
        );
        continue;
      }

      // All other capability files must NOT grant credential IPC commands
      const filePath = resolve(capDir, file);
      const content = readFileSync(filePath, "utf8");
      const rawContent = JSON.stringify(JSON.parse(content));
      for (const perm of credentialPermissions) {
        expect(rawContent).not.toContain(
          perm,
          `${file}: must not contain credential permission '${perm}' — only main.json may grant credential access`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // B73 — Trust check fails closed: network error → untrusted (not trusted)
  // -------------------------------------------------------------------------

  it("B73: isTrusted() returns false (fail-closed) when trust file is absent — App.tsx must NOT call setTrustStatus('trusted') in catch", async () => {
    // Test the isTrusted function directly — it should return false when the
    // trust flag file does not exist (filesystem access check)
    const { isTrusted } = await import("../src/server/trust-api");

    // A non-existent path should always return false (fail-closed)
    const result = await isTrusted("/tmp/nonexistent-workspace-that-does-not-exist/.gsd");
    expect(result).toBe(false);

    // Also verify App.tsx does NOT have the fail-open pattern:
    // .catch(() => setTrustStatus("trusted"))
    const appSrc = readFileSync(
      resolve(import.meta.dir, "../src/App.tsx"),
      "utf8"
    );

    // This pattern is the fail-open bug — must NOT be present after remediation
    expect(appSrc).not.toMatch(
      /\.catch\s*\(\s*(?:\(\s*\)|[^)]*)\s*=>\s*setTrustStatus\s*\(\s*["']trusted["']\s*\)/
    ); // RED: App.tsx currently has .catch(() => setTrustStatus("trusted"))
  });

  // -------------------------------------------------------------------------
  // B74 — Trust dialog requires explicit user confirmation (regression test)
  // GREEN: TrustDialog.tsx already has handleConfirm
  // -------------------------------------------------------------------------

  it("B74: TrustDialog requires explicit user confirmation via handleConfirm", () => {
    const trustDialogSrc = readFileSync(
      resolve(
        import.meta.dir,
        "../src/components/permissions/TrustDialog.tsx"
      ),
      "utf8"
    );
    // Must have an explicit confirm handler
    expect(trustDialogSrc).toMatch(/handleConfirm|onConfirm|confirm/i);
    // Must not auto-confirm (no setTimeout or immediate confirmation)
    expect(trustDialogSrc).not.toMatch(
      /autoConfirm|setTimeout.*confirm|immediate.*trust/i
    );
  });

  // -------------------------------------------------------------------------
  // B75 — Fetch monkey-patch handles Headers object, Headers instance, and array form
  // -------------------------------------------------------------------------

  it("B75: fetch monkey-patch in window-identity.ts handles Headers instances and [string,string][] arrays without dropping Authorization header", () => {
    const windowIdentitySrc = readFileSync(
      resolve(import.meta.dir, "../src/window-identity.ts"),
      "utf8"
    );

    // The monkey-patch must handle three header forms:
    // 1. Plain object: { "Authorization": "Bearer xyz" }
    // 2. Headers instance: new Headers({ "Authorization": "Bearer xyz" })
    // 3. Array form: [["Authorization", "Bearer xyz"]]

    // Assert the monkey-patch exists
    expect(windowIdentitySrc).toMatch(/globalThis\.fetch|global\.fetch/);

    // The CURRENT BROKEN pattern: spreads headers directly without instanceof check
    // { "X-Window-Id": windowId, ...(init?.headers ?? {}) }
    // This silently drops Authorization when headers is a Headers instance.

    // After remediation, the patch must check for Headers instance:
    const hasHeadersInstanceCheck =
      windowIdentitySrc.includes("instanceof Headers") ||
      (windowIdentitySrc.includes("new Headers") &&
        windowIdentitySrc.includes("Object.fromEntries"));

    expect(hasHeadersInstanceCheck).toBe(
      true,
      "window-identity.ts: fetch monkey-patch must handle Headers instances (instanceof Headers check) to avoid dropping Authorization headers — currently uses spread which silently drops Headers instance properties"
    ); // RED: current code uses ...(init?.headers ?? {}) without instanceof check

    // Must handle array form [string, string][]
    expect(windowIdentitySrc).toMatch(
      /Array\.isArray/,
      "window-identity.ts: fetch monkey-patch must handle [string,string][] header arrays using Array.isArray check"
    ); // RED: not present in current implementation
  });

  // -------------------------------------------------------------------------
  // B76 — Asset protocol scope narrowed from $APP/**
  // (static config check on tauri.conf.json — permitted)
  // -------------------------------------------------------------------------

  it("B76: asset protocol scope does not include broad $APP/** wildcard", () => {
    const tauriConf = JSON.parse(
      readFileSync(
        resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
        "utf8"
      )
    );

    const assetScope =
      tauriConf?.plugins?.protocol?.assetScope ??
      tauriConf?.tauri?.security?.assetScope ??
      null;

    expect(assetScope).not.toBeNull(
      "tauri.conf.json must define an asset protocol scope restriction"
    );

    const allowList: string[] = assetScope?.allow ?? [];

    // $APP/** is too broad — allows reading any app data directory file
    const hasBroadAppScope = allowList.some(
      (p: string) => p === "$APP/**" || p === "$APP/*"
    );
    expect(hasBroadAppScope).toBe(
      false,
      "asset scope must not allow $APP/** — must be narrowed to specific subdirectories"
    ); // RED: current tauri.conf.json has "$APP/**" in allow list

    // Must not allow root wildcards like **
    expect(allowList).not.toContain(
      "**",
      "asset scope must not allow ** root wildcard"
    );
  });
});
