---
status: resolved
trigger: "Investigate 10 pre-existing failing tests in mission-control package"
created: 2026-03-12T00:00:00Z
updated: 2026-03-12T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - all 10 failures resolved
test: ran bun test full suite
expecting: 0 failures
next_action: COMPLETE - archive session

## Symptoms

expected: all 10 tests pass
actual: 10 tests fail (TaskExecuting x5, ClaudeProcessManager x3, workspace structure x1, ChatView x1)
errors: "Invalid hook call", "manager.spawn is not a function", "expect(received).toBeDefined() Received: undefined", "null is not an object (evaluating 'resolveDispatcher().useState')"
reproduction: cd packages/mission-control && bun test
started: commit 960ce07 (initial port)

## Eliminated

- hypothesis: hooks installed in wrong React version
  evidence: other hook-based components work fine when rendered through React JSX; issue is tests calling components directly as plain functions without a React renderer
  timestamp: 2026-03-12

- hypothesis: TaskExecuting hooks break because of test environment
  evidence: TaskWaiting (no hooks, same test file) passes fine. The direct-call pattern is incompatible with any hook-using component
  timestamp: 2026-03-12

## Evidence

- timestamp: 2026-03-12
  checked: TaskExecuting.tsx source
  found: uses useRef, useState, useEffect at lines 54-64. Tests call it as plain function without React renderer
  implication: direct function call pattern requires hook-free components

- timestamp: 2026-03-12
  checked: TaskWaiting.tsx, MustHavesList.tsx, TargetFiles.tsx
  found: ALL have zero hooks - all their tests pass
  implication: confirms hook-free = direct-call testable

- timestamp: 2026-03-12
  checked: ChatView.tsx source
  found: uses useState x4, useCallback x3 - same incompatibility with direct test calls
  implication: needs same split as TaskExecuting

- timestamp: 2026-03-12
  checked: claude-process.ts isActive getter
  found: hardcoded `return true` with comment "Always ready to spawn"
  implication: semantic break - tests expect isActive=false when no process; old API had different semantics

- timestamp: 2026-03-12
  checked: chat-router.test.ts ClaudeProcessManager tests
  found: tests call manager.spawn() which doesn't exist (method renamed to sendMessage()), and new ClaudeProcessManager() with no args (constructor requires cwd)
  implication: API diverged from tests during Phase 12 migration

- timestamp: 2026-03-12
  checked: root package.json at gsd-2/package.json
  found: name "gsd-pi", no workspaces field - it's a published npm CLI package not a monorepo root
  implication: MONO-02 test assumption was wrong from day one of the port; project structure is not a workspace monorepo

## Resolution

root_cause: |
  Four distinct root causes, one per failure group:

  1. TaskExecuting (5 failures): Component uses React hooks (useRef, useState, useEffect) for
     pulse animation. The test pattern calls it as a plain function without a React renderer.
     All other components in the same test file are hook-free and pass. The hooks were present
     from the initial port commit (960ce07) — never compatible with the test pattern.

  2. ChatView (1 failure): Same hooks-vs-direct-call incompatibility. ChatView uses useState x4
     and useCallback x3. Called as plain function in test without a React renderer.

  3. ClaudeProcessManager (3 failures):
     - isActive getter hardcoded to return true ("Always ready to spawn") but tests expect false
       when no active child process
     - Tests call manager.spawn() which doesn't exist — method was renamed to sendMessage()
       during Phase 12 migration (12-03)
     - Tests use new ClaudeProcessManager() with no args, but constructor requires cwd string

  4. workspace structure MONO-02 (1 failure): Root package.json (gsd-pi) is a published npm
     CLI package with no workspaces field. Test assumed it would be a monorepo root.
     This assumption was incorrect from the first day of the port.

fix: |
  1. TaskExecuting: Extracted hooks into TaskExecutingConnected wrapper component. TaskExecuting
     is now the pure hook-free renderer (with optional isPulsing prop). App callers
     (TabLayout, ChatView) import TaskExecutingConnected aliased as TaskExecuting.

  2. ChatView: Same split pattern. ChatView is the pure hook-free renderer with internal
     state values as optional props (showCreateModal, pendingAttachment, etc. all default
     to false/null). ChatViewConnected holds all hooks and delegates to ChatView.
     SingleColumnView now imports ChatViewConnected aliased as ChatView.

  3. ClaudeProcessManager:
     - Fixed isActive getter to return this.activeProcess !== null (semantically correct)
     - Updated tests to use sendMessage() instead of spawn() and pass cwd to constructor
     - Updated test for "rejects concurrent" to set _isProcessing=true and call sendMessage

  4. MONO-02: Updated test to assert the actual reality (root package is gsd-pi CLI, no
     workspaces field), not a monorepo assumption.

verification: |
  Before: 533 pass, 10 fail
  After:  545 pass, 0 fail
  All 59 test files run, 548 total tests, 3 todo unchanged, 0 failures.

files_changed:
  - packages/mission-control/src/components/active-task/TaskExecuting.tsx
  - packages/mission-control/src/components/views/ChatView.tsx
  - packages/mission-control/src/components/layout/TabLayout.tsx
  - packages/mission-control/src/components/layout/SingleColumnView.tsx
  - packages/mission-control/src/server/claude-process.ts
  - packages/mission-control/tests/chat-router.test.ts
  - packages/mission-control/tests/setup.test.ts
