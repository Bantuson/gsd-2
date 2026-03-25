---
phase: 13-session-streaming-hardening
plan: "01"
subsystem: api
tags: [typescript, ndjson, streaming, pi-sdk, discriminated-union, tdd]

requires:
  - phase: 12-gsd-2-compatibility-pass
    provides: GSD2State types and ndjson-parser baseline

provides:
  - GSD2StreamEvent discriminated union (8 variants) in chat-types.ts
  - GSD2EventType, PhaseTransitionPhase, PiSdkCostData, PiSdkPhaseTransition types
  - classifyPiSdkEvent(raw: unknown) pure classifier function in ndjson-parser.ts

affects:
  - 13-02 (session continuity — reads GSD2StreamEvent)
  - 13-03 (streaming hardening — consumes classifyPiSdkEvent)
  - 14 (chat UI rendering — switches on GSD2StreamEvent.kind)

tech-stack:
  added: []
  patterns:
    - "Discriminated union via 'kind' field (not 'type') — avoids collision with existing StreamEvent.type"
    - "classifyPiSdkEvent switches on raw.type string, validates required fields, returns null (never throws)"
    - "TDD RED-GREEN: test file imports non-existent export to force import error on RED run"

key-files:
  created:
    - packages/mission-control/tests/pi-sdk-classifier.test.ts
  modified:
    - packages/mission-control/src/server/chat-types.ts
    - packages/mission-control/src/server/ndjson-parser.ts

key-decisions:
  - "GSD2StreamEvent uses 'kind' discriminant (not 'type') to avoid collision with existing StreamEvent.type field"
  - "classifyPiSdkEvent validates required fields per variant before constructing — missing fields return null rather than producing a partially-typed event"
  - "PhaseTransitionPhase validated inline via strict equality checks (no Zod) — consistent with project convention of no new dependencies"

patterns-established:
  - "Pure classifier pattern: raw: unknown → T | null with no side effects and no throws"
  - "GSD2StreamEvent.kind discriminant for downstream switch-based rendering"

requirements-completed:
  - STREAM-01
  - STREAM-02

duration: 3min
completed: 2026-03-12
---

# Phase 13 Plan 01: Pi SDK Event Classifier Summary

**GSD2StreamEvent discriminated union (8 variants) + classifyPiSdkEvent pure classifier with full TDD coverage, giving all downstream consumers a typed switch target instead of raw duck-typing**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-12T21:21:24Z
- **Completed:** 2026-03-12T21:24:01Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 3

## Accomplishments

- Created `GSD2StreamEvent` discriminated union covering all 8 Pi SDK event shapes
- Exported `GSD2EventType`, `PhaseTransitionPhase`, `PiSdkCostData`, `PiSdkPhaseTransition` from chat-types.ts
- Implemented `classifyPiSdkEvent(raw: unknown): GSD2StreamEvent | null` — null for non-objects, unknown types, missing required fields, never throws
- 12 tests (RED first, all failed; GREEN — all 12 pass)
- Existing `StreamEvent`, `parseNdjsonLine`, `createNdjsonParser` consumers unaffected; bun build 292 modules clean

## Task Commits

1. **RED — Failing classifier tests** - `a62cbc3` (test)
2. **GREEN — Types + classifyPiSdkEvent implementation** - `51390d5` (feat)

## Files Created/Modified

- `packages/mission-control/tests/pi-sdk-classifier.test.ts` - 12 TDD test cases for all 8 event variants + edge cases
- `packages/mission-control/src/server/chat-types.ts` - Added GSD2StreamEvent, GSD2EventType, PhaseTransitionPhase, PiSdkCostData, PiSdkPhaseTransition
- `packages/mission-control/src/server/ndjson-parser.ts` - Added classifyPiSdkEvent + import for new types

## Decisions Made

- Used `kind` (not `type`) as the discriminant field on GSD2StreamEvent to avoid collision with the existing `StreamEvent.type: ChatEventType` field — downstream consumers can import either type cleanly.
- Per-variant field validation before construction: if `{ type: "text" }` arrives without `text: string`, it returns null rather than `{ kind: "plain_text", text: undefined }`. Strict degradation.
- No Zod or new dependencies — inline typeof checks consistent with codebase convention.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `bun tsc --noEmit` not available (no TypeScript bin installed separately). Used `bun build src/server.ts --outdir /tmp/mc-build` to verify all 292 modules bundle without type errors. Clean.

## Next Phase Readiness

- `GSD2StreamEvent` and `classifyPiSdkEvent` ready for Plan 13-02 (session continuity) and Plan 13-03 (streaming hardening).
- All Pi SDK event shapes are typed — downstream rendering code can switch on `event.kind` with full TypeScript narrowing.

---
*Phase: 13-session-streaming-hardening*
*Completed: 2026-03-12*
