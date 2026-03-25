# Codebase Concerns

**Analysis Date:** 2026-03-12

---

## Tech Debt

**Worktree "merge" action is a stub:**
- Issue: `closeSessionWithWorktree("merge")` falls through to delete behavior with a warning. The merge branch into main workflow is explicitly deferred.
- Files: `packages/mission-control/src/server/session-manager.ts` lines 161–183
- Impact: The UI offers a "merge" option that silently deletes instead. Users have no indication the merge did not occur. Git history is permanently lost on close.
- Fix approach: Implement `git merge session/<slug>` into the default branch before removing the worktree. Requires handling conflicts and detecting current branch.

**Config settings not bridged to server-side process managers:**
- Issue: `config.json` fields `worktree_enabled`, `skip_permissions`, and `model_profile` are stored and surfaced in the settings UI, but the server never reads them to configure `ClaudeProcessManager` or `SessionManager` at session-creation time. `setWorktreeEnabled` exists on `SessionManager` but is never called from `pipeline.ts`. `skipPermissions` option exists on `ClaudeProcessManager` but is hardwired to "skip unless explicitly false" — the config value is ignored.
- Files: `packages/mission-control/src/server/pipeline.ts`, `packages/mission-control/src/server/session-manager.ts` line 71, `packages/mission-control/src/server/claude-process.ts` lines 107–109
- Impact: Setting `skip_permissions: false` in the UI or `worktree_enabled: true` has no effect on the running server — new sessions always skip permissions and never use worktrees unless the code is changed. Users cannot act on the UI toggles.
- Fix approach: In `startPipeline`, read `currentState.config` after initial build and pass `skipPermissions` and `worktreeEnabled` to the process factory and session manager. Re-read on project switch.

**Duplicate `MAX_SESSIONS` constant:**
- Issue: `MAX_SESSIONS = 4` is defined independently in both `packages/mission-control/src/server/session-manager.ts` (line 57) and `packages/mission-control/src/components/chat/SessionTabs.tsx` (line 21). They can drift.
- Files: `packages/mission-control/src/server/session-manager.ts`, `packages/mission-control/src/components/chat/SessionTabs.tsx`
- Impact: A developer who changes one will silently break the UI guard or the server guard. Already diverged once if they differ.
- Fix approach: Export `MAX_SESSIONS` from a shared types module and import in both places.

**`readFileJson` uses untyped `any`:**
- Issue: `state-deriver.ts` defines `readFileJson` returning `Promise<any | null>`. The config.json is then cast directly to `ConfigState` without validation.
- Files: `packages/mission-control/src/server/state-deriver.ts` line 75, lines 364–366
- Impact: A malformed or partially-written `config.json` (e.g., from a concurrent write) will silently pass corrupt data into `PlanningState` with no parse error.
- Fix approach: Add a Zod schema or manual field validation for `ConfigState`. Return `DEFAULT_CONFIG_STATE` on validation failure.

**`nul/` directory in repository:**
- Issue: An empty directory named `nul` exists at `packages/mission-control/nul/`. On Windows, `nul` is a reserved device name and cannot be used safely as a path component in many contexts.
- Files: `packages/mission-control/nul/`
- Impact: Potential confusion for Windows tooling. May have been created by a Windows path resolution bug. Should not exist.
- Fix approach: Remove the directory. Investigate what created it (likely a Windows path normalization bug in a previous tool or script).

---

## Known Bugs

**Auto-naming uses stale message buffer for rename:**
- Symptoms: After `chat_complete`, the auto-naming logic reads `current.messagesBySession` from `stateRef.current`, which is the pre-event state. The last `chat_complete` event itself already called `routeChatComplete` which updates `setMessagesBySession` via `setState`, but `stateRef.current` still points to the old state object because React state updates are asynchronous. The rename derives the session name from the previous cycle's first user message, not the updated one.
- Files: `packages/mission-control/src/hooks/useSessionManager.ts` lines 380–396
- Trigger: Occurs on the very first chat completion in a "Chat N"-named session.
- Workaround: In practice this often works because the user message was already in the previous state snapshot; it fails if the first completion immediately follows a session reset.

**Single `activeClient` per session — second browser tab loses chat events:**
- Symptoms: Each `SessionState` holds a single `activeClient: ServerWebSocket | null`. When a second browser tab connects and sends a chat message, it overwrites `session.activeClient`. The first tab then receives no `chat_complete` or `chat_event` messages.
- Files: `packages/mission-control/src/server/session-manager.ts` line 32, `packages/mission-control/src/server/pipeline.ts` lines 98, 115, 117, 223
- Trigger: Opening Mission Control in two browser tabs and sending a message from the second tab.
- Workaround: Use one browser tab per project. Not a concern for the intended single-user desktop use case but blocks multi-window setups.

**`useReconnectingWebSocket` fires infinite reconnect if URL is permanently invalid:**
- Symptoms: On `ws.onclose`, the hook increments `attemptRef.current` and schedules `connect()` with exponential backoff. If the server is intentionally stopped (e.g., dev server killed), reconnect attempts continue indefinitely and never stop, accumulating unresolved timers.
- Files: `packages/mission-control/src/hooks/useReconnectingWebSocket.ts` lines 106–111
- Trigger: Stopping the Bun server while the UI is open.
- Workaround: The max backoff cap of 30 seconds limits resource use. Not a crash, but timers accumulate until the component unmounts.

**`useChatMode` uses fixed 2-second reconnect delay with no backoff:**
- Symptoms: `useChatMode` manages its own raw WebSocket with a hardcoded `setTimeout(connect, 2000)` reconnect — no exponential backoff, no max retries. Under a flapping connection this will hammer the server at 2-second intervals.
- Files: `packages/mission-control/src/hooks/useChatMode.tsx` lines 96–101
- Trigger: Repeated disconnects of the WebSocket server.
- Workaround: Low severity for typical local use.

**`eslint-disable-next-line react-hooks/exhaustive-deps` suppresses missing dependency:**
- Symptoms: In `AppShell.tsx`, a `useEffect` that tracks `chatModeState.mode` for review view auto-switching deliberately omits `activeView` from its dependency array. Stale closure risk if `activeView` changes concurrently with a mode change.
- Files: `packages/mission-control/src/components/layout/AppShell.tsx` line 110
- Trigger: Race between mode event and user navigation; very edge-case.

---

## Security Considerations

**`--dangerously-skip-permissions` is on by default:**
- Risk: `ClaudeProcessManager` adds `--dangerously-skip-permissions` to every `claude` invocation unless `options.skipPermissions` is explicitly `false`. Because the config bridge is broken (see Tech Debt), this flag cannot be disabled via the UI.
- Files: `packages/mission-control/src/server/claude-process.ts` lines 107–109
- Current mitigation: App is localhost-only, single-user. The flag is intentional for the GSD workflow.
- Recommendations: Complete the config bridge so `skip_permissions: false` in `config.json` actually passes `skipPermissions: false` to the process manager. Document explicitly that this flag grants Claude full filesystem and shell access.

**Wildcard CORS (`Access-Control-Allow-Origin: *`) on all API routes:**
- Risk: `server.ts` adds `Access-Control-Allow-Origin: *` to every API response. Any webpage loaded in the user's browser can make requests to `http://localhost:4000/api/project/switch` and redirect Mission Control to an attacker-controlled directory.
- Files: `packages/mission-control/src/server.ts` lines 153–157
- Current mitigation: Comment acknowledges "same-origin in practice." Attack surface is localhost-only and requires the user to visit a malicious page while Mission Control is running.
- Recommendations: Restrict CORS to `http://localhost:4000` instead of `*`. The comment "defensive" is misleading — `*` is the opposite of defensive.

**Dev-server proxy strips `Content-Security-Policy` and `X-Frame-Options`:**
- Risk: The live preview proxy at `/api/preview/*` deletes `X-Frame-Options` and `Content-Security-Policy` from proxied responses so they load in the iframe. If the proxied app itself sets these headers for a reason (e.g., it serves authenticated content), the protections are silently removed.
- Files: `packages/mission-control/src/server/proxy-api.ts` lines 72–73
- Current mitigation: Only affects apps running on localhost that Claude itself started.
- Recommendations: Document clearly. Consider a per-project opt-out if apps need CSP preserved.

**No authentication on WebSocket server (port 4001):**
- Risk: `ws-server.ts` listens on all interfaces on port 4001 with no authentication. Any process on the local machine — or any machine on the same LAN — can connect and send `session_create`, `session_close`, or `chat` messages.
- Files: `packages/mission-control/src/server/ws-server.ts`
- Current mitigation: Intended as a localhost app. Not exposed externally.
- Recommendations: Bind explicitly to `127.0.0.1` rather than `0.0.0.0`. Add a simple shared-secret handshake for the chat protocol.

**`/api/project/switch` accepts arbitrary filesystem paths:**
- Risk: `POST /api/project/switch` with `{ path: "/etc" }` causes the pipeline to call `buildFullState("/etc/.planning")` — which will silently return empty/default state but also perform a `git rev-parse` in `/etc`. The directory access check (`await access(projectPath)`) confirms existence but does not validate the path is within expected project roots.
- Files: `packages/mission-control/src/server.ts` lines 88–138
- Current mitigation: Same-origin CORS issue above limits who can call this. Only matters if CORS is tightened without also adding path validation.
- Recommendations: Validate the target path starts within allowed roots (e.g., user home directory).

---

## Performance Bottlenecks

**`buildFullState` uses synchronous `readdirSync` inside async parsing:**
- Problem: `parseAllPhases` in `state-deriver.ts` calls `readdirSync` (sync) inside an async loop that is otherwise Promise-based.
- Files: `packages/mission-control/src/server/state-deriver.ts` lines 155, 173, 242, 252
- Cause: Inconsistent sync/async mixing. `readdirSync` blocks the event loop while scanning phase directories.
- Improvement path: Replace all `readdirSync` calls with `await readdir` (async). Low priority for small `.planning/` directories but will become noticeable as phase counts grow.

**State reconciliation rebuilds full state every 5 seconds:**
- Problem: `pipeline.ts` runs `buildFullState` on a 5-second interval regardless of whether files changed.
- Files: `packages/mission-control/src/server/pipeline.ts` lines 318–330
- Cause: Defense against file-watcher miss events. Each rebuild re-reads all phase files from disk.
- Improvement path: Track a file-system mtime fingerprint and skip rebuild when unchanged. Or increase the interval — 5s may be aggressive for projects with 50+ plan files.

**`Map` cloning on every WebSocket chat event:**
- Problem: `useSessionManager`'s `handleMessage` clones `messagesBySession` and `processingBySession` Maps on every streaming `chat_event`. For long Claude responses this is O(N * M) allocations where N = message count and M = event frequency.
- Files: `packages/mission-control/src/hooks/useSessionManager.ts` lines 368–371, and `routeChatEvent` pure function lines 74–109
- Cause: Immutable state pattern applied to Maps. Each chunk clone creates two new Map objects.
- Improvement path: Use `useReducer` with a single dispatch, or accumulate streaming text in a ref and flush on `chat_complete`. Low priority until sessions accumulate hundreds of messages.

---

## Fragile Areas

**`wireSessionEvents` called multiple times on the same session after restart:**
- Files: `packages/mission-control/src/server/pipeline.ts` lines 93–164, 167–169, 243–244
- Why fragile: `wireSessionEvents` calls `session.processManager.onEvent(handler)` which pushes to `ClaudeProcessManager.eventHandlers`. If called twice on the same session (e.g., due to a restart or reconnect), the handler array grows and each event fires twice, duplicating all chat responses.
- Safe modification: Guard with a `wired` flag on `SessionState` before calling. Check that `onEvent` is idempotent or clear handlers before re-wiring.
- Test coverage: No test validates handler multiplicity.

**`switchProject` does not stop the reconciliation interval before rebuilding state:**
- Files: `packages/mission-control/src/server/pipeline.ts` lines 364–445
- Why fragile: `switchProject` closes the file watcher and all sessions, then builds state for the new project. Meanwhile the `reconcileInterval` (setInterval every 5s) is still running and may fire during the switch, calling `buildFullState(oldPlanningDir)` or reading stale closure state. The `planningDir` closure variable is reassigned mid-switch, creating a race.
- Safe modification: Pause or cancel the reconcile interval before switching, restart it after the new watcher is established.
- Test coverage: `switch-guard.ts` is tested, but the interval race is not covered.

**`stateRef` in `useSessionManager` is updated via `useEffect` — one render behind:**
- Files: `packages/mission-control/src/hooks/useSessionManager.ts` lines 288–291
- Why fragile: `stateRef.current` is kept in sync via a `useEffect`, which runs after the render cycle. `handleMessage` reads from `stateRef.current`, so during the commit phase after a rapid state update, the ref may lag by one render. This is the root pattern that caused the auto-naming bug described above.
- Safe modification: Replace the `getState`/`stateRef` approach with a single `useReducer` so state reads are always from the dispatch closure.
- Test coverage: Pure function tests (`routeChatEvent`, etc.) do not cover the React stale-ref scenario.

**Regex-based XML parsing in `mode-interceptor.ts` is fragile under unexpected Claude output:**
- Files: `packages/mission-control/src/server/mode-interceptor.ts`
- Why fragile: The mode interceptor parses custom XML tags from Claude's streaming text using regex and manual string slicing. Any attribute order change in a `<decision>` or `<question>` tag (e.g., Claude emitting `answer` before `area`) will silently fail to parse — `parseQuestionBlock` returns `null` and the question card is dropped.
- Safe modification: Use attribute-order-insensitive extraction. `extractAttr` is already order-insensitive, but `parseQuestionBlock` requires the opening tag regex to match the full attributes string in one shot.
- Test coverage: `tests/mode-interceptor.test.ts` covers known tag orders but may not cover all attribute permutations.

**Session metadata persistence uses `writeFileSync` on the main thread:**
- Files: `packages/mission-control/src/server/session-manager.ts` lines 252–269, `packages/mission-control/src/server/session-persistence-api.ts` line 77
- Why fragile: Both metadata files are written synchronously (`writeFileSync`) in response to state changes. Since Bun runs on a single event loop thread, these sync writes block the loop. Under high-frequency session operations (rapid create/close), multiple sync writes can pile up and cause visible latency in WebSocket message delivery.
- Safe modification: Use async `writeFile` with a mutex or debounce to avoid concurrent writes and event loop blocking.
- Test coverage: Tests rely on synchronous write behavior; migrating to async would require updating test patterns.

---

## Scaling Limits

**Hard cap of 4 concurrent sessions:**
- Current capacity: 4 sessions per project (`MAX_SESSIONS = 4` in server and client).
- Limit: `ClaudeProcessManager` spawns a new `claude` process per message. At 4 sessions all actively processing, 4 Claude processes run concurrently — each consuming significant CPU and memory (model inference via Claude CLI).
- Scaling path: Make `MAX_SESSIONS` configurable. Consider process pooling if Claude supports it. Current limit is reasonable for a desktop app.

**In-memory message buffers grow unboundedly per session:**
- Current capacity: `messagesBySession` Map in `useSessionManager` holds all messages ever sent in a session. Server-side chat history is capped at 50 messages per session in `session-persistence-api.ts`, but the in-memory React state has no cap.
- Limit: Sessions with very long conversations (hundreds of tool use events) will accumulate large Maps in browser memory. Each streaming event clones the full Map.
- Scaling path: Cap in-memory messages at a rolling window (e.g., last 200). Match the server-side cap of 50 in the UI.

---

## Dependencies at Risk

**No TypeScript compiler — relies on Bun's type stripping:**
- Risk: `packages/mission-control/` has no `tsc` in scripts and no `tsconfig.json` strict-mode enforcement visible in `devDependencies`. Type errors are caught only by IDE/editor tooling, not in CI.
- Impact: Type regressions can ship silently.
- Migration plan: Add `bun run tsc --noEmit` to the test/CI script to surface type errors.

**`bun-plugin-tailwind` is at `^0.1.2` — pre-stable:**
- Risk: The `0.x` version range indicates breaking changes may occur without major bump.
- Impact: CSS build may break on routine `bun update`.
- Migration plan: Pin to exact version or monitor for 1.0 release.

**`react-resizable-panels ^4.7.2` is a major version jump risk:**
- Risk: At `^4`, any `5.x` release (if semver is bumped) would be excluded, but the API surface is large and the component is used throughout the panel layout.
- Impact: Panel resize behavior and persistence tied to this library's API.
- Migration plan: Low risk at current pinning — monitor for breaking changes when upgrading.

---

## Missing Critical Features

**Worktree feature not wired to config at runtime:**
- Problem: `worktree_enabled: true` is set in `.planning/config.json` and visible in the Settings UI, but `SessionManager.setWorktreeEnabled` is never called from `pipeline.ts`. New sessions are created without worktrees regardless of config.
- Blocks: Multi-session branch isolation — the marquee feature of v2.0 milestone.

**No error boundary in the React tree:**
- Problem: No `ErrorBoundary` component wraps any part of the component tree. An unhandled error in a component (e.g., malformed chat message rendering) will crash the entire UI to a white screen.
- Files: `packages/mission-control/src/components/layout/AppShell.tsx`, top-level render
- Blocks: Production reliability. Any component render error is unrecoverable without a page refresh.

**No structured logging — all diagnostics via `console.*`:**
- Problem: The server uses 41 raw `console.log/warn/error` calls across server files. There is no log level control, no structured format, and no way to suppress debug noise in production.
- Files: `packages/mission-control/src/server/claude-process.ts` (debug stdout dumps on first 5 chunks), `packages/mission-control/src/server/pipeline.ts`, etc.
- Blocks: Production observability. Debug output from `claude-process.ts` (first 5 chunks of Claude stdout) runs on every message.

---

## Test Coverage Gaps

**`pipeline.ts` has no direct integration tests:**
- What's not tested: `switchProject` concurrency race (reconcile interval during switch), `wireSessionEvents` double-call guard, the full request-to-response path through `onChatMessage`.
- Files: `packages/mission-control/src/server/pipeline.ts`
- Risk: Changes to session wiring or project switching could silently break multi-session routing.
- Priority: High

**React hooks with stale-closure patterns are untested at the hook level:**
- What's not tested: `useSessionManager` stale-ref behavior, `useChatMode` reconnect loop, `useReconnectingWebSocket` cleanup on unmount with pending timers.
- Files: `packages/mission-control/src/hooks/useSessionManager.ts`, `packages/mission-control/src/hooks/useChatMode.tsx`, `packages/mission-control/src/hooks/useReconnectingWebSocket.ts`
- Risk: The stale-ref pattern (identified under Fragile Areas) cannot be caught by pure function tests alone; it requires React Testing Library hook tests.
- Priority: High

**No tests for `proxy-api.ts`:**
- What's not tested: Header stripping, offline fallback, error handling.
- Files: `packages/mission-control/src/server/proxy-api.ts`
- Risk: CORS header stripping regression or unexpected 500 errors on unreachable dev servers.
- Priority: Medium

**`settings-api.ts` path injection not tested:**
- What's not tested: Malformed `planningDir` passed to `saveSettings` when `tier === "project"`.
- Files: `packages/mission-control/src/server/settings-api.ts`
- Risk: Path traversal or write to unintended directory on malformed input.
- Priority: Medium

---

*Concerns audit: 2026-03-12*
