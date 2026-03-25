---
phase: 13-session-streaming-hardening
plan: "04"
subsystem: cost-tracking
tags: [cost-tracking, react-hook, pure-function, tdd, ui-badge]
dependency_graph:
  requires: [13-01]
  provides: [useCostTracker, computeCostState, CostState, cost-badge-ui, budget-warning-banner]
  affects: [ChatView, plan-13-05]
tech_stack:
  added: []
  patterns: [pure-function-first, tdd-red-green, prop-drilling-costState]
key_files:
  created:
    - packages/mission-control/src/hooks/useCostTracker.ts
    - packages/mission-control/tests/cost-tracker.test.ts
  modified:
    - packages/mission-control/src/components/views/ChatView.tsx
decisions:
  - "computeCostState uses Math.round(fraction * 1e10) / 1e10 to avoid floating-point threshold failures (0.08/0.10 = 0.7999... in JS)"
  - "CostState.formatted uses toFixed(2) — 0.095.toFixed(2) = '$0.10' due to JS float representation; test expectation corrected from '$0.09'"
  - "ChatView accepts costState as a pure render prop; useCostTracker is NOT instantiated in ChatView — wired in plan 13-05 via useSessionManager"
  - "Budget warning dismiss in ChatViewConnected: downgrades level from critical to warning to hide banner while keeping badge color"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 13 Plan 04: Real-Time Cost Tracking — useCostTracker + ChatView Badge Summary

**One-liner:** Pure `computeCostState` function + `useCostTracker` hook with cyan/amber/red cost badge and dismissible 95% budget warning banner in ChatView.

## What Was Built

### computeCostState (pure function)
Maps `(totalCost: number, budgetCeiling: number | null)` → `CostState`:
- `level: "none"` when fraction < 80% or no budget ceiling
- `level: "warning"` when fraction >= 80%
- `level: "critical"` when fraction >= 95%
- `formatted`: always `$X.XX` (two decimal places)

### useCostTracker (React hook)
Accumulates cost from Pi SDK `cost_update` events. Pi SDK sends running total (not delta) so `addCostEvent(costUsd)` simply sets totalCost. Returns `{ costState, addCostEvent, reset }`.

### ChatView UI additions
- **Cost badge**: absolute-positioned in task status bar (top-right corner), visible when `totalCost > 0`, cyan (#5BC8F0) / amber (#F59E0B) / red (#EF4444) based on CostLevel
- **Budget warning banner**: `role="alert"`, shown when `level === "critical"`, dismissible, shows % of budget consumed
- `ChatViewConnected`: manages `budgetWarningDismissed` state; when dismissed, passes `level: "warning"` to suppress banner while keeping badge red

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useCostTracker with computeCostState | `70f1770` | src/hooks/useCostTracker.ts, tests/cost-tracker.test.ts |
| 2 | Add cost badge and budget warning to ChatView | `e7e7923` | src/components/views/ChatView.tsx |

## Test Results

```
bun test tests/cost-tracker.test.ts  →  7 pass, 0 fail
bun test tests/layout.test.tsx       →  11 pass, 0 fail
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Floating-point precision in 80% threshold comparison**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `0.08 / 0.10 = 0.7999999999999999` in JavaScript, causing `fraction >= 0.8` to return false
- **Fix:** Round fraction to 10 decimal places: `Math.round((totalCost / budgetCeiling) * 1e10) / 1e10`
- **Files modified:** `src/hooks/useCostTracker.ts`
- **Commit:** `70f1770`

**2. [Rule 1 - Bug] Test expectation for `$0.095.toFixed(2)` was wrong**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Test asserted `"$0.09"` for `computeCostState(0.095, 0.10).formatted` but `(0.095).toFixed(2) === "0.10"` in JavaScript due to float representation
- **Fix:** Corrected test expectation to `"$0.10"` with explanatory comment
- **Files modified:** `tests/cost-tracker.test.ts`
- **Commit:** `70f1770`

### Parallel Execution Note
Plan 13-03 and 13-05 were executing concurrently with 13-04. ChatView Task 2 changes were captured in commit `e7e7923` (13-03 commit) due to parallel agent execution. All required changes are present in the repository at HEAD.

## Self-Check: PASSED

- FOUND: `packages/mission-control/src/hooks/useCostTracker.ts`
- FOUND: `packages/mission-control/tests/cost-tracker.test.ts`
- FOUND: `.planning/phases/13-session-streaming-hardening/13-04-SUMMARY.md`
- FOUND: commit `70f1770` (Task 1 — useCostTracker + tests)
- FOUND: commit `e7e7923` (Task 2 — ChatView cost badge, captured in parallel 13-03 commit)
