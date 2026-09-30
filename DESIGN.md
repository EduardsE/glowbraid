---
name: Glowbraid
description: The fibre-optic wall's working shop drawing, in plot-bond paper, carbon ink and one redline pencil.
colors:
  paper: "#f1f3f4"
  paper-2: "#e5e8ea"
  ink: "#16191e"
  ink-2: "#4b5159"
  ink-3: "#666b72"
  rule: "#c8ccd0"
  redline: "#c81e3a"
  redline-lit: "#ff6b7a"
  view: "#0b0b0c"
typography:
  display:
    fontFamily: "'Sofia Sans Condensed Variable', 'DIN Condensed', 'Sofia Sans Variable', ui-sans-serif, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.05em"
  headline:
    fontFamily: "'Sofia Sans Condensed Variable', 'DIN Condensed', 'Sofia Sans Variable', ui-sans-serif, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "0.06em"
  title:
    fontFamily: "'Sofia Sans Variable', 'DIN Alternate', 'Bahnschrift', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: "'tnum', 'lnum'"
  body:
    fontFamily: "'Sofia Sans Variable', 'DIN Alternate', 'Bahnschrift', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "'tnum', 'lnum'"
  label:
    fontFamily: "'Sofia Sans Variable', 'DIN Alternate', 'Bahnschrift', ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.35
  value:
    fontFamily: "'Sofia Sans Variable', 'DIN Alternate', 'Bahnschrift', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.35
    fontFeature: "'tnum', 'lnum'"
  caption:
    fontFamily: "'Sofia Sans Variable', 'DIN Alternate', 'Bahnschrift', ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1
  key:
    fontFamily: "'Sofia Sans Condensed Variable', 'DIN Condensed', 'Sofia Sans Variable', ui-sans-serif, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1
  dimension:
    fontFamily: "'Sofia Sans Condensed Variable', 'DIN Condensed', 'Sofia Sans Variable', ui-sans-serif, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1
rounded:
  none: "0px"
  balloon: "9999px"
spacing:
  cell-gap: "8px"
  row-gap: "10px"
  panel: "16px"
  section: "24px"
  key-indent: "27px"
  row: "32px"
  row-touch: "44px"
  column: "328px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
  button-primary-active:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  button-secondary-active:
    backgroundColor: "{colors.rule}"
    textColor: "{colors.ink}"
  button-disabled:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-3}"
  segmented-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "30px"
  segmented-cell-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  segmented-cell-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  schedule-row:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "{spacing.row}"
  schedule-row-live:
    textColor: "{colors.redline}"
  number-field:
    textColor: "{colors.ink}"
    typography: "{typography.value}"
    rounded: "{rounded.none}"
    padding: "1px 2px"
  number-field-focus:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  key-balloon:
    textColor: "{colors.ink-2}"
    typography: "{typography.key}"
    rounded: "{rounded.balloon}"
    size: "17px"
  key-balloon-live:
    backgroundColor: "{colors.redline}"
    textColor: "{colors.paper}"
    rounded: "{rounded.balloon}"
    size: "17px"
  transport-key:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    size: "36px"
  transport-key-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  view-key:
    backgroundColor: "{colors.view}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "32px"
  view-key-pressed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  swatch:
    rounded: "{rounded.none}"
    size: "24px"
---

# Design System: Glowbraid

## Overview

**Creative North Star: "The Shop Drawing"**

The studio is the wall's working drawing. Every setting is a line in a schedule, six of them keyed by letter (A to F) to a dimension line drawn on the 3D wall itself, and the wall's derived facts sit in a title block along the sheet's edge. The author reads a real size, changes it, watches it measured on the wall, and trusts the number enough to cut timber. Nothing on the sheet explains itself; it is lettered for one fluent reader.

The material is cool plot-bond paper and carbon ink, flat, square and ruled. There is one coloured pencil, a carmine redline, and it only ever marks what is live. The single dark surface is the 3D view, where the fibres supply all the colour and everything the interface adds is a thin paper-coloured line. Density is a drawing's density: 32px rows, 328px columns, 13 to 15px lettering, tabular figures throughout.

This system rejects the dark glass dashboard it replaced: a header bar, panels of anonymous sliders, a glowing accent. It has no top header at desktop widths, no cards, no shadows, no gradients in its chrome.

**Key Characteristics:**
- Paper and ink chrome around one dark view; the wall is the only thing that glows.
- Controls are schedule rows, joined table cells and scale-rule sliders, not generic form widgets.
- Every slider carries a typed value and a unit; numbers are bold, units are quiet.
- Redline is state, never style.
- Square corners; round only on key balloons.
- Values snap. The playhead is the only continuous motion in the chrome.

## Colors

A near-neutral, cool-grey drawing palette with a single carmine pencil; all hue in the product belongs to the wall, its finishes and its light palettes.

### Primary
- **Redline Carmine** (`redline`): the pencil that marks what is live on paper. The active schedule row's label and key balloon, the playhead while playing, a slider thumb under the pointer or focus, the focus outline, the text caret, the traced fibre and its two LED labels in the wiring map, the selected frame's number tag. 5.1:1 on paper, so it holds as 13px text.
- **Redline, Lit** (`redline-lit`): the same pencil on the dark view, lightened so it reads against near-black (7.1:1). The live dimension line, its value and balloon, the selected frame's outline and tag. The WebGL selection outline mirrors this value and is kept under the bloom threshold so it stays a crisp line.

### Neutral
- **Plot-Bond Paper** (`paper`): the sheet. Every surface outside the view; also the colour of lines and lettering drawn on the view.
- **Paper, Shaded** (`paper-2`): hover fill on cells and buttons, the focused typed field, the empty custom-colour chip.
- **Carbon Ink** (`ink`): text, object lines, cell borders, the solid fill of the chosen cell and the primary action, text selection.
- **Ink, Second Weight** (`ink-2`): units, captions, notes, title-block labels, idle key balloons (7.2:1 on paper).
- **Ink, Third Weight** (`ink-3`): slider graduations and baseline, idle balloon outline, typed-field hover underline, disabled text (4.8:1 on paper; do not use it for text on `paper-2`).
- **Table Rule** (`rule`): the grey line under each schedule row and stat; the pressed fill of a paper button; disabled borders.
- **View Black** (`view`): the 3D view's ground. The rendered scene runs a vertical gradient from #161718 at the top down to this value. Also the halo stroke behind lettering on the view.

Canvas and WebGL cannot read CSS variables, so the wiring-map renderer and the 3D renderer hold literal mirrors of `ink`, `redline`, `redline-lit` and `view`. Change a token and its mirror together.

### Named Rules
**The Redline Rule.** Redline marks only what is live: the active dimension, the playhead, the selected frame, the traced fibre, focus, a slider thumb under the pointer. It is never a fill for a resting control, never a brand flourish, never a decoration. When nothing is live, the paper is black and grey.

**The One Dark Surface Rule.** Only the 3D view is dark. Panels, transport, title block, tooltips and any future surface are paper.

**The Borrowed Colour Rule.** Chroma outside redline appears only as data: finish swatches, pour palettes, light-palette strips. Those colours are shown in flat square chips and never leak into chrome.

## Typography

**Display Font:** Sofia Sans Condensed Variable (with DIN Condensed, Sofia Sans Variable, ui-sans-serif)
**Body Font:** Sofia Sans Variable (with DIN Alternate, Bahnschrift, ui-sans-serif, system-ui)

**Character:** DIN-lineage drawing lettering. The condensed cut is for what a drawing letters in capitals or on the object itself (the name, section titles, key letters, dimension text); the normal cut carries everything read as a row. Both are self-hosted variable fonts; figures are tabular and lining everywhere.

### Hierarchy
- **Display** (800, 21px, line-height 1, uppercase, 0.05em): the name in the title block. One use.
- **Headline** (800, 15px, uppercase, 0.06em, condensed): schedule section titles (Board, Frames, Fibres, Light, Frame), each lettered under a 2px object line.
- **Title** (700, 15px, line-height 1.25): title-block values and the editable seed; the 3D failure heading steps to 16px.
- **Body** (400, 14px, line-height 1.35): base. Notes and empty-state prose run 12.5 to 13.5px in `ink-2`, capped near 34 to 44ch.
- **Label** (400, 13.5px): schedule row names and field labels; turns 600 and redline while its dimension is live. Cells and buttons sit at 13 to 13.5px, 600 when chosen or actionable.
- **Value** (700, 14px, right-aligned, tabular): the typed number in a row, followed by its unit at 12px in `ink-2`.
- **Caption** (400, 11.5px, line-height 1): title-block labels and ruler numerals, in `ink-2`.
- **Key** (700, 11px, condensed): the letter inside a key balloon.
- **Dimension** (700, 19px, condensed): the live dimension's value on the wall. The always-on overall dimension is 600 at 14px; frame tags are 700 at 13px.

### Named Rules
**The Value Is Bold Rule.** In any label and value pair the value carries the weight (700, or 600 for a named choice) and the label stays regular. Units are smaller and second-weight ink.

**The Condensed Is Lettered Rule.** Condensed type is reserved for titles, key letters and text drawn on the wall. Rows, values and prose use the normal cut.

## Layout

One screen, one sheet, filling the viewport (100dvh) with no page scroll; only the side columns scroll.

- **From 1180px:** three columns, schedule (328px), view (fluid), specs (328px). The transport sits directly under the view. The title block spans the full width along the bottom edge; its name cell and seed cell are 327px so their dividers line up with the columns above.
- **From 760px:** two columns, a single 328px side column (schedule then specs) beside the view, transport under the view, title block along the bottom.
- **Below 760px:** the title block moves to the top as a strip, then the view at 42dvh (minimum 240px), the transport, then one scrolling column. Rows grow from 32 to 44px, cells from 30 to 40px, swatches from 24 to 36px, buttons to 44px. Title-block cells drop out in priority order until only the name, overall size and seed remain; transport speed presets hide below 640px.

Rhythm: 16px panel padding, 24px between sections, 10px between row columns, 8px between paired buttons and between swatches. A schedule row is a fixed grid: 17px key column, fluid label, 92px scale rule, 58px value and unit. Controls that need more than one line (colour, art) indent 27px so they hang under the label column, not the key column.

The view is edge to edge in its cell with no inset or frame. Its controls sit 12px in from the top right; the usage hint sits top left and steps aside while a live dimension is showing.

## Elevation & Depth

Flat. There are no shadows, no blur, no overlays and no tonal stacking in the chrome. Hierarchy is carried by line weight alone:

- **Object line** (2px `ink`): the sheet's structure. Column dividers, the title block's edge, the line over each section title, the selected swatch's outline.
- **Cell line** (1px `ink`): borders of buttons, joined cells, transport keys, title-block dividers.
- **Table rule** (1px `rule`): under each schedule row and stat.
- **Live line** (1.5px redline): the live dimension, the selected frame's tag, the traced fibre (2.25px on the wiring map).

Depth exists only inside the 3D view, and belongs to the wall. Lettering on the view is kept legible by a 4px `view`-coloured halo stroke, not a plate or a shadow.

### Named Rules
**The Drawn Line Rule.** Anything added to the 3D view is a drawn paper line or paper lettering: dimension lines with tick terminators at 80% paper, object outlines at 45 to 70%, controls with a 60% paper border. Never colour, glow, glass or chrome. Redline-lit is the only exception, under the Redline Rule.

## Shapes

Square. The radius token is zero and every shadcn radius step resolves to it, so an added component arrives square. Slider thumbs are square bars (5px by 19px; the playhead 3px by 24px), swatches are square chips, joined cells share 1px ink seams made by a 1px gap over an ink ground.

**The Balloon Exception.** Key balloons are round, as on a drawing, and nothing else is: the A to F dimension marks (17px), the frame-number tag (22px in the panel, 25px on the wall), and the live-dimension balloon on the wall (20px). A round shape in this system always means "this is a key to something on the wall". LED dots on the wiring map are drawn points, not interface shapes.

## Components

Controls are drawing furniture: they look like parts of a schedule, not like widgets placed on a panel.

### Buttons
- **Shape:** square, 1px ink border, 34px high (44px on phones), 13.5px at 600.
- **Primary:** solid ink with paper text. One per section at most: the action the section exists for (New wall). Hover `ink-2`, active `ink-3`.
- **Secondary:** paper with ink text and border. Hover `paper-2`, active `rule`.
- **Disabled:** paper, `rule` border, `ink-3` text, not-allowed cursor.
- **Focus:** 2px redline outline, 2px offset, on everything focusable.
- **Transitions:** 160ms on background, border, colour and opacity with an expo ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`); removed under reduced motion.

### Segmented cells
Every option visible as joined table cells; nothing hides in a dropdown. 30px high (40px on phones), 13px. The chosen cell is inked solid with paper text at 600; the rest are paper, `paper-2` on hover. Used for grid size, board art, drive pattern (three columns), speed presets. The light-palette list is the same construction turned vertical: 28px rows, a 120px flat gradient strip, then the name.

### Schedule row
The signature control. One 32px line under a table rule: key balloon, name, scale-rule slider, typed value, unit. Hover, focus or drag a keyed row and its dimension line appears on the wall in redline-lit with the same letter; the row's label and balloon turn redline for as long as it is live, and the line lingers one second after attention leaves. Rows that are not drawn on the wall (fibre percentages, speed, brightness) have no balloon and never turn red.

### Scale-rule slider
Ten graduations in `ink-3` over a 1px baseline, with the measured length inked 3px heavy in `ink` up to a 5px by 19px square thumb. The thumb turns redline on hover, press and focus. The transport scrub is the same instrument: twelve graduations in `ink` for the 12-second loop, numerals every 3 seconds, a 3px playhead that is redline only while playing.

### Typed field
Reads as bold dimension text until touched: no box, right-aligned, transparent 1px underline. Hover shows an `ink-3` underline; focus shows a redline underline on `paper-2` and selects the value. Enter or blur commits and snaps to the step; Escape reverts; arrow keys step, Shift steps by ten.

### Key balloon
A 17px circle with a condensed letter. Idle: `ink-3` outline, `ink-2` letter, no fill. Live: solid redline with a paper letter. The frame tag is the outlined variant in redline (1.5px), two digits.

### Swatches
24px square chips (36px on phones) at 8px gaps, bordered in ink at 45%. Chosen: a 2px ink outline offset 2px. The last chip is the custom colour: `paper-2` with a plus until a custom colour is set.

### Title block
A strip of cells divided by 1px ink lines: the mark and name, then label over value pairs (caption over title), then the editable seed at the far end. The name cell is the only place the display type appears.

### View keys
Controls drawn on the dark view: 32px (40px on phones), 60% paper border, 75% view fill, paper text. Hover inverts to paper with ink text; a pressed toggle stays inverted. Joined keys overlap borders by 1px.

### Dimension overlay
SVG lines projected from the wall's real geometry each frame. The overall board dimension is always on (toggle with D): extension lines that overshoot 6px, 45-degree tick terminators, paper lettering. The live dimension is the same construction in redline-lit at 1.5px, with its key balloon seated left of a 19px value. A radius is drawn as a leader from a crosshair at the arc's centre. Lines fade in and out over 160ms; positions are never animated.

### Brand mark
One frame in elevation: a square panel with two fibre runs crossing it. In the studio it is single-colour ink at 24px beside the name. The wordmark is the name in Sofia Sans Condensed ExtraBold capitals.

### States
The view has three states, all lettered in paper on the dark ground with no spinner or illustration: a centred line while the renderer loads, the usage hint once ready, and a two-line failure message (what happened, then what to do) if WebGL cannot start. With no frame selected, the frame section shows its title and one sentence on how to open a frame.

## Do's and Don'ts

### Do:
- **Do** give every numeric control a schedule row: name, scale rule, typed value, unit. A slider without a typed number does not belong on this sheet.
- **Do** keep redline for live state only, and use `redline-lit` for the same state on the dark view.
- **Do** build hierarchy from line weight: 2px ink for structure, 1px ink for cells, 1px `rule` for table lines.
- **Do** show every option of a small set as joined cells with the chosen cell inked solid.
- **Do** draw anything new on the 3D view as a paper line or paper lettering with the 4px view-coloured halo.
- **Do** keep figures tabular and values bolder than their labels.
- **Do** raise touch targets below 760px (rows and buttons 44px, cells 40px, swatches 36px).
- **Do** update the canvas and WebGL mirrors whenever `ink`, `redline`, `redline-lit` or `view` changes.
- **Do** use British spelling in lettering: fibre, colour.

### Don't:
- **Don't** use redline for decoration, emphasis, branding or a resting fill. If nothing is live, nothing is red.
- **Don't** round a corner unless the shape is a key balloon.
- **Don't** add a second dark surface, or a dark theme for the chrome.
- **Don't** put colour, glow, glass, blur or a filled panel over the 3D view.
- **Don't** add shadows, cards or gradients to the chrome. Gradients appear only inside palette strips and swatches, as data.
- **Don't** hide a small option set in a dropdown.
- **Don't** animate layout or position. Transitions are 160ms on colour and opacity; values snap.
- **Don't** set `ink-3` text on `paper-2`; it falls under 4.5:1.
- **Don't** bring back a top header bar at desktop widths; the name lives in the title block.
