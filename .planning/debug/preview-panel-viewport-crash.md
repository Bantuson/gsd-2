---
status: resolved
trigger: "Preview panel crash on viewport switching — Desktop works, Tablet/Mobile/Dual crash or trigger Leave page dialog"
created: 2026-03-17T00:00:00Z
updated: 2026-03-17T00:20:00Z
---

## Current Focus

hypothesis: Three confirmed bugs found via code inspection. Applying all fixes now.
test: Applied code changes, will run bun test to verify
expecting: All tests pass, no viewport crash
next_action: Apply fixes to PreviewPanel.tsx

## Symptoms

expected: Switching between Desktop/Tablet/Mobile/Dual viewports works without crash or beforeunload dialog
actual: Desktop works fine; switching to Tablet, Mobile, or Dual triggers crash or browser "Leave page?" dialog
errors: Browser "Leave page?" dialog on viewport switch
reproduction: Open preview panel on desktop with a server loaded. Switch to Tablet, Mobile, or Dual tab.
started: After Phase 20.1-02 PreviewPanel rewrite

## Eliminated

- hypothesis: desktopActiveServer sync missing
  evidence: Lines 72-81 of PreviewPanel.tsx show the useState + useEffect sync are present
  timestamp: 2026-03-17T00:03:00Z

- hypothesis: key={viewport} missing on ErrorBoundaryFrame for single viewport
  evidence: Line 246 shows `<ErrorBoundaryFrame key={viewport}>` is present
  timestamp: 2026-03-17T00:03:00Z

- hypothesis: dualLeftPort/dualRightPort sync missing in PreviewPanelWithState
  evidence: Lines 51-58 of PreviewPanelWithState.tsx show the dual port sync useEffects are present
  timestamp: 2026-03-17T00:03:00Z

## Evidence

- timestamp: 2026-03-17T00:03:00Z
  checked: PreviewPanel.tsx lines 243-275 (single viewport iframe render)
  found: |
    The iframe for tablet/mobile uses `activeFrontendPort` prop directly (no local state).
    On first mount when activeFrontendPort is null, src=undefined. When activeFrontendPort
    arrives (async scan), the src changes from undefined → http://localhost:PORT/.
    The key={viewport} is on ErrorBoundaryFrame but NOT on the <iframe> itself.
    When switching from desktop to tablet, the ErrorBoundaryFrame remounts (new key),
    but the iframe inside it is new, and its src starts as undefined because
    activeFrontendPort might be null at that instant, then flickers to a URL.
    Also: when switching FROM tablet back to desktop, the ErrorBoundaryFrame for desktop
    remounts — the desktopActiveServer may already be set, so the iframe immediately
    gets a valid src. But if tab navigation caused the tablet iframe to load a URL with
    a beforeunload handler, unmounting triggers the dialog.
  implication: |
    ROOT CAUSE A: Tablet/mobile iframe src flickers undefined → URL → undefined because
    it reads `activeFrontendPort` directly with no local snapshot. The iframe should only
    render when activeFrontendPort is non-null (guard the render).

- timestamp: 2026-03-17T00:04:00Z
  checked: PreviewPanel.tsx lines 218-239 (dual mode ErrorBoundaryFrame)
  found: |
    Dual mode ErrorBoundaryFrames have NO key prop. When switching from desktop to dual
    and back, the same ErrorBoundaryFrame instances persist. If an error was caught on a
    previous render, state is stuck at hasError=true. Also no key means the error boundary
    doesn't reset when the effective port changes.
  implication: |
    ROOT CAUSE B: Dual mode ErrorBoundaryFrames need key={effectiveDualLeft} and
    key={effectiveDualRight} to reset when port changes.

- timestamp: 2026-03-17T00:04:00Z
  checked: ErrorBoundaryFrame.tsx
  found: |
    The component has a resetError() method but it's never called externally. There is no
    componentDidUpdate that auto-resets on key change — but key change remounts the
    component entirely, so that IS the reset mechanism. The issue is that dual mode
    iframes don't have keys.
  implication: |
    Dual mode ErrorBoundaryFrames need keys (confirms ROOT CAUSE B).

- timestamp: 2026-03-17T00:04:00Z
  checked: PreviewPanel.tsx line 244-255 (single viewport iframe src logic)
  found: |
    The iframe is always rendered even when src=undefined. An iframe with src=undefined
    gets `about:blank` initially, then if src changes to a valid URL the navigation occurs.
    If that URL has a beforeunload handler, subsequent navigation (viewport switch causing
    remount via key change) triggers the "Leave page?" dialog from inside the iframe.
    The guard `{activeFrontendPort && <iframe>}` prevents the initial undefined→URL flicker
    and prevents any iframe from being mounted until there's a real URL to show.
  implication: |
    ROOT CAUSE C (primary beforeunload trigger): The iframe is rendered unconditionally.
    When src transitions undefined → URL, the iframe loads the app. When the user switches
    viewports, the ErrorBoundaryFrame remounts (key changes), destroying the old iframe,
    which triggers beforeunload. Fix: only render the iframe when src is non-null.

## Resolution

root_cause: |
  Three bugs cooperate to cause the crash:
  1. Single-viewport (tablet/mobile) iframe renders even when activeFrontendPort is null,
     causing undefined → URL → unmount lifecycle that triggers beforeunload dialogs.
  2. Dual-mode ErrorBoundaryFrames have no key prop, so they never reset on port changes.
  3. The beforeunload fires when viewport switches because the iframe was loaded with a
     real URL (from the flicker above) and is then destroyed by the key={viewport} remount.

fix: |
  PreviewPanel.tsx:
  1. Guard single-viewport iframe: only render when activeFrontendPort (or effectiveDesktopServer) is non-null.
     Show a placeholder when no port is available yet.
  2. Add key props to dual-mode ErrorBoundaryFrames: key={effectiveDualLeft ?? "left"} and
     key={effectiveDualRight ?? "right"}.

verification: |
  bun test tests/preview-panel.test.tsx → 37 pass, 0 fail.
  Full suite: 868 pass (was 866 before; +2 from fixing the preview ErrorBoundaryFrame test
  and the stale assertion update). No regressions in any previously-passing test.
files_changed:
  - packages/mission-control/src/components/preview/PreviewPanel.tsx
  - packages/mission-control/tests/preview-panel.test.tsx
