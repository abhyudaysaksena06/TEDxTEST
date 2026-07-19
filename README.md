# TEDxTIET — Landing Page Hero

The hero section for TEDxTIET (Thapar Institute of Engineering & Technology, Patiala):
a dark stage on which the wordmark assembles itself.

## The animation

1. The raw text is already there: a faint **stencil of TEDxTIET** is written on
   the stage from the very first frame.
2. Flat sheets in the **exact shape of the title** — themed on EDUCATION,
   TECHNOLOGY, DESIGN, and TIET — peel down onto the stencil one after
   another, each letter curling flat left to right like a sticker being laid
   down in reverse.
3. The finished **white word is applied last**, absorbing the stencil.
4. The word **extrudes to 3D** as the red rim light flashes on.
5. The camera eases back into a full TEDx event scene, viewed from the back
   of the house: the wordmark standing stage-left facing the audience, the
   circular red carpet center-stage, a curved projection screen sweeping the
   top of the frame, curtains, stage steps, and a seated audience below.

The background is a custom-shader "stage floor": a disc of points carrying slow
radial waves outward from the logo — an idea spreading. **Click anywhere on the
stage to send your own ripple.** Moving the pointer tilts the logo and camera.

The letter blocks carry a faint inner light. **Hover any letter** (or tap it
on touch) and it glows brighter and reveals a picture wrapped around the whole
block — and the same picture is projected big on the **curved projector screen**
closing the back of the stage, in sync. The whole wordmark tilts as one element,
pushed away where the cursor sits. Pictures — stage, audience, microphone, the x,
circuitry, an idea, a book, the campus. The art is generated at runtime; to use
real photos instead, fill the `LETTER_IMAGES` array at the top of
`src/three/HeroScene.js` with URLs or `/public` paths (one per letter).

- `prefers-reduced-motion` skips straight to the assembled logo with a static floor.
- A "Skip intro" control fast-forwards the choreography.
- If WebGL is unavailable, a static typographic hero renders instead.

## Stack

- [Vite](https://vitejs.dev) + React
- [Tailwind CSS v4](https://tailwindcss.com)
- [anime.js v4](https://animejs.com) — drives the whole assembly timeline
  (mesh transforms, material opacity, light state, shader uniforms, DOM chrome)
- [three.js](https://threejs.org) — extruded letter meshes (`TextGeometry`,
  Helvetiker Bold), stage lighting, ripple-floor `ShaderMaterial`, dust

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Structure

```
src/
  components/Hero.jsx       hero shell: canvas, chrome, skip control, fallbacks
  three/HeroScene.js        scene graph, letters, shards, lights, render loop
  three/rippleFloor.js      shader-based interactive stage floor
  anime/introTimeline.js    the assembly choreography (anime.js timeline)
```
