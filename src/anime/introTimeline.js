import { createTimeline, stagger, utils } from 'animejs'

/**
 * The assembly choreography, expressed as one anime.js timeline that drives
 * plain objects on the three.js scene (positions, rotations, material
 * opacity, light state) plus the DOM chrome.
 *
 * Beats — the reverse sticky-note:
 *   0. the raw text is already there: a faint stencil of TEDxTIET is
 *      written on the stage from the very first frame
 *   1. flat sheets in the exact shape of the title — near-black, deep red,
 *      warm grey, TED red — are peeled down onto the stencil one after
 *      another, each letter curling flat left to right like a sticker
 *      being laid down in reverse
 *   2. the finished white word is applied last, absorbing the stencil
 *   3. the word extrudes to 3D as the red rim light flashes on
 *   4. the camera eases back, the stage floor wakes, the chrome fades in
 */

const LAYER_GAP = 460 // ms between successive sheets starting their peel
const PEEL = { duration: 620, letterStagger: 62, ease: 'outQuint' }

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

  // hide DOM chrome before first paint of the intro
  const chromeEls = chrome.filter(Boolean)
  utils.set(chromeEls, { opacity: 0, translateY: '0.6rem' })

  // stage floor, red carpet, and dust breathe in underneath everything
  tl.add(scene.floor.uniforms.uFade, { value: 1, duration: 2200, ease: 'outQuad' }, 100)
  tl.add(scene.state, { stage: 1, duration: 2200, ease: 'outQuad' }, 300)
  tl.add(scene.dustMat, { opacity: 0.4, duration: 2000, ease: 'outQuad' }, 400)

  // 1 — the title-shaped sheets peel down onto the stencil, one per tint
  scene.wordLayers.forEach((layer, i) => {
    const at = 350 + i * LAYER_GAP
    const mats = layer.map((s) => s.material)
    const pos = layer.map((s) => s.mesh.position)
    const rot = layer.map((s) => s.mesh.rotation)

    tl.add(
      mats,
      {
        opacity: (_, j) => layer[j].restOpacity,
        duration: 220,
        delay: stagger(PEEL.letterStagger),
        ease: 'linear',
      },
      at,
    )
    tl.add(
      pos,
      {
        y: (_, j) => layer[j].final.y,
        z: (_, j) => layer[j].final.z,
        duration: PEEL.duration,
        delay: stagger(PEEL.letterStagger),
        ease: PEEL.ease,
      },
      at,
    )
    tl.add(
      rot,
      { x: 0, duration: PEEL.duration, delay: stagger(PEEL.letterStagger), ease: PEEL.ease },
      at,
    )
  })

  const lastSheetAt = 350 + scene.wordLayers.length * LAYER_GAP

  // 2 — the finished white word is applied last, the same way
  const letterMats = scene.letters.map((l) => l.material)
  const letterPos = scene.letters.map((l) => l.mesh.position)
  const letterRot = scene.letters.map((l) => l.mesh.rotation)
  tl.add(letterMats, { opacity: 1, duration: 240, delay: stagger(80), ease: 'linear' }, lastSheetAt)
  tl.add(
    letterPos,
    {
      y: (_, i) => scene.letters[i].final.y,
      z: 0,
      duration: 660,
      delay: stagger(80),
      ease: PEEL.ease,
    },
    lastSheetAt,
  )
  tl.add(letterRot, { x: 0, duration: 660, delay: stagger(80), ease: PEEL.ease }, lastSheetAt)
  tl.add(scene.state, { key: 2.4, duration: 900, ease: 'outQuad' }, lastSheetAt)

  // the stencil is absorbed as the white letters land
  tl.add(
    scene.rawLetters.map((r) => r.material),
    { opacity: 0, duration: 380, delay: stagger(80), ease: 'linear' },
    lastSheetAt + 200,
  )

  // 3 — extrusion pop + red rim flash: the stack becomes one object
  const popAt = lastSheetAt + 1150
  // the sheets beneath vanish into the extruding word
  for (const layer of scene.wordLayers) {
    tl.add(
      layer.map((s) => s.material),
      { opacity: 0, duration: 320, delay: stagger(40), ease: 'linear' },
      popAt - 60,
    )
  }
  tl.add(
    scene.letters.map((l) => l.mesh.scale),
    { z: 1, duration: 560, delay: stagger(55) },
    popAt,
  )
  tl.add(scene.state, { rim: 2.6, duration: 260, ease: 'outQuad' }, popAt + 40)
  tl.add(scene.state, { rim: 1.1, duration: 900, ease: 'outQuad' }, popAt + 320)

  // 4 — settle: camera eases back to the wide establishing shot, idle life
  // ramps in, chrome appears
  tl.add(scene.state, { camZ: 16.5, duration: 1400, ease: 'outQuint' }, popAt + 170)
  tl.add(scene.state, { idle: 1, duration: 1000, ease: 'outQuad' }, popAt + 420)
  if (chromeEls.length) {
    tl.add(
      chromeEls,
      { opacity: 1, translateY: '0rem', duration: 700, delay: stagger(90), ease: 'outQuint' },
      popAt + 520,
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
