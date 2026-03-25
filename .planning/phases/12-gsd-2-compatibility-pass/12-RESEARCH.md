# Phase 12: GSD 2 Compatibility Pass - Research

**Researched:** 2026-03-12
**Domain:** File watcher / state derivation migration, command registry update, process spawning, migration UX, settings panel
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### File Watcher — Directory Target
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

#### Command Autocomplete — GSD 2 Registry
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

#### Command Palette
- Update all GSD command entries to GSD 2 syntax
- Remove v1 entries
- Update descriptions to match GSD 2 behaviour

#### Process Spawning
- Spawn `gsd` binary, not `claude` or `claude-code`
- GSD 2 interactive session starts with `gsd` command
- Streaming stdout from `gsd` process — same architecture as M1 but correct binary
- GSD 2 uses Pi SDK which outputs structured stream — ensure parser handles this

#### Migration Helper Banner
- Condition: file watcher detects `.planning/` directory but NO `.gsd/` directory
- Show inline banner: "This project uses GSD v1. Run /gsd migrate to upgrade it."
- "Run migration" button sends `/gsd migrate` to the active `gsd` session

#### Settings Panel Updates
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

### Deferred Ideas (OUT OF SCOPE)
- Stream parser for Pi SDK structured events — deferred to Phase 13 (Session Streaming Hardening)
- Process lifecycle (graceful shutdown, crash recovery, orphan prevention) — Phase 13
- Cost/token display — Phase 13
- Auto mode indicators — Phase 13
- Tauri IPC wrapping — Phase 15
- OAuth / keychain — Phase 16
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COMPAT-01 | File watcher targets `.gsd/` directory, not `.planning/` | `watcher.ts` passes `planningDir` to `fs.watch()` — just change the path passed in. `server.ts` hardcodes `.planning` at startup and in `switchProject` handler — both must change. |
| COMPAT-02 | State deriver reads GSD 2 file schema — `STATE.md`, `M001-ROADMAP.md`, `S01-PLAN.md`, `T01-SUMMARY.md`, `DECISIONS.md`, `preferences.md`, `PROJECT.md`, `M001-CONTEXT.md` | Current `buildFullState()` reads `STATE.md`, `ROADMAP.md`, `config.json`, `REQUIREMENTS.md`, and scans `phases/` subdirectory. GSD 2 has a completely different flat-file-in-root schema. Full rewrite of `buildFullState()` and associated types. |
| COMPAT-03 | Milestone/slice/task file indices derived dynamically from STATE.md (never hardcoded `M001`, `S01`, `T01`) | STATE.md frontmatter contains active milestone/slice/task pointers. Parser must read those pointers first, then build paths like `M001-ROADMAP.md`. Glob pattern approach for discovery. |
| COMPAT-04 | Command autocomplete shows GSD 2 syntax; all v1 `/gsd:` entries removed | `GSD_COMMANDS` array in `slash-commands.ts` contains 21 v1 commands. Replace entirely with 9 GSD 2 commands. Also remove `CLAUDE_CODE_COMMANDS` list (those are Claude Code specific, not GSD 2 / `gsd` binary). |
| COMPAT-05 | Child process spawns `gsd` binary, not `claude` or `claude-code` | `claude-process.ts` spawns `"claude"` with `--output-format stream-json --verbose`. Change binary to `"gsd"`. GSD 2 / Pi SDK output format differs — Phase 13 handles full Pi SDK parsing, but basic text streaming must not crash. |
| COMPAT-06 | Migration banner shown when `.planning/` exists but no `.gsd/` — "Run migration" sends `/gsd migrate` | New UI component. Server must detect both directories. Detection logic belongs in `buildFullState()` or a new pre-check in `startPipeline()` / `switchProject()`. Banner can live in `ChatView` or as a top-level overlay in `AppShell`. |
| COMPAT-07 | Settings panel updated — per-phase model selection (research/planning/execution/completion), budget ceiling, skill_discovery toggle; v1 settings removed | `SettingsView.tsx` has a "Claude Code Options" section with `model`, `skip_permissions`, `allowed_tools`. These are v1 Claude Code fields. Replace with GSD 2 fields from `preferences.md`. Settings API reads from `.gsd/preferences.md` globally and project-level. |
</phase_requirements>

---

## Summary

Phase 12 is a targeted find-and-replace migration of all GSD v1 conventions in the Mission Control server and frontend. The codebase was built against `.planning/` directories and `claude` / `claude-code` process names. GSD 2 uses `.gsd/` directories, a `gsd` binary, and an entirely different file schema. There are no new frameworks or libraries required — this is entirely an internal convention migration.

The scope covers six distinct touch points: (1) the file watcher directory path, (2) the state deriver schema and `PlanningState` types, (3) the slash command registry, (4) the process spawning binary name, (5) a new migration helper banner, and (6) the settings panel fields. Each touch point has a clear before/after mapping. The most complex change is state deriver — the GSD 2 schema is structurally different from v1, requiring a full rewrite of `buildFullState()` and corresponding TypeScript types.

The project already has a comprehensive `bun:test` test suite covering state derivation, pipeline, and settings. The regression test required for Phase 12 can be added to the existing `state-deriver.test.ts` and `claude-process.test.ts` patterns.

**Primary recommendation:** Execute changes in isolation order — types and state deriver first (most complex, other modules depend on it), then watcher/pipeline path changes, then command registry, then process binary, then migration banner, then settings panel.

---

## Standard Stack

### Core (unchanged — already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gray-matter` | ^4.0.3 | Parse YAML frontmatter from `.gsd/STATE.md` and other GSD 2 markdown files | Already used; GSD 2 files still use YAML frontmatter |
| `bun:test` | Bun built-in | Test runner for regression tests | Already used throughout `packages/mission-control/tests/` |
| `node:fs` / `Bun.file` | Runtime built-ins | File reads in state deriver | Established pattern in codebase |

### No New Dependencies
Phase 12 requires zero new npm packages. All changes are internal TypeScript modifications.

---

## Architecture Patterns

### Recommended Touch-Point Structure

The six touch points should be treated as independent units. Each has a clear input (current v1 code) and output (GSD 2 code). Changes do not require new files — only edits to existing files.

```
packages/mission-control/src/
├── server/
│   ├── state-deriver.ts      REWRITE: buildFullState(), new GSD2State types
│   ├── types.ts              REWRITE: PlanningState → GSD2State shape
│   ├── claude-process.ts     EDIT: "claude" → "gsd", strip CLAUDECODE env still valid
│   ├── pipeline.ts           EDIT: .planning → .gsd path resolution
│   └── fs-api.ts             EDIT: .planning detection → .gsd detection
├── lib/
│   └── slash-commands.ts     REWRITE: GSD_COMMANDS array, remove CLAUDE_CODE_COMMANDS GSD entries
├── server.ts                 EDIT: resolve(".planning") → resolve(".gsd") at startup + switchProject
└── components/
    ├── views/SettingsView.tsx EDIT: replace Claude Code section with GSD 2 fields
    └── (new) MigrationBanner.tsx  NEW: migration helper UI component
```

### Pattern 1: GSD 2 State Derivation

**What:** `buildFullState()` in `state-deriver.ts` must be rewritten to read GSD 2 files from the `.gsd/` directory root, not a `.planning/phases/` subdirectory hierarchy.

**GSD 2 file schema (flat root, no subdirectories in base read):**

```typescript
// Source: CONTEXT.md decisions
// STATE.md — active pointers + status
// M{NNN}-ROADMAP.md — milestone structure (N is dynamic from STATE.md)
// S{NN}-PLAN.md — slice plan (NN from STATE.md active slice)
// T{NN}-SUMMARY.md — task summary (NN from STATE.md active task)
// DECISIONS.md — architectural decisions register
// preferences.md — model config, budget ceiling, skill_discovery
// PROJECT.md — project description
// M{NNN}-CONTEXT.md — user decisions for active milestone
```

**Dynamic ID resolution pattern:**

```typescript
// Step 1: Parse STATE.md frontmatter to get active IDs
const stateRaw = await readFileText(join(gsdDir, "STATE.md"));
const { data } = matter(stateRaw ?? "");
const activeMilestone = data.active_milestone ?? "M001"; // e.g. "M001"
const activeSlice     = data.active_slice     ?? "S01";  // e.g. "S01"
const activeTask      = data.active_task      ?? "T01";  // e.g. "T01"

// Step 2: Build derived file paths from those IDs
const roadmapPath = join(gsdDir, `${activeMilestone}-ROADMAP.md`);
const planPath    = join(gsdDir, `${activeSlice}-PLAN.md`);
const summaryPath = join(gsdDir, `${activeTask}-SUMMARY.md`);
const contextPath = join(gsdDir, `${activeMilestone}-CONTEXT.md`);
```

**When to use:** Always — this is the only valid approach. Never hardcode milestone/slice/task IDs.

### Pattern 2: `PlanningState` → `GSD2State` Type Rename / Reshape

**What:** The existing `PlanningState` type in `types.ts` models `.planning/` v1 concepts (`PhaseState[]`, `RoadmapPhase[]`, `ConfigState` with workflow flags). These must be replaced with GSD 2 concepts.

**New top-level type:**

```typescript
// Replaces PlanningState
export interface GSD2State {
  // From STATE.md frontmatter
  projectState: GSD2ProjectState;
  // From M{NNN}-ROADMAP.md
  roadmap: GSD2RoadmapState | null;
  // From S{NN}-PLAN.md
  activePlan: GSD2SlicePlan | null;
  // From T{NN}-SUMMARY.md
  activeTask: GSD2TaskSummary | null;
  // From DECISIONS.md
  decisions: string | null;
  // From preferences.md
  preferences: GSD2Preferences | null;
  // From PROJECT.md
  project: string | null;
  // From M{NNN}-CONTEXT.md
  milestoneContext: string | null;
  // Migration state — set when .planning/ exists but no .gsd/
  needsMigration: boolean;
}
```

**Important:** Downstream React components (`usePlanningState`, milestone/roadmap views) currently consume `PlanningState`. Changing the type requires updating all consumers. Since Phase 12 scope is compatibility-only (not redesigning the UI), the safest approach is to shape GSD 2 data to preserve as many existing field names as possible where semantically equivalent, and add `needsMigration: boolean` as a new field.

### Pattern 3: File Watcher Path

**What:** `watcher.ts` is passed `planningDir` from `pipeline.ts`. The watcher itself is path-agnostic. Only the callers need updating.

**Touch points:**
- `server.ts` line 19: `resolve(repoRoot, ".planning")` → `resolve(repoRoot, ".gsd")`
- `server.ts` line 111: `resolve(projectPath, ".planning")` → `resolve(projectPath, ".gsd")`
- `server.ts` line 114: `access(planningDir)` — still valid, checking `.gsd/` existence
- `fs-api.ts` line 88: `access(join(..., ".planning"))` → `access(join(..., ".gsd"))`
- `fs-api.ts` line 123: `access(join(resolved, ".planning"))` → `access(join(resolved, ".gsd"))`
- `fs-types.ts`: Field comment `contains .planning/` → `contains .gsd/`
- `watcher.ts` line 44: dotfile filter `!firstSegment.startsWith(".planning")` → `!firstSegment.startsWith(".gsd")`

**Note:** The `planningDir` variable name throughout the codebase can remain — renaming is cosmetic and would create excessive diff noise. The string value changes; the variable name does not need to.

### Pattern 4: Process Spawning Binary Change

**What:** `claude-process.ts` spawns `"claude"` on line 123. Change to `"gsd"`.

**Current args that must change:**
```typescript
// BEFORE (v1 — Claude Code specific flags)
args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
if (this._sessionId) args.push("--resume", this._sessionId);
if (this.options.model)  args.push("--model", this.options.model);
args.push("--dangerously-skip-permissions");

// AFTER (GSD 2 — minimal changes for Phase 12)
// Phase 13 handles full Pi SDK arg mapping.
// For Phase 12: change binary name only, keep args as-is for now.
// The stream will be different format but Phase 13 handles that.
// Key: remove CLAUDECODE env var strip (not relevant for gsd binary),
// but keep env passthrough otherwise.
```

**Phase 12 scope for COMPAT-05:** Change `"claude"` → `"gsd"` on the spawn call. Do NOT redesign the arg set — that belongs to Phase 13's Pi SDK integration. The goal is that `/gsd auto` spawns and streams (even if stream parsing needs hardening in Phase 13).

**CLAUDECODE env var:** The current code strips `CLAUDECODE` from env to avoid "nested session" rejection. This env var is Claude Code specific. For `gsd`, check if an equivalent guard is needed. Given Phase 13 will handle session continuity properly, the env strip can be kept for Phase 12 (harmless to strip a non-existent var).

### Pattern 5: Command Registry Replacement

**What:** `slash-commands.ts` exports `GSD_COMMANDS` (21 v1 entries) and `CLAUDE_CODE_COMMANDS` (21 Claude Code specific entries). Replace `GSD_COMMANDS` entirely with 9 GSD 2 entries. `CLAUDE_CODE_COMMANDS` should remain since they are native slash commands available in any Claude Code session.

**Wait — COMPAT-04 clarification:** The CLAUDE_CODE_COMMANDS are Claude Code native commands (`/help`, `/clear`, `/model` etc.). These are NOT GSD v1 commands. They should remain. Only `GSD_COMMANDS` is replaced.

**New GSD_COMMANDS:**
```typescript
export const GSD_COMMANDS: SlashCommand[] = [
  { command: "/gsd",         description: "Guided mode — reads project state, shows what's next", args: "", source: "gsd" },
  { command: "/gsd auto",    description: "Autonomous mode — research, plan, execute, commit, repeat", args: "", source: "gsd" },
  { command: "/gsd stop",    description: "Stop auto mode gracefully", args: "", source: "gsd" },
  { command: "/gsd discuss", description: "Discuss architecture and decisions", args: "", source: "gsd" },
  { command: "/gsd status",  description: "Progress dashboard", args: "", source: "gsd" },
  { command: "/gsd queue",   description: "Queue future milestones", args: "", source: "gsd" },
  { command: "/gsd prefs",   description: "Model selection, timeouts, budget ceiling", args: "", source: "gsd" },
  { command: "/gsd migrate", description: "Migrate v1 .planning/ directory to .gsd/ format", args: "", source: "gsd" },
  { command: "/gsd doctor",  description: "Validate .gsd/ integrity, find and fix issues", args: "", source: "gsd" },
];
```

**Note on autocomplete prefix matching:** The existing `filterCommands(input)` uses `c.command.startsWith(input)`. The command `/gsd auto` will match when input is `/gsd ` (with space) but not when input is `/gsd` alone (since `/gsd` without space would match all `/gsd*` entries). The current autocomplete UX already handles this correctly for the existing `/gsd:*` prefix. The space-separated subcommand syntax is a behavior change — verify `filterCommands` still works as expected with `/gsd ` prefix input.

### Pattern 6: Migration Banner

**What:** A new UI component that appears when the active project has a `.planning/` directory but no `.gsd/` directory.

**Detection mechanism:** Add `needsMigration: boolean` field to `GSD2State` (or the equivalent top-level state). Set it in `buildFullState()` by checking:
1. Parent of `gsdDir` (repoRoot) has `.planning/` directory
2. `gsdDir` itself does not exist or is empty

**Banner placement:** Chat area top is the most practical location since it is always visible when a project is open. The banner is dismissed by either running migration or switching projects.

**Banner sends message:** The "Run migration" button sends `/gsd migrate` as a chat message to the active session's process manager. This follows the same `sendMessage()` path as typing in the chat input.

### Anti-Patterns to Avoid

- **Hardcoding milestone IDs:** Never write `"M001"` as a file path component. Always derive from STATE.md active pointers.
- **Throwing on missing `.gsd/` files:** All reads must follow the `readFileText()` → `null` pattern. Consumers check for null before parsing.
- **Renaming `planningDir` variable:** The variable name is used in 20+ places. Keep it — just change the value from `.planning` to `.gsd`.
- **Changing `CLAUDE_CODE_COMMANDS`:** Those are not GSD v1 commands. They stay.
- **Removing `--resume` / session continuity from claude-process.ts in Phase 12:** That is Phase 13 scope. Phase 12 only changes the binary name.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex parser for `STATE.md` | `gray-matter` (already installed) | Handles edge cases, multi-document YAML, encoding |
| File existence checks | Custom try/catch per-file | Existing `readFileText()` returning `null` | Already handles all error cases gracefully |
| Autocomplete filtering | New prefix matcher | Existing `filterCommands()` | Already works with prefix matching; just change the data |
| Migration detection | New API endpoint | Add `needsMigration` flag to existing `GSD2State` pushed via WebSocket | State is already pushed to client; no new API needed |

---

## Common Pitfalls

### Pitfall 1: GSD 2 STATE.md Has Multiple YAML Frontmatter Blocks

**What goes wrong:** The project's own `.planning/STATE.md` contains two `---` YAML frontmatter blocks (observed in the real file). `gray-matter` parses only the first frontmatter block. If GSD 2's `STATE.md` follows the same pattern, the second block's data will not be parsed.

**Why it happens:** `gray-matter` stops at the first `---` closing delimiter.

**How to avoid:** Read the file and check if it contains multiple `---` delimited blocks. Use the last frontmatter block (most recent state). A simple approach: split on `---\n` and `matter()` the last YAML-containing chunk. Alternatively, use `gray-matter` with `excerpt: false` and parse the full content body for the second block manually.

**Warning signs:** `STATE.md` parses but `data.active_milestone` is undefined even though the file clearly contains the field.

### Pitfall 2: `.planning/` Path Appears in `watcher.ts` Dotfile Filter

**What goes wrong:** `watcher.ts` line 44 has a dotfile filter: `if (firstSegment.startsWith(".") && !firstSegment.startsWith(".planning")) return`. After the migration, this should read `.gsd`. If not updated, the watcher will silently drop all `.gsd/` file change events.

**Why it happens:** The filter was written with `.planning` as the sole GSD directory name.

**How to avoid:** Change the exception to `.gsd` in the filter.

**Warning signs:** File changes in `.gsd/` produce no WebSocket state updates.

### Pitfall 3: `isGsdProject` Detection in `fs-api.ts` and `fs-types.ts`

**What goes wrong:** `listDirectory()` and `detectProject()` in `fs-api.ts` check for `.planning/` to mark a folder as a GSD project. After Phase 12, projects have `.gsd/` not `.planning/`. These must be updated or both directory names must be checked (for migration support).

**Why it happens:** GSD project detection was written for v1.

**How to avoid:** Update detection to check for `.gsd/` first. For migration banner support, also check if `.planning/` exists without `.gsd/`. The result feeds `RecentProject.isGsdProject` and `FileSystemEntry.isGsdProject`.

**Warning signs:** File browser shows GSD 2 projects as plain folders (no GSD icon/indicator).

### Pitfall 4: `server.ts` switchProject Still Resolves `.planning`

**What goes wrong:** The `/api/project/switch` handler in `server.ts` always resolves `const planningDir = resolve(projectPath, ".planning")`. After Phase 12, this should be `.gsd`. The switch will watch the wrong directory.

**Why it happens:** Hardcoded string in server.ts line 111.

**How to avoid:** Change to `.gsd` alongside the startup path change.

**Warning signs:** Switching projects works (no error) but state never updates after switch.

### Pitfall 5: `preferences.md` Is Not JSON

**What goes wrong:** The current `state-deriver.ts` reads `config.json` as JSON (`readFileJson`). GSD 2's `preferences.md` is a markdown file with YAML frontmatter. Calling `Bun.file().json()` on it will throw.

**Why it happens:** Different file format — v1 used JSON config, GSD 2 uses markdown with frontmatter.

**How to avoid:** Read `preferences.md` with `readFileText()` then parse with `gray-matter`. Extract `budget_ceiling`, `skill_discovery`, and model selection fields from frontmatter.

### Pitfall 6: `--resume` Session Continuity Flag Is Claude Code Specific

**What goes wrong:** `claude-process.ts` passes `--resume <sessionId>` to maintain session continuity. This is a Claude Code CLI flag. The `gsd` binary may not support `--resume`. If it does not, the process will exit with a non-zero code on the first `sendMessage()` call.

**Why it happens:** Session continuity mechanism differs between Claude Code CLI and `gsd` binary.

**How to avoid:** For Phase 12, remove `--resume` from the args when spawning `gsd`. Session continuity via `gsd` is a Phase 13 concern. Removing it makes Phase 12 a "stateless per-message" spawn mode, which is already how the code works for new sessions.

---

## Code Examples

### GSD 2 STATE.md Frontmatter (expected shape)

```typescript
// Source: CONTEXT.md decisions, STATE.md observed format
// gray-matter will parse this:
// ---
// gsd_state_version: 1.0
// milestone: v2.0
// milestone_name: Native Desktop
// status: in_progress
// active_milestone: M001
// active_slice: S01
// active_task: T01
// auto_mode: false
// cost: 0.00
// tokens: 0
// last_updated: "2026-03-12T..."
// ---

interface GSD2ProjectState {
  gsd_state_version: string;
  milestone: string;
  milestone_name: string;
  status: string;
  active_milestone: string;   // "M001", "M002", etc.
  active_slice: string;       // "S01", "S02", etc.
  active_task: string;        // "T01", "T02", etc.
  auto_mode: boolean;
  cost: number;
  tokens: number;
  last_updated: string;
}
```

### Dynamic File Path Resolution

```typescript
// Source: CONTEXT.md decisions — never hardcode IDs
export async function buildFullState(gsdDir: string): Promise<GSD2State> {
  // Phase 1: Read STATE.md to get active pointers
  const stateRaw = await readFileText(join(gsdDir, "STATE.md"));
  const projectState = stateRaw ? parseGSD2State(stateRaw) : DEFAULT_GSD2_PROJECT_STATE;

  const { active_milestone, active_slice, active_task } = projectState;

  // Phase 2: Derive all other file paths from active pointers
  const [roadmapRaw, planRaw, summaryRaw, decisionsRaw, prefsRaw, projectRaw, contextRaw] =
    await Promise.all([
      readFileText(join(gsdDir, `${active_milestone}-ROADMAP.md`)),
      readFileText(join(gsdDir, `${active_slice}-PLAN.md`)),
      readFileText(join(gsdDir, `${active_task}-SUMMARY.md`)),
      readFileText(join(gsdDir, "DECISIONS.md")),
      readFileText(join(gsdDir, "preferences.md")),
      readFileText(join(gsdDir, "PROJECT.md")),
      readFileText(join(gsdDir, `${active_milestone}-CONTEXT.md`)),
    ]);

  // Phase 3: Check for migration need (parent has .planning but no .gsd)
  const repoRoot = resolve(gsdDir, "..");
  const needsMigration = await checkMigrationNeeded(repoRoot, gsdDir);

  // ... parse and return
}
```

### Migration Detection

```typescript
// Source: CONTEXT.md decisions
async function checkMigrationNeeded(repoRoot: string, gsdDir: string): Promise<boolean> {
  try {
    await access(join(repoRoot, ".planning"));
    // .planning exists — now check if .gsd does NOT exist
    try {
      await access(gsdDir);
      return false; // .gsd exists — no migration needed
    } catch {
      return true; // .planning exists but .gsd does not — migration needed
    }
  } catch {
    return false; // .planning does not exist — not a v1 project
  }
}
```

### GSD Command Registry (new)

```typescript
// Source: CONTEXT.md decisions
export const GSD_COMMANDS: SlashCommand[] = [
  { command: "/gsd",         description: "Guided mode — reads project state, shows what's next", args: "", source: "gsd" },
  { command: "/gsd auto",    description: "Autonomous mode — research, plan, execute, commit, repeat", args: "", source: "gsd" },
  { command: "/gsd stop",    description: "Stop auto mode gracefully", args: "", source: "gsd" },
  { command: "/gsd discuss", description: "Discuss architecture and decisions", args: "", source: "gsd" },
  { command: "/gsd status",  description: "Progress dashboard", args: "", source: "gsd" },
  { command: "/gsd queue",   description: "Queue future milestones", args: "", source: "gsd" },
  { command: "/gsd prefs",   description: "Model selection, timeouts, budget ceiling", args: "", source: "gsd" },
  { command: "/gsd migrate", description: "Migrate v1 .planning/ directory to .gsd/ format", args: "", source: "gsd" },
  { command: "/gsd doctor",  description: "Validate .gsd/ integrity, find and fix issues", args: "", source: "gsd" },
];
```

### Settings Panel GSD 2 Fields

```typescript
// Source: CONTEXT.md decisions — preferences.md frontmatter fields
// Global: ~/.gsd/preferences.md
// Per-phase model selection fields (from GSD 2 preferences schema):
const GSD2_MODEL_OPTIONS = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"];
const SKILL_DISCOVERY_OPTIONS = ["auto", "suggest", "off"] as const;

// Settings section replaces v1 "Claude Code Options":
// - research_model: string (select from model options)
// - planning_model: string (select from model options)
// - execution_model: string (select from model options)
// - completion_model: string (select from model options)
// - budget_ceiling: number (numeric field, maps to budget_ceiling in preferences.md)
// - skill_discovery: "auto" | "suggest" | "off" (select)
// REMOVED: skip_permissions, allowed_tools, model (single/global)
```

---

## Existing Test Infrastructure

The project uses `bun:test` with tests in `packages/mission-control/tests/`. All test files follow the `kebab-case.test.ts` pattern. No new test framework is needed.

**Relevant existing test files:**
- `tests/state-deriver.test.ts` — tests `buildFullState()`, `parseRoadmap()`, `parseRequirements()`
- `tests/state-deriver-extended.test.ts` — extended state deriver coverage
- `tests/state-deriver-phase5.test.ts` — phase-5 state tests
- `tests/pipeline-switch.test.ts` — tests `switchProject()` which passes `.planning/` paths

**Quick run command:** `cd packages/mission-control && bun test --testPathPattern state-deriver`
**Full suite command:** `cd packages/mission-control && bun test`

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Bun built-in) |
| Config file | `packages/mission-control/package.json` (`"test": "bun test"`) |
| Quick run command | `cd packages/mission-control && bun test --testPathPattern state-deriver` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMPAT-01 | File watcher targets `.gsd/`, not `.planning/` | unit | `bun test --testPathPattern watcher` | ✅ `watcher.test.ts` |
| COMPAT-02 | `buildFullState()` reads GSD 2 files from `.gsd/` | unit | `bun test --testPathPattern state-deriver` | ✅ `state-deriver.test.ts` (requires rewrite for GSD 2 fixtures) |
| COMPAT-03 | Dynamic ID resolution from STATE.md active pointers | unit | `bun test --testPathPattern state-deriver` | ✅ needs new test cases in existing file |
| COMPAT-04 | `GSD_COMMANDS` contains only GSD 2 entries, no v1 entries | unit | `bun test --testPathPattern slash-commands` | ❌ Wave 0 — new file |
| COMPAT-05 | `ClaudeProcessManager` spawns `gsd`, not `claude` | unit | `bun test --testPathPattern claude-process` | ❌ Wave 0 — new file |
| COMPAT-06 | Migration banner shown when `.planning/` exists but no `.gsd/` | unit | `bun test --testPathPattern migration-banner` | ❌ Wave 0 — new file |
| COMPAT-07 | Settings panel renders GSD 2 fields, not v1 fields | unit | `bun test --testPathPattern SettingsView` | ❌ Wave 0 — new file |

**Regression test (from CONTEXT.md):** Open GSD 2 project → STATE.md read correctly → autocomplete shows GSD 2 commands → `/gsd auto` spawns and streams.

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test --testPathPattern state-deriver`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/slash-commands.test.ts` — covers COMPAT-04: GSD 2 commands present, no v1 commands
- [ ] `tests/claude-process-gsd.test.ts` — covers COMPAT-05: spawn binary is `gsd` not `claude`
- [ ] `tests/migration-banner.test.ts` — covers COMPAT-06: `needsMigration` flag derivation
- [ ] `tests/settings-view-gsd2.test.ts` — covers COMPAT-07: SettingsView renders GSD 2 fields

Existing `state-deriver.test.ts` needs new test fixtures using `.gsd/` directory layout with GSD 2 file schema — the existing v1 fixtures will be replaced/augmented.

---

## File-by-File Change Inventory

This is a precise map for the planner to use when structuring tasks:

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/server/types.ts` | REWRITE | `PlanningState` → `GSD2State`; `ProjectState` fields updated for GSD 2; new `GSD2Preferences`, `GSD2SlicePlan`, `GSD2TaskSummary` interfaces; `ConfigState` removed or slimmed; `WatcherOptions.planningDir` comment updated |
| `src/server/state-deriver.ts` | REWRITE | `buildFullState()` reads `.gsd/` flat schema; dynamic ID resolution from STATE.md; `parseRoadmap()` updated for `M{NNN}-ROADMAP.md` format; `parseRequirements()` may be removed; add `checkMigrationNeeded()`; add `parsePreferences()` for markdown frontmatter |
| `src/server/watcher.ts` | EDIT (1 line) | Dotfile filter: `.planning` → `.gsd` (line 44) |
| `src/server/pipeline.ts` | EDIT (2 lines) | Comment update "one level up from .gsd"; no logic change needed (path comes from options) |
| `src/server/claude-process.ts` | EDIT (2-3 lines) | Spawn binary `"claude"` → `"gsd"`; remove `--resume` flag (Phase 13 concern); remove Claude-Code-specific env handling comment |
| `src/server/fs-api.ts` | EDIT (3 occurrences) | `.planning` → `.gsd` in `listDirectory()` and `detectProject()` |
| `src/server/fs-types.ts` | EDIT (comments) | Update `isGsdProject` field comments |
| `src/server.ts` | EDIT (2 occurrences) | Line 19: `.planning` → `.gsd`; line 111: `.planning` → `.gsd`; `hasPlanningDir` logic can remain for migration detection or be updated |
| `src/lib/slash-commands.ts` | REWRITE GSD_COMMANDS | Replace 21 v1 entries with 9 GSD 2 entries; keep `CLAUDE_CODE_COMMANDS` unchanged; update module JSDoc comment |
| `src/components/views/SettingsView.tsx` | EDIT | Replace "Claude Code Options" section with "GSD 2 Options" section (per-phase model fields, budget_ceiling, skill_discovery); remove `skip_permissions`, `model` (single), `allowed_tools` fields |
| `src/components/` (new file) | CREATE | `MigrationBanner.tsx` — inline banner component, shown when `state.needsMigration === true` |
| `src/hooks/usePlanningState.ts` | EDIT | Type update: `PlanningState` → `GSD2State` |
| `tests/state-deriver.test.ts` | EDIT | Replace v1 fixtures with GSD 2 fixtures; add dynamic ID resolution tests |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.planning/` directory as GSD project root | `.gsd/` directory as GSD project root | GSD 2 release | All file path resolution must change |
| `claude` or `claude-code` binary | `gsd` binary (wraps Pi SDK) | GSD 2 release | Process spawning binary changes |
| `/gsd:command` slash syntax | `/gsd subcommand` space-separated syntax | GSD 2 release | All autocomplete entries change |
| `config.json` for project settings | `preferences.md` with YAML frontmatter | GSD 2 release | Settings file format and location change |
| Flat `.planning/` with `phases/` subdirectory | `.gsd/` with `M{NNN}-ROADMAP.md`, `S{NN}-PLAN.md` etc. | GSD 2 release | State deriver schema completely different |
| Single model selection | Per-phase model selection (research/planning/execution/completion) | GSD 2 release | Settings panel fields multiply |

---

## Open Questions

1. **GSD 2 `gsd` binary argument interface**
   - What we know: Binary is `gsd`; Pi SDK outputs structured NDJSON events; Phase 13 handles full stream parsing
   - What's unclear: Which CLI flags does `gsd` accept? Does it accept `-p <prompt>`? Does it have a `--resume` equivalent?
   - Recommendation: For Phase 12, spawn `gsd` with minimal args: just the prompt as a positional argument or `-p` flag. Test manually against a real GSD 2 project. Phase 13 will add proper flag handling once the stream format is nailed down.

2. **GSD 2 `STATE.md` exact frontmatter field names**
   - What we know: Fields include `active_milestone`, `active_slice`, `active_task` based on CONTEXT.md; `gsd_state_version`, `milestone`, `milestone_name`, `status` from project's own STATE.md
   - What's unclear: Exact field names for `auto_mode`, `cost`, `tokens` in a real GSD 2 project's STATE.md
   - Recommendation: Parse defensively — all fields optional with defaults. The planner should note that STATE.md field names need validation against a real GSD 2 project before finalizing the type definition.

3. **`preferences.md` exact frontmatter schema**
   - What we know: Must contain `budget_ceiling`, `skill_discovery`, and per-phase model fields
   - What's unclear: Exact YAML key names (e.g., `research_model` vs `model.research`)
   - Recommendation: Parse permissively. Use `gray-matter` on `~/.gsd/preferences.md` and log the shape in Wave 0 of the plan.

4. **Migration banner placement**
   - What we know: Claude's discretion; options are header, sidebar, or chat area
   - Recommendation: Place in `ChatView` as a top-of-chat-area banner. Chat area is always visible when a project is active. Banner should be dismissible (close button) even if user doesn't run migration.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `packages/mission-control/src/` — all findings based on reading the actual source files
- `12-CONTEXT.md` — locked decisions and file schema, treated as authoritative product spec

### Secondary (MEDIUM confidence)
- `.planning/codebase/ARCHITECTURE.md` — architecture documentation, cross-referenced with source code
- `.planning/codebase/STACK.md` — stack documentation, cross-referenced with package.json

### Tertiary (LOW confidence)
- GSD 2 `gsd` binary argument interface — inferred from CONTEXT.md and Pi SDK mention; not directly verified against binary help output

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing libraries confirmed by source inspection
- Architecture: HIGH — all files directly inspected; touch points precisely identified
- Pitfalls: HIGH — identified from direct source code analysis, not speculation
- GSD 2 file schema field names: MEDIUM — from CONTEXT.md spec + project's own STATE.md; exact field names for preferences.md unverified

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable internal migration — no external library changes)
