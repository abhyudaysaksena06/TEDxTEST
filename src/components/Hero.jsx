import { useEffect, useRef, useState } from 'react'
import { HeroScene } from '../three/HeroScene.js'
import { buildIntroTimeline } from '../anime/introTimeline.js'
import TunePanel from './TunePanel.jsx'

export default function Hero() {
  const canvasRef = useRef(null)
  const topBarRef = useRef(null)
  const bottomLeftRef = useRef(null)
  const bottomRightRef = useRef(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [sceneReady, setSceneReady] = useState(null)
  const [tuneOpen, setTuneOpen] = useState(
    () => typeof window !== 'undefined' && window.location.search.includes('tune'),
  )
  const introRef = useRef(null)

  useEffect(() => {
    let scene
    try {
      scene = new HeroScene(canvasRef.current)
    } catch (err) {
      console.error('WebGL unavailable, falling back to static hero', err)
      setWebglFailed(true)
      return undefined
    }
    setSceneReady(scene)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scene.setReducedMotion(reduced)

    const chrome = [topBarRef.current, bottomLeftRef.current, bottomRightRef.current]
    if (reduced) {
      scene.setFinalState()
      setIntroDone(true)
    } else {
      introRef.current = buildIntroTimeline(scene, chrome, () => setIntroDone(true))
    }

    const onResize = () => scene.resize()
    const onPointerMove = (e) => {
      scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
    }
    const onClick = (e) => {
      if (scene.assembled) scene.pulseAt(e.clientX, e.clientY, canvasRef.current.getBoundingClientRect())
    }
    const onKey = (e) => {
      if (e.key.toLowerCase() === 't' && e.target.tagName !== 'INPUT') {
        setTuneOpen((open) => !open)
      }
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('keydown', onKey)
    canvasRef.current.addEventListener('click', onClick)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKey)
      canvasRef.current?.removeEventListener('click', onClick)
      introRef.current?.timeline.pause()
      scene.dispose()
    }
  }, [])

  const skipIntro = () => {
    introRef.current?.skip()
    setIntroDone(true)
  }

  return (
    <section className="relative h-svh min-h-[540px] w-full overflow-hidden bg-stage-deep">
      <h1 className="sr-only">TEDxTIET — Thapar Institute of Engineering &amp; Technology, Patiala</h1>

      {webglFailed ? (
        <div className="flex h-full items-center justify-center">
          <p
            aria-hidden="true"
            className="w-[85vw] text-center font-black tracking-tight text-chalk md:w-[65vw]"
            style={{ fontSize: 'clamp(2.5rem, 9vw, 6rem)', lineHeight: 1 }}
          >
            TEDxTIET
          </p>
        </div>
      ) : (
        <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />
      )}

      {/* top chrome */}
      <header
        ref={topBarRef}
        className="chrome-reveal absolute inset-x-0 top-0 flex items-center justify-between px-6 py-5 md:px-10"
      >
        <p className="text-lg leading-none font-black tracking-tight">
          <span className="text-ted">TEDx</span>
          <span className="text-chalk">TIET</span>
        </p>
        <p className="hidden text-sm text-smoke sm:block">
          Thapar Institute of Engineering &amp; Technology
        </p>
      </header>

      {/* bottom chrome */}
      <footer className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 px-6 py-6 md:px-10">
        <p ref={bottomLeftRef} className="chrome-reveal max-w-[46ch] text-sm leading-relaxed text-smoke">
          An independently organized TED event.
          <span className="text-chalk"> Ideas find a stage in Patiala.</span>
        </p>
        <p ref={bottomRightRef} className="chrome-reveal hidden shrink-0 text-sm text-smoke md:block">
          {introDone ? 'Hover a letter · click the stage for a ripple' : ' '}
        </p>
      </footer>

      {/* live effect tuner — press T or visit ?tune */}
      {tuneOpen && sceneReady && <TunePanel scene={sceneReady} onClose={() => setTuneOpen(false)} />}

      {/* skip control, only while the intro is running */}
      {!webglFailed && !introDone && (
        <button
          type="button"
          onClick={skipIntro}
          className="absolute right-6 bottom-6 text-sm text-smoke underline decoration-ted decoration-2 underline-offset-4 transition-colors duration-200 hover:text-chalk md:right-10"
        >
          Skip intro
        </button>
      )}
    </section>
  )
}
