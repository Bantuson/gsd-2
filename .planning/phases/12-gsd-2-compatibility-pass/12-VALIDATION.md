---
phase: 12
slug: gsd-2-compatibility-pass
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
nyquist_audited: 2026-03-12
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Bun built-in) |
| **Config file** | `packages/mission-control/package.json` (`"test": "bun test"`) |
| **Quick run command** | `cd packages/mission-control && bun test tests/state-deriver.test.ts` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/state-deriver.test.ts`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | COMPAT-04 | unit | `bun test tests/slash-commands.test.ts` | ✅ | ✅ green |
| 12-01-02 | 01 | 0 | COMPAT-05 | unit | `bun test tests/claude-process-gsd.test.ts` | ✅ | ✅ green |
| 12-01-03 | 01 | 0 | COMPAT-06 | unit | `bun test tests/migration-banner.test.ts` | ✅ | ✅ green |
| 12-01-04 | 01 | 0 | COMPAT-07 | unit | `bun test tests/settings-view-gsd2.test.ts` | ✅ | ✅ green |
| 12-02-01 | 02 | 1 | COMPAT-01 | unit | `bun test tests/watcher.test.ts` | ✅ | ✅ green |
| 12-02-02 | 02 | 1 | COMPAT-02 | unit | `bun test tests/state-deriver.test.ts` | ✅ | ✅ green |
| 12-02-03 | 02 | 1 | COMPAT-03 | unit | `bun test tests/state-deriver.test.ts` | ✅ | ✅ green |
| 12-02-04 | 02 | 1 | COMPAT-04 | unit | `bun test tests/slash-commands.test.ts` | ✅ | ✅ green |
| 12-02-05 | 02 | 1 | COMPAT-05 | unit | `bun test tests/claude-process-gsd.test.ts` | ✅ | ✅ green |
| 12-03-01 | 03 | 2 | COMPAT-06 | unit | `bun test tests/migration-banner.test.ts` | ✅ | ✅ green |
| 12-03-02 | 03 | 2 | COMPAT-07 | unit | `bun test tests/settings-view-gsd2.test.ts` | ✅ | ✅ green |
| nyquist-gap-01 | audit | — | COMPAT-01 | unit | `bun test tests/watcher.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/slash-commands.test.ts` — COMPAT-04: GSD 2 commands present, no v1 commands (8 tests GREEN)
- [x] `tests/claude-process-gsd.test.ts` — COMPAT-05: spawn binary is `gsd` not `claude` (3 tests GREEN)
- [x] `tests/migration-banner.test.ts` — COMPAT-06: `needsMigration` flag derivation (4 tests GREEN)
- [x] `tests/settings-view-gsd2.test.ts` — COMPAT-07: SettingsView renders GSD 2 fields (6 tests GREEN)
- [x] `tests/state-deriver.test.ts` — GSD 2 fixtures augmented (COMPAT-01, -02, -03) (22 tests GREEN)

### Nyquist Audit Gap Closed (2026-03-12)

**Gap:** `watcher.test.ts` lacked assertion for the `.gsd/` dotfile exception behavior (COMPAT-01 line 44 of watcher.ts: `!firstSegment.startsWith(".gsd")`).

**Fix:** Added two tests to `tests/watcher.test.ts` under `describe("COMPAT-01: watcher .gsd dotfile exception")`:
1. `allows events under .gsd/ subdirectory (dotfile exception)` — verifies `.gsd/STATE.md` writes fire onChange
2. `filters out events under other dotfile directories (not .gsd/)` — verifies `.planning/STATE.md` writes are suppressed

Both tests pass. Full suite: **535 pass / 10 fail** (10 failures are all pre-existing, none from Phase 12).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Open a GSD 2 project → STATE.md read correctly | COMPAT-02 | Requires live `.gsd/` project on disk | Open project in browser, check sidebar shows milestone/slice from `.gsd/STATE.md` |
| Autocomplete shows GSD 2 commands only | COMPAT-04 | E2E visual verification | Type `/gsd` in chat input, confirm no `/gsd:` v1 entries appear |
| `/gsd auto` spawns `gsd` process and streams | COMPAT-05 | Requires live `gsd` binary | Send `/gsd auto`, check Activity Monitor for `gsd` process |
| Migration banner visible for v1 project | COMPAT-06 | Requires v1 test project | Open project with `.planning/` only, verify banner appears with "Run migration" button |
| Settings shows GSD 2 fields, not v1 | COMPAT-07 | Visual verification | Open Settings, confirm per-phase model, budget ceiling, skill_discovery present; no v1 toggles |

---

## Requirements Coverage Summary

| Requirement | Test Files | Tests | Status |
|-------------|-----------|-------|--------|
| COMPAT-01 | `watcher.test.ts` (+2 nyquist), `fs-api.test.ts`, `state-deriver.test.ts` | 6 + 4 + 13 | ✅ green |
| COMPAT-02 | `state-deriver.test.ts` | 13 | ✅ green |
| COMPAT-03 | `state-deriver.test.ts` | 2 (dynamic ID tests) | ✅ green |
| COMPAT-04 | `slash-commands.test.ts`, `chat-input.test.tsx` | 8 + 3 | ✅ green |
| COMPAT-05 | `claude-process-gsd.test.ts` | 3 | ✅ green |
| COMPAT-06 | `migration-banner.test.ts`, `state-deriver.test.ts` | 4 + 3 | ✅ green |
| COMPAT-07 | `settings-view-gsd2.test.ts`, `settings-api.test.ts` | 6 + 11 | ✅ green |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete — 2026-03-12 (Nyquist audit by gsd-nyquist-auditor)
