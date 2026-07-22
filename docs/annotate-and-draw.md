# Annotate, Inspect & Draw

## Inspect Mode — style evidence for design-QA bugs

The newest of the three modes, and the only one with a first-class UI entry
point: the extension popup's **Inspect element** button (or
`TraceBug.activateInspectMode()`).

- **Hover** any element → a DevTools-style box-model highlight (margin /
  padding / content tint) plus a tooltip with the computed-style summary:
  `13.5px/20px 600 Inter · color #ffffff on #4f46e5 · 686px×38px · pad 10px 16px · contrast 6.29:1`
- **Click** → the element is attached to the report as an `inspect`
  annotation carrying a curated ~20-property snapshot: typography, colors
  (as hex), box model, layout, and a **WCAG text-contrast verdict** (ratio +
  AA pass/fail, large-text aware).
- **Esc** exits.

The evidence surfaces everywhere the report goes: an expandable **Styles**
block on annotation cards in the Quick Bug modal, an **Element Evidence**
section in generated GitHub issues, the export's Description panel, and
structured `elementAnnotations` over MCP (`get_bug_report`) so an AI agent
can diff the captured styles against the design tokens in the codebase.

Regular annotate-mode annotations (below) capture the same style snapshot
automatically.


> **v1.0 status — programmatic only.** Both modes were cut from the default toolbar in v1.0 to reduce overlap with the screenshot-annotation editor. The source files still ship in the bundle and the public API is unchanged — anything below works if you call it from your own code or a plugin. The `Ctrl+Shift+A` and `Ctrl+Shift+D` shortcuts are not wired in v1.0.
>
> **To re-enable the toolbar buttons** locally, restore the cut blocks in [src/compact-toolbar.ts](../src/compact-toolbar.ts) (`grep "Annotate + Draw modes were cut"` to find the spot). Or call the APIs from your own UI:
>
> ```typescript
> TraceBug.activateAnnotateMode();   // start clicking elements
> TraceBug.deactivateAnnotateMode();
> TraceBug.activateDrawMode();       // drag rectangles/ellipses
> TraceBug.deactivateDrawMode();
> ```

TraceBug also provides visual feedback modes for marking up UI issues directly on the live page — no screenshots needed: annotate, draw, and the element-level blur tool.

## Element Annotate Mode

Annotate mode lets you click any element on the page and attach structured feedback: what needs to change, how critical it is, and a description.

### How to Use

1. **Activate** — Call `TraceBug.activateAnnotateMode()` (no toolbar button / shortcut in v1.0)
2. A **purple banner** appears at the top: "Annotate Mode"
3. **Hover** over elements — they highlight with a purple border
4. **Click** an element to select it — a feedback form appears
5. Fill in:
   - **Intent** — What should happen? (Bug Fix / Redesign / Remove / Question)
   - **Priority** — How critical? (Critical / Major / Minor / Info)
   - **Description** — What's wrong and what should change
6. Click **Save Annotation**
7. A **numbered badge** appears on the annotated element
8. **Exit** by pressing `Esc`, clicking the Exit button, or clicking the toolbar button again

### Multi-Select

Hold `Shift` and click multiple elements to annotate them together:

- Each selected element gets a numbered cyan badge
- The banner updates to show the selection count
- Right-click to open the feedback form for all selected elements
- One comment applies to all selected elements

### What Gets Captured

Each element annotation records:

| Field | Description |
|-------|-------------|
| CSS Selector | Unique path to the element (prefers `#id`, `[data-testid]`, then tag path) |
| Tag name | HTML element type (`button`, `div`, etc.) |
| Inner text | First 100 characters of visible text |
| Bounding rect | Position and size on page |
| Intent | `fix` / `redesign` / `remove` / `question` |
| Severity | `critical` / `major` / `minor` / `info` |
| Comment | Your description of the issue |
| Page URL | Which page the annotation is on |
| Scroll position | Where the page was scrolled to |
| Style snapshot | The same curated computed-style evidence as inspect mode (typography, colors as hex, box model, WCAG contrast) — captured automatically on save |

### Persistent Badges

After saving, **dashed outlines and numbered badges** appear on annotated elements. These persist until you clear annotations or leave the page.

### Viewing Annotation Details

**Click any numbered badge** on the page to see a popover with:
- Intent (Fix / Redesign / Remove / Question) with color
- Severity (Critical / Major / Minor / Info)
- The comment you wrote

The popover closes on click outside, Escape key, or the X button.

## Draw Mode

Draw mode lets you draw rectangles or ellipses directly on the live page to mark layout, spacing, alignment, or grouping issues that span multiple elements.

### How to Use

1. **Activate** — Call `TraceBug.activateDrawMode()`, or use the recording HUD's ✎ **Pen** button (no dedicated toolbar button / shortcut in v1.0)
2. A **purple toolbar** appears at the top with shape and color options
3. **Drag** anywhere on the page to draw a shape
4. A comment input appears — add a description or click **No comment** to save without one
5. Draw as many shapes as you need
6. **Exit** by pressing `Esc` or clicking **Done**

### Tools

| Tool | Description |
|------|-------------|
| Rectangle | Drag to draw a rectangular region |
| Ellipse | Drag to draw an elliptical region |

### Colors

Five colors are available: **Purple**, **Red**, **Yellow**, **Green**, **Blue**. The active color has a white ring and glow effect.

### What Gets Captured

Each draw region records:

| Field | Description |
|-------|-------------|
| Shape | `rect`, `ellipse`, or `redact` (blur/black-out) |
| Position | X, Y coordinates (document-relative) |
| Size | Width and height in pixels |
| Color | The color used for the shape |
| Comment | Your description (optional) |
| Page URL | Which page the region is on |

### Region Labels

Saved regions display on the canvas with:
- A **colored number pill** in the top-left corner
- A **comment preview** next to the number (first 40 characters)

## Blur Tool (element-level redaction)

The blur tool redacts sensitive on-screen content before or during a
recording. Unlike draw mode, it is **element-level — no dragging**:

1. **Activate** — the recording HUD's droplet **Blur** button, the extension
   popup's **Blur before recording** option, or programmatically via
   `TraceBug.prepareRecording({ blurFirst: true })` /
   `startBlurThenRecord(...)`
2. **Hover** highlights an element; **click** applies `filter: blur(12px)`
   to the element itself. Because the blur is part of the element's own
   rendering it moves in the same paint as the content — it can't lag
   behind scrolling the way overlay boxes did
3. **Click again** to unblur; **Undo** on the pre-record arming bar removes
   the most recent blur
4. **Esc** (or deactivating) exits the picker — placed blurs stay

Blurred elements also get the `tb-mask` class, so the rrweb DOM replay
masks their text — not just the video pixels. Blurs persist through the
recording and are removed (original inline `filter` restored) when it
stops.

Named exports: `isBlurModeActive()`, `removeAllBlurBoxes()`.

## Viewing Annotations

Open the annotation panel programmatically (`getAnnotationReport()` and the export helpers below). It shows:

### Element Annotations Section
- Numbered badges with intent and severity
- Element tag and text preview
- Full comment
- Relative timestamp ("2m ago")
- Delete button per annotation

### Draw Regions Section
- Shape icon (rectangle or circle) with color indicator
- Dimensions (e.g., "200 x 80")
- Comment or "No comment added"
- Relative timestamp
- Delete button per region

### Screenshots Section
- All captured screenshots shown with inline preview
- Filename and dimensions
- Download button per screenshot

### Actions

| Button | Action |
|--------|--------|
| **Save** | Screenshot the page with annotations visible and auto-download |
| **Copy MD** | Copy all annotations as Markdown |
| **Copy JSON** | Copy all annotations as JSON |
| **Clear All** | Remove all annotations (with confirmation) |

## Export Formats

### Markdown

```markdown
# UI Annotations Report
**Page:** https://example.com/dashboard
**Date:** 2025-01-15T10:30:00.000Z
**Total:** 3 element annotations, 1 draw regions

## Element Annotations

### 1. [FIX] `#submit-btn` (Critical)
- **Element:** `<button>` "Submit Order"
- **Comment:** Button is not disabled after first click
- **Page:** /checkout

## Draw Regions

### 1. Rectangle at (120, 340) 200x80
- **Comment:** Spacing between cards is inconsistent
- **Page:** /dashboard
```

### JSON

```json
{
  "elementAnnotations": [...],
  "drawRegions": [...],
  "page": "/dashboard",
  "timestamp": 1705312200000
}
```

## Programmatic API

```typescript
// Activate/deactivate modes
TraceBug.activateAnnotateMode();
TraceBug.deactivateAnnotateMode();
TraceBug.activateDrawMode();
TraceBug.deactivateDrawMode();

// Check state
TraceBug.isAnnotateModeActive();
TraceBug.isDrawModeActive();

// Export
const report = TraceBug.getAnnotationReport();
const json = TraceBug.exportAnnotationsJSON();
const md = TraceBug.exportAnnotationsMarkdown();
await TraceBug.copyAnnotationsToClipboard("markdown");

// Clear
TraceBug.clearAnnotations();
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` | Toggle annotate mode — **not wired in v1.0** (call `activateAnnotateMode()`) |
| `Ctrl+Shift+D` | Toggle draw mode — **not wired in v1.0** (call `activateDrawMode()`) |
| `Ctrl+Shift+S` | Take screenshot |
| `Esc` | Exit current mode / close popover |
| `Shift+Click` | Multi-select elements (annotate mode) |
| `Right-Click` | Open feedback form for multi-selection |
