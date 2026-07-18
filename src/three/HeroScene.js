import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json'
import { createRippleFloor } from './rippleFloor.js'

const WORD = 'TEDxTIET'
const TED_RED = 0xeb0028
const FINAL_CAM_Z = 10.6
const LETTER_DEPTH = 0.24
const TRACKING = 0.09

// Each letter enters from its own direction — the "different elements
// coming together" brief. Order matches the letters of TEDxTIET.
const ENTRY_VECTORS = [
  [-3.2, 0.6], [0.4, 3.0], [3.0, 1.2], [0, -3.2],
  [-2.6, -1.4], [0.6, 3.2], [2.8, -0.8], [3.4, 0.4],
]

export class HeroScene {
  constructor(canvas) {
    this.canvas = canvas
    this.disposed = false
    this.assembled = false
    this.reduced = false
    this.clock = new THREE.Clock()

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setClearColor(0x050505, 1)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x050505, 14, 30)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)

    // Values the anime.js timeline drives; the render loop reads them.
    this.state = { camZ: 9, camY: 0.7, rim: 0, key: 0, idle: 0 }

    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 }

    this.#buildLights()
    this.#buildLogo()
    this.#buildShards()
    this.#buildAxis()
    this.#buildFloor()
    this.#buildDust()

    this.resize()
    this.renderer.setAnimationLoop(() => this.#tick())
  }

  // ————— construction —————

  #buildLights() {
    this.keyLight = new THREE.DirectionalLight(0xfff6ee, 0)
    this.keyLight.position.set(1.5, 6, 7)
    this.rimLeft = new THREE.DirectionalLight(TED_RED, 0)
    this.rimLeft.position.set(-7, 1.5, -4)
    this.rimRight = new THREE.DirectionalLight(TED_RED, 0)
    this.rimRight.position.set(7, -1, -4)
    this.ambient = new THREE.AmbientLight(0xffffff, 0.32)
    this.scene.add(this.keyLight, this.rimLeft, this.rimRight, this.ambient)
  }

  #buildLogo() {
    const font = new FontLoader().parse(helvetikerBold)

    // rig: idle float + pointer parallax. Letters inside are owned by the
    // intro timeline, so the two motion systems never fight.
    this.rig = new THREE.Group()
    this.logo = new THREE.Group()
    this.rig.add(this.logo)
    this.scene.add(this.rig)

    const capHeight = 0.71 // helvetiker bold cap height at size 1
    this.letters = []

    let cursor = 0
    for (let i = 0; i < WORD.length; i++) {
      const char = WORD[i]
      const geometry = new TextGeometry(char, {
        font,
        size: 1,
        depth: LETTER_DEPTH,
        curveSegments: 10,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.012,
        bevelSegments: 3,
      })
      geometry.computeBoundingBox()
      const bb = geometry.boundingBox
      const width = bb.max.x - bb.min.x
      // center each glyph on its own origin so rotation reads naturally,
      // sharing one vertical center so the baseline stays true
      geometry.translate(-bb.min.x - width / 2, -capHeight / 2, -LETTER_DEPTH / 2)

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.18,
        roughness: 0.34,
        transparent: true,
        opacity: 0,
      })
      const mesh = new THREE.Mesh(geometry, material)

      const final = { x: cursor + width / 2, y: 0, z: 0 }
      cursor += width + TRACKING

      this.letters.push({ mesh, material, final })
      this.logo.add(mesh)
    }

    this.logoWidth = cursor - TRACKING
    // shift finals so the word is centered
    for (const l of this.letters) l.final.x -= this.logoWidth / 2

    // scatter start states (the timeline animates back to final)
    this.letters.forEach((l, i) => {
      const [ex, ey] = ENTRY_VECTORS[i % ENTRY_VECTORS.length]
      l.mesh.position.set(
        l.final.x + ex * (1 + Math.random() * 0.5),
        l.final.y + ey * (1 + Math.random() * 0.5),
        -3.5 - Math.random() * 4,
      )
      l.mesh.rotation.set(
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 0.8,
      )
      l.mesh.scale.set(1, 1, 0.02) // arrives flat, extrudes on landing
    })
  }

  #buildShards() {
    // Abstract fragments that swarm onto the axis before the letters land.
    this.shards = []
    const shardGroup = new THREE.Group()
    this.logo.add(shardGroup)

    const count = 72
    for (let i = 0; i < count; i++) {
      const red = Math.random() < 0.24
      const geometry = new THREE.BoxGeometry(
        0.25 + Math.random() * 0.75,
        0.02 + Math.random() * 0.05,
        0.02 + Math.random() * 0.03,
      )
      const material = new THREE.MeshBasicMaterial({
        color: red ? TED_RED : 0xf4f2ef,
        transparent: true,
        opacity: 0,
      })
      const mesh = new THREE.Mesh(geometry, material)

      const slot = this.letters[i % this.letters.length].final
      const jx = (Math.random() - 0.5) * 1.1
      const jy = (Math.random() - 0.5) * 1.3

      const a = Math.random() * Math.PI * 2
      const b = (Math.random() - 0.5) * Math.PI
      const r = 6 + Math.random() * 6
      mesh.position.set(
        Math.cos(a) * Math.cos(b) * r,
        Math.sin(b) * r * 0.7,
        Math.sin(a) * Math.cos(b) * r - 2,
      )
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

      this.shards.push({
        mesh,
        material,
        home: { x: slot.x + jx, y: slot.y + jy, z: slot.z + (Math.random() - 0.5) * 0.6 },
        slot,
      })
      shardGroup.add(mesh)
    }
  }

  #buildAxis() {
    // The thin red line the fragments gather around — the first thing seen.
    const geometry = new THREE.BoxGeometry(1, 0.016, 0.016)
    const material = new THREE.MeshBasicMaterial({ color: TED_RED, transparent: true, opacity: 0 })
    this.axis = new THREE.Mesh(geometry, material)
    this.axis.position.set(0, 0, -0.4)
    this.axis.scale.x = 0.001
    this.logo.add(this.axis)
  }

  #buildFloor() {
    this.floor = createRippleFloor({ y: -1.75, maxRadius: 15 })
    this.scene.add(this.floor.points)
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.75)
    this.raycaster = new THREE.Raycaster()
  }

  #buildDust() {
    const count = 200
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 22
      positions[i * 3 + 1] = -2 + Math.random() * 8
      positions[i * 3 + 2] = -6 + Math.random() * 8
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.dustMat = new THREE.PointsMaterial({
      color: 0x8a8580,
      size: 0.025,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.dust = new THREE.Points(geometry, this.dustMat)
    this.scene.add(this.dust)
  }

  // ————— interaction —————

  setPointer(nx, ny) {
    this.pointer.tx = nx
    this.pointer.ty = ny
  }

  pulseAt(clientX, clientY, rect) {
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.floorPlane, hit)) {
      this.floor.addPulse(hit.x, hit.z, this.clock.elapsedTime)
    }
  }

  // ————— state —————

  setFinalState() {
    for (const l of this.letters) {
      l.mesh.position.set(l.final.x, l.final.y, l.final.z)
      l.mesh.rotation.set(0, 0, 0)
      l.mesh.scale.set(1, 1, 1)
      l.material.opacity = 1
    }
    for (const s of this.shards) s.material.opacity = 0
    this.axis.material.opacity = 0
    this.state.rim = 1.1
    this.state.key = 2.4
    this.state.camZ = FINAL_CAM_Z
    this.state.idle = 1
    this.floor.uniforms.uFade.value = 1
    this.dustMat.opacity = 0.4
    this.assembled = true
  }

  setReducedMotion(on) {
    this.reduced = on
    this.floor.uniforms.uWaveAmp.value = on ? 0 : 1
  }

  resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.floor.uniforms.uPixelRatio.value = dpr

    // The wordmark occupies 65% of the viewport width (85% on portrait
    // screens where 65% would render it illegibly small).
    const fraction = w / h < 0.9 ? 0.85 : 0.65
    const visibleWidth =
      2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * FINAL_CAM_Z * this.camera.aspect
    this.rigScale = (visibleWidth * fraction) / this.logoWidth
    this.rig.scale.setScalar(this.rigScale)
  }

  // ————— loop —————

  #tick() {
    if (this.disposed) return
    const t = this.clock.getElapsedTime()
    const dt = 0.016

    // damped pointer
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.045
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.045

    const { state } = this
    const idle = this.reduced ? 0 : state.idle

    this.rig.rotation.y = this.pointer.x * 0.16 * idle + Math.sin(t * 0.32) * 0.045 * idle
    this.rig.rotation.x = -this.pointer.y * 0.1 * idle + Math.sin(t * 0.21) * 0.02 * idle
    this.rig.position.y = Math.sin(t * 0.55) * 0.05 * this.rigScale * idle

    this.camera.position.set(this.pointer.x * 0.35 * idle, state.camY, state.camZ)
    this.camera.lookAt(0, -0.1, 0)

    this.keyLight.intensity = state.key
    this.rimLeft.intensity = state.rim
    this.rimRight.intensity = state.rim * 0.8

    this.floor.uniforms.uTime.value = t

    if (!this.reduced) {
      const pos = this.dust.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + 0.1 * dt
        if (y > 6) y = -2
        pos.setY(i, y)
      }
      pos.needsUpdate = true
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    })
    this.renderer.dispose()
  }
}
