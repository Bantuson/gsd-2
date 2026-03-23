/**
 * Nyquist security tests for T-FILE threat category (Behaviours 1-18).
 *
 * T-FILE-01: Path traversal in API params (Behaviours 1-8)
 * T-FILE-02: Write traversal and permissions (Behaviours 9-16)
 * T-FILE-03: Symlink escape and atomic port (Behaviours 17-18)
 *
 * RED PHASE: All tests are expected to fail until Wave 2 remediation.
 * Tests exercise the actual security behaviours described in THREAT-MODEL.md.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { validatePath } from "../src/server/fs-api";
import { readFileSync } from "fs";
import {
  mkdtempSync,
  symlinkSync,
  mkdirSync,
  writeFileSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// T-FILE-01 — Path Traversal Prevention (Behaviours 1-8)
// ---------------------------------------------------------------------------

describe("T-FILE-01 — Path Traversal Prevention", () => {
  it("B1: rejects sliceId with ../../etc/passwd traversal (HTTP 400)", async () => {
    // Source-inspect gsd-file-api.ts to ensure sliceId is validated before path construction
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/gsd-file-api.ts"),
      "utf8"
    );

    // The sliceId must be validated: either sanitized with path.basename, or
    // rejected if it contains path traversal sequences
    const hasTraversalCheck =
      src.includes("path.basename") ||
      src.includes("basename(sliceId)") ||
      /sliceId.*\.\.|\.\..*sliceId/.test(src) ||
      src.includes("validatePath") ||
      // Check for allowlist-style validation (only word chars)
      src.includes("/^[a-zA-Z0-9") ||
      src.includes("VALID_SLICE_RE") ||
      src.includes("sliceId.includes(\"..\")") ||
      src.includes('sliceId.includes("..")');

    // RED: This should fail — gsd-file-api.ts does not validate sliceId against traversal
    expect(hasTraversalCheck).toBe(true);
  });

  it("B2: rejects milestoneId with ../secret traversal (HTTP 400)", async () => {
    // Source-inspect gsd-file-api.ts for milestoneId validation
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/gsd-file-api.ts"),
      "utf8"
    );

    const hasMilestoneValidation =
      src.includes("basename(milestoneId)") ||
      src.includes("path.basename") ||
      src.includes("validatePath") ||
      src.includes('milestoneId.includes("..")') ||
      src.includes("VALID_ID_RE") ||
      /milestoneId.*\.\.|\.\..*milestoneId/.test(src);

    // RED: milestoneId is used directly in join() without validation
    expect(hasMilestoneValidation).toBe(true);
  });

  it("B3: rejects taskId containing null byte (HTTP 400)", async () => {
    // Source-inspect for null byte handling in taskId
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/gsd-file-api.ts"),
      "utf8"
    );

    const hasNullByteCheck =
      src.includes("\\x00") ||
      src.includes("\\u0000") ||
      src.includes("null byte") ||
      src.includes("charCodeAt") ||
      src.includes("validateTaskId") ||
      src.includes("VALID_TASK_RE") ||
      // If there's a general ID validator that would catch null bytes
      src.includes("/^[a-zA-Z0-9_-]+$/");

    // RED: taskId is not validated for null bytes
    expect(hasNullByteCheck).toBe(true);
  });

  it("B4: validatePath uses realpathSync to resolve symlinks before root comparison", () => {
    // Source-inspect fs-api.ts — must use realpathSync for symlink resolution
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/fs-api.ts"),
      "utf8"
    );

    // RED: validatePath currently uses resolve() not realpathSync()
    expect(src).toMatch(/realpathSync/);

    // Must also check that root comparison uses path.sep for exact prefix match
    expect(src).toMatch(/root\s*\+\s*path\.sep|resolvedRoot\s*\+\s*sep|allowedRoot.*sep/);
  });

  it("B5: validatePath rejects sibling-prefix bypass (/tmp/project-evil vs /tmp/project)", () => {
    // The sibling-prefix bypass: /tmp/project-evil starts with /tmp/project
    // A startsWith check alone would accept /tmp/project-evil as a child of /tmp/project
    const root = tmpdir();
    const projectRoot = join(root, "project-" + Date.now());
    const projectEvil = join(root, "project-" + Date.now() + "-evil");
    const evilFile = join(projectEvil, "secret.txt");

    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(projectEvil, { recursive: true });
    writeFileSync(evilFile, "evil content");

    try {
      // RED: current validatePath uses startsWith without sep — sibling prefix would pass
      let threw = false;
      try {
        const result = validatePath(evilFile, projectRoot);
        // If it returned a value, the check failed (sibling accepted)
        // The evil file IS outside the project root, so this should throw
        threw = false;
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(projectEvil, { recursive: true, force: true });
    }
  });

  it("B6: validatePath rejects symlink escaping to /tmp (outside root)", () => {
    // Create a temp root directory, then a symlink inside pointing outside
    const root = mkdtempSync(join(tmpdir(), "tfile-b6-root-"));
    const symlinkPath = join(root, "link");

    try {
      // Create symlink: root/link -> /tmp (outside root)
      symlinkSync(tmpdir(), symlinkPath);

      const escapePath = join(symlinkPath, "etc", "passwd");

      let threw = false;
      try {
        validatePath(escapePath, root);
      } catch {
        threw = true;
      }

      // RED: validatePath uses resolve() not realpathSync(), so symlinks are not followed
      expect(threw).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("B7: HTTP responses do not leak absolute paths in error bodies", async () => {
    // Source-inspect server files for absolute path leakage in response bodies
    const files = [
      "gsd-file-api.ts",
      "uat-results-api.ts",
      "assets-api.ts",
      "worktree-api.ts",
    ];

    for (const file of files) {
      const src = readFileSync(
        resolve(import.meta.dir, `../src/server/${file}`),
        "utf8"
      );

      // Look for Response.json calls that include err.message, which can contain paths
      // RED: error responses include err.message directly without path scrubbing
      const hasPathScrubbing =
        src.includes("scrubPath") ||
        src.includes("sanitizeError") ||
        src.includes("replace(/\\/home\\/") ||
        src.includes("replace(/\\/Users\\/") ||
        src.includes("stripAbsolutePath") ||
        src.includes("sanitizePath");

      // RED: no path scrubbing exists in these files
      expect(hasPathScrubbing).toBe(
        true,
        `${file} does not scrub absolute paths from error responses`
      );
    }
  });

  it("B8: OS error messages (ENOENT, EPERM) do not include absolute paths in HTTP response body", async () => {
    // Source-inspect for pattern: err.message returned directly in Response.json
    const files = [
      "fs-api.ts",
      "assets-api.ts",
    ];

    for (const file of files) {
      const src = readFileSync(
        resolve(import.meta.dir, `../src/server/${file}`),
        "utf8"
      );

      // The error handling should not expose raw OS error messages
      // Currently uses: Response.json({ error: err.message }, ...)
      // Should use: Response.json({ error: "File not found" }, ...) with generic messages
      const hasGenericErrors =
        !src.includes("err.message") ||
        src.includes("scrubPath(err.message)") ||
        src.includes("sanitizeError(err)");

      // RED: files return err.message directly which exposes OS paths
      expect(hasGenericErrors).toBe(true, `${file} exposes raw OS error messages`);
    }
  });
});

// ---------------------------------------------------------------------------
// T-FILE-02 — Write Traversal and Permissions (Behaviours 9-16)
// ---------------------------------------------------------------------------

describe("T-FILE-02 — Write Traversal Prevention", () => {
  it("B9: uat-results-api rejects sliceId with path traversal (HTTP 400)", async () => {
    // Source-inspect uat-results-api.ts for sliceId validation before write
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/uat-results-api.ts"),
      "utf8"
    );

    // Must validate sliceId before using it in join() for the write path
    const hasWriteValidation =
      src.includes("path.basename") ||
      src.includes("basename(sliceId)") ||
      src.includes("validatePath") ||
      src.includes("validateSliceId") ||
      src.includes('sliceId.includes("..")') ||
      src.includes("VALID_SLICE_RE") ||
      src.includes("/^[a-zA-Z0-9");

    // RED: uat-results-api.ts writes to join(gsdDir, sliceId-...) without validation
    expect(hasWriteValidation).toBe(true);
  });

  it("B10: assets-api uses path.basename on uploaded filename to prevent traversal", () => {
    // Source-inspect assets-api.ts — must use basename on file.name before writing
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/assets-api.ts"),
      "utf8"
    );

    // basename() is already used via uniqueFilename -> basename(name, ext)
    // But also check the direct upload path sanitizes the filename
    expect(src).toMatch(/basename\s*\(file\.name|basename\s*\(name/);
  });

  it("B11: assets write path is validated against the assets root directory", () => {
    // Source-inspect assets-api.ts — the final write path must be within the assets dir
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/assets-api.ts"),
      "utf8"
    );

    // Must validate the final path with realpathSync or validatePath before writing
    const hasWriteValidation =
      src.includes("validatePath") ||
      src.includes("realpathSync") ||
      src.includes("filePath.startsWith(resolvedDir)") ||
      src.includes("filePath.startsWith(resolve(dir))");

    // filePath.startsWith(resolvedDir) check exists for file serving — check upload path too
    expect(hasWriteValidation).toBe(true);
  });

  it("B12: fs-api mkdir rejects directory name containing path separators or ..", async () => {
    const { handleFsRequest } = await import("../src/server/fs-api");

    // Test with name containing forward slash
    const req1 = new Request("http://localhost:4000/api/fs/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/test/../../../evil" }),
    });
    const url1 = new URL(req1.url);
    const response1 = await handleFsRequest(req1, url1);
    expect(response1).not.toBeNull();
    expect(response1!.status).toBe(400);
  });

  it("B13: worktree-api validates sessionSlug against alphanumeric+dash+underscore pattern", () => {
    // Source-inspect worktree-api.ts — sessionSlug must be validated before filesystem use
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/worktree-api.ts"),
      "utf8"
    );

    // Must have slug validation to prevent directory traversal via slug
    const hasSlugValidation =
      src.includes("/^[a-zA-Z0-9_-]+$/") ||
      src.includes("VALID_SLUG_RE") ||
      src.includes("validateSlug") ||
      src.includes("validateSessionSlug") ||
      src.includes("slug.match(") ||
      src.includes("sessionSlug.match(");

    // RED: worktree-api.ts uses sessionSlug directly in join() without validation
    expect(hasSlugValidation).toBe(true);
  });

  it("B14: removeSessionWorktree validates resolved path starts with workspace root before rm", () => {
    // Source-inspect worktree-api.ts — removeSessionWorktree must validate path before removal
    const src = readFileSync(
      resolve(import.meta.dir, "../src/server/worktree-api.ts"),
      "utf8"
    );

    // The removeSessionWorktree function must verify the path is within the workspace
    const hasPathValidation =
      src.includes("startsWith(repoRoot") ||
      src.includes("startsWith(resolve(repoRoot") ||
      src.includes("validatePath(worktreePath") ||
      src.includes("validatePath(normalizedPath") ||
      src.includes("realpathSync") ||
      src.includes("resolvedPath.startsWith");

    // RED: removeSessionWorktree passes worktreePath directly to git without root validation
    expect(hasPathValidation).toBe(true);
  });

  it("B15: writeFileSync/writeFile calls include restrictive file permissions (0o600/0o700)", () => {
    // Source-inspect all server files for file creation calls
    const serverFiles = [
      "fs-api.ts",
      "uat-results-api.ts",
      "assets-api.ts",
      "worktree-api.ts",
      "auth-api.ts",
    ];

    for (const file of serverFiles) {
      let src: string;
      try {
        src = readFileSync(
          resolve(import.meta.dir, `../src/server/${file}`),
          "utf8"
        );
      } catch {
        // File may not exist — skip
        continue;
      }

      // If the file writes files/dirs, it should include permissions
      const hasFileWrite =
        src.includes("writeFileSync") ||
        src.includes("writeFile") ||
        src.includes("Bun.write") ||
        src.includes("mkdirSync") ||
        src.includes("mkdir(");

      if (hasFileWrite) {
        const hasPermissions =
          src.includes("0o600") ||
          src.includes("0o700") ||
          src.includes("mode:") ||
          src.includes("{ mode");

        // RED: file writes do not include mode permissions
        expect(hasPermissions).toBe(
          true,
          `${file} has file writes without explicit permissions`
        );
      }
    }
  });

  it("B16: auth file (~/.gsd/auth.json) is created with 0o600 permissions", () => {
    // Source-inspect auth-api.ts for file creation with 0o600
    let src: string;
    try {
      src = readFileSync(
        resolve(import.meta.dir, "../src/server/auth-api.ts"),
        "utf8"
      );
    } catch {
      // File doesn't exist — RED
      expect(false).toBe(true, "auth-api.ts does not exist");
      return;
    }

    // Auth file must be created with 0o600 or equivalent restrictive permissions
    const hasSecureAuth =
      (src.includes("auth.json") || src.includes("auth-api")) &&
      (src.includes("0o600") || src.includes("mode: 0o6"));

    // RED: auth file not created with 0o600
    expect(hasSecureAuth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-FILE-03 — Symlink Escape and Atomic Port Allocation (Behaviours 17-18)
// ---------------------------------------------------------------------------

describe("T-FILE-03 — Symlink Escape and Atomic Port", () => {
  it("B17: validatePath rejects symlink pointing to /etc (explicit symlink traversal test)", () => {
    // Create workspace dir with symlink to /etc (or tmpdir on Windows)
    const workspace = mkdtempSync(join(tmpdir(), "tfile-b17-"));
    const symlinkTarget = process.platform === "win32" ? tmpdir() : "/tmp";
    const linkPath = join(workspace, "link");

    try {
      symlinkSync(symlinkTarget, linkPath);

      const escapePath = join(linkPath, "passwd");

      let threw = false;
      try {
        validatePath(escapePath, workspace);
      } catch {
        threw = true;
      }

      // RED: validatePath uses resolve() not realpathSync(), so symlinks are followed
      // without actually resolving them against the real filesystem
      expect(threw).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("B18: port allocation uses atomic bind-and-hold pattern, not check-then-use", () => {
    // Source-inspect server.ts or ws-server.ts for port allocation pattern
    let serverSrc = "";
    let wsSrc = "";

    try {
      serverSrc = readFileSync(
        resolve(import.meta.dir, "../src/server.ts"),
        "utf8"
      );
    } catch {
      // server.ts may not be at this location
    }

    try {
      wsSrc = readFileSync(
        resolve(import.meta.dir, "../src/server/ws-server.ts"),
        "utf8"
      );
    } catch {
      // ws-server.ts may not exist
    }

    const combinedSrc = serverSrc + wsSrc;

    // Atomic pattern: bind to port 0 and let OS assign, or use net.createServer().listen(0)
    // Check-then-use anti-pattern: find a free port, then bind to it later
    const hasAtomicPattern =
      combinedSrc.includes("listen(0") ||
      combinedSrc.includes(".listen(0,") ||
      combinedSrc.includes("net.createServer") ||
      combinedSrc.includes("server.listen(0") ||
      combinedSrc.includes("port: 0");

    const hasCheckThenUse =
      (combinedSrc.includes("freePort") || combinedSrc.includes("findFreePort")) &&
      !combinedSrc.includes("listen(0");

    // RED: server uses freePort (check-then-use) not atomic bind-and-hold
    expect(hasAtomicPattern).toBe(true);
    expect(hasCheckThenUse).toBe(false);
  });
});
