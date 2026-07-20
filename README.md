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

**Your cursor is the followspot.** A tracking spotlight (soft floor pool +
real `SpotLight`) glides wherever you point, damped for a natural lag. Two
conditions have to be true at once for a bigger reaction: the pointer is over
a specific audience member, *and* the followspot is actually lighting them
(distance-to-target under the illumination radius) — only then do they stand
and applaud, with a crossfade in and out and a cooldown so the house doesn't
pop up and down erratically. It's a procedural stand-and-clap for now (bob +
lean + scale-pulse on five to six people at a time); the code is written to
swap onto skinned `Stand_Up_Clap` animation tracks the moment character
models are added — see `docs/ENGINEERING_PLAN.md`.

**Scroll to walk the theater.** A GSAP `ScrollTrigger` scrubs the hero's
pinned 300vh track, riding the camera along a `CatmullRomCurve3` rail (with a
separate look-at curve, so it never gimbal-twists) from the wide house shot
down the aisle to a stage-left hero angle on the letters. Pointer parallax
and idle drift fade out as the rail takes over, so the two motion systems
never fight. Skipped entirely under reduced motion.

**The projector wall supports live media.** `HeroScene.setScreenMedia({type:
'image'|'video', src})` swaps the whole backdrop to a real photo or an
autoplaying muted/looping `<video>` feed — built as two independent code
paths (not a single component with a conditional hook call) with explicit
`.dispose()` on the previous texture/video every time media changes, so
switching sources repeatedly doesn't leak VRAM. Leave `SCREEN_MEDIA` at the
top of `HeroScene.js` as `null` to keep the hover-driven watermark/slides
behavior; set it to programmed media to override.

- `prefers-reduced-motion` skips straight to the assembled logo with a static
  floor, no scroll rail, no crowd sway/flicker, no clap animation.
- A "Skip intro" control fast-forwards the choreography.
- If WebGL is unavailable, a static typographic hero renders instead.

## Stack

- [Vite](https://vitejs.dev) + React
- [Tailwind CSS v4](https://tailwindcss.com)
- [anime.js v4](https://animejs.com) — drives the whole assembly timeline
  (mesh transforms, material opacity, light state, shader uniforms, DOM chrome)
- [three.js](https://threejs.org) — extruded letter meshes (`TextGeometry`,
  Helvetiker Bold), stage lighting, ripple-floor `ShaderMaterial`, dust,
  crowd, curtains, projector wall, spotlight
- [GSAP](https://gsap.com) `ScrollTrigger` — scrubs the camera along the
  scroll-film rail

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
