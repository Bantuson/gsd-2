# Phase 18: Builder Mode — Research

**Researched:** 2026-03-14
**Domain:** React context / feature-flag patterns, vocabulary abstraction, Claude API intent classification, conditional UI rendering
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUILDER-01 | "Interface mode" toggle in Settings — Developer / Builder; default Developer; switching does not restart session | useSettings + settings-api pattern covers persistence; React Context covers propagation |
| BUILDER-02 | Builder vocabulary applied throughout — milestone→version, slice→feature, task→step, must-haves→goals, UAT→testing; context budget, token count, model name hidden | Central label map + hook pattern; hide-in-builder conditional props |
| BUILDER-03 | Builder chat input — placeholder "What do you want to build or change?"; slash autocomplete hidden; command palette shortcut hidden | ChatInput already accepts `placeholder` prop; `filtered` array is prop-driven — pass empty array in Builder mode |
| BUILDER-04 | Intent classifier — lightweight Claude API call with STATE.md context; routes to GSD_COMMAND / PHASE_QUESTION / GENERAL_CODING / UI_PHASE_GATE; routing badge shown with override option | POST /api/classify-intent Bun route; credentials already in keychain/auth.json; client-side sendMessage interception in AppShell |
| BUILDER-05 | Discuss cards in Builder mode — plain-language labels, "Question N of N" progress, no GSD terminology; decision log visible as "Your decisions so far" | QuestionCard already renders "Question N of N" (line 43); area label needs Builder conditional; DecisionLogDrawer header label needs Builder conditional |
| BUILDER-06 | Slice cards in Builder mode — state labels (Ready to build / Building now / Ready for your review / Done) and action labels (See what will be built / Build this feature / Give direction / Ship it) | All four slice card components have hardcoded strings — need label map + builderMode prop |
| BUILDER-07 | Phase gate in Builder mode — intercepts frontend build without design contract; shows plain-language prompt to set up design or skip | UI_PHASE_GATE routing outcome from classifier; inline card in chat stream |
</phase_requirements>

---

## Summary

Phase 18 adds a Builder mode vocabulary and routing layer on top of the existing Developer mode UI. All seven requirements are achievable without modifying any existing functionality — Builder mode is additive surface presentation only. The underlying GSD 2 engine runs unchanged.

The codebase already has almost every prerequisite: `useSettings` + `settings-api.ts` handle persistence to `preferences.md` YAML frontmatter; `ChatInput` is props-driven (placeholder, filtered array); `QuestionCard` already renders "Question N of N" progress; `DecisionLogDrawer` has a header label string; all four slice card components (`SlicePlanned`, `SliceInProgress`, `SliceNeedsReview`, `SliceComplete`) have hardcoded English strings that can be replaced with a label map. The only genuinely new piece of infrastructure is the intent classifier Bun API route (`POST /api/classify-intent`) and its client-side interception in `AppShell.tsx`.

**Primary recommendation:** Implement Builder mode as a React Context (`InterfaceModeContext`) providing `{ builderMode: boolean, vocab: VocabMap }`. Store the toggle in `settings-api.ts` as `interface_mode: 'developer' | 'builder'`. Use a single label map (`BUILDER_VOCAB`) consumed by a `useBuilderMode()` hook. All slice card components accept a `builderMode?: boolean` prop; the intent classifier is a server-side Bun route called before `sendMessage`.

---

## Standard Stack

### Core (already in project — no new dependencies)

| Library / Pattern | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| React Context API | React 19 (already installed) | Propagate `builderMode` boolean + vocab map to all components | Zero dependency; matches project's existing auth/trust patterns (no zustand) |
| Bun HTTP server | Already running on :4000 | Host `POST /api/classify-intent` route | All server-side logic lives in `packages/mission-control/src/server/` |
| `settings-api.ts` | Existing | Persist `interface_mode` to `preferences.md` frontmatter | Established pattern for all project/global preferences |
| `useSettings` hook | Existing | Read interface_mode from merged settings | Already used in AppShell for budget_ceiling |
| `gray-matter` | `^4.0.3` (already installed) | Parse preferences.md YAML frontmatter | Already used throughout settings-api.ts |

### Supporting (no new installs required)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `@tauri-apps/api/core` invoke | Read keychain for API key to pass to classifier | Already used in auth-api.ts; same isTauri() guard pattern applies |
| Fetch API (browser) | POST to `/api/classify-intent` from client | Standard — no wrapper needed |
| `~/.gsd/auth.json` | Source of Claude API credentials for server-side classifier call | Already written by Phase 16 OAuth flow |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Context | Prop drilling from App.tsx | Context is correct — `builderMode` is needed in 6+ components at different tree depths; prop drilling would require touching AppShell → SingleColumnView → ChatView → ChatInput → SliceAccordion → all four slice cards |
| React Context | Zustand | Zustand not in project; introducing a new state management library for a single boolean flag is unjustified |
| React Context | CSS class on `<body>` | Works for vocabulary hiding but not for label map substitution or intent classifier routing |
| Server-side classifier | Client-side Claude SDK call | Server-side keeps the API key out of the browser; consistent with existing server architecture; avoids CORS issues |

**Installation:** None required. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
packages/mission-control/src/
├── context/
│   └── InterfaceModeContext.tsx   # React Context + provider (new)
├── hooks/
│   └── useBuilderMode.ts          # Consumes InterfaceModeContext (new)
├── lib/
│   └── builder-vocab.ts           # BUILDER_VOCAB label map (new)
├── server/
│   └── classify-intent-api.ts     # POST /api/classify-intent handler (new)
└── components/
    └── chat/
        └── RoutingBadge.tsx       # Shows "Sent as: /gsd auto ×" (new)
```

Existing files modified (minimal, targeted changes):
- `App.tsx` — wrap AppShell in `<InterfaceModeProvider>`
- `components/views/SettingsView.tsx` — add "Interface mode" toggle row
- `components/chat/ChatInput.tsx` — accept `builderMode?: boolean` prop
- `components/chat/QuestionCard.tsx` — accept `builderMode?: boolean` prop for area label
- `components/chat/DecisionLogDrawer.tsx` — accept `builderMode?: boolean` prop for header
- `components/layout/AppShell.tsx` — intercept sendMessage for intent classifier
- `components/milestone/SlicePlanned.tsx` — accept `builderMode?: boolean` prop
- `components/milestone/SliceInProgress.tsx` — accept `builderMode?: boolean` prop
- `components/milestone/SliceNeedsReview.tsx` — accept `builderMode?: boolean` prop
- `components/milestone/SliceComplete.tsx` — accept `builderMode?: boolean` prop
- `server/server.ts` — register `/api/classify-intent` route

### Pattern 1: InterfaceModeContext

**What:** A React Context that provides `builderMode: boolean` and the resolved `vocab: VocabMap` to all descendant components.
**When to use:** Whenever a component needs to conditionally render Builder vs Developer text/labels.

```typescript
// Source: project convention — mirrors trust/auth pattern in App.tsx
// packages/mission-control/src/context/InterfaceModeContext.tsx

export type VocabMap = {
  milestone: string;
  slice: string;
  task: string;
  mustHaves: string;
  uat: string;
  decisionLog: string;
};

const DEVELOPER_VOCAB: VocabMap = {
  milestone: 'Milestone', slice: 'Slice', task: 'Task',
  mustHaves: 'Must-haves', uat: 'UAT', decisionLog: 'Decisions',
};

const BUILDER_VOCAB: VocabMap = {
  milestone: 'Version', slice: 'Feature', task: 'Step',
  mustHaves: 'Goals', uat: 'Testing', decisionLog: 'Your decisions so far',
};

export const InterfaceModeContext = React.createContext<{
  builderMode: boolean;
  vocab: VocabMap;
}>({ builderMode: false, vocab: DEVELOPER_VOCAB });

export function InterfaceModeProvider({
  children,
  builderMode,
}: { children: React.ReactNode; builderMode: boolean }) {
  const vocab = builderMode ? BUILDER_VOCAB : DEVELOPER_VOCAB;
  return (
    <InterfaceModeContext.Provider value={{ builderMode, vocab }}>
      {children}
    </InterfaceModeContext.Provider>
  );
}
```

### Pattern 2: useBuilderMode Hook

**What:** Thin consumer of `InterfaceModeContext`. All components call this hook rather than consuming the context directly.
**When to use:** In any component that needs `builderMode` or `vocab`.

```typescript
// packages/mission-control/src/hooks/useBuilderMode.ts
import { useContext } from 'react';
import { InterfaceModeContext } from '../context/InterfaceModeContext';

export function useBuilderMode() {
  return useContext(InterfaceModeContext);
}
```

### Pattern 3: Settings Toggle — Persist via settings-api.ts

**What:** The mode toggle writes `interface_mode: 'developer' | 'builder'` to `preferences.md` via the existing `PUT /api/settings` route.
**When to use:** User clicks toggle in SettingsView.

```typescript
// In SettingsView.tsx — same pattern as other settings fields
handleUpdate('interface_mode', checked ? 'builder' : 'developer');
// Then call save('project') on Apply
```

Reading the mode back in AppShell (already uses `useSettings`):
```typescript
const builderMode = settings?.merged?.interface_mode === 'builder';
```

The mode propagates through `InterfaceModeProvider` wrapped around `AppShell`. Since `useSettings` already populates `settings.merged`, no additional fetch is needed. Mode toggle does NOT restart the session — it only changes the React context value.

### Pattern 4: ChatInput in Builder Mode

**What:** Pass `builderMode` as prop to `ChatInput`. In Builder mode: use Builder placeholder, pass `filtered={[]}` (empty), hide command palette shortcut.
**When to use:** ChatView renders ChatInput; AppShell renders CommandPalette.

The existing `ChatInput` is already perfectly shaped for this:
- `placeholder` is computed inside `ChatInput` today — move it to a prop or compute based on `builderMode` prop
- `filtered` is already a prop on `ChatInputView` — pass `[]` in Builder mode
- `SlashAutocomplete` renders only when `filtered.length > 0` (line 37 of ChatInput.tsx) — no further change needed

```typescript
// In ChatView or wherever ChatInput is rendered:
const { builderMode } = useBuilderMode();
<ChatInput
  onSend={onChatSend}
  disabled={isProcessing}
  builderMode={builderMode}
/>
```

### Pattern 5: Intent Classifier API Route

**What:** `POST /api/classify-intent` receives `{ message: string, stateContext: string }` and returns `{ intent: 'GSD_COMMAND' | 'PHASE_QUESTION' | 'GENERAL_CODING' | 'UI_PHASE_GATE' }`.
**Where:** `packages/mission-control/src/server/classify-intent-api.ts` registered in `server.ts`.
**Credentials:** Read from `~/.gsd/auth.json` (written by Phase 16). The server-side Bun process has filesystem access; no Tauri IPC needed.
**Model:** Use the execution model from preferences (or `claude-sonnet-4-6` as fallback). Keep the system prompt minimal — inject the current STATE.md raw content as context and ask for a JSON response.

```typescript
// classify-intent-api.ts (server-side Bun, not browser)
import { readFile } from 'node:fs/promises';
import { join, homedir } from 'node:path';

const INTENT_SYSTEM_PROMPT = `
You are a routing classifier for a developer tool.
Given the user message and current GSD project state, classify the intent as exactly one of:
- GSD_COMMAND (user wants to run a gsd workflow command like start, discuss, review)
- PHASE_QUESTION (user has a question about the current plan or decisions)
- GENERAL_CODING (user wants to write or modify code directly)
- UI_PHASE_GATE (user wants to build a frontend but no design contract exists yet)

Respond with JSON only: { "intent": "<one of the four values>" }
`;

export async function classifyIntent(
  message: string,
  stateContent: string,
): Promise<'GSD_COMMAND' | 'PHASE_QUESTION' | 'GENERAL_CODING' | 'UI_PHASE_GATE'> {
  // Read credentials from ~/.gsd/auth.json
  let apiKey = '';
  try {
    const auth = JSON.parse(await readFile(join(homedir(), '.gsd', 'auth.json'), 'utf-8'));
    apiKey = auth.access_token ?? auth.api_key ?? '';
  } catch { return 'GENERAL_CODING'; } // fail open

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', // cheap + fast for routing
      max_tokens: 64,
      system: INTENT_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `State:\n${stateContent.slice(0, 2000)}\n\nUser message: ${message}` },
      ],
    }),
  });

  if (!response.ok) return 'GENERAL_CODING';
  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  try {
    const parsed = JSON.parse(text);
    return parsed.intent ?? 'GENERAL_CODING';
  } catch { return 'GENERAL_CODING'; }
}
```

**Use Haiku** (cheapest/fastest) for the classifier — it is a routing call, not a reasoning call. The spec says "lightweight Claude API call."

### Pattern 6: Client-Side Intent Interception in AppShell

**What:** When Builder mode is active, wrap `sendMessage` with a classifier call before dispatching.
**Where:** `AppShell.tsx` already owns `sendMessage` and the `onChatSend` prop passed down.

```typescript
// In AppShell.tsx
const handleBuilderSend = useCallback(async (message: string) => {
  if (!builderMode) { sendMessage(message); return; }

  // 1. POST to /api/classify-intent
  const stateContent = state ? JSON.stringify(state.projectState) : '';
  const res = await fetch('/api/classify-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stateContext: stateContent }),
  });
  const { intent } = await res.json();

  if (intent === 'UI_PHASE_GATE') {
    // Show phase gate card inline — do NOT send the message yet
    setPhaseGateMessage(message);
    setShowPhaseGate(true);
    return;
  }

  // 2. Map intent to gsd command if needed
  const routed = intent === 'GSD_COMMAND'
    ? `/gsd auto`                    // or more specific based on message
    : message;

  // 3. Show routing badge
  setLastRoutingBadge({ original: message, sent: routed, intent });

  sendMessage(routed);
}, [builderMode, sendMessage, state]);
```

### Pattern 7: Slice Cards — Label Map

**What:** Add a `builderMode?: boolean` prop to all four slice card components. Use local label objects.
**When to use:** SliceRow passes `builderMode` down to whichever state-specific card it renders.

State labels (hardcoded strings to replace):
```typescript
// In each slice card component
const stateLabel = builderMode ? {
  planned: 'Ready to build',
  executing: 'Building now...',
  needs_review: 'Ready for your review',
  complete: 'Done',
} : {
  planned: 'PLANNED',
  executing: '● EXECUTING',
  needs_review: '⚠ NEEDS YOUR REVIEW',
  complete: '✓ COMPLETE',
};

const actionLabel = builderMode ? {
  reviewPlan: 'See what will be built',
  startSlice: 'Build this feature',
  steer: 'Give direction',
  mergeToMain: 'Ship it',
} : {
  reviewPlan: 'Review plan',
  startSlice: 'Start this slice',
  steer: 'Steer',
  mergeToMain: 'Merge to main',
};
```

### Pattern 8: Phase Gate Card (BUILDER-07)

**What:** When `UI_PHASE_GATE` intent is detected, show an inline card in the chat area instead of sending the message.
**Where:** AppShell manages `showPhaseGate` state. The card renders inside the chat area via the `discussOverlay` prop pattern (already established in AppShell/SingleColumnView).

```typescript
// PhaseGateCard.tsx (new)
interface PhaseGateCardProps {
  onSetupDesign: () => void;
  onSkip: () => void;
}
// Renders the "One step first" card from the spec
```

### Anti-Patterns to Avoid

- **Duplicating components for Builder mode:** Never create BuilderSlicePlanned, BuilderQuestionCard etc. All Builder changes are prop-conditional within the existing component.
- **Client-side API key exposure:** The intent classifier call must go through the Bun server (`/api/classify-intent`). Never read `~/.gsd/auth.json` from the browser.
- **Blocking the chat on classifier failure:** The classifier must fail open — any network error or unexpected response falls through to `GENERAL_CODING` and sends the message directly.
- **Restarting the session on mode switch:** The spec is explicit — switching modes does NOT restart the session. The `InterfaceModeContext` value change causes React re-renders only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisting interface_mode | Custom localStorage or new REST endpoint | `settings-api.ts` `PUT /api/settings` + `preferences.md` | Already handles global/project tiers, tested, consistent with all other settings |
| Propagating builderMode to 10+ components | Prop drilling from App.tsx through 5 layers | React Context (`InterfaceModeContext`) | Same pattern used for auth (useAuthGuard), proven in this codebase |
| Reading API key for classifier | Tauri IPC invoke from browser | Server-side Bun file read of `~/.gsd/auth.json` | Bun server has direct filesystem access; avoids browser/keychain coupling |
| Vocabulary substitution | Separate translated copies of each component | Label map object + `builderMode` prop | Single source of truth; no divergence risk |

**Key insight:** Builder mode is a thin presentation layer. The less new infrastructure introduced, the more reliable the feature.

---

## Common Pitfalls

### Pitfall 1: context not wrapping the right tree

**What goes wrong:** `useBuilderMode()` returns `{ builderMode: false }` even after the user enables Builder mode because `InterfaceModeProvider` was placed inside `AppShell` rather than above it in `App.tsx`.
**Why it happens:** AppShell is the root component consumers. If the Provider lives inside AppShell it will be recreated on every AppShell re-render, losing context continuity.
**How to avoid:** Wrap in `App.tsx`, above `<AppShell />`, reading the mode from `useSettings` or a startup fetch.
**Warning signs:** `builderMode` is always `false` even after saving the setting.

### Pitfall 2: Settings read race — mode not available on first render

**What goes wrong:** `useSettings` is async — on first render `settings` is `null`, so `builderMode` is `false` even for a Builder-mode user.
**Why it happens:** `useSettings` fetches `/api/settings` on mount. The context value is `false` until the fetch resolves.
**How to avoid:** Initialize `InterfaceModeProvider` with a loading state or read from `localStorage` as an optimistic read while the fetch is in-flight. Simplest: accept the brief flash (same pattern as trust status checking in `App.tsx` — it returns `null` while checking). Document it is acceptable.
**Warning signs:** Brief Developer mode flash on load for Builder-mode users.

### Pitfall 3: Intent classifier blocks the send path

**What goes wrong:** If `fetch('/api/classify-intent')` takes >2 seconds, the user's message appears to be dropped.
**Why it happens:** `await`-ing the classifier before calling `sendMessage`.
**How to avoid:** Add a timeout: if the classifier doesn't respond within 1500ms, fall through to `GENERAL_CODING`. Show a subtle loading state on the chat input during classification.
**Warning signs:** Slow message sends in Builder mode when network is slow.

### Pitfall 4: Slash commands still appearing in Builder mode

**What goes wrong:** `ChatInput` shows slash autocomplete when user types `/` in Builder mode.
**Why it happens:** The `filtered` array is computed inside `ChatInput` (`filterCommands(value)`) — not passed from outside.
**How to avoid:** `ChatInput` must accept `builderMode` prop and override `filtered = []` unconditionally when `builderMode === true`. The `filterCommands` call itself can remain — just gate the result.
**Warning signs:** Slash dropdown appears in Builder mode on typing `/`.

### Pitfall 5: Classifier uses wrong model endpoint

**What goes wrong:** `~/.gsd/auth.json` has `access_token` from OAuth but the Anthropic API expects `api_key` for direct API calls (not OAuth bearer tokens).
**Why it happens:** OAuth access tokens for Claude Max are NOT the same as Anthropic API keys. The `access_token` from the OAuth flow is for the Claude.ai web product; it cannot be used directly against `api.anthropic.com`.
**How to avoid:** The intent classifier should only use `api_key` providers (Anthropic API key, OpenRouter). For OAuth providers (Claude Max, GitHub Copilot), fall through to `GENERAL_CODING` without making a classify call. Alternatively, detect the provider from `auth.json` `provider` field and skip classification for OAuth-only providers.
**Warning signs:** 401 errors from `api.anthropic.com` for Claude Max users.

---

## Code Examples

Verified patterns from existing codebase:

### How settings-api.ts reads/writes preferences.md (established pattern)

```typescript
// Source: packages/mission-control/src/server/settings-api.ts lines 56-81
async function readPreferencesMd(filePath: string): Promise<Record<string, unknown>> {
  const content = await readFile(filePath, "utf-8");
  const { data } = matter(content);
  return data;
}

async function writePreferencesMd(filePath: string, updates: Record<string, unknown>): Promise<void> {
  // Merges with existing frontmatter, writes back as YAML
  const output = matter.stringify("", merged);
  await writeFile(filePath, output);
}
```

Adding `interface_mode` is a one-line change to existing save logic — no new API route needed.

### How useSettings reads merged settings in AppShell (established pattern)

```typescript
// Source: packages/mission-control/src/components/layout/AppShell.tsx lines 46-49
const { settings } = useSettings();
const budgetCeiling = typeof settings?.merged?.budget_ceiling === "number"
  ? settings.merged.budget_ceiling
  : null;

// New pattern for interface mode:
const builderMode = settings?.merged?.interface_mode === 'builder';
```

### How ChatInputView accepts and uses props (established pattern)

```typescript
// Source: packages/mission-control/src/components/chat/ChatInput.tsx lines 14-52
interface ChatInputViewProps {
  value: string;
  placeholder: string;  // already a prop — just change what's passed in
  disabled: boolean;
  filtered: readonly SlashCommand[] | SlashCommand[];  // pass [] for Builder
  onChange, onKeyDown, onSelect // ...
}
```

### How DecisionLogDrawer header label is rendered (existing string to conditionalise)

```typescript
// Source: packages/mission-control/src/components/chat/DecisionLogDrawer.tsx line 20
<span className="text-xs font-display uppercase tracking-wider text-slate-400">
  Decisions  {/* → change to props.builderMode ? 'Your decisions so far' : 'Decisions' */}
</span>
```

### How QuestionCard already renders "Question N of N" (no change needed for BUILDER-05 progress)

```typescript
// Source: packages/mission-control/src/components/chat/QuestionCard.tsx lines 41-44
<span className="text-xs text-slate-400 font-mono">
  {`Question ${question.questionNumber} of ${question.totalQuestions}`}
</span>
// The progress display already matches the Builder mode requirement.
// Only the `question.area` label (line 37-39) needs Builder conditional.
```

### How slice cards have hardcoded status labels (all need builderMode prop)

```typescript
// Source: SlicePlanned.tsx line 21
<span className="text-xs font-mono text-slate-400 uppercase tracking-wider">PLANNED</span>
// → replace "PLANNED" with builderMode ? 'Ready to build' : 'PLANNED'

// Source: SlicePlanned.tsx line 56
<button>Review plan</button>
// → replace with builderMode ? 'See what will be built' : 'Review plan'

// Source: SlicePlanned.tsx line 72
<button>Start this slice</button>
// → replace with builderMode ? 'Build this feature' : 'Start this slice'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Feature flags via prop drilling | React Context for cross-cutting concerns | React 16.3+ (2018) | Context is standard for app-wide state like theme/mode |
| Separate component trees per mode | Single component tree with conditional props | Standard React | Less code, no divergence |
| Client-side API calls with exposed keys | Server-side proxy routes | Always project convention | Security; all server calls go through Bun |

**Deprecated/outdated:**
- Do not use `localStorage` directly for the mode setting — the project persists all settings through `preferences.md` via `settings-api.ts`. Do not introduce a second persistence mechanism.

---

## Open Questions

1. **Intent classifier and OAuth-only providers**
   - What we know: `~/.gsd/auth.json` written by Phase 16 has `access_token` (OAuth) or `api_key` (API key flow). OAuth tokens cannot call `api.anthropic.com` directly.
   - What's unclear: Should the classifier be silently skipped for OAuth providers, or should there be a fallback mechanism?
   - Recommendation: Skip classification (fall through to GENERAL_CODING) when `auth.json` provider is `anthropic` (OAuth) or `github-copilot`. Only classify when provider is `openrouter` or `api-key`. Document this limitation in the routing badge UI.

2. **Phase gate detection heuristic**
   - What we know: The classifier must detect "user wants to build a frontend without design contract." The current STATE.md doesn't have a `has_design_contract` field.
   - What's unclear: What signals does the system prompt use to detect UI_PHASE_GATE vs GENERAL_CODING?
   - Recommendation: The system prompt instructs the classifier to look for frontend/UI keywords (CSS, component, page, design, layout) AND check whether `milestoneContext` is empty (no CONTEXT.md decisions yet). If both are true, return UI_PHASE_GATE.

3. **Settings read timing for InterfaceModeProvider**
   - What we know: `useSettings` is async; on first render `settings` is `null`.
   - What's unclear: Should the app briefly flash Developer mode while settings load, or block render?
   - Recommendation: Accept the brief flash (same as trust/auth checking — App.tsx already returns `null` during `checking` state). Default to `builderMode: false` while loading. No blocking.

---

## Validation Architecture

`nyquist_validation` is `true` in `.planning/config.json` — include this section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | `bunfig.toml` in `packages/mission-control/` |
| Quick run command | `cd packages/mission-control && bun test tests/builder-mode.test.ts` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILDER-01 | Mode toggle persists as `interface_mode` in settings | unit | `bun test tests/builder-mode.test.ts` | ❌ Wave 0 |
| BUILDER-02 | BUILDER_VOCAB map returns correct labels for each key | unit | `bun test tests/builder-vocab.test.ts` | ❌ Wave 0 |
| BUILDER-03 | ChatInputView with builderMode=true renders correct placeholder and empty filtered | unit | `bun test tests/chat-input.test.tsx` (extend existing) | ✅ (extend) |
| BUILDER-04 | classifyIntent returns valid intent enum value | unit | `bun test tests/classify-intent.test.ts` | ❌ Wave 0 |
| BUILDER-05 | QuestionCard area label shows "What's needed" not "Constraint" in Builder mode | unit | `bun test tests/builder-mode.test.ts` | ❌ Wave 0 |
| BUILDER-06 | SlicePlanned with builderMode=true shows "Ready to build" and "Build this feature" | unit | `bun test tests/builder-mode.test.ts` | ❌ Wave 0 |
| BUILDER-07 | Phase gate card renders with "Set up the design" and "Skip for now" buttons | unit | `bun test tests/builder-mode.test.ts` | ❌ Wave 0 |

**Pattern note:** This codebase tests React components using direct function calls (`Component(props)`) and `JSON.stringify(result)` inspection — NOT React Testing Library. Do not introduce RTL. Follow the pattern in `slice-cards-planned-inprogress.test.ts` and `chat-input.test.tsx`.

**Source text test pattern:** For SettingsView changes, follow `settings-view-gsd2.test.ts` — read the source file as a string and assert string presence. This avoids React hook rendering complexity in Bun test environment.

### Sampling Rate

- **Per task commit:** `cd packages/mission-control && bun test tests/builder-mode.test.ts --timeout 10000`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/builder-mode.test.ts` — covers BUILDER-01, BUILDER-02, BUILDER-05, BUILDER-06, BUILDER-07 (new file)
- [ ] `tests/builder-vocab.test.ts` — covers BUILDER-02 vocabulary map unit tests (new file, or merge into builder-mode.test.ts)
- [ ] `tests/classify-intent.test.ts` — covers BUILDER-04 with mock fetch (new file)
- [ ] Extend `tests/chat-input.test.tsx` — add 2 test cases for `builderMode=true` prop behavior

---

## Sources

### Primary (HIGH confidence)

- Direct codebase reading — all file paths verified by Read tool:
  - `packages/mission-control/src/components/chat/ChatInput.tsx` — props interface, filtered array pattern, placeholder computation
  - `packages/mission-control/src/components/chat/QuestionCard.tsx` — "Question N of N" at line 43 already implemented
  - `packages/mission-control/src/components/chat/DecisionLogDrawer.tsx` — "Decisions" header string at line 20
  - `packages/mission-control/src/components/milestone/SlicePlanned.tsx` — "PLANNED", "Review plan", "Start this slice" hardcoded at lines 21, 56, 72
  - `packages/mission-control/src/components/milestone/SliceInProgress.tsx` — "● EXECUTING", "Pause", "View task", "Steer" hardcoded
  - `packages/mission-control/src/components/milestone/SliceNeedsReview.tsx` — "NEEDS YOUR REVIEW", "Run UAT checklist", "Merge to main" hardcoded
  - `packages/mission-control/src/components/milestone/SliceComplete.tsx` — "✓ COMPLETE", "View diff", "View UAT results" hardcoded
  - `packages/mission-control/src/components/layout/AppShell.tsx` — sendMessage ownership, settings hook, context composition point
  - `packages/mission-control/src/hooks/useSettings.ts` — fetch pattern, `settings.merged` access
  - `packages/mission-control/src/server/settings-api.ts` — `readPreferencesMd`, `writePreferencesMd`, `PUT /api/settings` handler
  - `packages/mission-control/src/hooks/useChatMode.tsx` — discuss mode state, overlay pattern for inject React nodes into chat
  - `packages/mission-control/src/auth/auth-api.ts` — `isTauri()` guard pattern, `~/.gsd/auth.json` written by Phase 16
  - `packages/mission-control/src/server/types.ts` — `GSD2State`, `SliceStatus`, `SliceAction` types
  - `packages/mission-control/tests/chat-input.test.tsx` — direct function call test pattern
  - `packages/mission-control/tests/settings-view-gsd2.test.ts` — source-text static analysis test pattern
  - `.planning/config.json` — `nyquist_validation: true`, `commit_docs: false`

### Secondary (MEDIUM confidence)

- Anthropic API docs pattern (from training knowledge, August 2025 cutoff): `x-api-key` header, `anthropic-version: 2023-06-01`, messages array format — this matches Phase 16 code that already calls Anthropic endpoints; HIGH confidence the interface is stable.
- React Context API: stable since React 16.3 (2018); React 19 installed; no breaking changes to createContext/useContext — HIGH confidence.

### Tertiary (LOW confidence)

- OAuth access token vs API key incompatibility with direct Anthropic API: inferred from how OAuth flows work (bearer tokens are for product APIs, not developer APIs). This is flagged as Open Question 1 above.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all dependencies already installed; no new packages
- Architecture: HIGH — React Context, props-based vocabulary, and Bun server routes are established patterns in this exact codebase
- Pitfalls: HIGH — identified from direct code reading (hardcoded strings, prop shapes, auth.json format)
- Intent classifier auth: MEDIUM — OAuth vs API key distinction is inferred, not verified against live Anthropic API docs

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable patterns; Claude API endpoint format could change but is unlikely within 30 days)
