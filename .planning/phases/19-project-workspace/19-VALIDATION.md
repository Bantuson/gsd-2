---
phase: 19
slug: project-workspace
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built into Bun 1.3.10) |
| **Config file** | none — bun discovers tests in `tests/` directory |
| **Quick run command** | `cd packages/mission-control && bun test tests/workspace-api.test.ts tests/project-home-screen.test.tsx tests/project-tab-bar.test.tsx tests/project-archiving.test.ts --timeout 5000` |
| **Full suite command** | `cd packages/mission-control && bun test --timeout 30000` |
| **Estimated runtime** | ~30 seconds (full suite 748+ tests) |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/workspace-api.test.ts tests/project-home-screen.test.tsx tests/project-tab-bar.test.tsx tests/project-archiving.test.ts --timeout 5000`
- **After every plan wave:** Run `cd packages/mission-control && bun test --timeout 30000`
- **Before `/gsd:verify-work`:** Full suite must be green (748+ tests)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 0 | WORKSPACE-01 | unit | `bun test tests/workspace-api.test.ts -t "getWorkspacePath"` | ❌ Wave 0 | ⬜ pending |
| 19-01-02 | 01 | 0 | WORKSPACE-01 | unit | `bun test tests/workspace-api.test.ts -t "createProject"` | ❌ Wave 0 | ⬜ pending |
| 19-01-03 | 01 | 0 | WORKSPACE-02 | unit | `bun test tests/project-home-screen.test.tsx -t "Developer empty state"` | ❌ Wave 0 | ⬜ pending |
| 19-01-04 | 01 | 0 | WORKSPACE-02 | unit | `bun test tests/project-home-screen.test.tsx -t "Builder empty state"` | ❌ Wave 0 | ⬜ pending |
| 19-01-05 | 01 | 0 | WORKSPACE-03 | unit | `bun test tests/project-home-screen.test.tsx -t "ProjectCard renders"` | ❌ Wave 0 | ⬜ pending |
| 19-01-06 | 01 | 0 | WORKSPACE-03 | unit | `bun test tests/project-home-screen.test.tsx -t "ProjectCardMenu"` | ❌ Wave 0 | ⬜ pending |
| 19-02-01 | 02 | 0 | WORKSPACE-04 | unit | `bun test tests/project-tab-bar.test.tsx -t "tab bar visibility"` | ❌ Wave 0 | ⬜ pending |
| 19-02-02 | 02 | 0 | WORKSPACE-04 | unit | `bun test tests/project-tab-bar.test.tsx -t "amber dot"` | ❌ Wave 0 | ⬜ pending |
| 19-03-01 | 03 | 0 | WORKSPACE-05 | unit | `bun test tests/project-archiving.test.ts -t "archive"` | ❌ Wave 0 | ⬜ pending |
| 19-03-02 | 03 | 0 | WORKSPACE-05 | unit | `bun test tests/project-archiving.test.ts -t "show archived"` | ❌ Wave 0 | ⬜ pending |
| 19-03-03 | 03 | 0 | WORKSPACE-05 | unit | `bun test tests/project-archiving.test.ts -t "restore"` | ❌ Wave 0 | ⬜ pending |
| 19-01-07 | 01 | 0 | WORKSPACE-01 | unit | `bun test tests/workspace-api.test.ts -t "workspace_path setting"` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/workspace-api.test.ts` — stubs for WORKSPACE-01 (getWorkspacePath, createProject, workspace_path setting)
- [ ] `tests/project-home-screen.test.tsx` — stubs for WORKSPACE-02, WORKSPACE-03 UI
- [ ] `tests/project-tab-bar.test.tsx` — stubs for WORKSPACE-04 tab visibility and amber dot
- [ ] `tests/project-archiving.test.ts` — stubs for WORKSPACE-05 archive/restore

*(Framework installed — `bun:test` is the established runner. No new packages needed.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `reveal_item_in_dir` opens Finder/Explorer to project folder | WORKSPACE-03 | OS file manager interaction not automatable | Open `···` menu on a project card, click "Open in Finder/Explorer", verify correct folder opens |
| Builder mode new project auto-creates dir + git init | WORKSPACE-01 | Requires real filesystem + git binary | In Builder mode, enter project name, confirm project directory created under `~/GSD Projects/`, verify `git init` ran (`.git/` exists) |
| Multi-session tab switching preserves per-session state | WORKSPACE-04 | Requires running gsd processes | Open 2 projects, switch tabs, verify each tab shows its own chat history and state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
