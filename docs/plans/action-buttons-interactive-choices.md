# Plan: Interactive Action Buttons in Workspace Chat

## Problem

When Claude asks the user a question with numbered/lettered options (e.g., "Which approach would you prefer? 1. Option A 2. Option B 3. Option C"), the chat currently shows this as plain text. The user must manually type their choice. We need to detect these choice patterns and render them as interactive UI elements (radio buttons, checkboxes, clickable buttons) so the user can click to respond, or still type a custom answer.

## Current State

### What exists:
- **Types**: `ActionButton` and `ActionButtonsEntry` types in `chat/types.ts` — simple `{ id, label, prompt, variant }` shape
- **Renderer**: `ActionButtonsEntry.tsx` — renders a flat row of `<Button>` elements. Clicking sends `btn.prompt` via `onAction`
- **ChatEntryRenderer**: Already handles `action_buttons` case, calls `onAction` prop
- **Backend**: `acp-session.ts` line 362-366 calls `this.extractActionButtons()` at end of each turn, but **the method doesn't exist** — it's a dead reference that would crash at runtime
- **WorkspaceChat.tsx**: Uses an older `ChatMessage` interface, does NOT use the `ChatEntry`/`ChatEntryRenderer` system from `chat/`. There's a disconnect — the rich chat entry system exists but WorkspaceChat doesn't use it

### Key gaps:
1. `extractActionButtons()` is never defined — no detection logic exists
2. `WorkspaceChat.tsx` doesn't use `ChatEntryRenderer` — the action_buttons rendering path is unreachable
3. No support for single-select (radio) vs multi-select (checkbox) vs button-grid
4. No "custom answer" input alongside the choices
5. No visual state (selected, submitted, disabled after submission)

---

## Implementation Plan

### Phase 1: Backend — Detect choices in Claude's output

**File: `backend/src/services/acp/acp-session.ts`**

Add the `extractActionButtons()` method to the `ACPSession` class. This method parses the assistant's accumulated text looking for question + numbered/lettered options patterns.

**Detection patterns to handle:**
```
// Numbered lists after a question
Which approach would you prefer?
1. Option A
2. Option B
3. Option C

// Lettered lists
a) Option A
b) Option B

// Dash/bullet lists after a question mark
What should I do?
- Fix the bug first
- Add tests first
- Refactor the module

// Yes/No questions
Would you like me to proceed? (yes/no)
Should I continue with this approach?
```

**Extracted data shape** (enhanced from current `ActionButton`):
```ts
interface ExtractedChoice {
  id: string;
  label: string;          // Display text: "Option A"
  value: string;          // What gets sent back: "1" or "Option A" or full text
  prompt: string;         // Full message to send: "1. Option A" or "yes"
}

interface ExtractedChoiceGroup {
  question: string;       // The question text
  choices: ExtractedChoice[];
  selectionMode: "single" | "multi" | "button";
  // single = radio buttons (numbered/lettered lists)
  // multi = checkboxes (when Claude says "select all that apply")
  // button = simple clickable buttons (yes/no, proceed/cancel)
}
```

**Emit enhanced event:**
```ts
this.emitEvent("action_buttons", {
  question: group.question,
  choices: group.choices,
  selectionMode: group.selectionMode,
});
```

### Phase 2: Frontend Types — Extend chat types

**File: `frontend/src/components/workspace/chat/types.ts`**

Update `ActionButton` and `ActionButtonsEntry`:

```ts
export type SelectionMode = "single" | "multi" | "button";

export interface ActionChoice {
  id: string;
  label: string;
  value: string;
  prompt: string;
}

export interface ActionButtonsEntry extends ChatEntry {
  type: "action_buttons";
  metadata: {
    question?: string;
    choices: ActionChoice[];
    selectionMode: SelectionMode;
    submitted?: boolean;        // true after user submits
    selectedIds?: string[];     // which choices were selected
  };
}
```

Keep backward compat with old `ActionButton` type (alias or adapter) since it's exported.

### Phase 3: Frontend Component — Rebuild `ActionButtonsEntry.tsx`

**File: `frontend/src/components/workspace/chat/ActionButtonsEntry.tsx`**

Complete rewrite to support three modes:

#### 3a. Button mode (yes/no, proceed/cancel)
- Row of styled buttons, similar to current implementation
- Clicking a button immediately sends the prompt and disables all buttons
- Shows which was selected with a check icon

#### 3b. Single-select mode (radio buttons)
- Render choices as a radio group with labels
- Each option is a clickable row with a radio indicator
- "Submit" button at the bottom to confirm selection
- Optional "custom answer" text input below the choices
- After submission: radio group becomes disabled, selected option highlighted

#### 3c. Multi-select mode (checkboxes)
- Same as single-select but with checkboxes
- Multiple can be toggled
- "Submit" sends comma-separated or newline-separated selected values
- After submission: checkboxes disabled, selections highlighted

#### Common features:
- "Or type your own answer..." text input at the bottom (for single/multi modes)
- Typing in the custom field and pressing Enter sends that instead
- After any submission, the entire component becomes read-only with visual feedback
- Smooth entry animation (fade + slide up)

**Component structure:**
```
ActionButtonsEntry
  +-- question text (muted, small)
  +-- if mode=button: ButtonChoices
  +-- if mode=single: RadioChoices
  +-- if mode=multi: CheckboxChoices
  +-- CustomAnswerInput (for single/multi)
  +-- SubmitButton (for single/multi, disabled until selection made)
```

### Phase 4: Wire into WorkspaceChat

**File: `frontend/src/components/workspace/WorkspaceChat.tsx`**

The workspace chat currently uses its own simple `ChatMessage` interface and doesn't use `ChatEntryRenderer`. Two options:

**Option A (Recommended — incremental):** Add action_buttons handling directly in WorkspaceChat's WebSocket message handler. When an `action_buttons` event arrives, push it as a special message type and render the `ActionButtonsEntry` component inline.

Changes:
1. Extend `ChatMessage` with an optional `actionChoices` field
2. In the WebSocket `addMessageHandler`, listen for `action_buttons` events
3. In the render function, when `message.actionChoices` exists, render `ActionButtonsEntry`
4. When user selects/submits, call `handleSend` with the chosen prompt and mark the entry as submitted

**Option B (Larger refactor):** Migrate WorkspaceChat to use `ChatEntry` + `ChatEntryRenderer`. This is the cleaner long-term solution but much bigger scope.

**Go with Option A for now**, with a TODO to migrate later.

### Phase 5: State management for submitted choices

When the user clicks a choice:
1. Mark the `ActionButtonsEntry` as `submitted: true` with `selectedIds` in local state
2. Send the chosen prompt as a user message (via the existing send mechanism)
3. The component re-renders in read-only/disabled state

This is local UI state only — no backend persistence needed. If the page reloads, the action buttons from replayed events will appear as un-submitted (acceptable for now).

---

## File Change Summary

| File | Change |
|------|--------|
| `backend/src/services/acp/acp-session.ts` | Add `extractActionButtons()` method (~60 lines) |
| `frontend/src/components/workspace/chat/types.ts` | Add `SelectionMode`, `ActionChoice` types; update `ActionButtonsEntry` |
| `frontend/src/components/workspace/chat/ActionButtonsEntry.tsx` | Full rewrite with radio/checkbox/button modes (~200 lines) |
| `frontend/src/components/workspace/WorkspaceChat.tsx` | Add action_buttons event handler + rendering (~30 lines) |

## Edge Cases

- **Multiple choice groups in one message**: Only extract the last/most prominent one. Avoids noisy UI.
- **Already answered**: If the user types before buttons render (race condition), the buttons should still appear but become informational only.
- **Very long option text**: Truncate with ellipsis in the UI, full text in tooltip.
- **No question detected but numbered list**: Only show buttons if there's a clear question (line ending with `?`) preceding the list.

## Not in scope (future)
- Persisting submitted selections to backend/DB
- Migrating WorkspaceChat to use ChatEntryRenderer entirely
- Drag-to-reorder for multi-select priorities
- Inline image options
