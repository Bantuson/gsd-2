/**
 * Nyquist security tests for T-EXEC threat category (Behaviours 19-32).
 *
 * T-EXEC-01: Process Spawning Safety (Behaviours 19-24)
 * T-EXEC-02: XSS-to-IPC Chain Prevention (Behaviours 25-32)
 *
 * RED PHASE: All tests are expected to fail until Wave 2 remediation.
 * Tests exercise security behaviours described in THREAT-MODEL.md.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// T-EXEC-01 — Process Spawning Safety (Behaviours 19-24)
// ---------------------------------------------------------------------------

describe("T-EXEC-01 — Process Spawning Safety", () => {
  it("B19: Bun spawned with absolute path, not bare \"bun\" or \"bun.exe\"", () => {
    const src = readFileSync(
      resolve(import.meta.dir, "../src-tauri/src/bun_manager.rs"),
      "utf8"
    );

    // Must NOT use bare Command::new("bun") or Command::new("bun.exe")
    // Must use an absolute path or a path resolution
    const hasBareString =
      src.includes('Command::new("bun")') ||
      src.includes('Command::new("bun.exe")');

    // RED: bun_manager.rs uses Command::new("bun") / Command::new("bun.exe") bare strings
    expect(hasBareString).toBe(false);

    // Must contain some form of path resolution — not just a bare binary name
    const hasPathResolution =
      src.includes("which_bun") ||
      src.includes("bun_path") ||
      src.includes("resolve_bun") ||
      src.includes("absolute") ||
      src.includes("PathBuf") ||
      src.includes(".join(\"bun\")") ||
      src.includes("home_dir") ||
      src.includes("canonicalize");

    // RED: no absolute path resolution exists for the bun binary
    expect(hasPathResolution).toBe(true);
  });

  it("B20: Bun spawn env does not inherit dangerous env vars (NODE_OPTIONS, LD_PRELOAD, etc.)", () => {
    const src = readFileSync(
      resolve(import.meta.dir, "../src-tauri/src/bun_manager.rs"),
      "utf8"
    );

    // Must NOT pass dangerous env vars to the child process
    // If env is inherited (no .env_clear()), then NODE_OPTIONS etc. can affect Bun
    const exposesDangerousVars =
      src.includes("NODE_OPTIONS") ||
      src.includes("LD_PRELOAD") ||
      src.includes("DYLD_INSERT_LIBRARIES") ||
      src.includes("HTTP_PROXY") ||
      src.includes("HTTPS_PROXY");

    // RED: bun_manager.rs may inherit these env vars if env_clear() is absent
    expect(exposesDangerousVars).toBe(false);

    // Must also not use env_clear() absence (inheriting all parent env is dangerous)
    // Verify env is either cleared or explicitly allowlisted
    const hasEnvControl =
      src.includes(".env_clear()") ||
      src.includes(".envs(") ||
      src.includes("env_map") ||
      src.includes("allowed_env");

    // RED: no explicit env control — inherits all parent env
    expect(hasEnvControl).toBe(true);
  });

  it("B21: Bun spawn uses env allowlist or env_clear(), not full env inheritance", () => {
    const src = readFileSync(
      resolve(import.meta.dir, "../src-tauri/src/bun_manager.rs"),
      "utf8"
    );

    // Must use env_clear() or explicit allowlist, NOT inherit entire environment
    const hasEnvClear = src.includes(".env_clear()");
    const hasExplicitEnvs =
      src.includes(".envs(") ||
      src.includes("env_map") ||
      src.includes("HashMap") ||
      src.includes(".env(\"PATH\"");

    // Must have EITHER env_clear OR explicit env allowlist
    const hasEnvIsolation = hasEnvClear || hasExplicitEnvs;

    // RED: Command inherits full parent env (no .env_clear() and no explicit env map)
    expect(hasEnvIsolation).toBe(true);
  });

  it("B22: kill-port.ts uses execFile/spawnSync with array args, not execSync with template literals", () => {
    const killSrc = readFileSync(
      resolve(import.meta.dir, "../src/server/kill-port.ts"),
      "utf8"
    );

    // Must NOT use execSync with template literals containing port (command injection risk)
    // The dangerous pattern: execSync(`netstat -ano | findstr ":${port}...``)
    const hasTemplateLiteralExec =
      /execSync\s*\(\s*`[^`]*\$\{port\}/.test(killSrc) ||
      /execSync\s*\(\s*`[^`]*\$\{pid\}/.test(killSrc);

    // RED: kill-port.ts uses execSync with template literal containing port variable
    expect(hasTemplateLiteralExec).toBe(false);

    // Should use execFile, spawnSync with array args, or process.kill()
    const hasSafeExec =
      killSrc.includes("execFile") ||
      killSrc.includes("spawnSync") ||
      (killSrc.includes("process.kill") && !killSrc.includes("execSync(`"));

    // RED: kill-port.ts still uses execSync with interpolated values
    expect(hasSafeExec).toBe(true);
  });

  it("B23: dep_check.rs verifies binary against known installation directory, not just which/where", () => {
    const depSrc = readFileSync(
      resolve(import.meta.dir, "../src-tauri/src/dep_check.rs"),
      "utf8"
    );

    // check_dependency currently uses `which`/`where` + trust
    // Must verify the binary path against known trusted installation directories
    const hasPathVerification =
      depSrc.includes("starts_with") ||
      depSrc.includes("home_dir") ||
      depSrc.includes("known_path") ||
      depSrc.includes("trusted_path") ||
      depSrc.includes("verify_path") ||
      depSrc.includes("canonicalize") ||
      depSrc.includes(".bun/bin") ||
      depSrc.includes("installation_dir");

    // RED: dep_check.rs only uses `which`/`where` without path verification
    expect(hasPathVerification).toBe(true);
  });

  it("B24: git-api.ts uses execFile with array args, not exec()/execSync() with template literals", () => {
    const gitSrc = readFileSync(
      resolve(import.meta.dir, "../src/server/git-api.ts"),
      "utf8"
    );

    // Must NOT use exec() or execSync() with template literals containing git commands
    const hasUnsafeExec =
      /execSync\s*\(\s*`git/.test(gitSrc) ||
      /exec\s*\(\s*`git/.test(gitSrc) ||
      /execAsync\s*\(\s*`git/.test(gitSrc);

    // RED: git-api.ts uses execAsync("git status --porcelain -u") without array args
    // execAsync("git status --porcelain -u") is exec() under the hood — string-based
    expect(hasUnsafeExec).toBe(false);

    // All git invocations should use spawn with array args
    const hasSafeExec =
      gitSrc.includes("nodeSpawn") ||
      gitSrc.includes("execFile") ||
      gitSrc.includes("spawnSync");

    expect(hasSafeExec).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-EXEC-02 — XSS-to-IPC Chain Prevention (Behaviours 25-32)
// ---------------------------------------------------------------------------

describe("T-EXEC-02 — XSS to IPC Chain Prevention", () => {
  it("B25: CodeExplorer.tsx and InlineReadPanel.tsx sanitize markdown with DOMPurify before dangerouslySetInnerHTML", () => {
    const ceSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/code-explorer/CodeExplorer.tsx"),
      "utf8"
    );

    const irpSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/milestone/InlineReadPanel.tsx"),
      "utf8"
    );

    // Both files use dangerouslySetInnerHTML — must sanitize with DOMPurify first
    const ceHasDangerousHtml = ceSrc.includes("dangerouslySetInnerHTML");
    const irpHasDangerousHtml = irpSrc.includes("dangerouslySetInnerHTML");

    if (ceHasDangerousHtml) {
      // RED: CodeExplorer passes marked.parse() output directly without DOMPurify
      expect(ceSrc).toContain("DOMPurify.sanitize");
    }

    if (irpHasDangerousHtml) {
      // RED: InlineReadPanel passes marked() output directly without DOMPurify
      expect(irpSrc).toContain("DOMPurify.sanitize");
    }

    // At least one of them uses dangerouslySetInnerHTML (test is meaningful)
    expect(ceHasDangerousHtml || irpHasDangerousHtml).toBe(true);
  });

  it("B26: DOMPurify sanitizes marked.parse() output before HTML injection in CodeExplorer", () => {
    const ceSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/code-explorer/CodeExplorer.tsx"),
      "utf8"
    );

    // DOMPurify must be called on the marked.parse() output
    // Pattern: DOMPurify.sanitize(marked.parse(...)) or sanitize then assign
    const hasSanitizedMarked =
      ceSrc.includes("DOMPurify.sanitize") &&
      (ceSrc.includes("marked.parse") || ceSrc.includes("marked("));

    // RED: CodeExplorer uses marked.parse() directly in dangerouslySetInnerHTML
    expect(hasSanitizedMarked).toBe(true);
  });

  it("B27: DOMPurify default config strips event handler attributes (onerror, onload, etc.)", () => {
    const ceSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/code-explorer/CodeExplorer.tsx"),
      "utf8"
    );

    const irpSrc = readFileSync(
      resolve(import.meta.dir, "../src/components/milestone/InlineReadPanel.tsx"),
      "utf8"
    );

    // DOMPurify by default strips event handlers. Asserting DOMPurify.sanitize() is called
    // is sufficient to ensure onerror/onload handlers are stripped.
    // If DOMPurify config explicitly ALLOWS_ATTR or FORCE_BODY, check it doesn't allow events.
    const ceHasDOMPurify = ceSrc.includes("DOMPurify.sanitize");
    const irpHasDOMPurify = irpSrc.includes("DOMPurify.sanitize");

    // Must NOT explicitly allow dangerous attributes
    const ceAllowsEvents =
      ceSrc.includes("ALLOWED_ATTR") &&
      (ceSrc.includes("\"onerror\"") || ceSrc.includes("\"onload\""));

    const irpAllowsEvents =
      irpSrc.includes("ALLOWED_ATTR") &&
      (irpSrc.includes("\"onerror\"") || irpSrc.includes("\"onload\""));

    // RED: Neither file uses DOMPurify
    expect(ceHasDOMPurify || irpHasDOMPurify).toBe(true);
    expect(ceAllowsEvents).toBe(false);
    expect(irpAllowsEvents).toBe(false);
  });

  it("B28: tauri.conf.json CSP does not contain 'unsafe-inline' in script-src", () => {
    const tauriConf = readFileSync(
      resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
      "utf8"
    );

    // Parse to get the CSP string
    const conf = JSON.parse(tauriConf);
    const csp: string = conf?.app?.security?.csp ?? "";

    // Extract script-src directive
    const scriptSrcMatch = csp.match(/script-src([^;]*)/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1] : "";

    // RED: tauri.conf.json has 'unsafe-inline' in script-src
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("B29: tauri.conf.json CSP script-src uses nonces or hashes (not 'unsafe-inline')", () => {
    const tauriConf = readFileSync(
      resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
      "utf8"
    );

    const conf = JSON.parse(tauriConf);
    const csp: string = conf?.app?.security?.csp ?? "";

    // script-src must use 'nonce-...' or 'sha256-...' / 'sha384-...' / 'sha512-...'
    const scriptSrcMatch = csp.match(/script-src([^;]*)/);
    const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1] : "";

    const hasNonceOrHash =
      scriptSrc.includes("'nonce-") ||
      scriptSrc.includes("'sha256-") ||
      scriptSrc.includes("'sha384-") ||
      scriptSrc.includes("'sha512-");

    // RED: script-src uses 'unsafe-inline' instead of nonces/hashes
    expect(hasNonceOrHash).toBe(true);
  });

  it("B30: capabilities directory has more than one capability file with identifier and permissions", () => {
    const capabilitiesDir = resolve(
      import.meta.dir,
      "../src-tauri/capabilities"
    );

    const files = readdirSync(capabilitiesDir).filter((f) => f.endsWith(".json"));

    // RED: only main.json exists — no secondary window capability files
    expect(files.length).toBeGreaterThan(1);

    // Each file must have identifier and permissions
    for (const file of files) {
      const cap = JSON.parse(
        readFileSync(resolve(capabilitiesDir, file), "utf8")
      );
      expect(cap).toHaveProperty("identifier");
      expect(cap).toHaveProperty("permissions");
      expect(Array.isArray(cap.permissions)).toBe(true);
    }
  });

  it("B31: non-main capability files do not include dangerous IPC commands", () => {
    const capabilitiesDir = resolve(
      import.meta.dir,
      "../src-tauri/capabilities"
    );

    const files = readdirSync(capabilitiesDir).filter(
      (f) => f.endsWith(".json") && f !== "main.json"
    );

    // RED: no non-main capability files exist — this test cannot pass in RED phase
    // This will fail because there are no secondary capability files
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const cap = JSON.parse(
        readFileSync(resolve(capabilitiesDir, file), "utf8")
      );
      const permissionsStr = JSON.stringify(cap.permissions);

      // Dangerous commands that should NOT appear in non-main capability files
      expect(permissionsStr).not.toContain("set_credential");
      expect(permissionsStr).not.toContain("delete_credential");
      expect(permissionsStr).not.toContain("restart_bun");
    }
  });

  it("B32: all <iframe> elements in TSX components have a sandbox attribute", () => {
    // Scan all .tsx files for <iframe tags
    const componentsDir = resolve(import.meta.dir, "../src/components");

    function findTsxFiles(dir: string): string[] {
      const files: string[] = [];
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...findTsxFiles(fullPath));
          } else if (entry.name.endsWith(".tsx")) {
            files.push(fullPath);
          }
        }
      } catch {
        // Directory may not exist
      }
      return files;
    }

    const tsxFiles = findTsxFiles(componentsDir);

    let iframeCount = 0;
    let sandboxedCount = 0;
    const unsandboxedFiles: string[] = [];

    for (const file of tsxFiles) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("<iframe")) continue;

      // Find all iframe elements and check for sandbox attribute
      const iframeMatches = src.match(/<iframe[\s\S]*?>/g) ?? [];

      for (const iframeTag of iframeMatches) {
        iframeCount++;
        if (iframeTag.includes("sandbox")) {
          sandboxedCount++;
        } else {
          unsandboxedFiles.push(file.split("/").pop() ?? file);
        }
      }
    }

    // Ensure we found some iframes (test is meaningful)
    expect(iframeCount).toBeGreaterThan(0);

    // RED: iframes in DeviceFrame.tsx and PreviewPanel.tsx lack sandbox attributes
    expect(sandboxedCount).toBe(
      iframeCount,
      `Unsandboxed iframes found in: ${unsandboxedFiles.join(", ")}`
    );
  });
});
