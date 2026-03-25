---
status: awaiting_human_verify
trigger: "Multiple integration gaps and runtime bugs after Phase 20.1 execution in packages/mission-control"
created: 2026-03-17T00:00:00Z
updated: 2026-03-17T00:10:00Z
---

## Current Focus

hypothesis: All five root causes confirmed and fixed
test: bun test run — 869 pass, 70 pre-existing failures (TAURI/AUTH-02 planned-not-yet-implemented), 0 new failures
expecting: User to confirm original symptoms are resolved in runtime
next_action: Await human verification

## Symptoms

expected: After server restart, project name appears in sidebar/header, milestone slices render, preview panel auto-scans, no "Leave page?" dialog when switching preview tabs, chat auto-scrolls during streaming
actual:
  1. activeProjectPath is null after server restart → Code Explorer shows "No project open", project name missing
  2. Milestone slices never render → state-deriver reads .gsd/M002-ROADMAP.md but file is at .gsd/milestones/M002/M002-ROADMAP.md
  3. Preview panel shows "Scan for servers" button instead of auto-scanning on open
  4. Switching Desktop→Tablet→Mobile→Dual preview tabs triggers browser "Leave page?" dialog
  5. Chat auto-scroll stops working during GSD streaming output
errors: No hard crashes — silent UI failures (blank panels, stale state, iframe beforeunload)
reproduction:
  1. Restart dev server, open http://localhost:4000 → project name blank
  2. Navigate to Milestones tab → empty slices
  3. Open Preview (Ctrl+P) → shows button, not scanning
  4. After scan finds server, switch viewport tabs → browser dialog
  5. Run a GSD command → chat doesn't scroll to latest output
started: After Phase 20.1 execution (commits c49a1e6, c58c5c6, e94acbd, 580896b, b1b982e)

## Eliminated

- hypothesis: Hard crashes or thrown errors
  evidence: Symptoms described as "silent UI failures" — all five are logic/timing bugs
  timestamp: 2026-03-17T00:00:00Z

## Evidence

- timestamp: 2026-03-17T00:00:00Z
  checked: AppShell.tsx line 71
  found: useState<string | null>(null) — initializes to null synchronously; the restore useEffect fires after render, too late to populate project name header before first paint
  implication: Fix 1 needed — initialize from localStorage synchronously

- timestamp: 2026-03-17T00:00:00Z
  checked: state-deriver.ts buildFullState() lines 467-474
  found: readFileText(join(gsdDir, `${active_milestone}-ROADMAP.md`)) — only reads from .gsd/ root; no fallback to .gsd/milestones/M002/M002-ROADMAP.md subdirectory
  implication: Fix 2 needed — add readMilestoneFile/readSliceFile helpers with subdirectory fallback

- timestamp: 2026-03-17T00:00:00Z
  checked: PreviewPanelWithState.tsx
  found: No useEffect calling triggerScan on mount; panel opens with servers=[] and waits for user to click button
  implication: Fix 3 needed — add mount useEffect to call triggerScan()

- timestamp: 2026-03-17T00:00:00Z
  checked: PreviewPanel.tsx line 72-74, PreviewPanelWithState.tsx lines 45-46
  found: desktopActiveServer initialized from activeFrontendPort (null at mount). After scan arrives, desktopActiveServer stays null. Single-viewport iframe gets src=undefined when switching tabs → React app fires beforeunload → browser "Leave page?" dialog
  implication: Fix 4 needed — sync desktopActiveServer and dual ports when activeFrontendPort arrives

- timestamp: 2026-03-17T00:00:00Z
  checked: ChatPanel.tsx lines 110-116
  found: Auto-scroll useEffect runs synchronously after React render but before browser layout paint; scrollHeight may not reflect new streaming content yet
  implication: Fix 5 needed — wrap scroll in requestAnimationFrame to defer until after layout

## Resolution

root_cause: Five independent integration gaps introduced/exposed by Phase 20.1 changes: (1) useState null init instead of localStorage sync read, (2) state-deriver flat-dir assumption missing subdirectory fallback, (3) missing auto-scan on PreviewPanel mount, (4) desktopActiveServer stays null after async scan completes causing undefined iframe src, (5) scroll fires before browser layout updates scrollHeight during streaming
fix: Applied five targeted fixes — localStorage init, readMilestoneFile/readSliceFile helpers, mount useEffect scan trigger, activeFrontendPort sync effects, requestAnimationFrame scroll deferral
verification: bun test: 869 pass, 0 new failures (70 pre-existing TAURI/AUTH failures unrelated to our changes)
files_changed:
  - packages/mission-control/src/components/layout/AppShell.tsx
  - packages/mission-control/src/server/state-deriver.ts
  - packages/mission-control/src/components/preview/PreviewPanelWithState.tsx
  - packages/mission-control/src/components/preview/PreviewPanel.tsx
  - packages/mission-control/src/components/chat/ChatPanel.tsx
