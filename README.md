# TEDxTIET — Landing Page Hero

The hero section for TEDxTIET (Thapar Institute of Engineering & Technology, Patiala):
a dark stage on which the wordmark assembles itself.

## The animation

1. A thin **red axis line** draws across the darkness.
2. Scattered **fragments** (white and TED-red bars) swarm in and gather along it.
3. The fragments collapse into eight slots and the flat letters of **TEDxTIET**
   land in their place — each letter entering from its own direction.
4. The letters **extrude to 3D** as the red rim light flashes on.
5. The camera eases back and the logo settles into a floating, pointer-reactive
   3D object sized to ~65% of the viewport width.

The background is a custom-shader "stage floor": a disc of points carrying slow
radial waves outward from the logo — an idea spreading. **Click anywhere on the
stage to send your own ripple.** Moving the pointer tilts the logo and camera.

**Hover any letter** (or tap it on touch) and it lights up, lifts toward you,
and reveals a picture inside the glyph — stage, audience, microphone, the x,
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
