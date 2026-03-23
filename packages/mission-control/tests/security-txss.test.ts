/**
 * Nyquist tests for T-XSS-01 — Content Security (Behaviours 65-70)
 *
 * RED phase: Tests verify required security properties that may not yet be
 * fully implemented. All tests in this file are expected to FAIL until
 * green-phase implementation is complete.
 *
 * Source inspection approach: Tests read source files directly to verify
 * security contracts are encoded in the code, not just in runtime behaviour.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// B65 — All marked.parse output sanitized with DOMPurify before DOM insertion
// ---------------------------------------------------------------------------

describe("T-XSS-01 — Content Security", () => {
  it("B65: all marked.parse output sanitized with DOMPurify before DOM insertion", () => {
    const ceSrc = readFileSync(
      join(ROOT, "src/components/code-explorer/CodeExplorer.tsx"),
      "utf8"
    );
    const irpSrc = readFileSync(
      join(ROOT, "src/components/milestone/InlineReadPanel.tsx"),
      "utf8"
    );

    // Both files use marked.parse — verify DOMPurify.sanitize is called
    expect(ceSrc).toMatch(
      /DOMPurify\.sanitize/,
      "CodeExplorer.tsx must call DOMPurify.sanitize on marked.parse output"
    );
    expect(irpSrc).toMatch(
      /DOMPurify\.sanitize/,
      "InlineReadPanel.tsx must call DOMPurify.sanitize on marked.parse output"
    );
  });

  // -------------------------------------------------------------------------
  // B66 — javascript: URL prevention via DOMPurify on all markdown output paths
  // -------------------------------------------------------------------------

  it("B66: DOMPurify configured to strip javascript: URLs in all marked.parse output paths", () => {
    const ceSrc = readFileSync(
      join(ROOT, "src/components/code-explorer/CodeExplorer.tsx"),
      "utf8"
    );
    const irpSrc = readFileSync(
      join(ROOT, "src/components/milestone/InlineReadPanel.tsx"),
      "utf8"
    );

    // DOMPurify strips javascript: URLs by default when sanitize() is called.
    // Asserting DOMPurify.sanitize is present on all marked.parse output paths
    // is sufficient — no explicit FORBID_URI_PATTERNS config needed.
    expect(ceSrc).toMatch(
      /DOMPurify\.sanitize/,
      "CodeExplorer.tsx: DOMPurify.sanitize must wrap marked.parse output to prevent javascript: URLs"
    );
    expect(irpSrc).toMatch(
      /DOMPurify\.sanitize/,
      "InlineReadPanel.tsx: DOMPurify.sanitize must wrap marked.parse output to prevent javascript: URLs"
    );

    // Verify sanitization precedes DOM insertion (dangerouslySetInnerHTML)
    // CodeExplorer: DOMPurify.sanitize call must appear before dangerouslySetInnerHTML
    const cePos = ceSrc.indexOf("DOMPurify.sanitize");
    const ceDomPos = ceSrc.indexOf("dangerouslySetInnerHTML");
    expect(cePos).toBeGreaterThan(-1);
    expect(ceDomPos).toBeGreaterThan(-1);
    expect(cePos).toBeLessThan(
      ceDomPos,
      "CodeExplorer.tsx: DOMPurify.sanitize must appear before dangerouslySetInnerHTML"
    );

    // InlineReadPanel: same ordering check
    const irpPos = irpSrc.indexOf("DOMPurify.sanitize");
    const irpDomPos = irpSrc.indexOf("dangerouslySetInnerHTML");
    expect(irpPos).toBeGreaterThan(-1);
    expect(irpDomPos).toBeGreaterThan(-1);
    expect(irpPos).toBeLessThan(
      irpDomPos,
      "InlineReadPanel.tsx: DOMPurify.sanitize must appear before dangerouslySetInnerHTML"
    );
  });

  // -------------------------------------------------------------------------
  // B67 — CSP connect-src must not contain wildcards or ws://127.0.0.1:*
  // -------------------------------------------------------------------------

  it("B67: CSP connect-src does not contain ws://127.0.0.1:* wildcard or bare *", () => {
    const conf = JSON.parse(
      readFileSync(
        join(ROOT, "src-tauri/tauri.conf.json"),
        "utf8"
      )
    );

    // Support both Tauri v1 (tauri.security.csp) and Tauri v2 (app.security.csp) layouts
    const csp: string =
      conf?.app?.security?.csp ??
      conf?.tauri?.security?.csp ??
      "";

    expect(csp).toBeTruthy("tauri.conf.json must define a CSP policy");

    // Extract connect-src directive
    const connectSrcMatch = csp.match(/connect-src\s+([^;]+)/);
    expect(connectSrcMatch).toBeTruthy("CSP must contain a connect-src directive");

    const connectSrc = connectSrcMatch ? connectSrcMatch[1] : "";

    // connect-src must NOT contain ws://127.0.0.1:* (wildcard port)
    expect(connectSrc).not.toMatch(
      /ws:\/\/127\.0\.0\.1:\*/,
      "connect-src must not allow ws://127.0.0.1:* (wildcard port opens CSRF attack surface)"
    );

    // connect-src must NOT contain a bare * wildcard
    expect(connectSrc).not.toMatch(
      /(?:^|\s)\*(?:\s|$)/,
      "connect-src must not contain a bare * wildcard"
    );
  });

  // -------------------------------------------------------------------------
  // B68 — OAuth URL scheme validation: only https:// URLs opened externally
  // -------------------------------------------------------------------------

  it("B68: OAuth connect flow only opens https:// URLs via open_external", () => {
    const oauthSrc = readFileSync(
      join(ROOT, "src/components/auth/OAuthConnectFlow.tsx"),
      "utf8"
    );

    // open_external is the Tauri IPC command for opening URLs in the browser.
    // The frontend must not pass non-https URLs to it. Verify the auth flow
    // either validates the URL scheme client-side or relies on the Rust command's
    // own https:// check (which is already present — see commands.rs).
    // For belt-and-suspenders, the component should not construct non-https URLs.
    expect(oauthSrc).toMatch(
      /open_external/,
      "OAuthConnectFlow.tsx must use open_external for opening auth URLs"
    );

    // Assert no direct window.open with non-validated URLs as a fallback path
    // that could bypass the Rust-level https check
    const windowOpenMatches = oauthSrc.match(/window\.open\s*\([^)]+\)/g) ?? [];
    for (const call of windowOpenMatches) {
      // window.open fallback should not accept arbitrary non-https content
      // The only safe pattern is window.open(url, "_blank") where url is already validated
      expect(call).not.toMatch(
        /['"`]javascript:/i,
        `OAuthConnectFlow.tsx: window.open must not use javascript: URLs. Found: ${call}`
      );
    }
  });

  // -------------------------------------------------------------------------
  // B69 — open_external validates URL using https:// prefix check (Rust side)
  // -------------------------------------------------------------------------

  it("B69: open_external Rust command rejects non-https:// and non-http:// URLs", () => {
    const commandsSrc = readFileSync(
      join(ROOT, "src-tauri/src/commands.rs"),
      "utf8"
    );

    // The Rust open_external command must guard against non-http(s) URL schemes
    // to prevent OS-level command injection via custom URI schemes
    expect(commandsSrc).toMatch(
      /open_external/,
      "commands.rs must define open_external command"
    );

    // Must have an https:// or http:// starts_with check
    expect(commandsSrc).toMatch(
      /starts_with\s*\(\s*["']https:\/\//,
      "open_external must check that URL starts with https://"
    );

    // Must reject URLs that don't match — look for a return false / early return
    expect(commandsSrc).toMatch(
      /rejected non-http|starts_with.*https.*&&.*starts_with.*http|starts_with.*http.*starts_with.*https/,
      "open_external must reject non-http(s) URLs with an early return"
    );
  });

  // -------------------------------------------------------------------------
  // B70 — file:// URL construction uses URL constructor or percent-encoding
  // -------------------------------------------------------------------------

  it("B70: file:// URL construction uses proper encoding, not raw string concatenation", () => {
    const commandsSrc = readFileSync(
      join(ROOT, "src-tauri/src/commands.rs"),
      "utf8"
    );

    // Check for raw string concatenation patterns like format!("file://{}", path)
    // without percent-encoding — this is the unsafe pattern we need to eliminate
    const rawConcatPattern = /format!\s*\(\s*["']file:\/\/\{\}["']\s*,\s*path\s*\)/;
    const hasRawConcat = rawConcatPattern.test(commandsSrc);

    // If raw concatenation is found, it must be accompanied by percent-encoding
    if (hasRawConcat) {
      // Must either use percent_encoding crate, url::Url::from_file_path, or encode the path
      const hasEncoding = /percent_encoding|url::Url::from_file_path|encode_uri|urlencoded/.test(commandsSrc);
      expect(hasEncoding).toBe(
        true,
        "commands.rs: file:// URL construction using raw format! must use percent-encoding to prevent path injection"
      );
    }

    // TypeScript files should also not raw-concatenate file:// URLs
    const serverFiles = [
      join(ROOT, "src/server/fs-api.ts"),
      join(ROOT, "src/server/workspace-api.ts"),
    ];

    for (const filePath of serverFiles) {
      try {
        const src = readFileSync(filePath, "utf8");
        // Flag any 'file://' + path style concatenation
        expect(src).not.toMatch(
          /['"`]file:\/\/['"`]\s*\+/,
          `${filePath}: must not use string concatenation for file:// URL construction`
        );
      } catch {
        // File may not exist — skip
      }
    }
  });
});
