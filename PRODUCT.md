# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the project's author: a maker who built (or is building) a physical fibre-optic wall and uses Glowbraid as a personal design tool, and later as the control surface for an ESP32-driven wall. They know the hardware and the vocabulary; nothing needs explaining to them.

Other people (visitors from the README, the Instructables project, or a shared link to the live demo) are a bonus audience, not the one decisions are made for.

## Product Purpose

Glowbraid simulates a fibre-optic wall in the browser: a grid of square frames, each ringed by 24 hidden edge LEDs (6 per edge) that inject light into 12 passive side-glow fibres arcing across the panel. It lets the author design and preview a wall (grid size, frame geometry, board finish, fibre routing, colours, animation) before cutting a single fibre or wiring a single LED.

Success is a wall design the author trusts enough to build, and a preview that looks like the finished installation.

## Positioning

It is a digital companion to one specific real build ([Fiber Optic and LEDs: A Wall Decoration](https://www.instructables.com/Fiber-Optic-and-LEDs-a-Wall-Decoration/)), not a generic LED visualiser. The LEDs are never seen, only the light bleeding through the fibres. Every frame's fibre layout is generated deterministically from a seed, so a saved project regenerates pixel-for-pixel, and the framework-free engine is meant to drive the real hardware later.

## Operating Context

- A single-screen studio: a 3D view of the wall (orbit, pan, dolly, click a frame to select it), wall and fibre settings, a per-frame inspector with a connection map, and a transport for the 12-second animation loop.
- Used in repeated personal sessions at a desk. Designed desktop first; it must stay usable on a phone.
- Projects autosave to localStorage (`glowbraid.project`) as seeds plus settings; geometry is regenerated on load.
- Deployed as a static site on GitHub Pages.

## Capabilities and Constraints

Wall: grid size 1 to 6 squared; frame size, spacing, board padding, frame width, corner radius, frame offset; board colour (five presets plus custom); optional "Pour" board art with its own palettes and reroll.

Fibres: fixed at 24 LEDs and 12 fibre runs per frame (a perfect matching, not adjustable); curviness, randomness, socket depth; re-route fibres; generate a new wall.

Selected frame: number and seed, re-seed, frame colour with apply-to-all, stats (fibre runs, LEDs, crossings, average length), a connection map where clicking a fibre traces which two LEDs feed it.

Light: LED drive pattern (animation), animation speed, LED brightness, colour palette.

Transport: play/pause, stop, loop, scrub, speed presets, time readout.

Camera: dolly in and out, reset.

Constraints:

- The app is 3D-only (three.js); the wall view is the only view.
- Layering is engine, then renderer, then UI; the engine stays free of React and DOM types.
- Determinism is a persistence contract: RNG draw order in fibre generation is load-bearing, and snapshot fields must tolerate absence.
- Animation-frequency data (scrub position, time readout) lives outside React state and is written straight to the DOM.
- Terminology uses British spelling for the domain: fibre, colour.

Undecided: the roadmap items the current UI teases (draw fibres, move LEDs, layers, ESP32 live output, DMX, keyframes) are intentions, not commitments, and need not be advertised in the interface.

## Brand Commitments

Only the name Glowbraid is binding. The existing logo mark, lockups, tagline, and roadmap teasers are all open to change.

## Evidence on Hand

- The running app and its live demo: https://eduardse.github.io/glowbraid/
- Recordings: `docs/demo.gif`, `docs/3d.gif`
- The original physical build on Instructables (linked above)
- An imported design reference at `docs/reference/glowbraid-studio.dc.html`, which can go stale

There are no testimonials, user numbers, or press. None may be invented.

## Product Principles

1. The wall is the subject. Everything else exists to change it or to read it.
2. What the preview shows must be buildable: real dimensions, real LED counts, real fibre physics.
3. A design is reproducible. Same seeds and settings, same wall, every time.
4. Built for one expert user. Fluency and speed beat explanation.
5. The software follows the hardware. Nothing in the interface should contradict how the physical wall works.
