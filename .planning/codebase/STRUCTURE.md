# Codebase Structure

**Analysis Date:** 2026-03-12

## Directory Layout

```
gsd-2/                              # Monorepo root (no workspace tooling — two separate packages)
├── src/                            # GSD CLI source (compiled to dist/)
│   ├── loader.ts                   # CLI entry point — env setup, bootstraps cli.ts
│   ├── cli.ts                      # Pi SDK session creation, interactive/print/rpc modes
│   ├── app-paths.ts                # Centralized path constants (~/.gsd/ locations)
│   ├── resource-loader.ts          # Syncs bundled resources to ~/.gsd/agent/
│   ├── tool-bootstrap.ts           # Provisions managed binaries (fd, rg) to ~/.gsd/agent/bin/
│   ├── wizard.ts                   # First-run setup wizard
│   └── resources/                  # Bundled resources (synced to ~/.gsd/agent/ at runtime)
│       ├── GSD-WORKFLOW.md         # Master workflow protocol document
│       ├── AGENTS.md               # Agent instructions
│       ├── agents/                 # Agent definition files
│       ├── skills/                 # Reusable skill files
│       └── extensions/             # Pi SDK extensions
│           ├── gsd/                # Primary GSD extension (all /gsd commands + hooks)
│           ├── bg-shell/           # Background shell tool
│           ├── browser-tools/      # Playwright-based browser tools
│           ├── context7/           # Context7 integration
│           ├── search-the-web/     # Web search (wraps google-search)
│           ├── slash-commands/     # Slash command registration helpers
│           ├── subagent/           # Subagent dispatching (spawns child gsd processes)
│           ├── mac-tools/          # macOS-specific tools (Swift CLI)
│           ├── remote-questions/   # Remote question/answer channel
│           ├── shared/             # Shared library (NOT an extension entry point)
│           ├── ask-user-questions.ts   # Interactive user input tool
│           └── get-secrets-from-user.ts # Secrets prompting tool
├── packages/
│   └── mission-control/            # React web dashboard (Bun-served, separate from CLI)
│       ├── src/
│       │   ├── server.ts           # Bun HTTP server entry point (port 4000)
│       │   ├── App.tsx             # React root component
│       │   ├── frontend.tsx        # Bun bundler entry for React app
│       │   ├── server/             # Server-side modules
│       │   │   ├── pipeline.ts     # Orchestrator: watcher → deriver → differ → WS
│       │   │   ├── state-deriver.ts# Parses .planning/ into PlanningState
│       │   │   ├── differ.ts       # Computes state diffs for WS broadcast
│       │   │   ├── watcher.ts      # File watcher with debounce
│       │   │   ├── ws-server.ts    # WebSocket server (port 4001)
│       │   │   ├── claude-process.ts # Spawns claude CLI per message
│       │   │   ├── session-manager.ts# Multi-session lifecycle
│       │   │   ├── types.ts        # PlanningState, StateDiff, shared types
│       │   │   ├── fs-api.ts       # /api/fs/* handler
│       │   │   ├── dialog-api.ts   # /api/dialog/* handler (native file pickers)
│       │   │   ├── git-api.ts      # /api/git/* handler
│       │   │   ├── recent-projects.ts # /api/projects/* handler
│       │   │   ├── settings-api.ts # /api/settings handler
│       │   │   ├── assets-api.ts   # /api/assets/* handler
│       │   │   ├── session-status-api.ts # /api/session/* handler
│       │   │   ├── proxy-api.ts    # /api/preview/* dev server proxy
│       │   │   ├── chat-router.ts  # Chat message routing helpers
│       │   │   ├── chat-types.ts   # ChatResponse, StreamEvent types
│       │   │   ├── mode-interceptor.ts  # Strips inline mode tags from stream
│       │   │   ├── ndjson-parser.ts # NDJSON stream parser
│       │   │   ├── switch-guard.ts # Prevents concurrent project switches
│       │   │   ├── session-persistence-api.ts # Session viewport persistence
│       │   │   └── worktree-api.ts # Git worktree operations
│       │   ├── components/         # React components (feature-grouped)
│       │   │   ├── layout/         # AppShell, Sidebar, SingleColumnView
│       │   │   ├── views/          # Page-level views (ChatView, MilestoneView, etc.)
│       │   │   ├── chat/           # Chat panel components
│       │   │   ├── milestone/      # Milestone display components
│       │   │   ├── sidebar/        # Sidebar nav and project browser
│       │   │   ├── active-task/    # Active task display
│       │   │   ├── slice-detail/   # Slice detail view
│       │   │   ├── session/        # Loading, onboarding, resume cards
│       │   │   ├── command-palette/# Ctrl+Shift+P command palette
│       │   │   ├── modals/         # PermissionModal, FolderPickerModal
│       │   │   ├── preview/        # Live preview panel
│       │   │   ├── states/         # Empty/loading state components
│       │   │   ├── shared/         # Shared UI primitives
│       │   │   └── ui/             # Base design system components
│       │   ├── hooks/              # React hooks (data + state)
│       │   ├── lib/                # Non-hook utilities (slash-commands, utils, view-types)
│       │   └── styles/             # CSS / Tailwind base styles
│       ├── public/                 # Static assets (index.html)
│       ├── tests/                  # Mission Control tests
│       ├── package.json            # @gsd/mission-control private package
│       ├── bunfig.toml             # Bun configuration
│       └── tsconfig.json           # TypeScript config
├── pkg/                            # Pi SDK shim: piConfig branding + theme assets (no src/)
├── patches/                        # patch-package patches for pi SDK overrides
├── scripts/                        # npm lifecycle scripts (postinstall, sync-pkg-version, etc.)
├── docs/                           # Documentation reference files
├── .planning/                      # GSD planning artifacts for this repo itself
│   ├── codebase/                   # Codebase analysis docs (this directory)
│   ├── phases/                     # Phase plan files
│   ├── milestones/                 # Milestone artifacts (v1.0-phases/)
│   ├── research/                   # Research files
│   ├── STATE.md                    # Current project state
│   ├── ROADMAP.md                  # Milestone roadmap
│   ├── REQUIREMENTS.md             # Requirements list
│   └── config.json                 # GSD config (model, workflow flags, etc.)
├── .claude/commands/               # Claude Code slash command definitions
├── .bg-shell/                      # Background shell state
├── .github/workflows/              # GitHub Actions CI
├── package.json                    # Root package (gsd-pi npm package)
├── tsconfig.json                   # Root TypeScript config
└── package-lock.json               # npm lockfile
```

## Directory Purposes

**`src/`:**
- Purpose: GSD CLI source, compiled to `dist/` for distribution
- Contains: Entry points (`loader.ts`, `cli.ts`), resource sync, path utilities, all bundled extensions
- Key files: `src/loader.ts` (bin entry), `src/cli.ts` (Pi session setup), `src/resource-loader.ts`

**`src/resources/extensions/gsd/`:**
- Purpose: The core GSD extension — every GSD command, hook, and agent behavior lives here
- Contains: `index.ts` (extension export), `commands.ts`, `auto.ts`, `state.ts`, `paths.ts`, `types.ts`, `files.ts`, `prompt-loader.ts`, and ~20 supporting modules
- Key files: `state.ts` (disk→state derivation), `paths.ts` (ID-based addressing), `types.ts` (all types)
- Subdirectories: `prompts/` (markdown prompt templates), `templates/` (file templates), `docs/`, `tests/`, `migrate/`

**`src/resources/extensions/gsd/prompts/`:**
- Purpose: Markdown prompt templates injected into agent turns by `prompt-loader.ts`
- Key files: `system.md`, `execute-task.md`, `plan-slice.md`, `plan-milestone.md`, `guided-execute-task.md`, and 20+ others

**`packages/mission-control/src/server/`:**
- Purpose: All server-side logic for Mission Control — HTTP routing, file watching, Claude process management, WebSocket
- Contains: `pipeline.ts` (orchestrator), `state-deriver.ts` (`.planning/` parser), `claude-process.ts`, `ws-server.ts`, REST API handlers
- No framework — uses Bun's built-in `Bun.serve()` with manual path routing

**`packages/mission-control/src/components/`:**
- Purpose: All React UI components organized by feature area
- Pattern: Feature directories (not atomic design layers): `layout/`, `views/`, `chat/`, `milestone/`, `sidebar/`, `session/`, `modals/`, `preview/`, `ui/` (base primitives)

**`packages/mission-control/src/hooks/`:**
- Purpose: All data fetching, WebSocket communication, and shared UI state
- Pattern: All WebSocket/API interaction goes through hooks; components receive data as props from `AppShell`
- Key hooks: `usePlanningState.ts`, `useSessionManager.ts`, `useChatMode.tsx`, `useReconnectingWebSocket.ts`

**`packages/mission-control/src/lib/`:**
- Purpose: Non-hook utility modules shared across components
- Contains: `layout-storage.ts`, `slash-commands.ts`, `utils.ts`, `view-types.ts`

**`pkg/`:**
- Purpose: Pi SDK config shim — contains a `package.json` with `piConfig.name: "gsd"` and theme assets copied from Pi SDK. Has no `src/` directory. Required so Pi's `config.js` reads GSD branding.
- Generated: No (manually maintained shim)
- Committed: Yes

**`patches/`:**
- Purpose: `patch-package` patches applied to `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui` at install time
- Key files: `@mariozechner+pi-coding-agent+0.57.1.patch`, `@mariozechner+pi-tui+0.57.1.patch`
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning artifacts for this repository (the repo uses GSD to develop itself)
- Contains: `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `config.json`, `phases/`, `milestones/`, `codebase/`, `research/`
- Not generated — maintained by GSD agent turns

## Key File Locations

**Entry Points:**
- `src/loader.ts`: GSD CLI binary entry (compiled to `dist/loader.js`)
- `src/cli.ts`: Pi SDK session initialization and mode dispatch
- `packages/mission-control/src/server.ts`: Mission Control HTTP server entry
- `packages/mission-control/src/frontend.tsx`: React app bundler entry

**Configuration:**
- `package.json`: Root npm package config, bin definitions, build scripts
- `tsconfig.json`: Root TypeScript config for `src/`
- `packages/mission-control/tsconfig.json`: TypeScript config for Mission Control
- `packages/mission-control/bunfig.toml`: Bun runtime config
- `.planning/config.json`: GSD workflow configuration (model, flags)
- `pkg/package.json`: Pi SDK branding shim

**Core Logic:**
- `src/resources/extensions/gsd/state.ts`: `deriveState()` — disk → GSDState
- `src/resources/extensions/gsd/paths.ts`: All `.gsd/` path resolution
- `src/resources/extensions/gsd/types.ts`: All GSD type definitions
- `src/resources/extensions/gsd/auto.ts`: Auto-mode state machine
- `packages/mission-control/src/server/pipeline.ts`: Server orchestrator
- `packages/mission-control/src/server/state-deriver.ts`: `.planning/` → PlanningState
- `packages/mission-control/src/server/claude-process.ts`: Claude CLI spawning

**Testing:**
- `src/resources/extensions/gsd/tests/`: GSD extension unit tests
- `packages/mission-control/tests/`: Mission Control tests

## Naming Conventions

**Files:**
- TypeScript source: `kebab-case.ts` (e.g., `state-deriver.ts`, `claude-process.ts`)
- React components: `PascalCase.tsx` (e.g., `AppShell.tsx`, `ChatPanel.tsx`)
- Hooks: `useCamelCase.ts` or `useCamelCase.tsx` (e.g., `usePlanningState.ts`, `useChatMode.tsx`)
- GSD planning files: `ID-SUFFIX.md` uppercase (e.g., `M001-ROADMAP.md`, `S01-PLAN.md`, `T03-SUMMARY.md`)
- Prompt templates: `kebab-case.md` (e.g., `execute-task.md`, `plan-milestone.md`)

**Directories:**
- Feature directories: `kebab-case` (e.g., `active-task/`, `slice-detail/`, `command-palette/`)
- Extension directories: `kebab-case` (e.g., `bg-shell/`, `browser-tools/`)
- GSD milestone directories: bare ID `M001/` or legacy `M001-DESCRIPTOR/`
- GSD slice directories: bare ID `S01/` or legacy `S01-DESCRIPTOR/`

**Exports:**
- Extensions: `default export function(pi: ExtensionAPI)` in `index.ts`
- Server modules: named exports (e.g., `export async function startPipeline(...)`)
- React hooks: named exports with `use` prefix

## Where to Add New Code

**New GSD command (e.g., `/gsd mycommand`):**
- Register in: `src/resources/extensions/gsd/commands.ts` via `registerGSDCommand()`
- Prompt template (if needed): `src/resources/extensions/gsd/prompts/my-command.md`
- Types (if needed): `src/resources/extensions/gsd/types.ts`

**New GSD extension:**
- Create: `src/resources/extensions/myextension/index.ts` with `export default function(pi: ExtensionAPI)`
- Register in: `src/loader.ts` `GSD_BUNDLED_EXTENSION_PATHS` array

**New Mission Control REST API endpoint:**
- Create handler: `packages/mission-control/src/server/my-api.ts`
- Mount in: `packages/mission-control/src/server.ts` `fetch()` routing block

**New React view (sidebar tab):**
- View component: `packages/mission-control/src/components/views/MyView.tsx`
- Register view type: `packages/mission-control/src/lib/view-types.ts`
- Add nav item: `packages/mission-control/src/components/sidebar/NavItems.tsx`
- Route in: `packages/mission-control/src/components/layout/SingleColumnView.tsx`

**New React hook:**
- Location: `packages/mission-control/src/hooks/useMyHook.ts`
- Pattern: named export `export function useMyHook(...)`

**New shared UI component:**
- Base primitives: `packages/mission-control/src/components/ui/`
- Feature-specific shared: `packages/mission-control/src/components/shared/`

**New GSD planning artifact (when GSD is running on this repo):**
- Phase plans: `.planning/phases/<NN>-phase-name/<NN>-PLAN.md`
- State: `.planning/STATE.md` (updated by GSD agent)

**Utilities:**
- CLI shared helpers: `src/resources/extensions/shared/` (imported by extensions, not an entry point)
- Mission Control non-hook utils: `packages/mission-control/src/lib/`

## Special Directories

**`dist/`:**
- Purpose: TypeScript compiled output of `src/`
- Generated: Yes (`npm run build` / `tsc`)
- Committed: No (gitignored)

**`pkg/`:**
- Purpose: Pi SDK branding shim with `piConfig` and theme assets
- Generated: Partially (theme assets copied by `npm run copy-themes` build step)
- Committed: Yes

**`~/.gsd/`:**
- Purpose: Runtime agent directory created on first launch
- Contains: `agent/` (synced extensions, auth, settings), `sessions/` (per-cwd .jsonl session files)
- Generated: Yes (at runtime by `initResources()`)
- Committed: No (user-local)

**`packages/mission-control/node_modules/`:**
- Purpose: Mission Control dependencies (Bun-managed)
- Generated: Yes
- Committed: No

**`.planning/codebase/`:**
- Purpose: Codebase analysis documents for GSD plan-phase and execute-phase context
- Generated: Yes (by `/gsd:map-codebase` command)
- Committed: Yes

---

*Structure analysis: 2026-03-12*
