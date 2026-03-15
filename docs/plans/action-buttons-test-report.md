# Action Buttons — Test Report

## Summary

Interactive action buttons in workspace chat are fully implemented and working. The system detects when Claude asks questions with numbered/lettered options or yes/no prompts, and renders them as interactive UI elements (radio buttons, checkboxes, or button pairs) that users can click to respond. Users can toggle between single-select and multi-select modes regardless of backend detection.

## What Was Built

### Backend (`backend/src/services/acp/acp-session.ts`)
- Added `extractActionButtons()` method (~90 lines) to the `ACPSession` class
- Called automatically at end of each turn when the `result` event fires
- Parses Claude's accumulated text for 3 pattern types:
  1. **Yes/no binary** — `(yes/no)`, `(proceed/cancel)` etc. -> `selectionMode: "button"`
  2. **Standalone proceed questions** — "Would you like me to..?" / "Should I..?" -> yes/no buttons
  3. **Numbered/lettered/bullet lists** — with a question before OR after the list -> `selectionMode: "single"` (or `"multi"` if "select all" phrasing detected)
- Fixed the original code which called `this.extractActionButtons()` but the method never existed (would crash at runtime)
- Fixed the event emission from `{ buttons }` (old shape) to `{ question, choices, selectionMode }` (new shape)

### Frontend Types (`frontend/src/components/workspace/chat/types.ts`)
- Added `SelectionMode = "single" | "multi" | "button"`
- Added `ActionChoice` interface: `{ id, label, value, prompt }`
- Updated `ActionButtonsEntry` metadata to use new types (backward-compatible with old `buttons` field)

### Frontend Component (`frontend/src/components/workspace/chat/ActionButtonsEntry.tsx`)
- Complete rewrite (~270 lines) with 3 render modes:
  - **Button mode**: Horizontal row of buttons (Yes/No, Proceed/Cancel). Click = instant send.
  - **Single-select (radio)**: Vertical list of options with radio indicators. Must click Submit.
  - **Multi-select (checkbox)**: Same but with checkboxes and multi-selection.
- **Single/Multi toggle**: Users can switch between single-select and multi-select via a toggle button in the header, regardless of the backend's initial detection
- All modes include "Or type your own answer..." input
- After submission: component becomes read-only, selected option highlighted, unselected dimmed
- Smooth entry animation (fade + slide up)

### Frontend Wiring (`frontend/src/pages/WorkspaceDetail.tsx`)
- Added `action_buttons` case to `parseACPEvent()` function
- Updated `onAction` handler to auto-send using the existing retry pattern (`setInputValue` + `setRetryContent`)
- Backward-compatible: falls back to old `buttons` array if new `choices` array is missing

## Test Results (Playwright E2E)

### Test 1: Numbered List Detection (Radio Buttons)
**Prompt**: "Give me exactly 4 numbered options for which programming language to use for a new CLI tool, then ask 'Which language would you prefer?'"

**Claude's response**:
```
1. Go — Single binary, fast compilation, simple concurrency
2. Rust — High performance, memory safe, clap ecosystem
3. Python — Rapid development, rich libraries, click/typer frameworks
4. TypeScript — Familiar if you know JS, commander.js, easy npm distribution

Which language would you prefer?
```

**Result**: Action buttons rendered as radio group with 4 options. Question "Which language would you prefer?" shown as header. "Single" toggle visible in top-right corner. Submit button disabled until selection made.

**Status**: PASS

### Test 2: Single to Multi Toggle
**Action**: Clicked the "Single" toggle button in the action buttons header.

**Result**: Toggle switched to "Multi" label with different icon. Radio indicators changed to checkbox indicators. Submit button changed from "Submit" to "Submit (0 selected)".

**Status**: PASS

### Test 3: Multi-Select with Multiple Options
**Action**: In multi mode, clicked "Go" then "Rust".

**Result**: Both options highlighted with teal checkbox indicators. Unselected options (Python, TypeScript) remained with empty checkboxes. Submit button updated to "Submit (2 selected)".

**Status**: PASS

### Test 4: Multi-Select Submit + Auto-Send
**Action**: Clicked "Submit (2 selected)".

**Result**:
- All buttons became disabled
- Go and Rust remained highlighted, Python and TypeScript dimmed
- "Selection submitted" confirmation text with green checkmark appeared
- User message auto-sent: "1. Go — Single binary, fast compilation, simple concurrency\n2. Rust — High performance, memory safe, clap ecosystem"
- Claude received the selection, understood both choices, and asked follow-up: "Which one — Go or Rust?"

**Status**: PASS

### Test 5: Yes/No Button Detection
**Claude's response**: "Go it is. Would you like me to set up the project structure with Go modules? (yes/no)"

**Result**: Action buttons rendered in button mode with "Yes" and "No" buttons side by side. Question shown as "Go it is. Would you like me to set up the project structure with Go modules?". Custom text input also available below buttons.

**Status**: PASS

### Test 6: Yes/No Button Click + Auto-Send
**Action**: Clicked "No" button.

**Result**:
- "No" button got checkmark icon and stayed highlighted (teal)
- "Yes" button dimmed/disabled
- "no" auto-sent as user message
- Claude responded: "Alright. Let me know when you're ready or if you'd like to do something else."

**Status**: PASS

### Test 7: No False Positives
**Claude's response**: "Which one — Go or Rust?" (simple question, no numbered list, no yes/no pattern)

**Result**: No action buttons rendered. Correct — this is a plain question without detectable patterns.

**Status**: PASS

## Screenshots

| Screenshot | Description |
|-----------|-------------|
| `action-buttons-radio-with-toggle.png` | Radio buttons (single-select) with 4 language options and "Single" toggle visible |
| `action-buttons-multi-mode.png` | After toggling to Multi mode — checkbox indicators and "Submit (0 selected)" |
| `action-buttons-multi-selected.png` | Go and Rust selected in multi mode — "Submit (2 selected)" |
| `action-buttons-yesno.png` | Yes/No button mode for binary question with custom input |
| `action-buttons-yesno-submitted.png` | After clicking No — checkmark on No, Yes dimmed, "no" auto-sent |

## Files Changed

| File | Lines Changed | Change Type |
|------|--------------|-------------|
| `backend/src/services/acp/acp-session.ts` | +95, -5 | Added `extractActionButtons()`, fixed call site |
| `frontend/src/components/workspace/chat/types.ts` | +12, -1 | Added `SelectionMode`, `ActionChoice` types |
| `frontend/src/components/workspace/chat/ActionButtonsEntry.tsx` | +270 (rewrite) | Full rewrite with 3 modes + Single/Multi toggle |
| `frontend/src/components/workspace/chat/ChatEntryRenderer.tsx` | +8, -4 | Updated to use new types |
| `frontend/src/components/workspace/chat/index.ts` | +2 | New type exports |
| `frontend/src/pages/WorkspaceDetail.tsx` | +16, -2 | Added `action_buttons` parsing + auto-send |

## Known Limitations

1. **No persistence**: Submitted state is local React state. Page reload resets action buttons to un-submitted (the choices still appear from replayed events, but selection state is lost).
2. **No system prompt**: No system prompt instructs Claude to format questions in a specific way. Detection relies on parsing natural language output, which works well for common patterns but could miss unusual formatting.
3. **Markdown stripping**: Bold markers (`**text**`) are stripped from choice labels for cleaner display, but other markdown (links, code, etc.) may still appear in labels.
4. **Toggle state not persisted**: The Single/Multi toggle state is local — if the page re-renders the action buttons from replayed events, the toggle resets to the backend's initial suggestion.
