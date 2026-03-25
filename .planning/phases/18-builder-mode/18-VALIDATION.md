---
phase: 18
slug: builder-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (already configured) |
| **Config file** | `packages/mission-control/package.json` (`"test": "bun test"`) |
| **Quick run command** | `cd packages/mission-control && bun test --testPathPattern builder` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test --testPathPattern builder`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 18-01-01 | 01 | 1 | BUILDER-01 | unit | `bun test --testPathPattern builder-mode` | ⬜ pending |
| 18-01-02 | 01 | 1 | BUILDER-02 | unit | `bun test --testPathPattern builder-mode` | ⬜ pending |
| 18-01-03 | 01 | 1 | BUILDER-03 | unit | `bun test --testPathPattern builder-mode` | ⬜ pending |
| 18-02-01 | 02 | 1 | BUILDER-04 | unit | `bun test --testPathPattern classify-intent` | ⬜ pending |
| 18-02-02 | 02 | 1 | BUILDER-04 | unit | `bun test --testPathPattern classify-intent` | ⬜ pending |
| 18-03-01 | 03 | 2 | BUILDER-05 | unit | `bun test --testPathPattern builder` | ⬜ pending |
| 18-03-02 | 03 | 2 | BUILDER-06 | unit | `bun test --testPathPattern builder` | ⬜ pending |
| 18-03-03 | 03 | 2 | BUILDER-07 | unit | `bun test --testPathPattern builder` | ⬜ pending |
| 18-04-01 | 04 | 3 | BUILDER-01..07 | human | Manual visual verification | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — Bun test is already installed and configured. No new test framework needed.

Test files to create during Wave 1:
- [ ] `packages/mission-control/tests/builder-mode.test.ts` — BUILDER-01, 02, 03 (context/hook/settings)
- [ ] `packages/mission-control/tests/classify-intent.test.ts` — BUILDER-04 (classifier API route)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mode toggle in Settings immediately relabels UI without session restart | BUILDER-01 | Live UI interaction required | Open Settings → toggle Interface Mode → verify labels change instantly in Milestones view and chat |
| Slash autocomplete hidden in Builder mode | BUILDER-03 | DOM interaction with autocomplete dropdown | Switch to Builder → type "/" in chat → verify no autocomplete appears |
| Routing badge appears after message send in Builder mode | BUILDER-04 | Requires live Claude API call | Send "I want to start building my homepage" in Builder mode → verify routing badge shows intent |
| Discuss cards show plain language in Builder mode | BUILDER-05 | Requires live GSD discuss session | Start a discuss session in Builder mode → verify cards show "Question N of N" not GSD phase names |
| Slice cards show Builder labels | BUILDER-06 | Requires slices in various states | Open Milestones with planned/in-progress slices → verify "Ready to build" / "Build this feature" etc. |
| Phase gate card appears for frontend build intent | BUILDER-07 | Requires UI_PHASE_GATE routing to trigger | Send "build the landing page" in Builder mode without design contract → verify gate card appears |

---

## Validation Architecture (from Research)

### Strategy
- **Unit tests:** Pure function extraction for `classifyIntent`, `useBuilderMode`, `applyBuilderVocab`
- **Static analysis:** Source-text assertions for SettingsView builder toggle (follows Phase 12-01 pattern)
- **Integration:** Full `bun test` suite must remain green (currently 700+ tests pass)
- **Human verification:** One plan (18-04) dedicated to visual/functional verification of all 7 BUILDER requirements

### Critical Non-Regressions
- All existing 700+ tests must continue to pass
- Developer mode behaviour must be completely unchanged
- Builder mode is additive only — no existing functionality removed

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
