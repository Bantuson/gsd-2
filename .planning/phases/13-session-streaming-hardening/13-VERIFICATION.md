---
phase: 13-session-streaming-hardening
verified: 2026-03-13T10:45:00Z
status: human_needed
score: 16/16 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 15/16
  gaps_closed:
    - "Pressing Escape while auto mode is active causes processManager.interrupt() to be called on the target session"
    - "session_interrupt WebSocket message is routed through onSessionAction callback, not silently dropped"
    - "pipeline.ts onSessionAction switch handles 'session_interrupt' and calls sessionManager.getSession(sessionId)?.processManager.interrupt()"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Start /gsd auto, observe EXECUTING badge appears, then press Escape"
    expected: "gsd process receives SIGINT, auto mode stops, EXECUTING badge disappears, chat history preserved"
    why_human: "Requires live gsd binary installed; automated tests verified the routing path up to processManager.interrupt() but cannot simulate real SIGINT delivery end-to-end"
  - test: "Close and reopen browser tab within 30 seconds during an active session"
    expected: "App reconnects with exponential backoff, chat history and task panel restored from .gsd/ files"
    why_human: "Real WebSocket lifecycle requires a running server"
  - test: "Observe the cost badge while a session accumulates cost_update events"
    expected: "Cyan '$X.XX' badge appears in task status bar header, turning amber at 80% budget and red at 95%"
    why_human: "Requires live gsd process emitting cost_update events"
  - test: "Start /gsd auto and observe the streaming output in the chat panel"
    expected: "Phase transition divider cards appear with amber diamond PHASE label; tool_use cards show tool name with spinner; plain text shows as normal chat bubbles"
    why_human: "Requires live gsd binary"
---

# Phase 13: Session Streaming Hardening — Verification Report

**Phase Goal:** The Pi SDK stream is fully parsed, resilient to malformed input, and surfaces cost/token data and auto mode phase transitions to the user in real time — with WebSocket reconnect and process lifecycle handled cleanly.

**Verified:** 2026-03-13T10:45:00Z
**Status:** human_needed (all automated checks passed — gap from previous verification is closed)
**Re-verification:** Yes — after gap closure plan 13-07 fixed session_interrupt WebSocket routing

---

## Re-verification Summary

The previous verification (2026-03-13T10:00:00Z) found 15/16 truths with 1 blocker gap: `session_interrupt` was sent by the client but silently dropped by the server because `ws-server.ts` had no handler for it.

Plan 13-07 closed that gap with two commits:
- `f2037a2` — Added `{ type: "session_interrupt"; sessionId: string }` as the 5th variant to the `SessionAction` union, and added `parsed.type === "session_interrupt"` to the message routing OR-chain in `ws-server.ts`. Also added 2 regression tests in `session-ws.test.ts`.
- `aaa6a66` — Added `case "session_interrupt"` to the `onSessionAction` switch in `pipeline.ts`, calling `interruptSession.processManager.interrupt()` with a session null-guard.

Full test suite result after gap closure: **580 pass, 0 fail** (was 578 before the 2 new tests).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GSD2StreamEvent discriminated union (8 variants) exported from chat-types.ts | VERIFIED | `chat-types.ts` lines 168-176; 8 kind variants with discriminant |
| 2 | classifyPiSdkEvent() maps raw JSON to GSD2StreamEvent, never throws on unknown shapes | VERIFIED | `ndjson-parser.ts` lines 17-75; default returns null; 12 tests in pi-sdk-classifier.test.ts |
| 3 | Malformed/truncated JSON chunk returns null from parseNdjsonLine, stream continues | VERIFIED | `ndjson-parser.ts` lines 81-88; try/catch returns null |
| 4 | ClaudeProcessManager.interrupt() sends SIGINT, no-op if no active process | VERIFIED | `claude-process.ts` lines 211-214; 7 tests in process-lifecycle.test.ts |
| 5 | process_crashed event emitted when process exits non-zero after producing output | VERIFIED | `claude-process.ts` lines 175-184; distinct from no-output error path |
| 6 | SessionManager.killAll() kills all registered sessions | VERIFIED | `session-manager.ts` lines 156-159; SIGTERM/SIGINT handlers in server.ts lines 153-161 call `pipeline.sessionManager.killAll()` |
| 7 | WebSocket reconnect sends 'refresh' to trigger full state re-derive | VERIFIED | `usePlanningState.ts` handleReconnect() sends "refresh"; `useReconnectingWebSocket.ts` isReconnect() + onReconnect callback |
| 8 | ChatView shows crash recovery banner when isCrashed=true | VERIFIED | `ChatView.tsx` lines 226-250; amber role="alert" banner with Reconnect button |
| 9 | Running cost badge in chat header updates on cost_update events | VERIFIED | `ChatView.tsx` lines 273-292; `useCostTracker.ts` computeCostState() + useCostTracker(); 7 tests pass |
| 10 | Budget warning at 80% (amber) and 95% (red/banner) | VERIFIED | `ChatView.tsx` lines 297-317; computeCostState() level logic; budget warning banner at critical |
| 11 | EXECUTING badge in chat header while /gsd auto is running | VERIFIED | `ChatView.tsx` renders badge in all 3 header variants when isAutoMode=true |
| 12 | Phase transition events insert divider cards in chat | VERIFIED | `ChatPanel.tsx` routes role=phase_transition to PhaseTransitionCard; `applyGSD2Event` inserts messageInsert |
| 13 | tool_use events render as structured cards | VERIFIED | `ChatPanel.tsx` routes role=tool_use to ToolUseCard; ToolUseCard shows name + spinner/done |
| 14 | Pressing Escape while auto mode active calls interrupt() on process | VERIFIED | Client: `useSessionManager.ts` line 634 sends `{ type: "session_interrupt", sessionId }`. Server: `ws-server.ts` line 122 routes to `onSessionAction`. `pipeline.ts` line 302 `case "session_interrupt"` calls `interruptSession.processManager.interrupt()`. 2 new regression tests in session-ws.test.ts pass (9/9 session-ws tests green). |
| 15 | All Phase 13 props wired from useSessionManager through AppShell to ChatView | VERIFIED | AppShell.tsx lines 63-68 destructures isAutoMode/isCrashed/costState/interrupt/resetCrash; passes all through SingleColumnView to ChatViewConnected |
| 16 | SessionManager.killAll() called on SIGTERM/SIGINT | VERIFIED | `server.ts` lines 152-161 register cleanup() that calls `pipeline.sessionManager.killAll()` |

**Score: 16/16 truths verified**

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/mission-control/src/server/chat-types.ts` | VERIFIED | GSD2StreamEvent, GSD2EventType, PiSdkCostData, PiSdkPhaseTransition all exported |
| `packages/mission-control/src/server/ndjson-parser.ts` | VERIFIED | classifyPiSdkEvent exported; all 8 variants + null returns |
| `packages/mission-control/tests/pi-sdk-classifier.test.ts` | VERIFIED | 12 substantive TDD tests covering all variants + edge cases |
| `packages/mission-control/src/server/claude-process.ts` | VERIFIED | interrupt() method at line 211; process_crashed branch at line 175 |
| `packages/mission-control/src/server/session-manager.ts` | VERIFIED | IProcessManager.interrupt() at line 27; killAll() at lines 156-159 |
| `packages/mission-control/tests/process-lifecycle.test.ts` | VERIFIED | 7 substantive tests for interrupt/crash/killAll |
| `packages/mission-control/src/hooks/useReconnectingWebSocket.ts` | VERIFIED | isReconnect() exported; onReconnect option wired in ws.onopen |
| `packages/mission-control/src/components/views/ChatView.tsx` | VERIFIED | isCrashed banner, costState badge, isAutoMode badge, Escape useEffect |
| `packages/mission-control/src/hooks/useCostTracker.ts` | VERIFIED | computeCostState() + useCostTracker() exported |
| `packages/mission-control/tests/cost-tracker.test.ts` | VERIFIED | 7 substantive tests for computeCostState |
| `packages/mission-control/src/hooks/useSessionManager.ts` | VERIFIED | applyGSD2Event, isAutoMode, isCrashed, costState, interrupt, resetCrash |
| `packages/mission-control/tests/auto-mode-indicators.test.ts` | VERIFIED | 5 tests for applyGSD2Event state machine |
| `packages/mission-control/src/components/chat/PhaseTransitionCard.tsx` | VERIFIED | Amber divider with phase name |
| `packages/mission-control/src/components/chat/ToolUseCard.tsx` | VERIFIED | Bordered mono card with tool name, pulse animation, done checkmark |
| `packages/mission-control/src/components/chat/ChatPanel.tsx` | VERIFIED | Imports and routes phase_transition + tool_use to card components |
| `packages/mission-control/src/components/layout/AppShell.tsx` | VERIFIED | All Phase 13 props destructured and passed through SingleColumnView |
| `packages/mission-control/src/server/server.ts` | VERIFIED | SIGTERM/SIGINT cleanup handler calls pipeline.sessionManager.killAll() |
| `packages/mission-control/src/server/ws-server.ts` | VERIFIED | SessionAction union now has 5 variants (was 4, added session_interrupt at line 18); message() handler routes all 5 including session_interrupt at line 122 |
| `packages/mission-control/src/server/pipeline.ts` | VERIFIED | onSessionAction switch has 5 cases; session_interrupt at lines 302-311 calls processManager.interrupt() with null-guard |
| `packages/mission-control/tests/session-ws.test.ts` | VERIFIED | 2 new tests added: "session_interrupt action dispatches to onSessionAction" and "session_interrupt without handler does not throw"; 9/9 session-ws tests pass |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ndjson-parser.ts | chat-types.ts | import GSD2StreamEvent | WIRED | Line 10 imports GSD2StreamEvent, PhaseTransitionPhase |
| session-manager.ts | claude-process.ts | IProcessManager + killAll iterates sessions | WIRED | killAll() at line 156 calls processManager.kill() on each session |
| claude-process.ts | event handlers | process_crashed event type | WIRED | Lines 175-184 emit {type: "process_crashed"} to all handlers |
| useReconnectingWebSocket.ts | ws-server.ts | sends "refresh" on reconnect | WIRED | usePlanningState handleReconnect() sends "refresh" string; ws-server.ts lines 92-103 handle "refresh" |
| ChatView.tsx | useSessionManager | isCrashed prop drives banner | WIRED | AppShell → SingleColumnView → ChatViewConnected passes isCrashed prop |
| useCostTracker.ts | GSD2StreamEvent cost_update | addCostEvent accumulates total_cost_usd | WIRED | useSessionManager lines 446-448 call addCostEvent(classified.total_cost_usd) |
| ChatView.tsx | useCostTracker | costState prop from AppShell | WIRED | AppShell destructures costState from useSessionManager, passes through |
| AppShell.tsx | useSessionManager | destructures isAutoMode, isCrashed, costState, interrupt | WIRED | AppShell.tsx lines 63-68 |
| server.ts | SessionManager.killAll | process.on('SIGTERM') and process.on('SIGINT') | WIRED | server.ts lines 153-161 cleanup() calls pipeline.sessionManager.killAll() |
| useSessionManager.ts | ws-server.ts | WebSocket send { type: "session_interrupt", sessionId } | WIRED | useSessionManager line 634; ws-server.ts line 122 routes to onSessionAction — gap closed by commit f2037a2 |
| ws-server.ts | pipeline.ts | onSessionAction callback with session_interrupt | WIRED | ws-server.ts line 125 calls onSessionAction(parsed as SessionAction, ws); pipeline.ts line 302 case "session_interrupt" — gap closed by commit aaa6a66 |
| pipeline.ts | claude-process.ts | sessionManager.getSession(sessionId)?.processManager.interrupt() | WIRED | pipeline.ts lines 303-306; null-guard on getSession result before calling interrupt() |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STREAM-01 | 13-01 | Pi SDK event parser handles all 8 event shapes | SATISFIED | GSD2StreamEvent union in chat-types.ts; classifyPiSdkEvent in ndjson-parser.ts; 12 tests pass |
| STREAM-02 | 13-01 | Stream parser resilient — malformed chunks skipped, never crash | SATISFIED | parseNdjsonLine try/catch returns null; classifyPiSdkEvent returns null for unknown/malformed |
| STREAM-03 | 13-02, 13-06, 13-07 | Process lifecycle — graceful shutdown, crash recovery, orphan prevention | SATISFIED | interrupt() wired end-to-end (Escape → WS → ws-server → pipeline → processManager.interrupt()); killAll() wired to SIGTERM/SIGINT; crash event emitted — gap closed by 13-07 |
| STREAM-04 | 13-03, 13-06 | WebSocket reconnect with exponential backoff | SATISFIED | calculateBackoffDelay() + useReconnectingWebSocket backoff; reconnect tests pass |
| STREAM-05 | 13-03, 13-06 | On reconnect, full state re-derived from .gsd/ files | SATISFIED | usePlanningState sends "refresh" on reconnect; ws-server handles "refresh" by calling getFullState() |
| STREAM-06 | 13-04, 13-06 | Cost badge, budget warnings at 80%/95% | SATISFIED | computeCostState() + useCostTracker() + ChatView badge/banner; wired through AppShell |
| STREAM-07 | 13-05, 13-06, 13-07 | EXECUTING badge, phase announcements, Escape interrupt | SATISFIED | EXECUTING badge renders; phase transition cards render; tool use cards render; Escape → interrupt() path fully wired through server — gap closed by 13-07 |

All 7 STREAM requirements confirmed Complete in REQUIREMENTS.md requirement tracker.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/claude-process.ts` | 11, 35, 80 | TODO(Phase-13) comments | INFO | Forward-looking notes for Pi SDK arg updates and session continuity — not blockers for Phase 13 goals |
| `src/server/pipeline.ts` | 87 | TODO (Phase 13) comment | INFO | `skip_permissions` read from preferences.md flagged for future work — defaults to true, not a Phase 13 blocker |

No blocker anti-patterns remain.

---

## Human Verification Required

### 1. Live Escape Key Interrupt Test

**Test:** Run `/gsd auto` in Mission Control, observe EXECUTING badge appears in header, then press Escape
**Expected:** gsd process receives SIGINT, auto mode stops, EXECUTING badge disappears, chat history preserved
**Why human:** The complete routing path (Escape → interrupt() → WebSocket session_interrupt → ws-server → pipeline → processManager.interrupt() → SIGINT) is verified at the unit test level through all three architectural boundaries. But actual SIGINT delivery to the gsd binary requires a live process.

### 2. WebSocket Reconnect Full-State Re-derive

**Test:** Open app with active session, close the browser tab, wait 2s, reopen tab
**Expected:** Status indicator shows reconnecting → connected; chat history and task panel state restored from .gsd/ files without relying on server memory
**Why human:** Real WebSocket lifecycle requires a running server

### 3. Live Cost Badge

**Test:** Run a gsd session that generates cost_update events; observe the chat header
**Expected:** Cyan $X.XX badge appears in task status bar top-right corner, updating on each cost event; turns amber at 80% of budget ceiling, red at 95%
**Why human:** Requires live gsd process emitting cost_update events

### 4. Live Streaming Event Cards

**Test:** Send `/gsd auto` in chat, observe the chat panel message stream
**Expected:** Phase transition divider cards appear with amber diamond PHASE text; tool invocations appear as structured ToolUseCard with tool name and pulse dot transitioning to green checkmark; plain text appears as normal assistant bubbles
**Why human:** Requires live gsd binary

---

## Gap Closure Confirmation

The single blocker gap from the initial verification is confirmed closed.

**What was broken:** `session_interrupt` was sent by the client (useSessionManager line 634) but `ws-server.ts` had only four handled SessionAction types (`session_create`, `session_close`, `session_rename`, `session_list`). The message fell through to the catch block and was silently discarded. `ClaudeProcessManager.interrupt()` was never called.

**What was fixed:**

1. `ws-server.ts` (commit `f2037a2`): Added `| { type: "session_interrupt"; sessionId: string }` as the 5th variant to the `SessionAction` union (line 18). Added `parsed.type === "session_interrupt"` to the message routing OR-chain (line 122).

2. `pipeline.ts` (commit `aaa6a66`): Added `case "session_interrupt"` to the `onSessionAction` switch (lines 302-311). Resolves the session with `sessionManager.getSession(action.sessionId)`, null-guards the result, then calls `processManager.interrupt()`. Logs a warning if the session is not found. Fire-and-forget — no `publishSessionUpdate` required.

3. `session-ws.test.ts` (commit `f2037a2`): Two regression tests added — one asserting dispatch to `onSessionAction` with correct type and sessionId, one asserting no throw when no handler is registered. Both pass. Full session-ws suite: 9 pass, 0 fail.

**Full test suite after closure:** 580 pass, 3 todo, 0 fail across 583 tests in 63 files.

---

*Verified: 2026-03-13T10:45:00Z*
*Re-verification: Yes — after gap closure plan 13-07*
*Verifier: Claude (gsd-verifier)*
