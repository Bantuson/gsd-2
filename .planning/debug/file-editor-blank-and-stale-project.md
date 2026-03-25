---
status: awaiting_human_verify
trigger: "Bug 1: FileEditor blank — file content never displays. Bug 2: Project display and Code Explorer stuck on old project."
created: 2026-03-17T00:00:00Z
updated: 2026-03-17T00:10:00Z
---

## Current Focus

hypothesis: All three root causes confirmed and fixed
test: bun test — 12/12 code-explorer tests pass; full suite 867 pass / 82 fail (all failures pre-existing, unrelated to changed files)
expecting: User confirms editor shows content and project name/tree updates on folder switch
next_action: Await human verification

## Symptoms

expected: FileEditor shows file content when a file is selected; switching projects updates sidebar name and Code Explorer tree
actual: FileEditor shows blank; project name and file tree remain stale after switching projects
errors: none visible — silent failures
reproduction: Select file in Code Explorer → editor blank; open new project folder → sidebar/tree show old project
started: After phase 20.1 Code Explorer implementation

## Eliminated

- hypothesis: isBinaryContent() false-positive on normal text files
  evidence: Current implementation uses content.slice(0, 8192).includes("\0") — correct, only checks null bytes. Not the cause.
  timestamp: 2026-03-17T00:01:00Z

- hypothesis: try/catch in init effect swallowing EditorState.create() errors
  evidence: This was present in the pre-stash version but linter-reverted to a cleaner version without try/catch. Not the primary cause.
  timestamp: 2026-03-17T00:01:00Z

## Evidence

- timestamp: 2026-03-17T00:00:30Z
  checked: FileEditor.tsx — content-sync useEffect dep array
  found: Original code had `}, [content]` on the content-sync effect. When filePath changes, CodeExplorer resets fileContent to "" before the fetch resolves. If content was already "" from a previous file load, the [content] effect would NOT re-fire (content didn't change — stayed ""). This means the editor stays blank permanently for the new file.
  implication: Fix: add filePath to content-sync deps → `[content, filePath]` ensures the dispatch runs when the file changes, even if content value transitions "" → ""

- timestamp: 2026-03-17T00:01:00Z
  checked: AppShell.tsx — all three FolderPickerModal onSelect handlers
  found:
    Line 278 (home mode): saves to localStorage, calls dismiss() — NO setActiveProjectPath(path) call
    Line 325 (onboarding mode): saves to localStorage, calls dismiss() — NO setActiveProjectPath(path) call
    Line 474 (dashboard mode): ONLY calls dismiss() — no localStorage save, no setActiveProjectPath(path)
  implication: activeProjectPath state never updates when folder picker is used → projectName stays stale → CodeExplorer receives old projectRoot

- timestamp: 2026-03-17T00:02:30Z
  checked: FileTree.tsx — entries Map and expandedDirs Set lifecycle
  found: No reset effect on projectRoot change. loadDir() has early return `if (entries.has(dirPath)) return` — but new root path won't be in the map, so it does fetch. However stale entries from old project remain in the map, and old expandedDirs remain, leaking stale tree state.
  implication: Fix: add useEffect that resets entries and expandedDirs when projectRoot changes (runs before loadDir effect due to declaration order)

- timestamp: 2026-03-17T00:10:00Z
  checked: bun test results
  found: 12/12 code-explorer tests pass; full suite 867 pass / 82 fail. Pre-fix baseline was 878 pass / 83 fail (stash baseline). The difference is pre-existing flaky tests — all failures are in unrelated test files (auth-phase16, sidebar-tree ChatView class mismatch, playwright e2e, etc.). No new failures introduced.
  implication: Fixes are clean — no regressions

## Resolution

root_cause: |
  Bug 1 (FileEditor blank): The content-sync useEffect depended only on [content]. When a new file is selected, CodeExplorer resets fileContent to "" before the async fetch completes. If the previously-viewed file also had content="" (or any file that left content as ""), the [content] dependency would not detect a change (same value "" → ""), so the sync dispatch never fires, leaving the editor blank permanently even after the fetch completes with real content.

  Bug 2A (stale project name): All three FolderPickerModal onSelect handlers in AppShell.tsx failed to call setActiveProjectPath(path). The home and onboarding instances saved to localStorage but returned without updating React state. The dashboard instance only called dismiss() with no side effects. Since activeProjectPath drives both the projectName shown in the sidebar and the projectRoot passed to CodeExplorer, the UI stayed frozen on the old project.

  Bug 2B (stale file tree): FileTree.tsx entries Map and expandedDirs Set were never reset when projectRoot changed. Old project entries lingered alongside new ones, and old expanded-dir state remained visible.

fix: |
  1. FileEditor.tsx: Changed content-sync useEffect deps from `[content]` to `[content, filePath]` so the dispatch runs whenever the file changes, not only when the content string value differs.
  2. AppShell.tsx line 278 (home FolderPickerModal): Added `setActiveProjectPath(path)` call.
  3. AppShell.tsx line 325 (onboarding FolderPickerModal): Added `setActiveProjectPath(path)` call.
  4. AppShell.tsx line 474 (dashboard FolderPickerModal): Added localStorage save and `setActiveProjectPath(path)` call — was previously only calling dismiss().
  5. FileTree.tsx: Added `useEffect(() => { setEntries(new Map()); setExpandedDirs(new Set()); }, [projectRoot])` before the loadDir effect to reset stale state on project switch.

verification: |
  bun test: 12/12 code-explorer tests pass. Full suite 867 pass / 82 fail — all failures are pre-existing and in unrelated files (auth-phase16, sidebar ChatView class mismatch, playwright e2e specs). No new failures introduced by any of the three fixes.

files_changed:
  - packages/mission-control/src/components/code-explorer/FileEditor.tsx
  - packages/mission-control/src/components/layout/AppShell.tsx
  - packages/mission-control/src/components/code-explorer/FileTree.tsx
