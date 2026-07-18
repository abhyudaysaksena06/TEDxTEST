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

// The genres that stack up to become the event — bottom to top.
const GENRES = ['TECHNOLOGY', 'ENTERTAINMENT', 'DESIGN', 'SCIENCE', 'ART', 'CULTURE']

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
    this.#buildGenreLayers()
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

    // peel-on start states: each finished letter hovers over its raw
    // outline, curled toward the camera like the unstuck end of a sticker,
    // and is laid down flat left-to-right by the timeline
    for (const l of this.letters) {
      l.mesh.position.set(l.final.x, l.final.y + 0.22, 1.7)
      l.mesh.rotation.set(-1.15, 0, 0)
      l.mesh.scale.set(1, 1, 0.02) // lands flat, extrudes afterwards
    }

    this.#buildRawWord(font, capHeight)
  }

  #buildRawWord(font, capHeight) {
    // The raw text: a faint stencil of TEDxTIET, written on the stage from
    // the very first frame. The finished letters are applied on top of it.
    this.rawLetters = []
    const group = new THREE.Group()
    this.logo.add(group)

    this.letters.forEach((l, i) => {
      const flat = new TextGeometry(WORD[i], { font, size: 1, depth: 0.001, bevelEnabled: false })
      flat.computeBoundingBox()
      const bb = flat.boundingBox
      const width = bb.max.x - bb.min.x
      flat.translate(-bb.min.x - width / 2, -capHeight / 2, 0)

      const edges = new THREE.EdgesGeometry(flat, 20)
      flat.dispose()
      const material = new THREE.LineBasicMaterial({
        color: 0xb9b5b0,
        transparent: true,
        opacity: 0.3,
      })
      const line = new THREE.LineSegments(edges, material)
      line.position.set(l.final.x, l.final.y, -0.05)
      this.rawLetters.push({ line, material })
      group.add(line)
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

  #buildGenreLayers() {
    // The mid-transition: translucent glass panes, one per genre, that fly
    // in and stack one on another before compressing into the wordmark.
    this.genreLayers = []
    const group = new THREE.Group()
    this.logo.add(group)

    const paneW = this.logoWidth + 1.2
    const paneH = paneW * 0.375 // matches the 1024x384 label texture aspect
    const gap = 0.55
    const geometry = new THREE.PlaneGeometry(paneW, paneH)

    GENRES.forEach((genre, i) => {
      const red = i % 2 === 1
      const texture = this.#makeGenreTexture(genre, red)
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)

      // final stack slot, centered on the axis line
      const stackY = (i - (GENRES.length - 1) / 2) * gap
      mesh.rotation.x = -Math.PI / 2 + 0.62 // tilted toward the camera
      mesh.position.set(0, stackY, -0.4)

      // entry state: alternating from below and above, pushed back, extra tilt
      const fromBelow = i % 2 === 0
      mesh.position.y = stackY + (fromBelow ? -3.6 : 3.6)
      mesh.position.z = -3
      mesh.rotation.x += fromBelow ? -0.7 : 0.7

      this.genreLayers.push({ mesh, material, texture, stackY })
      group.add(mesh)
    })
  }

  #makeGenreTexture(text, red) {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 384
    const ctx = canvas.getContext('2d')

    const tint = red ? 'rgba(235, 0, 40, 0.12)' : 'rgba(244, 242, 239, 0.08)'
    const edge = red ? 'rgba(235, 0, 40, 0.8)' : 'rgba(244, 242, 239, 0.65)'

    const r = 28
    ctx.beginPath()
    ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, r)
    ctx.fillStyle = tint
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = edge
    ctx.stroke()

    ctx.font = '700 92px "Archivo Variable", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    if ('letterSpacing' in ctx) ctx.letterSpacing = '14px'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4)

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 4
    return texture
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
    for (const g of this.genreLayers) g.material.opacity = 0
    for (const r of this.rawLetters) r.material.opacity = 0
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
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose()
        obj.material.dispose()
      }
    })
    this.renderer.dispose()
  }
}
