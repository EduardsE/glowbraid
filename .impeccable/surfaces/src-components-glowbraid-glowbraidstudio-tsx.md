---
version: 1
slug: "src-components-glowbraid-glowbraidstudio-tsx"
primary_target: "src/components/glowbraid/GlowbraidStudio.tsx"
related_targets: []
---

# Studio (the single app screen)

Scope: the whole Glowbraid studio, `src/components/glowbraid/`. Visitor mode: Operate.

Audience and job: the author, at a desk with the room lights on, shaping a wall (grid, frame geometry, finish, fibre routing) they intend to build, reading real sizes off the screen. Secondary tasks: tuning the light, inspecting one frame's wiring.

Constraints: desktop first, phone usable. Full restructure allowed; every existing function stays. Must not read as a generic dark AI tool or as toy-like decoration. Roadmap teasers are dropped. Light controls are wall-wide and no longer hide behind frame selection.

Additions approved by "full restructure": typed numeric values beside every slider, an editable master seed, keyboard shortcuts, overall board size and approximate fibre length as derived readouts.

Unresolved: none. The app icons and brand SVGs in `public/` were redrawn from the new mark during the fix round.

## Direction contract

THESIS: The studio is the wall's working shop drawing. Every setting is a dimension in a schedule, keyed by letter to a live dimension line on the wall itself. It refuses the dark glass dashboard: a header bar, two panels of anonymous sliders, a glowing accent.

OWN-WORLD: Cool plot-bond paper (#f1f3f4) and carbon ink (#16191e) in three line weights: 2px object lines, 1px table rules, hairlines. Square corners everywhere, with one exception: key balloons (the A to F dimension marks, the frame-number tag) are round, as on a drawing. Carmine redline pencil (#c81e3a) is reserved for what is live: the active dimension, the playhead, the selected frame, focus. DIN-lineage lettering (Sofia Sans, Sofia Sans Condensed) with tabular figures. Controls are schedule rows, joined table cells with the chosen cell inked solid, and scale-rule sliders. The only dark area is the view.

STORY: The author reads real sizes, changes one, sees it measured on the wall, and trusts the number enough to cut timber.

FIRST VIEWPORT: At 1440 by 900: a 328px schedule on the left (Board, Frames, Fibres) of single-line rows, each mark, label, rule, value. The dark view fills the centre column edge to edge, the wall carrying an always-on overall dimension, view controls top right. Under it, the transport with a 12-second ruler. A 328px column on the right holds Light, then the frame detail with its wiring map. A full-width title strip runs along the bottom with the name, wall, overall size, counts, fibre length and editable seed. There is no top header. The primary action, Generate new wall, is solid ink at the foot of Fibres.

SIGNATURE INTERACTION AND MOTION: Live dimensions. Hover, focus or drag a schedule row and its lettered dimension line appears on the 3D wall in redline, value large, tracking the camera, lingering one second after the row loses attention. Transitions are 160ms ease-out on opacity and colour; values snap; the playhead is the only continuous motion in the chrome; reduced motion removes transitions.

FORM: Shop Drawing, position 1 on the ordered list, chosen by the user over the rolled position 5. Seed key f21c04b1.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
