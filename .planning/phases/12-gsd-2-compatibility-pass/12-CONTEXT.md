# Phase 12: GSD 2 Compatibility Pass - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/GSD-Mission-Control-M2-Execution-Prompt.md)

<domain>
## Phase Boundary

Update all M1 code that references GSD v1 conventions to GSD 2. The app was built targeting GSD v1 (`.planning/` directory, Claude Code slash command syntax `/gsd:discuss-phase` etc.). GSD 2 has shipped and uses a different directory (`.gsd/`), different CLI (`gsd` not `claude`), different command syntax (`/gsd`, `/gsd auto`, `/gsd discuss`), and different state file schema.

This phase covers six distinct sub-areas:
1. File watcher directory + state deriver schema update
2. Command autocomplete registry update (v1 → v2)
3. Command palette entries update
4. Process spawning binary update (`gsd` not `claude`/`claude-code`)
5. Migration helper banner (`.planning/` without `.gsd/`)
6. Settings panel updates (GSD 2 fields, remove v1 fields)

</domain>

<decisions>
## Implementation Decisions

### File Watcher — Directory Target
- All `Bun.watch()` calls must watch `.gsd/` not `.planning/`
- State deriver must read GSD 2 file schema:
  - `.gsd/STATE.md` → active milestone, slice, task, auto mode status, cost, tokens
  - `.gsd/M001-ROADMAP.md` → milestone structure, slice checkboxes, risk levels
  - `.gsd/S01-PLAN.md` → slice task decomposition, must-haves, cost estimate
  - `.gsd/T01-SUMMARY.md` → completed task output, YAML frontmatter
  - `.gsd/DECISIONS.md` → architectural decision register
  - `.gsd/preferences.md` → model config, budget ceiling, skill_discovery setting
  - `.gsd/PROJECT.md` → living project description
  - `.gsd/M001-CONTEXT.md` → user decisions from discuss phase
- File naming patterns are DYNAMIC: `M001`, `M002` for milestones; `S01`, `S02` for slices; `T01`, `T02` for tasks
- State deriver must handle all milestone/slice/task indices dynamically — never hardcode indices
- All file reads are non-blocking — missing files render as empty states, never errors

### Command Autocomplete — GSD 2 Registry
Replace ALL v1 `/gsd:` prefixed commands with the following GSD 2 registry:
```
/gsd              Guided mode — reads project state, shows what's next
/gsd auto         Autonomous mode — research, plan, execute, commit, repeat
/gsd stop         Stop auto mode gracefully
/gsd discuss      Discuss architecture and decisions
/gsd status       Progress dashboard
/gsd queue        Queue future milestones
/gsd prefs        Model selection, timeouts, budget ceiling
/gsd migrate      Migrate v1 .planning/ directory to .gsd/ format
/gsd doctor       Validate .gsd/ integrity, find and fix issues
```
- Remove ALL `/gsd:` prefixed v1 commands from autocomplete and command palette
- No v1 entries should appear anywhere in the UI

### Command Palette
- Update all GSD command entries to GSD 2 syntax
- Remove v1 entries
- Update descriptions to match GSD 2 behaviour

### Process Spawning
- Spawn `gsd` binary, not `claude` or `claude-code`
- GSD 2 interactive session starts with `gsd` command
- Streaming stdout from `gsd` process — same architecture as M1 but correct binary
- GSD 2 uses Pi SDK which outputs structured stream — ensure parser handles this

### Migration Helper Banner
- Condition: file watcher detects `.planning/` directory but NO `.gsd/` directory
- Show inline banner:
  ```
  This project uses GSD v1. Run /gsd migrate to upgrade it.
  [ Run migration ]
  ```
- "Run migration" button sends `/gsd migrate` to the active `gsd` session

### Settings Panel Updates
- Model options: reflect GSD 2's per-phase model selection (research, planning, execution, completion)
- Remove any v1-specific settings fields
- Add budget ceiling field (maps to `budget_ceiling` in `~/.gsd/preferences.md`)
- Add skill_discovery toggle (values: auto / suggest / off)

### Claude's Discretion
- Exact parsing logic for GSD 2 state file format (frontmatter, section delimiters, etc.)
- How to detect "dynamic" milestone/slice/task IDs from STATE.md (read active pointers, then build file paths)
- Error state presentation for missing `.gsd/` directory (should gracefully degrade)
- Whether migration banner is shown in header, sidebar, or chat area
- Order/grouping of settings panel fields for GSD 2

</decisions>

<specifics>
## Specific Ideas

**Design system (do not change):**
- Background: `#0F1419` (dark navy)
- Surface: `#131C2B`
- Elevated: `#1A2332`
- Border: `#1E2D3D`
- Accent cyan: `#5BC8F0` — active states, CTAs, logo only
- Green: `#22C55E` — complete/verified
- Amber: `#F59E0B` — active/executing
- Red: `#EF4444` — error/blocked
- Fonts: Share Tech Mono (display), JetBrains Mono (body)
- Spacing: 8-point grid strictly

**Testing requirement (from M2 cross-cutting constraints):**
Phase 12 requires a regression test: open a GSD 2 project, verify STATE.md is read correctly, verify autocomplete shows GSD 2 commands, verify `/gsd auto` spawns and streams correctly.

**GSD 2 file naming patterns:**
- Milestone IDs: zero-padded three digits → `M001`, `M002`
- Slice IDs: zero-padded two digits within milestone context → `S01`, `S02`
- Task IDs: zero-padded two digits within slice context → `T01`, `T02`

</specifics>

<deferred>
## Deferred Ideas

- Stream parser for Pi SDK structured events — deferred to Phase 13 (Session Streaming Hardening)
- Process lifecycle (graceful shutdown, crash recovery, orphan prevention) — Phase 13
- Cost/token display — Phase 13
- Auto mode indicators — Phase 13
- Tauri IPC wrapping — Phase 15
- OAuth / keychain — Phase 16

</deferred>

---

*Phase: 12-gsd-2-compatibility-pass*
*Context gathered: 2026-03-12 via PRD Express Path*
