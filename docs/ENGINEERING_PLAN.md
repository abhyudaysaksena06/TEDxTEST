# TEDxTIET Immersive 3D Landing Page — Engineering Plan (v2, rectified)

Reference: the TED conference photo (wide house shot — screen sweeping the top,
TED letters stage-left, red circle carpet, curtains, seated audience banked left).

This document supersedes the v1 "Master Engineering Document". It keeps its
architecture where sound and amends what was incorrect, risky, or unnecessary.

---

## 0. Stack decision (amended)

| v1 proposed | v2 decision | Why |
|---|---|---|
| Next.js | **Vite (keep current setup)** | Single immersive landing page: SSR buys nothing, costs canvas hydration friction and `"use client"` ceremony. Revisit Next only when the site grows real multi-page/SEO needs. |
| R3F + drei | **R3F + drei** ✓ | Right call — declarative scene graph, `useGLTF`, `useAnimations`, `useVideoTexture` solve exactly the problems this build has. |
| GSAP ScrollTrigger | **GSAP ScrollTrigger** ✓ | Best-in-class scrubbing. One instance, one timeline. |
| Tailwind | **Tailwind v4** ✓ (already in repo) | — |

Pin versions: `three` ≥ r170, `@react-three/fiber` ^8/^9 (matching React 19),
`@react-three/drei` latest, `gsap` ^3. Do not mix drei/fiber majors.

---

## 1. Asset pipeline (amended — verification first)

### 1.1 Verify before integrating (gate zero)

The plan assumes each character GLB carries `Sit_Idle` and `Stand_Up_Clap`
skeletal tracks. **Downloaded models rarely do.** Before any code:

1. Open every GLB at <https://gltf.report> (or the three.js editor).
2. Record for each: animation track names, vertex/triangle count, texture
   sizes, file size, rig type (skinned vs static).
3. Any character missing the two tracks goes through the **Mixamo pipeline**:
   upload → auto-rig → apply "Sitting Idle" and "Stand Up + Clapping" (or
   Seated Clap) → download as FBX-with-skin → convert to GLB
   (`FBX2glTF` or Blender) → rename tracks to `Sit_Idle` / `Stand_Up_Clap`.

### 1.2 Compression (mandatory)

Raw rigged characters commonly total 50–150 MB. Budget:

- **Per character ≤ 1.5 MB**, seating ≤ 1.5 MB, stage ≤ 2 MB.
- **Total payload target ≤ 10 MB, hard ceiling 15 MB.**

Pipeline (run per file):

```bash
npx @gltf-transform/cli optimize input.glb output.glb \
  --compress meshopt --texture-compress webp --texture-size 1024
```

- Prefer **meshopt** (fast decode, small runtime) over Draco for animated
  meshes; drei's `useGLTF` supports both.
- Textures → WebP (or KTX2 if we adopt `KTX2Loader` later), max 1024².
- Strip unused nodes/materials (`--prune`).

### 1.3 Repo layout & delivery

```
public/models/
  stage-core.glb        # deck + curtains ONLY (letters excluded — see §3.1)
  seating.glb           # empty amphitheater rows (from "auditorium seating")
  char-child.glb
  char-businesswoman.glb
  char-woman-business.glb
  char-male.glb
  char-businessman.glb
public/media/
  screen-poster.webp    # idle screen artwork
  screen-loop.mp4       # H.264 + AAC-silent, ≤ 8 MB, 1280×540 letterboxed
```

- GitHub hard limit 100 MB/file; stay far below it. If any file cannot get
  under ~20 MB, use Git LFS or a CDN — decide at gate zero.
- Every model loads through **one manifest module** (`src/three/assets.js`)
  exporting paths + `useGLTF.preload()` calls, so the loading screen and
  suspense boundaries have a single source of truth.

---

## 2. Application architecture

```
src/
  components/
    Hero.jsx                 # DOM chrome, vignette, loading UX, skip, tuner
    TunePanel.jsx            # (kept) live effect tuner, press T / ?tune
  scene/
    Stage.jsx                # stage-core.glb + fascia + steps + carpet
    Letters.jsx              # PROCEDURAL TEDxTIET blocks (kept from current build)
    TheaterMediaScreen.jsx   # curved screen + media router (§4)
    Seating.jsx              # seating.glb, instanced if the source allows
    Audience.jsx             # extras (static silhouettes) + 5 hero members
    AudienceHeroMember.jsx   # one interactive character (§5.2)
    Spotlight.jsx            # cursor followspot (§5.1)
    Atmosphere.jsx           # curtain flicker, uplights, dust, ripple floor
    CameraRig.jsx            # scroll rail + idle drift (§6)
  hooks/
    useSpotlightTracker.js   # damped pointer → stage-plane point (shared)
    useMediaRouter.js        # {type:'image'|'video', src} state + disposal
    useReducedMotion.js
  three/
    assets.js                # manifest + preloads
```

Principles:

- **The letters stay procedural** (TextGeometry blocks from the current
  build), NOT baked into `stage-core.glb`. Every letter interaction we've
  shipped — per-letter hover glow, photo wrap, projector sync, the peel
  intro — requires owning those meshes individually. Strip letters out of
  the stage model in Blender if the source includes them.
- One `<Canvas>`; all cross-cutting per-frame state lives in refs/zustand,
  never React state per frame.

---

## 3. What carries over from the current build (do not rebuild)

| System | Status |
|---|---|
| Procedural glass letters (red TEDx / white TIET, inner glow) | Port as `Letters.jsx` |
| Letter hover → photo wrap + projector sync | Port; the media router replaces the canvas-slide half |
| Intro choreography (stencil → themed peel → extrude) | Port timeline onto R3F refs (anime.js works fine alongside) |
| Cursor followspot (pool + SpotLight) | Port as `Spotlight.jsx` + `useSpotlightTracker` |
| Ripple floor shader, click pulses | Port into `Atmosphere.jsx` |
| Effect tuner (`T` / `?tune`) | Keep; it has already paid for itself |
| ACES grade, vignette, reduced-motion, WebGL fallback | Keep |

---

## 4. TheaterMediaScreen (corrected)

### 4.1 v1 bugs fixed

1. **Rules-of-Hooks violation** — v1 called `useVideoTexture`/`useTexture`
   conditionally. Fix: two leaf components, each calling its hook
   unconditionally, selected (and remounted via `key`) by the router.
2. **`texture.encoding = THREE.sRGBEncoding` no longer exists** (removed
   r152+). Use `texture.colorSpace = THREE.SRGBColorSpace`.
3. **Disposal**: drei disposes on unmount for `useTexture`; for video,
   pause + clear `src` + `texture.dispose()` in a cleanup effect. The
   `key`-remount pattern makes this automatic and leak-free.

### 4.2 Corrected component sketch

```jsx
import { useTexture, useVideoTexture } from '@react-three/drei'
import * as THREE from 'three'

const SCREEN = { pos: [0, 8, -12], args: [25, 25, 10, 64, 1, true, -Math.PI / 4, Math.PI / 2] }

function Surface({ texture, boost }) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  return (
    <mesh position={SCREEN.pos} rotation={[0, Math.PI, 0]}>
      <cylinderGeometry args={SCREEN.args} />
      <meshBasicMaterial side={THREE.DoubleSide} map={texture} toneMapped={false} />
    </mesh>
  )
}

function VideoSurface({ src }) {
  const tex = useVideoTexture(src, { muted: true, loop: true, start: true })
  return <Surface texture={tex} />
}

function ImageSurface({ src }) {
  const tex = useTexture(src)
  return <Surface texture={tex} />
}

export default function TheaterMediaScreen({ media }) {
  return media.type === 'video'
    ? <VideoSurface key={media.src} src={media.src} />
    : <ImageSurface key={media.src} src={media.src} />
}
```

(`meshBasicMaterial` + `toneMapped:false` reads as emissive projection under
ACES without the emissiveMap double-sampling of v1; add a low-opacity
`meshStandardMaterial` variant only if the screen must receive light.)

Letter-hover slides feed this router as `{type:'image', src: dataURL}` from
the existing generated art, so hover sync and video mode share one path.

---

## 5. Lighting & interaction (amended values)

### 5.1 Spotlight

- v1: intensity 50 at `[0,22,5]`, angle π/12. With physical lights
  (decay 2) that's plausible, but **tune against the ACES grade in-scene**;
  start `intensity 40, decay 1.2, angle π/11, penumbra 0.6` and expose in
  the tuner. Keep the 2D floor pool sprite — it reads better than the beam.
- Tracker: `useSpotlightTracker` keeps v1's lerp (α = 0.08) → intersects the
  stage plane → returns a shared `Vector3` consumed by the spotlight target,
  the pool, and the clap trigger. One raycast per frame, total.

### 5.2 The clap trigger (kept, hardened)

Dual condition (raycast hover on the character AND spotlight distance
`d < 3.2`) stands. Amendments:

- **Crossfade, don't cut**: `standUp.reset().fadeIn(0.25)`,
  `sitIdle.fadeOut(0.25)`; on exit play the clip in reverse or crossfade
  back — never `stop()` mid-pose.
- **Cooldown** (~2.5 s) so cursor scrubbing doesn't retrigger a rising
  character into jitter.
- `LoopOnce` + `clampWhenFinished` on `Stand_Up_Clap`, then auto-return.
- Cap concurrent standers at 2 — a whole row popping up reads as glitch,
  one or two reads as delight.
- Non-hero extras stay as the current lightweight silhouettes (or static
  poses from the same GLBs) — five animated skinned meshes is the budget.

### 5.3 Curtain flicker

v1 formula kept verbatim — it's good:
`I(t) = 12 + 2.0 · sin(0.4t) · cos(0.15t)` driving the amber wash lights.
Add: freeze at `I_base` under reduced motion.

---

## 6. Scroll cinematics (corrected)

### 6.1 v1 bugs fixed

- The 70% → 100% straight-line interpolation **clips the camera through the
  stage and letters**. Replace waypoint lerping with a **`CatmullRomCurve3`
  camera rail** sampled by scroll progress.
- Interpolating raw Euler rotations gimbal-twists when scrubbed. Drive a
  **separate lookAt-target curve** instead; `camera.lookAt(target)` each
  frame. No rotation arrays anywhere.

### 6.2 The rail (v2)

| Scroll | Camera (on rail) | LookAt target | Intent |
|---|---|---|---|
| 0% | `[1.2, 7, 26]` | stage center | Wide house shot — full auditorium, screen text readable |
| 30% | `[0, 3.2, 15]` | carpet | Descent down the center aisle, heads passing below frame |
| 70% | `[-5, 1.8, 8]` | letters | Low-angle stage-left hero shot of the glowing TEDxTIET |
| 95% | `[0, 6.5, 2]` | screen center | Rise toward the screen filling the frame |
| 100% | — | — | **DOM crossfade**: a positioned `<video>` element fades over the canvas (§6.3) |

- One GSAP timeline, `scrub: 0.6` (slight smoothing), pinned hero section of
  ~300vh; progress writes to a ref consumed in `useFrame` — GSAP never
  touches the camera object directly.
- Idle drift + cursor parallax from the current build **multiply on top** of
  the rail position at low amplitude, gated off above 90% progress.

### 6.3 The 100% video handoff

Rendering "into" the WebGL screen at full scroll costs resolution and
sync pain. Instead: at 95–100% a DOM `<video>` (same file as the screen
loop, so the image matches) fades in over the canvas, letterboxed to the
screen's projected rect. Seamless to the eye, pixel-perfect, and the
canvas can drop its DPR while hidden.

### 6.4 Fallbacks

- Reduced motion: no pin, no rail — the current static composed shot, with
  sections stacking normally below.
- Touch: rail runs off native scroll (ScrollTrigger handles it); hover
  interactions keep their tap equivalents.

---

## 7. Performance budget & loading UX

- 60 fps target desktop, 30+ mobile; DPR capped at 2 (1.5 while scrolling —
  ScrollTrigger `onUpdate` can drop it).
- Draw calls < 150. Seating instanced if the GLB permits; extras use shared
  materials (already true).
- `<Suspense>` around each GLB group with a branded loading screen: black,
  small red wordmark, thin progress bar (drei `useProgress`). The intro
  timeline **starts only after** critical assets resolve — never animate
  into a half-loaded house.
- Skinned meshes: `frustumCulled` left ON, `updateMatrixWorld` default;
  pause mixers for characters far off-rail (scroll > 50%).
- Textures: max 1024², WebP; models meshopt; total transfer ≤ 10 MB.
- Explicit `.dispose()` on any texture we create imperatively (slides,
  posters) when replaced — pattern already in the codebase.

---

## 8. Phases & acceptance criteria

**Phase 0 — Asset gate (blocks everything)**
Verify tracks/sizes per §1.1, compress per §1.2, commit to `public/models/`.
✅ Done when: every file ≤ budget, characters play both tracks in gltf.report.

**Phase 1 — R3F skeleton + stage**
Canvas, ACES, fog, CameraRig (static), Stage.jsx from GLB, ported Letters +
intro + hover/projector, Atmosphere port.
✅ Done when: current hero parity inside R3F at 60 fps.

**Phase 2 — House**
Seating.jsx, Audience extras, 5 AudienceHeroMembers with clap trigger.
✅ Done when: hover+spotlight on a hero character stands them up with
crossfade, ≤ 2 concurrent, cooldown works, 60 fps holds.

**Phase 3 — Scroll film**
CameraRig rail + lookAt curve, pinned 300vh, DOM video handoff, reduced-
motion fallback.
✅ Done when: full scrub up/down shows no clipping, no gimbal flips, video
handoff is invisible at 4 devicePixelRatios.

**Phase 4 — Media router + polish**
TheaterMediaScreen video mode, loading UX, mobile pass, tuner defaults baked,
QA checklist below.

**QA checklist (every phase):** zero console errors; reduced-motion path;
WebGL-fail fallback; 390px portrait; tab-hidden pause; memory stable after
5 media-router swaps (DevTools heap + `renderer.info.memory`).

---

## 9. Out of scope (explicitly)

- Next.js migration, SSR, route transitions.
- Physics, post-processing chains (bloom etc.) — revisit only after Phase 4
  holds 60 fps; the emissive + ACES look already carries the aesthetic.
- More than 5 skinned characters.
