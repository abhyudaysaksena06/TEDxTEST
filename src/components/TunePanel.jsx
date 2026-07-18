import { useReducer, useState } from 'react'

/**
 * Live effect tuner. Open with the T key or by visiting ?tune.
 * Sliders mutate scene.tuning directly, so every change is visible
 * immediately; "Copy values" puts the JSON on the clipboard so the
 * numbers can be baked into the code as the new defaults.
 */

const CONTROLS = [
  { key: 'turnY', label: 'Turn toward cursor', min: 0, max: 0.6, step: 0.01 },
  { key: 'turnX', label: 'Turn (vertical)', min: 0, max: 0.35, step: 0.01 },
  { key: 'follow', label: 'Follow speed', min: 0.02, max: 0.2, step: 0.005 },
  { key: 'floatAmp', label: 'Levitation float', min: 0, max: 0.15, step: 0.005 },
  { key: 'backGlow', label: 'Rear backlight', min: 0, max: 0.4, step: 0.01 },
  { key: 'ringGlow', label: 'Carpet edge glow', min: 0, max: 0.5, step: 0.01 },
  { key: 'hoverTilt', label: 'Hover tilt', min: 0, max: 0.3, step: 0.01 },
  { key: 'hoverGlow', label: 'Hover photo glow', min: 0, max: 1, step: 0.02 },
  { key: 'stageBorder', label: 'Stage border glow', min: 0, max: 1, step: 0.02 },
]

export default function TunePanel({ scene, onClose }) {
  const [, rerender] = useReducer((n) => n + 1, 0)
  const [copied, setCopied] = useState(false)

  const set = (key, value) => {
    scene.tuning[key] = value
    rerender()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(scene.tuning, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      console.log('tuning', scene.tuning)
    }
  }

  return (
    <aside className="absolute top-16 right-6 z-10 w-72 rounded-lg border border-white/10 bg-black/85 p-4 text-xs text-smoke backdrop-blur-sm select-none md:right-10">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold tracking-tight text-chalk">Effect tuner</p>
        <button type="button" onClick={onClose} className="text-smoke hover:text-chalk" aria-label="Close tuner">
          ✕
        </button>
      </div>

      {CONTROLS.map(({ key, label, min, max, step }) => (
        <label key={key} className="mb-2.5 block">
          <span className="mb-1 flex justify-between">
            <span>{label}</span>
            <span className="tabular-nums text-chalk">{scene.tuning[key].toFixed(3)}</span>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={scene.tuning[key]}
            onChange={(e) => set(key, Number(e.target.value))}
            className="w-full accent-ted"
          />
        </label>
      ))}

      <button
        type="button"
        onClick={copy}
        className="mt-1 w-full rounded bg-ted py-1.5 font-bold text-chalk transition-opacity hover:opacity-90"
      >
        {copied ? 'Copied ✓' : 'Copy values'}
      </button>
      <p className="mt-2 leading-relaxed text-smoke/70">
        Play until it feels right, copy the values, and send them over — they become the new defaults.
      </p>
    </aside>
  )
}
