# Phase 13: Session Streaming Hardening - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning
**Source:** GSD-Mission-Control-M2-Execution-Prompt.md

<domain>
## Phase Boundary

This phase makes the streaming connection between Mission Control and the `gsd` process production-quality. It is the most critical integration layer — everything else depends on it. Scope:

1. **Stream Parser** — parse Pi SDK / GSD 2 structured output into typed event cards (not raw text)
2. **Process Lifecycle** — clean spawn, graceful shutdown, crash recovery, orphan prevention
3. **WebSocket Reconnection** — exponential backoff, full state re-derive from `.gsd/` on reconnect
4. **Cost + Token Display** — running badge in chat header, per-slice total, milestone total, budget ceiling warnings
5. **Auto Mode Indicators** — EXECUTING badge, phase transition announcements, Escape interrupt

**Depends on Phase 12** — process must already spawn `gsd` binary (not `claude`), and GSD 2 state schema must already be read correctly.

</domain>

<decisions>
## Implementation Decisions

### Stream Parser — Pi SDK Event Types
All locked decisions from execution prompt:
- Handle **plain text** → display as assistant message in chat
- Handle **tool use blocks** → display as structured event cards (not raw JSON)
- Handle **tool result blocks** → display as result cards
- Handle **phase transition markers** (Research → Plan → Execute → Complete)
- Handle **cost/token updates** → update cost display in real time
- Handle **stuck detection messages** → surface as warning card
- Handle **timeout messages** → surface as amber warning with action button
- Handle **auto mode phase announcements** → update milestone/slice progress display
- **Resilience**: malformed chunks must be logged and skipped, never crash the stream

### Process Lifecycle
All locked decisions:
- Spawn with **correct working directory** (open project root)
- **Graceful shutdown**: send interrupt signal → wait for process to finish current operation → then kill
- **Crash recovery**: show reconnect option + preserve chat history + attempt restart with session recovery
- **Orphan prevention**: process registry tracks all spawned `gsd` processes, kills all on app close
- **Multi-session**: each chat tab has its own `gsd` process (Phase 6.3 architecture — verify works with GSD 2)

### WebSocket Reconnection
All locked decisions:
- **Exponential backoff**: 1s → 2s → 4s → 8s → max 30s
- **On reconnect**: re-derive full state from `.gsd/` files (no reliance on in-memory state)
- **Stale state detection**: if `.gsd/STATE.md` modified time is newer than last WebSocket message → force full re-derive

### Cost + Token Display
All locked decisions:
- **Chat header**: running cost badge (e.g. `$0.18`) for active session
- **Slice card**: per-slice total cost
- **Milestone header**: sum across all slices
- **Budget ceiling warnings**: amber at 80%, red at 95% — reads `budget_ceiling` from `.gsd/preferences.md`

### Auto Mode Indicators
All locked decisions:
- **Persistent EXECUTING badge** pinned in chat header while `/gsd auto` is running
- **Phase announcements** (Research / Plan / Execute / Complete) update the active slice card in Milestones view in real time
- **Escape key** in chat input while auto is running → sends interrupt signal to `gsd` process (conversation preserved, auto mode paused — GSD 2 supports this)

### Design System (do not deviate)
- Background: `#0F1419`, Surface: `#131C2B`, Elevated: `#1A2332`, Border: `#1E2D3D`
- Accent cyan `#5BC8F0` — active states only
- Green `#22C55E` complete, Amber `#F59E0B` active/executing, Red `#EF4444` error/blocked
- Fonts: Share Tech Mono (display), JetBrains Mono (body)
- Spacing: 8-point grid strictly
- Motion: state change only, never decorative
- Every new UI state needs: empty state, loading state, error state

### Existing Infrastructure to Build On
- `packages/mission-control/src/server/ndjson-parser.ts` — existing NDJSON parser (pure, line-based). Phase 13 extends the stream EVENT TYPING on top of it.
- `packages/mission-control/src/server/claude-process.ts` — existing process manager, `TODO(Phase-13)` comments mark exactly what to extend
- `packages/mission-control/src/server/chat-types.ts` — `StreamEvent` type needs new subtypes for GSD 2 / Pi SDK event shapes
- `packages/mission-control/src/server/ws-server.ts` — WebSocket server, reconnect logic lives here
- `packages/mission-control/src/server/session-manager.ts` — session/process registry

### Claude's Discretion
- Exact TypeScript discriminated union shape for GSD 2 stream events (implementation detail)
- Whether cost badge is in the ChatView header component or in a new overlay component
- Internal structure of the process registry (Map vs WeakMap vs array)
- Exact reconnect UI (banner vs toast vs inline indicator)
- Whether Escape key listener is in ChatView or a global keyboard hook

</decisions>

<specifics>
## Specific Ideas

**Cost badge placement:** Chat header (`ChatView.tsx` header area) — small monospace badge, e.g. `$0.18`, cyan text, updates on every cost event

**EXECUTING badge:** Pinned chip in chat header, amber background `#F59E0B`, text "EXECUTING" in Share Tech Mono. Appears/disappears on auto mode start/stop.

**Phase transition cards in chat:** When GSD 2 emits a phase transition, render an inline divider card in the chat stream — e.g.:
```
━━━━━━━━━━━━━━━━━━━━
  ◆ EXECUTING PHASE 2: Planning
━━━━━━━━━━━━━━━━━━━━
```

**Crash recovery banner:**
```
╔══════════════════════════════════════╗
║  ⚠  gsd process stopped unexpectedly ║
║  Chat history preserved.              ║
║  [ Reconnect ]                        ║
╚══════════════════════════════════════╝
```

**Tool use card:** Instead of raw JSON, display structured card with tool name, input summary, collapsible full input.

**Budget warning:** Inline banner above chat input, amber at 80%, red at 95%. Dismissible but re-appears if cost increases further.

</specifics>

<deferred>
## Deferred Ideas

- Slice card per-slice cost (belongs to Phase 14 — Slice Integration)
- Milestone total cost in milestone header (belongs to Phase 14)
- Full UAT testing of all streaming edge cases (Phase 13 unit tests cover parser; human UAT covers E2E)
- Streaming analytics / telemetry (M3 scope)

</deferred>

---

*Phase: 13-session-streaming-hardening*
*Context gathered: 2026-03-12 via GSD-Mission-Control-M2-Execution-Prompt.md*
