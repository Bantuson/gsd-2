/**
 * Shared security test helpers for holistic behaviour testing.
 * Imported by all 6 security test files (tfile, texec, tnet, tauth, txss, tcred).
 *
 * Does NOT import anything from src/ — only node:* and bun:* APIs.
 *
 * [Rule 3 - Blocking] Created by 20.2.5-02 execution because plan-01 (which creates this
 * file) runs in parallel. This is a minimal bootstrap required for plan-02 tests.
 */

import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestServer {
  /** Full base URL, e.g. http://127.0.0.1:49123 */
  baseUrl: string;
  /** Port the server is bound to */
  port: number;
  /** Stop the server and clean up the child process */
  stop: () => Promise<void>;
}

const MC_ROOT = resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// startTestServer
// ---------------------------------------------------------------------------

/**
 * Spawns the Mission Control Bun HTTP server on a random available port.
 * Polls until the server responds or 25 seconds elapse (matches server.test.ts pattern).
 * Returns a TestServer handle with a stop() method.
 */
export async function startTestServer(env?: Record<string, string>): Promise<TestServer> {
  // Find a random available port using a probe listener
  const port = await getRandomPort();

  // Use Bun.spawn with cwd (matches the working pattern in server.test.ts)
  const proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd: MC_ROOT,
    env: {
      ...process.env,
      MC_PORT: String(port),
      MC_NO_HMR: "1",
      NODE_ENV: "test",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Poll until the server is up (max 25 seconds, matching server.test.ts)
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(baseUrl + "/", {
        signal: AbortSignal.timeout(500),
      });
      if (res.status < 600) {
        ready = true;
        break;
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(250);
  }

  if (!ready) {
    proc.kill();
    const stderr = await new Response(proc.stderr).text().catch(() => "");
    throw new Error(`Test server on port ${port} did not start within 25 seconds. stderr: ${stderr.slice(0, 500)}`);
  }

  return {
    baseUrl,
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        proc.kill();
        // Give process time to terminate
        setTimeout(resolve, 500);
      }),
  };
}

// ---------------------------------------------------------------------------
// makeRequest
// ---------------------------------------------------------------------------

/**
 * Thin fetch wrapper that prepends baseUrl and adds the correct Host header
 * so that server.ts Host-header validation (B37) passes automatically.
 * Does NOT follow redirects.
 */
export async function makeRequest(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = new URL(path, baseUrl);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Host")) {
    headers.set("Host", `127.0.0.1:${port}`);
  }
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url.toString(), {
    ...options,
    headers,
    redirect: "manual",
  });
}

// ---------------------------------------------------------------------------
// assertNoPathLeakInBody
// ---------------------------------------------------------------------------

/**
 * Asserts the response body string does NOT contain absolute filesystem paths.
 * Prevents path disclosure via error messages or response bodies.
 */
export function assertNoPathLeakInBody(body: string, label: string): void {
  const patterns = [
    /\/home\//,
    /\/Users\//,
    /\/tmp\//,
    /C:\\Users\\/,
    /C:\/Users\//,
  ];
  for (const pattern of patterns) {
    if (pattern.test(body)) {
      throw new Error(`assertNoPathLeakInBody [${label}]: body contains filesystem path matching ${pattern}: ${body.slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// traversalPayloads
// ---------------------------------------------------------------------------

/**
 * Standard path traversal payloads for testing input validation.
 */
export function traversalPayloads(): string[] {
  return [
    "../../etc/passwd",
    "../secret",
    "..\\..\\Windows\\System32\\drivers\\etc\\hosts",
    "task\x00id",
    "/etc/passwd",
    "....//....//etc/passwd",
  ];
}

// ---------------------------------------------------------------------------
// makeMultipartBody
// ---------------------------------------------------------------------------

/**
 * Creates a FormData with a file field using the given filename and content.
 * Used for testing assets-api upload with traversal filenames.
 */
export function makeMultipartBody(
  filename: string,
  content: string
): FormData {
  const formData = new FormData();
  const blob = new Blob([content], { type: "text/plain" });
  formData.append("file", blob, filename);
  return formData;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const net = require("node:net");
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
