import { createTimeline, stagger, utils } from 'animejs'

/**
 * The assembly choreography, expressed as one anime.js timeline that drives
 * plain objects on the three.js scene (positions, rotations, material
 * opacity, light state) plus the DOM chrome.
 *
 * Beats:
 *   0. the raw text is already there — a faint stencil of TEDxTIET is
 *      written on the stage from the very first frame
 *   1. a red axis line draws through it
 *   2. scattered fragments swarm in and gather along it
 *   3. the fragments collapse into eight slots along the axis
 *   4. translucent genre panes — TECHNOLOGY, ENTERTAINMENT, DESIGN, … —
 *      fly in and stack one on another over the raw text
 *   5. the stack compresses into the axis and the finished letters are
 *      applied onto their raw outlines like a sticker being laid down —
 *      each one curls flat, left to right, absorbing the stencil beneath
 *   6. the letters extrude to 3D as the red rim light flashes on
 *   7. the camera eases back, the stage floor wakes, the chrome fades in
 */
export function buildIntroTimeline(scene, chrome, onDone) {
  const tl = createTimeline({
    defaults: { ease: 'outExpo' },
    autoplay: false,
    onComplete: () => finish(),
  })

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    scene.assembled = true
    onDone?.()
  }

  const axisLength = scene.logoWidth + 1.6

  // hide DOM chrome before first paint of the intro
  const chromeEls = chrome.filter(Boolean)
  utils.set(chromeEls, { opacity: 0, translateY: '0.6rem' })

  // 1 — the axis line draws
  tl.add(scene.axis.material, { opacity: 0.9, duration: 240, ease: 'linear' }, 60)
  tl.add(scene.axis.scale, { x: axisLength, duration: 780 }, 60)

  // stage floor breathes in underneath everything
  tl.add(scene.floor.uniforms.uFade, { value: 1, duration: 2200, ease: 'outQuad' }, 200)
  tl.add(scene.dustMat, { opacity: 0.4, duration: 2000, ease: 'outQuad' }, 500)

  // 2 — fragments swarm onto the axis
  const shardMats = scene.shards.map((s) => s.material)
  const shardPos = scene.shards.map((s) => s.mesh.position)
  const shardRot = scene.shards.map((s) => s.mesh.rotation)
  tl.add(shardMats, { opacity: 0.85, duration: 320, delay: stagger(6), ease: 'linear' }, 260)
  tl.add(
    shardPos,
    {
      x: (_, i) => scene.shards[i].home.x,
      y: (_, i) => scene.shards[i].home.y,
      z: (_, i) => scene.shards[i].home.z,
      duration: 1050,
      delay: stagger(7),
      ease: 'outQuint',
    },
    300,
  )
  tl.add(
    shardRot,
    { x: 0, y: 0, z: (_, i) => (i % 2 ? 0.12 : -0.12), duration: 1050, delay: stagger(7), ease: 'outQuint' },
    300,
  )

  // 3 — fragments collapse into the letter slots along the axis
  tl.add(
    shardPos,
    {
      x: (_, i) => scene.shards[i].slot.x,
      y: (_, i) => scene.shards[i].slot.y,
      z: (_, i) => scene.shards[i].slot.z,
      duration: 380,
      delay: stagger(4),
      ease: 'inQuad',
    },
    1420,
  )
  tl.add(
    scene.shards.map((s) => s.mesh.scale),
    { x: 0.01, y: 0.01, z: 0.01, duration: 360, delay: stagger(4), ease: 'inQuad' },
    1460,
  )
  tl.add(shardMats, { opacity: 0, duration: 300, delay: stagger(4), ease: 'linear' }, 1520)

  // 4 — the genre panes fly in and stack one on another around the axis
  const layerPos = scene.genreLayers.map((g) => g.mesh.position)
  const layerRot = scene.genreLayers.map((g) => g.mesh.rotation)
  const layerMats = scene.genreLayers.map((g) => g.material)
  tl.add(layerMats, { opacity: 0.85, duration: 420, delay: stagger(170), ease: 'linear' }, 1600)
  tl.add(
    layerPos,
    {
      y: (_, i) => scene.genreLayers[i].stackY,
      z: -0.4,
      duration: 900,
      delay: stagger(170),
      ease: 'outQuint',
    },
    1600,
  )
  tl.add(
    layerRot,
    { x: -Math.PI / 2 + 0.62, duration: 900, delay: stagger(170), ease: 'outQuint' },
    1600,
  )

  // 5 — the stack compresses into the axis…
  tl.add(
    layerPos,
    { y: 0, duration: 480, delay: stagger(60), ease: 'inQuad' },
    3050,
  )
  tl.add(
    layerRot,
    { x: 0, duration: 480, delay: stagger(60), ease: 'inQuad' },
    3050,
  )
  tl.add(
    scene.genreLayers.map((g) => g.mesh.scale),
    { x: 0.24, y: 0.24, duration: 500, delay: stagger(60), ease: 'inQuad' },
    3070,
  )
  tl.add(layerMats, { opacity: 0, duration: 340, delay: stagger(60), ease: 'linear' }, 3240)

  // …and the finished letters are applied onto their raw outlines,
  // sticker-style: each curls down flat, left to right
  const letterPos = scene.letters.map((l) => l.mesh.position)
  const letterRot = scene.letters.map((l) => l.mesh.rotation)
  const letterMats = scene.letters.map((l) => l.material)
  tl.add(letterMats, { opacity: 1, duration: 260, delay: stagger(85), ease: 'linear' }, 3200)
  tl.add(
    letterPos,
    {
      y: (_, i) => scene.letters[i].final.y,
      z: 0,
      duration: 640,
      delay: stagger(85),
      ease: 'outQuint',
    },
    3200,
  )
  tl.add(letterRot, { x: 0, duration: 640, delay: stagger(85), ease: 'outQuint' }, 3200)
  // the stencil beneath is absorbed as each letter lands
  tl.add(
    scene.rawLetters.map((r) => r.material),
    { opacity: 0, duration: 420, delay: stagger(85), ease: 'linear' },
    3420,
  )
  tl.add(scene.state, { key: 2.4, duration: 900, ease: 'outQuad' }, 3200)

  // the axis has done its job
  tl.add(scene.axis.scale, { x: 0.001, duration: 420, ease: 'inQuint' }, 4150)
  tl.add(scene.axis.material, { opacity: 0, duration: 380, ease: 'linear' }, 4180)

  // 6 — extrusion pop + red rim flash: the logo becomes an object
  tl.add(
    scene.letters.map((l) => l.mesh.scale),
    { z: 1, duration: 560, delay: stagger(55) },
    4280,
  )
  tl.add(scene.state, { rim: 2.6, duration: 260, ease: 'outQuad' }, 4320)
  tl.add(scene.state, { rim: 1.1, duration: 900, ease: 'outQuad' }, 4600)

  // 7 — settle: camera eases back, idle life ramps in, chrome appears
  tl.add(scene.state, { camZ: 10.6, duration: 1400, ease: 'outQuint' }, 4450)
  tl.add(scene.state, { idle: 1, duration: 1000, ease: 'outQuad' }, 4700)
  if (chromeEls.length) {
    tl.add(
      chromeEls,
      { opacity: 1, translateY: '0rem', duration: 700, delay: stagger(90), ease: 'outQuint' },
      4800,
    )
  }

  tl.play()

  return {
    timeline: tl,
    skip: () => {
      tl.pause()
      scene.setFinalState()
      utils.set(chromeEls, { opacity: 1, translateY: '0rem' })
      finish()
    },
  }
}
