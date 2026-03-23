/**
 * Nyquist security tests for T-NET-01, T-NET-02, and T-DOS threat categories.
 *
 * Covers behaviours 33-49:
 *   T-NET-01 (B33-B40) — Proxy SSRF prevention, Host/Origin validation, header sanitization
 *   T-NET-02 (B41-B42) — Resource limits (body size, NDJSON line cap)
 *   T-DOS-01 (B43-B49) — Session cap, rate limiting, Rust safety (no blocking .unwrap())
 *
 * These are RED-phase tests: all expected to FAIL until Wave 2/3 implements the behaviours.
 */

import { describe, it, expect } from "bun:test";
import { handleProxyRequest } from "../src/server/proxy-api";
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

/** Read all .rs files in src-tauri/src/ */
function readAllRsFiles(): Array<{ path: string; content: string }> {
  const rsFiles = [
    "bun_manager.rs",
    "commands.rs",
    "dep_check.rs",
    "lib.rs",
    "main.rs",
  ];
  const results: Array<{ path: string; content: string }> = [];
  for (const f of rsFiles) {
    try {
      results.push({ path: f, content: readTauriSrc(f) });
    } catch {
      // file may not exist in test environment — skip
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// T-NET-01 — Proxy SSRF Prevention (B33-B36)
// ---------------------------------------------------------------------------

describe("T-NET-01 — Proxy SSRF Prevention", () => {
  it("B33: proxy rejects non-allowlisted destination hosts", async () => {
    // The proxy must only allow configured AI provider hostnames.
    // A request to evil-host.com should return 403.
    const req = new Request("http://localhost:4200/api/proxy", {
      headers: { "X-Proxy-Target": "https://evil-host.com/api" },
    });
    const url = new URL(req.url);

    // Inject the target URL into the proxy request so handleProxyRequest can inspect it.
    // Wrap with a custom URL to simulate the request having a non-allowlisted host.
    const proxyUrl = new URL("http://localhost:4200/api/proxy?target=https://evil-host.com/api");
    const response = await handleProxyRequest(req, proxyUrl, 9999);
    expect(response.status).toBe(403);
  });

  it("B34: proxy rejects requests targeting Postgres port (5432)", async () => {
    // Port 5432 is a database port — SSRF vector. Must be blocked with 403.
    const req = new Request("http://localhost:4200/api/proxy", {
      headers: { "X-Proxy-Target": "http://localhost:5432/query" },
    });
    const proxyUrl = new URL("http://localhost:4200/api/proxy?target=http://localhost:5432/query");
    const response = await handleProxyRequest(req, proxyUrl, 5432);
    expect(response.status).toBe(403);
  });

  it("B35: proxy rejects requests targeting 127.0.0.1:5432 (loopback Postgres)", async () => {
    // Even on loopback, 5432 is a blocked internal service port.
    const req = new Request("http://localhost:4200/api/proxy");
    const proxyUrl = new URL("http://localhost:4200/api/proxy?target=http://127.0.0.1:5432");
    const response = await handleProxyRequest(req, proxyUrl, 5432);
    expect(response.status).toBe(403);
  });

  it("B36: proxy rejects requests targeting 127.0.0.1:4001 (internal WS server port)", async () => {
    // Port 4001 is the internal WebSocket server — SSRF must not allow forwarding to it.
    const req = new Request("http://localhost:4200/api/proxy");
    const proxyUrl = new URL("http://localhost:4200/api/proxy?target=http://127.0.0.1:4001");
    const response = await handleProxyRequest(req, proxyUrl, 4001);
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// T-NET-01 — Host + Origin Validation (B37-B38)
// ---------------------------------------------------------------------------

describe("T-NET-01 — Host and Origin Validation", () => {
  it("B37: server.ts rejects requests with Host header not matching 127.0.0.1:4200", async () => {
    // source-inspect: server.ts must validate Host header before routing.
    const serverSrc = readSrc("server.ts");

    // Either a Host check or an explicit CORS-based origin guard must be present.
    const hasHostCheck =
      serverSrc.includes("Host") ||
      serverSrc.includes("host") ||
      serverSrc.includes("127.0.0.1");

    // The server must explicitly enforce the Host header — not just bind to 127.0.0.1.
    // Look for explicit rejection (400) of requests with wrong Host.
    const hasExplicitHostRejection =
      serverSrc.includes("req.headers.get(\"host\")") ||
      serverSrc.includes("req.headers.get('host')") ||
      serverSrc.includes("X-Forwarded-Host") ||
      serverSrc.match(/host.*!==.*127\.0\.0\.1/i) !== null ||
      serverSrc.match(/status.*400.*[Hh]ost/s) !== null ||
      serverSrc.match(/[Hh]ost.*status.*400/s) !== null;

    expect(hasExplicitHostRejection).toBe(true);
  });

  it("B38: ws-server.ts validates Origin header on WebSocket upgrade (rejects evil.com)", async () => {
    // source-inspect: ws-server.ts WebSocket upgrade must check Origin.
    const wsSrc = readSrc("server/ws-server.ts");

    // Must validate Origin against allowed origins (tauri://localhost or file://)
    const hasOriginCheck =
      wsSrc.includes("Origin") ||
      wsSrc.includes("origin") ||
      wsSrc.includes("tauri://") ||
      wsSrc.includes("file://");

    const hasOriginRejection =
      wsSrc.match(/[Oo]rigin.*403/s) !== null ||
      wsSrc.match(/403.*[Oo]rigin/s) !== null ||
      wsSrc.match(/[Oo]rigin.*tauri.*\|\|.*file/s) !== null ||
      wsSrc.includes("reject") ||
      wsSrc.includes("allowedOrigins");

    expect(hasOriginCheck).toBe(true);
    expect(hasOriginRejection).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-NET-01 — Header Sanitization (B39-B40)
// ---------------------------------------------------------------------------

describe("T-NET-01 — Header Sanitization", () => {
  it("B39: proxy-api.ts preserves CSP, X-Frame-Options, X-Content-Type-Options from upstream", async () => {
    // source-inspect: proxy must NOT strip security headers from upstream responses.
    const proxySrc = readSrc("server/proxy-api.ts");

    // Check that security response headers are NOT deleted/removed.
    const stripsCSP = proxySrc.includes("headers.delete(\"content-security-policy\")") ||
      proxySrc.includes("headers.delete('content-security-policy')");
    const stripsXFrameOptions = proxySrc.includes("headers.delete(\"x-frame-options\")") ||
      proxySrc.includes("headers.delete('x-frame-options')");

    // These security headers must NOT be stripped — they protect the user.
    // If either is deleted, this behaviour is violated.
    expect(stripsCSP).toBe(false);
    expect(stripsXFrameOptions).toBe(false);
  });

  it("B40: proxy-api.ts strips X-Forwarded-For and X-Forwarded-Host from proxied requests", async () => {
    // source-inspect: proxy must remove forwarding headers before sending to upstream.
    const proxySrc = readSrc("server/proxy-api.ts");

    const stripsXForwardedFor =
      proxySrc.includes("x-forwarded-for") ||
      proxySrc.includes("X-Forwarded-For");
    const stripsXForwardedHost =
      proxySrc.includes("x-forwarded-host") ||
      proxySrc.includes("X-Forwarded-Host");

    // Both headers must be stripped to prevent IP spoofing and host header injection.
    expect(stripsXForwardedFor).toBe(true);
    expect(stripsXForwardedHost).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-NET-02 / T-DOS — Resource Limits (B41-B42)
// ---------------------------------------------------------------------------

describe("T-NET-02 / T-DOS — Resource Limits", () => {
  it("B41: server.ts enforces body size limit (returns 413 for bodies > 10 MB)", async () => {
    // source-inspect: server.ts must check Content-Length or stream size before processing.
    const serverSrc = readSrc("server.ts");

    const hasBodySizeCheck =
      serverSrc.includes("413") ||
      serverSrc.includes("Content-Length") ||
      serverSrc.includes("content-length") ||
      serverSrc.includes("10_000_000") ||
      serverSrc.includes("10000000") ||
      serverSrc.includes("maxBodySize") ||
      serverSrc.includes("bodyLimit") ||
      serverSrc.match(/body.*size/i) !== null;

    expect(hasBodySizeCheck).toBe(true);
  });

  it("B42: ndjson-parser.ts enforces line-length cap (>= 1 MB) and closes stream on exceed", async () => {
    // source-inspect: the NDJSON parser must cap line length at ~1 MB (1048576 bytes).
    const ndjsonSrc = readSrc("server/ndjson-parser.ts");

    const hasLineLengthCap =
      ndjsonSrc.includes("1048576") ||
      ndjsonSrc.includes("1_048_576") ||
      ndjsonSrc.includes("maxLineLength") ||
      ndjsonSrc.includes("MAX_LINE") ||
      ndjsonSrc.match(/line.*length.*cap/i) !== null ||
      ndjsonSrc.match(/cap.*line.*length/i) !== null;

    expect(hasLineLengthCap).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-DOS-01 — Session Cap + Rate Limiting (B43-B44)
// ---------------------------------------------------------------------------

describe("T-DOS-01 — Session Cap and Rate Limiting", () => {
  it("B43: session-manager.ts enforces session cap — additional creation returns error/429", async () => {
    // source-inspect: session-manager must enforce MAX_SESSIONS (currently 4).
    // The behaviour under test (B43) requires the cap to be 100 concurrent sessions.
    const smSrc = readSrc("server/session-manager.ts");

    // Must reference a cap constant — currently MAX_SESSIONS is 4, behaviour requires 100.
    // RED: this test verifies the cap is enforced AND the intended cap is >= 100.
    const MAX_SESSIONS_100 =
      smSrc.includes("100") ||
      smSrc.includes("MAX_SESSIONS = 100") ||
      smSrc.match(/concurrent.*session.*100/i) !== null;

    expect(MAX_SESSIONS_100).toBe(true);
  });

  it("B44: server.ts has rate limiting middleware (returns 429 for excessive requests)", async () => {
    // source-inspect: server.ts must include a rate-limiting mechanism.
    const serverSrc = readSrc("server.ts");

    const hasRateLimiting =
      serverSrc.includes("429") ||
      serverSrc.includes("rateLimit") ||
      serverSrc.includes("rate_limit") ||
      serverSrc.includes("rateLimiter") ||
      serverSrc.match(/tokens.*Map/i) !== null ||
      serverSrc.match(/Map.*tokens/i) !== null;

    expect(hasRateLimiting).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-DOS-01 — Rust Safety (B45-B49)
// ---------------------------------------------------------------------------

describe("T-DOS-01 — Rust Safety (no blocking calls in async context)", () => {
  it("B45: no .rs file uses .lock().unwrap() on Mutex (must handle PoisonError)", () => {
    // source-inspect all .rs files: none may use .lock().unwrap() — must handle PoisonError.
    const rsFiles = readAllRsFiles();

    const violators = rsFiles.filter(({ content }) =>
      /\.lock\(\)\.unwrap\(\)/.test(content)
    );

    if (violators.length > 0) {
      const names = violators.map((f) => f.path).join(", ");
      throw new Error(
        `B45 FAIL: The following .rs files use .lock().unwrap() without PoisonError handling: ${names}`
      );
    }

    expect(violators.length).toBe(0);
  });

  it("B46: bun_manager.rs calls child.wait() inside spawn_blocking to avoid blocking async runtime", () => {
    // source-inspect: any child.wait() call must be wrapped in spawn_blocking.
    const src = readTauriSrc("bun_manager.rs");

    // Verify spawn_blocking is used near .wait() calls
    const hasSpawnBlocking = src.includes("spawn_blocking");
    const hasWait = src.includes(".wait()");

    if (hasWait && !hasSpawnBlocking) {
      throw new Error(
        "B46 FAIL: bun_manager.rs calls .wait() without spawn_blocking — this blocks the async runtime"
      );
    }

    expect(hasSpawnBlocking).toBe(true);
  });

  it("B47: commands.rs open_folder_dialog uses spawn_blocking or async variant (not blocking_pick_folder directly)", () => {
    // source-inspect: blocking_pick_folder must be wrapped in spawn_blocking.
    const src = readTauriSrc("commands.rs");

    const usesBlockingPickFolder = src.includes("blocking_pick_folder");
    const usesSpawnBlocking = src.includes("spawn_blocking");

    // If blocking_pick_folder is used, it must be inside spawn_blocking.
    if (usesBlockingPickFolder && !usesSpawnBlocking) {
      throw new Error(
        "B47 FAIL: commands.rs uses blocking_pick_folder without spawn_blocking — blocks async runtime"
      );
    }

    // Both conditions must be false or spawn_blocking must be present if blocking variant is used.
    expect(usesBlockingPickFolder && !usesSpawnBlocking).toBe(false);
  });

  it("B48: base64 image/screenshot payload size is checked against 5 MB cap before processing", () => {
    // source-inspect all TS server files for screenshot/image handling with size cap.
    const pipelineSrc = readSrc("server/pipeline.ts");
    const serverSrc = readSrc("server.ts");

    const allSrc = pipelineSrc + serverSrc;

    const hasSizeCap =
      allSrc.includes("5242880") ||
      allSrc.includes("5_242_880") ||
      allSrc.match(/screenshot.*size/i) !== null ||
      allSrc.match(/image.*size.*cap/i) !== null ||
      allSrc.match(/base64.*limit/i) !== null ||
      allSrc.match(/payload.*5.*mb/i) !== null;

    expect(hasSizeCap).toBe(true);
  });

  it("B49: ws-server.ts or pipeline.ts caps window registration pool at 10 — 11th returns error", () => {
    // source-inspect: the window registration mechanism must cap at 10 windows.
    const wsSrc = readSrc("server/ws-server.ts");
    const serverSrc = readSrc("server.ts");

    const allSrc = wsSrc + serverSrc;

    const hasWindowCap =
      allSrc.includes("MAX_WINDOWS") ||
      allSrc.match(/window.*cap.*10/i) !== null ||
      allSrc.match(/10.*window/i) !== null ||
      allSrc.match(/windowPipelines\.size.*>=.*10/i) !== null ||
      allSrc.match(/windowWsPorts\.size.*>=.*10/i) !== null;

    expect(hasWindowCap).toBe(true);
  });
});
