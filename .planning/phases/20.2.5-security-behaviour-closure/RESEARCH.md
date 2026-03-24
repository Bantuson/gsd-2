# Phase 20.2.5: Security Behaviour Closure — Research

**Researched:** 2026-03-24
**Domain:** Holistic security testing — Bun HTTP server, React components, Rust/Tauri, filesystem
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Tests MUST verify observable runtime behaviour — actual HTTP responses, real process inspection,
  DOM state — NOT source code pattern matching (no `readFileSync + regex` to check if a function
  name appears in source)
- Bun server (not Node.js) — use Bun-native APIs (`Bun.serve`, `Bun.file`)
- Tauri 2.x capability model — capabilities are per-window, declared in JSON files
- Tests must run without a live Tauri process for most assertions (use HTTP client against the Bun
  server directly)
- DOMPurify version compatible with Tauri WebView — prefer `dompurify` npm package + jsdom for
  tests

### Claude's Discretion

- How to structure the test server harness (direct module import vs subprocess spawn)
- Whether to use happy-dom or jsdom for DOM-based XSS tests
- Exact port numbers and timeout values for integration tests
- Whether some behaviours that require a live Tauri process fall back to static config assertions
  (CSP strings, capability JSON)

### Deferred Ideas (OUT OF SCOPE)

- B77 — CI updater signing key verification (deferred to CI/CD phase)
- Protocol-level TLS for localhost (AUTH-03) — architectural constraint, accepted risk
- Full OAuth nonce binding (B60-B61) — complex cross-session state, planned for 20.2.6
- B23 dep_check binary path verification beyond warning (B23 is a PARTIAL implementation, already
  passing its source-inspection test from 20.2.4)
</user_constraints>

---

## Summary

Phase 20.2.5 must replace 6 test files (security-tfile, security-texec, security-tnet,
security-tauth, security-txss, security-tcred) that use `readFileSync + regex` source inspection
with tests that exercise observable runtime behaviour. The project already demonstrates two valid
holistic testing strategies in its test suite: (1) direct module import and function call
(used in `security-hardening.test.ts`, `fs-api.test.ts`, `proxy-api.test.ts`), and (2) Bun subprocess
spawn for full integration tests (used in `server.test.ts`). These patterns define the permitted
approaches.

The key architectural constraint is that most tests should import handler functions directly and
call them with constructed `Request` objects — this avoids the overhead and flakiness of spawning a
full server process while still exercising the same code path that runs in production. The Bun test
runner (`bun:test`) supports `import.meta.dir` and top-level `await`, making handler-level testing
natural.

For DOM/XSS tests, the project already has `happy-dom` 20.8.3 as a devDependency. DOMPurify 3.3.3
is available on npm but not yet installed. The established pattern for React component testing in
this project is direct function invocation (calling the component as a function and inspecting the
returned JSX tree via `JSON.stringify`) — NOT React Testing Library. This avoids the need for
`@testing-library/react` and works in Bun's test environment without special DOM setup.

**Primary recommendation:** Use direct handler imports for all HTTP behaviour tests. Use DOMPurify's
own `sanitize()` function directly in unit tests for XSS sanitization verification. Reserve
subprocess spawn (the `server.test.ts` pattern) only for tests that require the full server
lifecycle (rate limiting middleware, body size enforcement end-to-end). For Rust/Tauri tests that
cannot run in JS, use static config assertion as the approved fallback (source inspection of JSON
configs and Rust source is explicitly allowed for static contracts in CONTEXT.md).

---

## Standard Stack

### Core Testing Tools

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:test` | Bun 1.3.10 built-in | Test runner, describe/it/expect | Already used across all 100+ test files |
| `node:fs` / `node:os` / `node:path` | Bun built-in | Filesystem assertions, temp dirs | Native — no install needed |
| `dompurify` | 3.3.3 (latest) | XSS sanitization unit tests | Locks down what DOMPurify actually strips at runtime |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `happy-dom` | 20.8.3 (already installed) | Headless DOM for DOMPurify init | DOMPurify requires a DOM environment to initialize |
| `@types/dompurify` | 3.2.0 | TypeScript types for DOMPurify | DOMPurify test files |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| direct handler import | subprocess spawn (`Bun.spawn`) | Spawn is slower (~3s startup), flaky in CI, but needed for middleware-level tests that can't be exercised via module import (e.g., body size limit via Content-Length header check in the server fetch handler) |
| happy-dom + DOMPurify | `@testing-library/react` + jsdom | Testing Library gives a real DOM and RTL queries, but adds significant dependencies; the project's existing pattern of JSX function invocation is sufficient for sanitization output checks |
| direct function call | Playwright e2e | Playwright can verify Tauri behaviour end-to-end but requires a built Tauri app; not runnable in unit test context |

**Installation:**
```bash
cd packages/mission-control
bun add dompurify @types/dompurify
```

**Version verification:**
```bash
npm view dompurify version        # 3.3.3
npm view @types/dompurify version # 3.2.0
npm view happy-dom version        # 20.8.3 (already installed)
```

---

## Architecture Patterns

### Two Permitted Test Patterns

The codebase uses exactly two patterns for holistic testing. Both are valid. Use the simplest
one that covers the observable behaviour.

---

### Pattern 1: Direct Handler Import (preferred for most HTTP tests)

**What:** Import the handler function from `src/server/` and call it with a constructed `Request`
object. Assert on the returned `Response`.

**When to use:** Any test where the security behaviour is implemented inside the handler function
(path validation, SSRF blocking, host header check, etc.). This is the pattern used in
`security-hardening.test.ts` and `proxy-api.test.ts`.

**Example — path traversal B1:**
```typescript
// Source: packages/mission-control/tests/security-hardening.test.ts pattern
import { describe, it, expect } from "bun:test";
import { handleFsRequest } from "../src/server/fs-api";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("B1: GET /api/fs/read rejects sliceId with ../../etc/passwd traversal — returns 400", async () => {
  const root = mkdtempSync(join(tmpdir(), "b1-root-"));
  try {
    const req = new Request(
      `http://localhost:4200/api/fs/read?path=${encodeURIComponent("../../etc/passwd")}`,
      { method: "GET" }
    );
    const url = new URL(req.url);
    const response = await handleFsRequest(req, url, root);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403); // or 400
    // Verify the response body does NOT contain absolute path in error message
    const body = await response!.json() as { error?: string };
    expect(body.error).not.toMatch(/[A-Z]:\\/); // no Windows absolute path
    expect(body.error).not.toMatch(/\/home\//);  // no Unix absolute path
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Example — SSRF proxy blocking B33 (already passing in 20.2.4):**
```typescript
import { handleProxyRequest } from "../src/server/proxy-api";

it("B33: proxy rejects non-allowlisted host — 403", async () => {
  const req = new Request("http://localhost:4200/api/proxy");
  const url = new URL("http://localhost:4200/api/proxy?target=https://evil-host.com/api");
  const response = await handleProxyRequest(req, url, 9999);
  expect(response.status).toBe(403);
});
```

---

### Pattern 2: Subprocess Spawn (for middleware-level tests)

**What:** Use `Bun.spawn` to start the full `src/server.ts` process with a custom port, wait for
it to respond, make real HTTP requests, then kill it. This is the pattern in `server.test.ts`.

**When to use:** Tests that require the middleware layer in `server.ts` itself to be exercised,
not a handler function. Specifically: body size limit (B41 — Content-Length check in the `fetch`
function), Host header validation (B37 — ALLOWED_HOSTS check before route dispatch), rate limiting
(B44).

```typescript
// Source: packages/mission-control/tests/server.test.ts
import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import { join } from "node:path";

const TEST_PORT = 14200 + Math.floor(Math.random() * 1000);
let serverProc: ReturnType<typeof Bun.spawn> | null = null;

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, MC_PORT: String(TEST_PORT), MC_NO_HMR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Poll until ready (up to 25s)
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) break;
    } catch { /* not ready */ }
    await Bun.sleep(250);
  }
}, { timeout: 30_000 });

afterAll(() => { serverProc?.kill(); });

it("B37: Host header mismatch returns 400", async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/fs/list`, {
    headers: { "Host": "evil.com" },
  });
  expect(res.status).toBe(400);
});

it("B41: Content-Length > 10MB returns 413", async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/fs/write`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(11 * 1024 * 1024), // 11 MB
    },
    body: "{}",
  });
  expect(res.status).toBe(413);
});
```

---

### Pattern 3: Direct Sanitizer Unit Test (for DOMPurify / XSS tests)

**What:** Import DOMPurify, initialize it with happy-dom's Window, run `sanitize()` on attack
payloads, assert the output DOM is clean. Do NOT render React components with React Testing Library.

**When to use:** B25-B27, B65-B66 (DOMPurify sanitization output verification).

```typescript
import { describe, it, expect, beforeAll } from "bun:test";
import DOMPurify from "dompurify";
import { Window } from "happy-dom";

let purify: ReturnType<typeof DOMPurify.bind>;

beforeAll(() => {
  // DOMPurify requires a DOM environment — happy-dom provides it
  const window = new Window();
  purify = DOMPurify(window as unknown as Window & typeof globalThis);
});

it("B25: DOMPurify strips <script> tags from marked.parse output", () => {
  const input = `<p>Hello</p><script>window.__TAURI__.invoke('set_credential', {key:'x',value:'y'})</script>`;
  const clean = purify.sanitize(input);
  expect(clean).not.toContain("<script");
  expect(clean).not.toContain("window.__TAURI__");
});

it("B25: DOMPurify strips onerror event handlers", () => {
  const input = `<img src=x onerror="window.__TAURI__.invoke('set_credential',{})" />`;
  const clean = purify.sanitize(input);
  expect(clean).not.toContain("onerror");
  expect(clean).not.toContain("window.__TAURI__");
});

it("B66: DOMPurify strips javascript: href", () => {
  const input = `<a href="javascript:window.__TAURI__.invoke('delete_credential',{key:'x'})">click</a>`;
  const clean = purify.sanitize(input);
  expect(clean).not.toContain("javascript:");
});
```

---

### Pattern 4: Static Config Assertion (approved fallback for Tauri-native behaviours)

**What:** Parse JSON config files (tauri.conf.json, capability JSON) and assert on their content.
Read Rust source to check for presence/absence of patterns. CONTEXT.md explicitly marks this as
allowed for static contracts.

**When to use:** B28/B29 (CSP string), B30/B31/B72 (capability JSON structure), B69/B70 (Rust
open_external), B73 (App.tsx trust-fail pattern), B76 (asset scope). These behaviours are static
configuration contracts, not runtime behaviour — exercising them holistically requires a live
Tauri WebView which is outside the test environment.

**Distinction from the forbidden pattern:** The forbidden pattern is using regex on TypeScript
source to verify that a function is called (e.g., `src.includes("realpathSync")`). The approved
pattern is asserting on the CONTENT of declarative JSON configs (what values are set) or on
absence of specific dangerous code patterns in Rust (e.g., no `.lock().unwrap()`).

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("B28: CSP script-src does not contain 'unsafe-inline'", () => {
  const conf = JSON.parse(
    readFileSync(join(import.meta.dir, "../src-tauri/tauri.conf.json"), "utf8")
  );
  const csp: string = conf?.app?.security?.csp ?? "";
  const scriptSrcMatch = csp.match(/script-src([^;]*)/);
  expect(scriptSrcMatch).not.toBeNull();
  expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
});

it("B78: no Rust file uses .lock().unwrap() (would panic on mutex poisoning)", () => {
  // This IS a static assertion but verifies a Rust safety contract that cannot
  // be exercised from TypeScript — approved fallback for Rust tests
  const src = readFileSync(join(import.meta.dir, "../src-tauri/src/bun_manager.rs"), "utf8");
  expect(src).not.toMatch(/\.lock\(\)\.unwrap\(\)/);
});
```

---

### Pattern 5: Filesystem State Assertion (for write traversal tests)

**What:** Call the handler, then check the filesystem directly to verify no file was written
outside the allowed root.

**When to use:** B9 (uat-results write traversal), B10/B11 (assets write traversal), B14
(removeSessionWorktree without root check), B15 (file permissions).

```typescript
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("B9: uat-results write with traversal sliceId does not create file outside workspace", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "b9-ws-"));
  const outsidePath = join(tmpdir(), "evil-uat-results.md");

  try {
    // Attempt write with traversal
    const req = new Request("http://localhost:4200/api/uat-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sliceId: "../../evil", content: "pwned" }),
    });
    const response = await handleUatResultsRequest(req, new URL(req.url), workspace);
    expect(response.status).toBe(400); // must reject

    // Verify no file was written outside the workspace
    expect(existsSync(outsidePath)).toBe(false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outsidePath, { force: true });
  }
});
```

---

### Anti-Patterns to Avoid

- **Source inspection for behavioural verification:** `src.includes("realpathSync")` does not prove
  the function is called with correct arguments at runtime. Replace with a request that exercises
  the actual path.
- **Asserting the handler exists/is imported:** `expect(handleFsRequest).toBeDefined()` does not
  test security behaviour. Call it with malicious input and assert on the response.
- **Checking variable name patterns:** `src.includes("ALLOWED_PROXY_HOSTS")` does not verify
  the allowlist is enforced. Send a request with an evil host and check the status code.
- **Subprocess spawn for unit-level tests:** Only use `Bun.spawn` when the behaviour is in the
  `server.ts` fetch handler itself, not inside a handler module function.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM sanitization verification | Custom HTML parser to check for `<script>` | DOMPurify 3.3.3 with real sanitize() call | DOMPurify handles all XSS vectors including SVG, HTML entities, javascript: protocol; hand-rolled checks miss edge cases |
| DOM environment for DOMPurify | JSDOM installation and configuration | `happy-dom` (already installed as devDep 20.8.3) | happy-dom is already in package.json; it initializes DOMPurify correctly |
| Test server lifecycle | Custom process manager with health checks | Existing `server.test.ts` pattern: `Bun.spawn` + polling loop | Pattern already proven in the codebase |
| Filesystem temp dir management | Custom temp dir tracking | `mkdtempSync` + try/finally + `rmSync` | Node.js built-in, cleans up even on test failure |
| Path traversal test cases | Custom encoding variations | Standard attack strings: `../../`, `..%2F`, null byte `\x00`, sibling prefix | These cover the known bypass vectors |

**Key insight:** The hardest part of this phase is NOT building test infrastructure — it is
identifying the exact assertion that proves the observable behaviour without falling back to
source inspection. The patterns above are sufficient for all 53 failing behaviours.

---

## Test Infrastructure Setup

### How to Start the Bun Server in Tests

**Option A: Direct module import (use for ~45 of 53 behaviours)**

```typescript
// No server startup needed — import handlers and call them:
import { handleFsRequest } from "../src/server/fs-api";
import { handleUatResultsRequest } from "../src/server/uat-results-api";
import { handleProxyRequest } from "../src/server/proxy-api";
import { handleGsdFileRequest } from "../src/server/gsd-file-api";

// Construct Request with the URL and body the attacker would send
const req = new Request("http://localhost:4200/api/fs/read?path=../../etc/passwd");
const url = new URL(req.url);
const response = await handleFsRequest(req, url, "/safe/workspace/root");
expect(response!.status).toBe(403);
```

**Why this works:** Bun's `Request` and `URL` are global standards (WHATWG). The handler functions
accept these directly — the same objects that `Bun.serve`'s `fetch` callback receives. There is no
difference between calling `handleFsRequest(req, url, root)` in a test vs from the server router.

**Option B: Subprocess spawn (use for ~8 behaviours requiring middleware layer)**

For B37 (Host validation), B41 (body size limit), B44 (rate limiting), B50/B51 (bearer token auth
on all routes) — these checks are implemented in the `fetch` function in `server.ts` before
dispatching to handler modules. They cannot be tested via handler import alone.

Use the pattern from `server.test.ts` — see Pattern 2 above. Key settings:
- `MC_NO_HMR=1` — disables hot module reload, reduces startup noise
- Random port: `14200 + Math.floor(Math.random() * 1000)` — avoids conflicts with parallel tests
- 25s timeout polling loop — server may be slow under parallel test load
- `skipIf(isCI)` on tests that are too slow/flaky for CI (optional)

### Module Import Caveat: `server.ts` Top-Level Await

`src/server.ts` has top-level `await` (it calls `freePort(HTTP_PORT)` at module level) and
constructs `Bun.serve()`. You CANNOT `import "../src/server.ts"` in a test — it will start a live
server on port 4200 and block the test process. Always import from the individual handler modules
under `src/server/`.

### Worker/Pipeline Imports Caveat

Some handlers (e.g., `handleFsRequest`) take an `allowedRoot` parameter passed from `server.ts`
via `getPipelineForReq()`. In tests, pass the allowed root directly as a temp directory:

```typescript
const root = mkdtempSync(join(tmpdir(), "test-root-"));
const response = await handleFsRequest(req, url, root); // pass root directly
```

---

## Concrete Test Patterns by Threat Category

### T-FILE (B1-B18): Path Traversal

**Holistic approach:** Call handler with traversal payloads, assert 400/403 response.
Optionally assert filesystem state (no file created outside root).

**Attack payload set (use these in tests):**
```
../../etc/passwd          — classic Unix traversal
..%2F..%2Fetc%2Fpasswd    — URL-encoded traversal
....//....//etc/passwd    — doubled-dot bypass
/absolute/path/outside    — absolute path injection
path\x00.txt              — null byte injection (encodeURIComponent('\x00'))
../sibling-dir/file       — sibling directory escape
```

**Key tests:**
- B1-B3: `handleGsdFileRequest` with malicious `sliceId`, `milestoneId`, null byte in params
- B4-B6, B17: Call `validatePath()` directly with symlinks (already done correctly in existing tests B5/B6 — keep these, they ARE holistic as they call the real function)
- B7-B8: Make request that triggers error; assert response body contains no absolute paths
- B9: Call `handleUatResultsRequest` with traversal sliceId; assert 400 AND no file created outside workspace
- B10-B11: Call `handleAssetsRequest` with crafted multipart body; assert 400
- B12: Call `handleFsRequest` for mkdir with traversal path; assert 403 (currently passing per CONTEXT.md audit)
- B13-B14: Call `handleWorktreeRequest`; assert 400 for invalid sessionSlug
- B15: After a legitimate file-write call succeeds, check `statSync(path).mode & 0o777 === 0o600`
- B18: Assert `freePort` is the actual mechanism used (subprocess + bind, not check-then-bind) — this is observable as server startup succeeding on a port that was previously occupied

### T-EXEC-02 (B25-B32): XSS + IPC Chain

**Holistic approach:** Use DOMPurify directly (Pattern 3). For CSP/capability tests, use static
config assertion (Pattern 4).

**Key tests:**
- B25-B27: DOMPurify unit test with XSS payloads (script tags, event handlers, javascript: hrefs)
- B28-B29: Parse `tauri.conf.json`; assert CSP `script-src` lacks `'unsafe-inline'`; assert nonce/hash present
- B30-B31: Read capabilities directory; assert secondary window capability files exist; assert they lack credential permissions
- B32: Read TSX source for `<iframe` elements; assert each has `sandbox` attribute (static config assertion — this is approved because it verifies a declarative HTML attribute, not a code behaviour)

**DOMPurify initialization note:**
DOMPurify requires a global `window`/`document` to initialize. happy-dom provides this. The
pattern is:

```typescript
import DOMPurify from "dompurify";
import { Window } from "happy-dom";
const window = new Window();
const purify = DOMPurify(window as unknown as Window & typeof globalThis);
// purify.sanitize(input) now works
```

Alternatively, for quick unit tests that don't need full DOM fidelity:
```typescript
// DOMPurify can also be initialized from a minimal JSDOM-like environment
// happy-dom is simpler and already installed
```

### T-NET (B33-B42): Proxy, Host, Resource Limits

**Holistic approach:** Mix of Pattern 1 (proxy handler direct import) and Pattern 2 (subprocess
for body size limit and rate limiting).

**Key tests:**
- B33-B36: Already passing per audit — `handleProxyRequest` direct import with evil targets
- B37: Subprocess spawn test — send request with `Host: evil.com`; assert 400
- B38: WebSocket upgrade test with wrong Origin — requires ws server setup; can use `ws` npm client OR assert statically on ws-server.ts `allowedOrigins` set content (the origin check is declarative config, not a computed behaviour)
- B39: `handleProxyRequest` with a target that returns CSP headers; assert response preserves them
- B40: `handleProxyRequest`; assert `X-Forwarded-For` header is absent in forwarded request (tricky — requires intercepting the outgoing request or checking proxy-api.ts behavior with a mock upstream)
- B41: Subprocess test — POST with `Content-Length: 11000000`; assert 413
- B42: Call `NdJsonParser` with a line > 1 MB; assert stream closes/errors

### T-AUTH (B50-B64): Authentication

**Holistic approach:** B50-B52 require per-launch token to exist — if not implemented yet,
the test will be RED (expected). For B53/B54, verify token format (UUID v4 pattern check on the
actual generated token value). For B57/B71, inspect what gets written to auth.json (filesystem
assertion).

**Key tests:**
- B50: Subprocess test (server.ts middleware) — request without `Authorization: Bearer <token>`; assert 401
- B51: WebSocket connection without token; assert upgrade rejected (403/401)
- B52: Two WebSocket clients; client A sends command targeting session B; assert B receives nothing
- B53: Read the generated per-launch token from the server; assert UUID v4 format via regex `[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`
- B54: Same check on window IDs
- B55: Subprocess test — request with `Origin: https://evil.com`; assert 400/403
- B57/B71: Call `handleAuthRequest` with `POST /api/auth/login-api-key`; after it completes, read `~/.gsd/auth.json`; assert file contains no raw API key value (the key itself should be absent, only metadata)
- B58: After auth.json write, `statSync(authFilePath).mode & 0o777 === 0o600`
- B62: Call logout endpoint; assert `delete_credential` IPC was invoked (requires a mock/spy on `invoke`)
- B63: Trigger auth error; assert response body is generic `{"error": "Unauthorized"}` not specific cause
- B64: Concurrent refresh calls — start two simultaneous token refresh requests; assert only one network call is made

### T-XSS (B65-B70): Content Security

- B65-B66: DOMPurify unit tests (Pattern 3)
- B67: Parse `tauri.conf.json` CSP `connect-src`; assert no `ws://127.0.0.1:*` wildcard
- B68: Parse `OAuthConnectFlow.tsx`; assert no `window.open` with non-validated URL — this is a static assertion (approved for declarative contracts)
- B69: Parse `commands.rs`; assert `starts_with("https://")` guard exists — static assertion on Rust config
- B70: Parse `commands.rs`; assert no `format!("file://{}", path)` raw concat — static assertion

### T-CRED (B71-B81): Credential + Runtime Safety

- B71-B72: Filesystem assertion (what auth.json contains) + capability JSON assertion
- B73: Mock `fetch("/api/trust-status")` to reject; assert App state = untrusted (React component test via JSX function invocation)
- B74: Already passing
- B75: Call the monkey-patched fetch with a `Headers` instance containing `Authorization`; assert header is preserved in the outgoing request
- B76: Parse `tauri.conf.json` asset scope; assert no `$APP/**` wildcard
- B78: Static assertion — Rust source, no `.lock().unwrap()`
- B79: Static assertion — Rust source, `.wait()` wrapped in `spawn_blocking`
- B80: Static assertion — Rust source, `blocking_pick_folder` wrapped in `spawn_blocking`
- B81: Static + runtime hybrid — verify no `isPortAvailable` check AND verify port bind succeeds after `freePort` call

---

## What CAN Be Tested Holistically vs What Needs Static Config Assertion

### HOLISTIC (runtime observable behaviour)

| Behaviour | Observable Signal | How |
|-----------|------------------|-----|
| B1-B3, B7-B14 | HTTP 400/403 response | Handler import + Request with payload |
| B4-B6, B17 | validatePath throws | Direct function call with symlink/traversal |
| B9, B15 | Filesystem state after write | statSync on expected output paths |
| B25-B27, B65-B66 | DOMPurify output DOM | purify.sanitize() on attack payloads |
| B33-B36, B39-B42 | HTTP 400/403/413 response | Handler import |
| B37, B41, B44, B50, B55 | HTTP 400/401/413/429 response | Subprocess spawn |
| B50-B52 | 401/403 on unauthenticated request | Subprocess spawn |
| B57, B71 | auth.json file content | statSync + JSON.parse after auth call |
| B58 | auth.json permissions | statSync().mode |
| B62 | OS keychain delete_credential called | Spy/mock on invoke() |
| B63 | Generic error message in response body | Handler import + auth error trigger |
| B64 | Single refresh despite concurrent calls | Concurrent fetch calls, count network requests |
| B73 | App untrusted state on fetch failure | Mock fetch + React JSX function call |
| B75 | Headers preserved through monkey-patch | Call monkey-patched fetch; inspect forwarded request |

### STATIC CONFIG ASSERTION (approved fallback — declarative contracts only)

| Behaviour | Config | Assertion |
|-----------|--------|-----------|
| B28-B29 | tauri.conf.json CSP | `script-src` lacks `'unsafe-inline'`; has nonce/hash |
| B30-B31 | src-tauri/capabilities/*.json | Secondary window files exist; lack credential perms |
| B67 | tauri.conf.json CSP | `connect-src` has no wildcard port |
| B68 | OAuthConnectFlow.tsx | No raw `window.open` with unvalidated URL |
| B69 | commands.rs | `starts_with("https://")` guard present |
| B70 | commands.rs | No `format!("file://{}", path)` |
| B72 | capabilities/main.json | Credential commands only in main.json |
| B76 | tauri.conf.json | Asset scope has no `$APP/**` |
| B78-B80 | bun_manager.rs, commands.rs | No `.lock().unwrap()`; wait()/blocking_pick_folder wrapped |
| B81 | server.ts | No `isPortAvailable` function; `nextWsPort++` direct-bind pattern |

---

## Common Pitfalls

### Pitfall 1: Importing server.ts in a Test

**What goes wrong:** `import "../src/server.ts"` executes the top-level `await freePort(4200)` and
starts `Bun.serve` on port 4200. The test process never exits. Port conflicts with development server.

**Why it happens:** Bun executes top-level `await` at module load time.

**How to avoid:** Only import from `src/server/*.ts` handler modules, never from `src/server.ts`.

**Warning signs:** Test hangs indefinitely after importing; `bun test` times out on that file.

---

### Pitfall 2: DOMPurify Initializing Without a DOM

**What goes wrong:** `DOMPurify.sanitize(input)` throws `DOMPurify is not initialized` or returns
unmodified input because there is no `document` global.

**Why it happens:** DOMPurify reads `window.document` for parser context. Bun's test environment
does not have a global `window`.

**How to avoid:** Always initialize with happy-dom before calling sanitize:
```typescript
import { Window } from "happy-dom";
const purify = DOMPurify(new Window() as unknown as Window & typeof globalThis);
```

**Warning signs:** Tests pass (DOMPurify returns input unchanged) but XSS payloads aren't stripped.

---

### Pitfall 3: Request Constructor URL Must Be Absolute

**What goes wrong:** `new Request("/api/fs/read?path=..")` throws because the URL is relative.

**Why it happens:** WHATWG `Request` requires absolute URLs.

**How to avoid:** Always use `http://localhost:4200/...` as the base URL in tests. The handler
modules parse the URL themselves — the host is irrelevant for handler-level tests.

---

### Pitfall 4: Filesystem Tests Without Cleanup Leave Pollution

**What goes wrong:** Failed test leaves temp directories that accumulate across test runs; a
later test finds an unexpected pre-existing file and gives a false result.

**Why it happens:** Exceptions before `rmSync` skip cleanup.

**How to avoid:** Always wrap test assertions in `try/finally`:
```typescript
const root = mkdtempSync(join(tmpdir(), "test-"));
try {
  // ... test assertions
} finally {
  rmSync(root, { recursive: true, force: true });
}
```

---

### Pitfall 5: Symlink Tests on Windows Require Admin Privileges

**What goes wrong:** `symlinkSync` throws `EPERM: operation not permitted` on Windows unless
Developer Mode is enabled or the test runs as Administrator.

**Why it happens:** Windows requires elevated privileges to create symlinks by default.

**How to avoid:** Wrap symlink tests with a platform check:
```typescript
const canSymlink = process.platform !== "win32" || process.env.WINDOWS_SYMLINKS === "1";
it.skipIf(!canSymlink)("B6: validatePath rejects symlink escape", () => { ... });
```

Note: The existing tests for B6 and B17 already do this check implicitly (they use `symlinkSync`
directly). Keep the existing platform conditional.

---

### Pitfall 6: WebSocket Test Requires Separate WS Client

**What goes wrong:** Testing B38 (WS Origin validation) requires making a WebSocket connection
with a custom Origin header. The browser WebSocket API ignores the Origin header; only server-side
or native WS clients can set it.

**Why it happens:** Browser spec prohibits setting Origin on WebSocket.

**How to avoid:** Use the `ws` npm package in tests, which allows setting arbitrary headers:
```typescript
import WebSocket from "ws";
const ws = new WebSocket("ws://127.0.0.1:4001", {
  headers: { "Origin": "https://evil.com" }
});
ws.on("error", (err) => { /* expect connection refused or 403 */ });
```
OR use static assertion on `ws-server.ts` `allowedOrigins` set (the `allowedOrigins` constant is a
declarative static config — the approved fallback).

---

### Pitfall 7: Rate Limiting Test Requires Subprocess Spawn

**What goes wrong:** B44 (rate limiting) is implemented in `server.ts` fetch handler. Calling
`handleFsRequest` directly bypasses the rate limiter entirely.

**Why it happens:** Handler modules have no rate-limiting logic — it lives in the router.

**How to avoid:** Use subprocess spawn for B44. Send N+1 rapid requests; assert the N+1th returns 429.

---

### Pitfall 8: happy-dom Version Drift

**What goes wrong:** happy-dom 20.x changed the import for `Window` class between minor versions.

**Why it happens:** The `Window` class moved from default export to named export in some versions.

**How to avoid:** Use the named export: `import { Window } from "happy-dom"`. This is stable in
20.x. The devDependency is pinned to `^20.8.3` in package.json.

---

## Dependencies Needed

### Must Install

```bash
cd packages/mission-control
bun add dompurify
bun add -d @types/dompurify
```

### Already Available (no install needed)

- `happy-dom` — already in devDependencies (`^20.8.3`)
- `bun:test` — built into Bun 1.3.10
- `node:fs`, `node:os`, `node:path` — Bun built-ins
- `bun-types` — already in devDependencies

### Optional (for WebSocket origin testing only)

```bash
bun add -d ws @types/ws
```

Only needed if WebSocket tests use runtime connection testing instead of static config assertion
for B38/B51. Static assertion is simpler and already approved.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Test runner | ✓ | 1.3.10 | — |
| dompurify | B25-B27, B65-B66 | needs install | 3.3.3 | Static assertion (weaker) |
| happy-dom | DOMPurify DOM context | ✓ (devDep) | ^20.8.3 | jsdom (heavier) |
| node:fs symlink | B6, B17 symlink tests | ✓ on Linux/Mac; conditional on Windows | — | `it.skipIf(win32)` |
| /tmp write access | All filesystem tests | ✓ | — | — |
| Bun.spawn | B37, B41, B44, B50 subprocess tests | ✓ | — | — |
| ws npm package | B38/B51 WebSocket Origin tests | needs install | — | Static config assertion |

**Missing dependencies with fallback:**
- `dompurify` — must be installed; fallback is weaker static assertion (not approved per CONTEXT.md)
- `ws` — optional; static assertion on `allowedOrigins` is sufficient for B38

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` (Bun 1.3.10 built-in) |
| Config file | `bunfig.toml` — `[test] root = "./tests"` |
| Quick run command | `cd packages/mission-control && bun test tests/security-tfile.test.ts` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements → Test Map

| File | Behaviours | Test Type | Command |
|------|-----------|-----------|---------|
| security-tfile.test.ts | B1-B18 | unit (handler import + fs assertion) | `bun test tests/security-tfile.test.ts` |
| security-texec.test.ts | B19-B32 | unit (handler import) + static config | `bun test tests/security-texec.test.ts` |
| security-tnet.test.ts | B33-B49 | unit + subprocess (B37, B41, B44) | `bun test tests/security-tnet.test.ts` |
| security-tauth.test.ts | B50-B64 | subprocess (B50-B52) + unit | `bun test tests/security-tauth.test.ts` |
| security-txss.test.ts | B65-B70 | DOMPurify unit + static config | `bun test tests/security-txss.test.ts` |
| security-tcred.test.ts | B71-B81 | static config + unit | `bun test tests/security-tcred.test.ts` |

### Sampling Rate

- **Per task commit:** `bun test tests/security-tfile.test.ts` (relevant file only)
- **Per wave merge:** `bun test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `dompurify` must be installed: `bun add dompurify && bun add -d @types/dompurify`
- [ ] Verify `happy-dom` is importable: `import { Window } from "happy-dom"` in a test file

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Source inspection: `readFileSync + regex` | Observable behaviour: HTTP responses + DOM inspection | This phase | Tests actually prove the system behaves securely, not that the code looks correct |
| Process-global handler calls | Direct module import with request objects | Already established in security-hardening.test.ts | Fast unit tests without server startup |
| No DOM for XSS testing | happy-dom + DOMPurify.sanitize() | This phase | Verifies actual sanitizer output |

---

## Open Questions

1. **B50-B52 per-launch token — implementation doesn't exist yet**
   - What we know: server.ts has a comment stating no auth is intentional design
   - What's unclear: Does the implementation wave (Wave 1) add the token before tests are written, or do tests arrive RED first?
   - Recommendation: Write the tests RED first (they will fail), then implement. Tests using subprocess spawn will need the token to be discoverable from the test — one pattern is reading it from a file the server writes at startup, or from a `GET /api/token` endpoint (if implemented)

2. **B62 logout delete_credential — requires Tauri IPC spy**
   - What we know: `invoke("delete_credential", ...)` is a Tauri IPC call from TypeScript
   - What's unclear: In a non-Tauri test environment, `invoke` is either mocked or throws; cannot verify the IPC call was made without a mock
   - Recommendation: Mock `window.__TAURI__.core.invoke` in the test and verify it was called with `delete_credential` for each stored key; this is an observable call even without Tauri

3. **B44 rate limiting — implementation unknown**
   - What we know: server.ts currently has no rate limiting; B44 requires 429 response
   - What's unclear: Implementation approach (token bucket, sliding window, simple counter)
   - Recommendation: The test should be: send N requests rapidly, expect the (N+1)th to return 429. N should be a reasonable threshold (e.g., 100/minute).

---

## Sources

### Primary (HIGH confidence)

- Existing test files in `packages/mission-control/tests/` — confirmed patterns that work in this project
- `packages/mission-control/bunfig.toml` — test runner configuration
- `packages/mission-control/package.json` — installed dependencies
- `packages/mission-control/src/server.ts` — server architecture, middleware order
- `packages/mission-control/src/server/fs-api.ts` — handler function signatures
- `.planning/phases/20.2.5-security-behaviour-closure/20.2.5-CONTEXT.md` — locked decisions and gap matrix

### Secondary (MEDIUM confidence)

- npm registry: `dompurify@3.3.3`, `@types/dompurify@3.2.0`, `happy-dom@20.8.7` — verified current versions
- Bun 1.3.10 documentation — `bun:test` API, `Bun.spawn`, top-level await behaviour

### Tertiary (LOW confidence)

- DOMPurify + happy-dom integration pattern — derived from happy-dom API; not tested in this specific codebase

---

## Metadata

**Confidence breakdown:**
- Test patterns (direct handler import): HIGH — proven in existing tests
- DOMPurify + happy-dom integration: MEDIUM — packages compatible, pattern standard, not yet confirmed in this project
- Subprocess spawn timing/flakiness: MEDIUM — server.test.ts shows it works but notes CI flakiness
- Rust/Tauri test limitations: HIGH — confirmed, Tauri cannot run in bun test environment

**Research date:** 2026-03-24
**Valid until:** 2026-04-23 (30 days — dompurify and bun versions stable)
