---
status: awaiting_human_verify
trigger: "Code Explorer right-panel editor crashes when file loads; .gsd folder not shown in file tree"
created: 2026-03-17T00:00:00Z
updated: 2026-03-17T00:10:00Z
---

## Current Focus

hypothesis: |
  Bug 1: FileEditor has TWO bugs:
  (a) Wrong dependency array on the content-sync useEffect — it uses [filePath] instead of [content],
      so when the fetch resolves and setFileContent fires, the editor is never updated.
  (b) EditorState.create({ doc: content }) crashes when content contains null bytes
      (binary files like images) because CodeMirror forbids null characters in Text nodes.
  (c) No binary file guard — any binary file picked from the tree will crash the editor.

  Bug 2: fs-api.ts line 77 `if (name.startsWith(".")) continue;` hides ALL dotfiles including .gsd and .planning.

test: "bun test tests/code-explorer.test.ts tests/code-explorer.test.tsx tests/fs-api.test.ts — all pass"
expecting: "Human verifies editor shows file content and .gsd folder is visible"
next_action: "Human verify in browser"

## Symptoms

expected: "Code Explorer right panel shows selected file content; .gsd folder visible in file tree"
actual: "Right panel editor crashes when file loads; .gsd and .planning folders not shown in tree"
errors: "No specific error message — crash in FileEditor.tsx CodeMirror initialization"
reproduction: "Open Code Explorer, click any file in left tree, right panel crashes"
started: "Since Code Explorer was introduced in phase 20.1-04"

## Eliminated

- hypothesis: "Race condition — second useEffect dispatches on null viewRef.current"
  evidence: "viewRef.current guard on line 97 (`if (!viewRef.current) return`) prevents this path"
  timestamp: 2026-03-17T00:00:00Z

## Evidence

- timestamp: 2026-03-17T00:00:00Z
  checked: "FileEditor.tsx second useEffect dependency array (line 106)"
  found: "Dependency is [filePath] not [content] — editor created with empty string, never updated when fetch resolves"
  implication: "Editor always shows empty/stale content after file load. Not a crash per se but wrong behavior."

- timestamp: 2026-03-17T00:00:00Z
  checked: "FileEditor.tsx EditorState.create call (line 54)"
  found: "doc: content with no sanitization — if content contains null bytes (binary file), CodeMirror throws because Text.of() does not allow \\0 characters"
  implication: "Crash when user opens a binary file (image, compiled asset, etc.)"

- timestamp: 2026-03-17T00:00:00Z
  checked: "FileEditor.tsx second useEffect dependency array — content-sync effect"
  found: "The effect at lines 96-106 re-syncs doc when content changes but deps say [filePath]. This means the effect only runs when filePath changes, not when content arrives from fetch."
  implication: "Root cause of 'editor shows empty' bug combined with the crash when content has null bytes"

- timestamp: 2026-03-17T00:00:00Z
  checked: "fs-api.ts line 77"
  found: "`if (name.startsWith(\".\")) continue;` unconditionally skips ALL dotfiles including .gsd and .planning"
  implication: "Root cause of .gsd folder not showing — confirmed matches pre-investigation finding"

## Resolution

root_cause: |
  Bug 1 (crash + empty editor):
  - FileEditor.tsx second useEffect has wrong dependency [filePath] instead of [content],
    so editor content is never updated when the async fetch resolves. Creates editor with "".
  - No null-byte guard: binary files cause EditorState.create to throw because CodeMirror
    Text.of() rejects strings containing \0 characters.
  - Fix: (1) change second useEffect dep to [content], (2) add binary/size guard before
    rendering CodeMirror, (3) add try/catch around EditorState.create.

  Bug 2 (dotfiles hidden):
  - fs-api.ts line 77 unconditionally skips names starting with "." — hides .gsd and .planning.
  - Fix: allow .gsd and .planning through the dotfile skip.

fix: |
  FileEditor.tsx:
  - Add isBinary() helper: checks for null bytes in first 8KB of content
  - Add size guard: files > 500KB show "File too large" message
  - Add binary guard: binary files show "Binary file — cannot display" message
  - Wrap EditorState.create in try/catch to prevent unhandled throws
  - Fix second useEffect dependency from [filePath] to [content]

  fs-api.ts line 77:
  - Change `if (name.startsWith(".")) continue;`
    to `if (name.startsWith(".") && name !== ".gsd" && name !== ".planning") continue;`

verification: "bun test: 10/10 code-explorer tests pass, 23/23 fs-api+boundary tests pass. 87 pre-existing failures unaffected. Awaiting human verify in browser."
files_changed:
  - packages/mission-control/src/components/code-explorer/FileEditor.tsx
  - packages/mission-control/src/server/fs-api.ts
