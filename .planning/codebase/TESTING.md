# Testing Patterns

**Analysis Date:** 2026-03-12

## Test Framework

**Runner (Mission Control — `packages/mission-control`):**
- Bun test runner (`bun:test`) — built into Bun, no separate config file required
- Test files live in `packages/mission-control/tests/` (separate directory, not co-located)
- Config: `packages/mission-control/bunfig.toml` — configures `bun-plugin-tailwind` for serve

**Runner (Root package / GSD extension — `src/`):**
- Node.js built-in test runner (`node:test`, `node:assert/strict`) for `.test.mjs` files
- Custom `assert`/`assertEq` helper pattern (hand-rolled) for `.test.ts` files
- Config: run via `npm test` script in root `package.json`

```bash
# Root package tests (Node test runner)
npm test
# Equivalent: node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs \
#   --experimental-strip-types --test \
#   'src/resources/extensions/gsd/tests/*.test.ts' \
#   'src/resources/extensions/gsd/tests/*.test.mjs' \
#   'src/tests/*.test.ts'

# Mission Control tests (Bun test runner)
# Run from packages/mission-control/:
bun test
```

**Assertion Library:**
- Mission Control: `expect` from `bun:test` (Jest-compatible API)
- GSD extension `.test.mjs`: `assert` from `node:assert/strict`
- GSD extension `.test.ts`: custom hand-rolled `assert(condition, message)` and `assertEq(actual, expected, message)` helpers

## Test File Organization

**Mission Control tests:**
- Location: `packages/mission-control/tests/` — separate top-level directory, not co-located with source
- Naming: `{feature-name}.test.ts` or `{feature-name}.test.tsx` (`.tsx` for component tests)
- Examples: `session-manager.test.ts`, `chat-integration.test.ts`, `active-task.test.tsx`

**GSD extension tests:**
- Location: `src/resources/extensions/gsd/tests/` — co-located with extension source in a `tests/` subdirectory
- Naming: `{feature-name}.test.ts` or `{feature-name}.test.mjs`
- Examples: `derive-state.test.ts`, `parsers.test.ts`, `auto-supervisor.test.mjs`

**Root-level integration tests:**
- Location: `src/tests/`
- Naming: `{feature-name}.test.ts`
- Examples: `app-smoke.test.ts`, `provider.test.ts`

```
packages/mission-control/
├── src/                   # source
└── tests/                 # all MC tests here
    ├── active-task.test.tsx
    ├── session-manager.test.ts
    └── ...

src/
├── resources/extensions/gsd/
│   ├── state.ts
│   ├── files.ts
│   └── tests/
│       ├── derive-state.test.ts
│       └── ...
└── tests/
    └── app-smoke.test.ts
```

## Test Structure

**Mission Control — bun:test pattern:**
```typescript
/**
 * Module-level JSDoc describing what this test file covers.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("FeatureName", () => {
  let subject: SubjectType;

  beforeEach(async () => {
    // setup
  });

  afterEach(async () => {
    // cleanup (always fires even if test fails)
  });

  test("action description with expected outcome", () => {
    expect(result).toBe(expected);
  });
});
```

**GSD Extension — hand-rolled pattern:**
```typescript
import { mkdtempSync, rmSync } from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else { failed++; console.error(`  FAIL: ${message}`); }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// Groups use labelled console.log headers
console.log('\n=== test group name ===');
{
  const base = createFixtureBase();
  try {
    const result = await functionUnderTest(base);
    assertEq(result.field, expected, 'description');
  } finally {
    cleanup(base); // always runs
  }
}

// Results summary at end
if (failed > 0) process.exit(1);
```

**Patterns:**
- Setup: `beforeEach` creates isolated temp directories via `mkdtemp`/`mkdtempSync`
- Teardown: `afterEach` cleans up with `rm(..., { recursive: true, force: true })` — errors suppressed
- All filesystem fixture work uses OS temp dir (`tmpdir()`) for isolation
- Test names describe behavior: `"createSession rejects when 4 sessions already exist"`, not `"test session limit"`

## Mocking

**Framework:** `mock` from `bun:test` (used sparingly)

**Patterns:**

```typescript
// Dependency injection via factory function — preferred over module mocking
const mgr = new SessionManager(tempDir, {
  processFactory: (cwd: string) => createMockPM(cwd),
});

// Inline mock factory — returns object literal implementing interface
function createMockPM(cwd: string) {
  return {
    cwd,
    _isProcessing: false,
    _killed: false,
    async start() { this._started = true; },
    async kill() { this._killed = true; killCalls.push(cwd); },
    onEvent(handler: (event: unknown) => void) { this.eventHandlers.push(handler); },
  };
}
```

```typescript
// Cast to any for internal state inspection
expect((s1.processManager as any)._killed).toBe(true);
```

**What to Mock:**
- External process spawning (`ClaudeProcessManager`) — always inject via factory
- File system operations: use real `tmpdir()` fixtures, not mocks
- Network (WebSocket server): start real Bun server on test-specific port, connect real WebSocket client

**What NOT to Mock:**
- File system I/O — use real temp directories; this is consistently the pattern throughout the codebase
- Pure functions — test them directly without any mocking
- WebSocket protocol — integration tests start a real `startPipeline()` instance with a unique port

## Fixtures and Factories

**Temp directory fixtures:**
```typescript
// Standard fixture setup (Mission Control — async)
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "session-mgr-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

// Standard fixture setup (GSD extension — sync)
function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-state-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}
// Always used in try/finally
```

**File content fixtures:**
- Markdown content written inline as template literals — no external fixture files
- `writeFileSync`/`writeFile` used to create `.md` files in temp dirs
- Each test group creates its own fixture base for isolation

**Location:** No shared fixture directory — all fixtures are created inline within test files.

## Coverage

**Requirements:** No coverage threshold enforced — no `--coverage` flag in test script

**View Coverage:**
```bash
# Not configured — add --coverage flag to test command if needed
bun test --coverage
```

## Test Types

**Unit Tests (pure functions):**
- Scope: Single function tested in isolation
- Pattern: Import function, call with literal inputs, assert on return value
- Examples: `chat-router.test.ts` (isGsdCommand, routeMessage), `reconnect.test.ts` (calculateBackoffDelay, shouldProcessMessage), `design-tokens.test.ts`

**Integration Tests (stateful / I/O):**
- Scope: A class or module that interacts with filesystem, process spawning, or WebSocket
- Pattern: Create real temp dir, instantiate real class with injectable dependencies, assert on side effects
- Examples: `session-manager.test.ts`, `pipeline-perf.test.ts`, `server.test.ts`

**Component Tests (React):**
- Scope: React component rendered as a plain function call — no DOM/JSDOM
- Pattern: Call component function directly, `JSON.stringify(result)` the React element tree, assert on presence of strings/class names
- Framework: `bun:test` with `happy-dom` (declared as devDependency, used for module environment)
- Examples: `active-task.test.tsx`, `panel-states.test.tsx`, `layout.test.tsx`

**Performance Tests:**
- Scope: Verify synchronous operations complete within time budgets
- Pattern: `performance.now()` wrapping the operation, `expect(elapsed).toBeLessThan(N)`
- Examples: `session-perf.test.ts` (< 800ms first render, < 50ms synchronous derivation), `pipeline-perf.test.ts` (< 200ms file-to-WS latency)

**E2E Tests:**
- `server.test.ts` spawns the real Bun server process via `Bun.spawn`, polls until ready, then issues real HTTP requests

## Common Patterns

**Async Testing:**
```typescript
// Promise-based wait for WebSocket message
const msg = await new Promise<any>((resolve) => {
  ws.onmessage = (event) => resolve(JSON.parse(event.data as string));
  setTimeout(() => resolve(null), 5000); // timeout sentinel
});
expect(msg).not.toBeNull();
```

**Error/Edge-case Testing:**
```typescript
// Verify throwing behavior
expect(() => mgr.createSession("/repo")).toThrow(/maximum.*4/i);

// Verify graceful null return
const result = CheckpointRef({ checkpoint: undefined });
expect(result).toBeNull();
```

**Component JSON Inspection:**
```typescript
// Direct component call + JSON.stringify — no render/DOM needed
const result = TaskExecuting({ taskId: "05-02", wave: 1, ... });
const json = JSON.stringify(result);
expect(json).toContain("bg-status-warning");
expect(json).toContain("animate-pulse");
// Note: React mixed children serialize as arrays: ["Wave ",2]
expect(json).toContain('"Wave ",2]');
```

**Requirement ID in Test Names (Mission Control):**
```typescript
// Test names reference requirement IDs for traceability
it("SERV-01: starts and responds with HTML on :4000", async () => { ... });
it("MONO-01: mission-control package.json exists with correct name", async () => { ... });
```

---

*Testing analysis: 2026-03-12*
