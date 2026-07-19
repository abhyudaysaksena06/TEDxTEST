import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json'
import { createRippleFloor } from './rippleFloor.js'

const WORD = 'TEDxTIET'
const TED_RED = 0xeb0028
const FINAL_CAM_Z = 10.6
const LOGO_Z = -3 // the word stands behind the carpet, like the reference
const FLOOR_Y = -1.74
const LETTER_DEPTH = 0.24
const TRACKING = 0.09

// Optional photos for the letter-hover reveal, one per letter of TEDxTIET.
// Drop image URLs (or /public paths) here and they replace the generated
// poster art automatically, e.g. '/images/speakers.jpg'. Leave '' to keep
// the built-in art for that letter.
const LETTER_IMAGES = ['', '', '', '', '', '', '', '']

// The flat sheets applied over the stencil, bottom of the stack first.
// Each is the exact TEDxTIET letterform carrying its own theme texture —
// the things the event is made of, applied as layers of the title itself.
const LAYER_THEMES = ['education', 'technology', 'design', 'tiet']

export class HeroScene {
  constructor(canvas) {
    this.canvas = canvas
    this.disposed = false
    this.assembled = false
    this.reduced = false
    this.clock = new THREE.Clock()

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setClearColor(0x050505, 1)
    // cinematic grade: filmic rolloff instead of raw clipping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x050505, 14, 30)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)

    // Values the anime.js timeline drives; the render loop reads them.
    this.state = { camZ: 9, camY: 1.5, rim: 0, key: 0, idle: 0, stage: 0 }

    // Live-tunable effect intensities (the ?tune panel edits these).
    this.tuning = {
      turnY: 0.3, // how far the word turns toward the cursor (rad)
      turnX: 0.16,
      follow: 0.085, // how quickly it follows (per-frame damping)
      floatAmp: 0.06, // levitation bob amplitude
      backGlow: 0.15, // rear backlight opacity
      ringGlow: 0.16, // carpet edge glow opacity
      hoverGlow: 0.38, // photo emissive strength on hover
      stageBorder: 0.45, // glow of the big deck's back-edge border
      screenGlow: 0.85, // projector screen brightness
      spotlight: 1, // strength of the cursor followspot
    }

    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 }

    this.tmpA = new THREE.Vector3()
    this.tmpB = new THREE.Vector3()

    this.#buildLights()
    this.#buildLogo()
    this.#buildFloor()
    this.#buildStage()
    this.#buildScreen()
    this.#buildCurtains()
    this.#buildDecor()
    this.#buildCrowd()
    this.#buildSpotlight()
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

    // rig: idle float + pointer parallax. Everything inside is owned by the
    // intro timeline, so the two motion systems never fight.
    this.rig = new THREE.Group()
    this.rig.position.z = LOGO_Z
    this.logo = new THREE.Group()
    this.rig.add(this.logo)
    this.scene.add(this.rig)

    const capHeight = 0.71 // helvetiker bold cap height at size 1
    this.letters = []

    let cursor = 0
    for (let i = 0; i < WORD.length; i++) {
      const geometry = new TextGeometry(WORD[i], {
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
      // UVs keep the pre-translate coordinates; remember them so the hover
      // photo can be cover-fitted onto the glyph later
      const uvBounds = {
        minX: bb.min.x,
        minY: bb.min.y,
        w: width,
        h: bb.max.y - bb.min.y,
      }
      // center each glyph on its own origin so the peel rotation reads
      // naturally, sharing one vertical center so the baseline stays true
      geometry.translate(-bb.min.x - width / 2, -capHeight / 2, -LETTER_DEPTH / 2)

      // TEDx in red, TIET in white — frosted glass blocks, lit from inside
      const isRed = i < 4
      const material = new THREE.MeshPhysicalMaterial({
        color: isRed ? 0xeb0028 : 0xffffff,
        emissive: isRed ? 0xff1638 : 0xfff3ec,
        emissiveIntensity: 0,
        metalness: 0,
        roughness: 0.28,
        transmission: 0.5,
        thickness: 0.6,
        ior: 1.45,
        clearcoat: 0.7,
        clearcoatRoughness: 0.22,
        transparent: true,
        opacity: 0,
      })
      const mesh = new THREE.Mesh(geometry, material)

      const final = { x: cursor + width / 2, y: 0, z: 0 }
      cursor += width + TRACKING

      this.letters.push({ mesh, material, final, geometry, uvBounds, isRed })
      this.logo.add(mesh)
    }

    this.logoWidth = cursor - TRACKING
    // shift finals so the word is centered
    for (const l of this.letters) l.final.x -= this.logoWidth / 2

    // peel-on start state: the finished word hovers over its stencil,
    // curled toward the camera like the unstuck end of a sticker
    for (const l of this.letters) {
      l.mesh.position.set(l.final.x, l.final.y + 0.26, 1.6)
      l.mesh.rotation.set(-1.25, 0, 0)
      l.mesh.scale.set(1, 1, 0.02) // lands flat, extrudes at the end
    }

    this.#buildRawWord(font, capHeight)
    this.#buildWordLayers(font, capHeight)
    this.#buildHoverArt()
  }

  #buildHoverArt() {
    // Hover reveal: each letter carries a hidden photo clone of its full 3D
    // geometry — front, bevels, and extruded sides all wear the picture, so
    // the reveal reads as a solid printed block, glowing from within.
    this.hoverState = this.letters.map(() => ({ t: 0, target: 0, flashUntil: 0 }))
    this.hoverIndex = -1
    this.litIndex = -1
    this.pointerMoved = false
    this.letterMeshes = []
    this.screenSlides = []

    this.letters.forEach((l, i) => {
      l.mesh.userData.letterIndex = i
      this.letterMeshes.push(l.mesh)

      const texture = this.#makeLetterArtTexture(i)
      // cover-fit the square art across the glyph's UV bounds (the sides
      // sample the silhouette edge of the same image and streak it through
      // the depth — the printed-acrylic look)
      const { minX, minY, w, h } = l.uvBounds
      const s = Math.max(w, h)
      texture.repeat.set(1 / s, 1 / s)
      texture.offset.set(-(minX - (s - w) / 2) / s, -(minY - (s - h) / 2) / s)

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0,
        metalness: 0.1,
        roughness: 0.5,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })

      // the matching projection slide for the big screen behind the stage
      this.screenSlides.push(this.#makeScreenSlide(texture.image))

      if (LETTER_IMAGES[i]) {
        new THREE.TextureLoader().load(LETTER_IMAGES[i], (photo) => {
          photo.colorSpace = THREE.SRGBColorSpace
          photo.repeat.copy(texture.repeat)
          photo.offset.copy(texture.offset)
          material.map = photo
          material.emissiveMap = photo
          material.needsUpdate = true
          // keep the projector in sync with the real photo
          this.screenSlides[i] = this.#makeScreenSlide(photo.image)
        })
      }

      const overlay = new THREE.Mesh(l.geometry, material) // shares geometry
      overlay.renderOrder = 2
      overlay.userData.letterIndex = i
      l.mesh.add(overlay)

      l.hoverMat = material
    })
  }

  // ————— the projector screen —————

  #screenCanvasBase() {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#08080a'
    ctx.fillRect(0, 0, 2048, 512)
    // soft projector vignette
    const v = ctx.createRadialGradient(1024, 256, 120, 1024, 256, 1100)
    v.addColorStop(0, 'rgba(30, 26, 27, 0.55)')
    v.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, 2048, 512)
    // scanlines
    ctx.fillStyle = 'rgba(255, 255, 255, 0.022)'
    for (let y = 0; y < 512; y += 4) ctx.fillRect(0, y, 2048, 1)
    return { canvas, ctx }
  }

  #makeScreenSlide(image) {
    // one letter's picture filling the whole space behind the stage: the
    // same photo blur-filled edge to edge, sharp in the center, edges
    // falling into darkness so it reads as projection light, not a screen
    const { canvas, ctx } = this.#screenCanvasBase()

    ctx.save()
    ctx.filter = 'blur(26px)'
    ctx.globalAlpha = 0.8
    // cover-fill the wide wall with the square image
    const scale = Math.max(2048 / image.width, 512 / image.height)
    const w = image.width * scale
    const h = image.height * scale
    ctx.drawImage(image, (2048 - w) / 2, (512 - h) / 2, w, h)
    ctx.restore()

    // the sharp picture, feathered so it melts into the blurred fill, drawn
    // in the canvas region that maps to the visible part of the band (the
    // wall's upper half rises out of frame)
    const size = 300
    const sharp = document.createElement('canvas')
    sharp.width = sharp.height = size
    const sctx = sharp.getContext('2d')
    sctx.drawImage(image, 0, 0, size, size)
    const mask = sctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.62)
    mask.addColorStop(0, 'rgba(0, 0, 0, 1)')
    mask.addColorStop(1, 'rgba(0, 0, 0, 0)')
    sctx.globalCompositeOperation = 'destination-in'
    sctx.fillStyle = mask
    sctx.fillRect(0, 0, size, size)
    ctx.drawImage(sharp, (2048 - size) / 2, 360 - size / 2)

    // let the edges fall away into the dark
    const fade = ctx.createLinearGradient(0, 0, 2048, 0)
    fade.addColorStop(0, 'rgba(5, 5, 5, 0.9)')
    fade.addColorStop(0.22, 'rgba(5, 5, 5, 0)')
    fade.addColorStop(0.78, 'rgba(5, 5, 5, 0)')
    fade.addColorStop(1, 'rgba(5, 5, 5, 0.9)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, 2048, 512)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    // viewed from inside the cylinder, so un-mirror horizontally
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.repeat.x = -1
    texture.offset.x = 1
    return texture
  }

  #makeIdleScreenTexture() {
    const { canvas, ctx } = this.#screenCanvasBase()
    ctx.font = '700 170px "Archivo Variable", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(235, 0, 40, 0.13)'
    ctx.fillText('TEDxTIET', 1024, 372)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.repeat.x = -1
    texture.offset.x = 1
    return texture
  }

  #buildScreen() {
    // The curved 3D projector screen closing the back of the stage: a
    // cylindrical arc behind the deck's semi-oval, idle-branded, that
    // projects whichever letter picture is being hovered.
    // a wide band across the top of the frame, like the reference: its
    // bottom edge sits above the standing wordmark, curtains fill below
    const RADIUS = 20
    const HEIGHT = 10.5
    const ARC = 2.6
    const BOTTOM = 0.35 // the screen band starts above the standing word
    const AZIMUTH = -0.45 // swept toward the right of the frame, reference-style

    const geometry = new THREE.CylinderGeometry(
      RADIUS, RADIUS, HEIGHT, 64, 1, true,
      Math.PI + AZIMUTH - ARC / 2, ARC,
    )
    this.screenBaseMat = new THREE.MeshBasicMaterial({
      map: this.#makeIdleScreenTexture(),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false,
    })
    this.screenBase = new THREE.Mesh(geometry, this.screenBaseMat)
    this.screenBase.position.set(0, BOTTOM + HEIGHT / 2, 4)

    this.screenImageMat = new THREE.MeshBasicMaterial({
      map: null,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false,
    })
    this.screenImage = new THREE.Mesh(geometry.clone().scale(0.995, 1, 0.995), this.screenImageMat)
    this.screenImage.position.copy(this.screenBase.position)
    this.screenFade = 0

    this.scene.add(this.screenBase, this.screenImage)
  }

  #buildRawWord(font, capHeight) {
    // The raw text: a faint stencil of TEDxTIET, written on the stage from
    // the very first frame. Every layer is applied on top of it.
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
      line.position.set(l.final.x, l.final.y, -0.16)
      this.rawLetters.push({ line, material })
      group.add(line)
    })
  }

  #buildWordLayers(font, capHeight) {
    // The stack: flat sheets in the exact shape of the title, each carrying
    // a theme texture, peeled down onto the stencil one after another
    // before the finished white word is applied last.
    this.wordLayers = []
    const group = new THREE.Group()
    this.logo.add(group)

    LAYER_THEMES.forEach((theme, layerIndex) => {
      const texture = this.#makeThemeTexture(theme)
      const layer = []
      this.letters.forEach((l, i) => {
        const shapes = font.generateShapes(WORD[i], 1)
        const geometry = new THREE.ShapeGeometry(shapes, 8)
        geometry.computeBoundingBox()
        const bb = geometry.boundingBox
        const width = bb.max.x - bb.min.x
        geometry.translate(-bb.min.x - width / 2, -capHeight / 2, 0)

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(geometry, material)

        // each sheet rests a hair above the previous one
        const final = { x: l.final.x, y: l.final.y, z: -0.14 + layerIndex * 0.035 }
        mesh.position.set(final.x, final.y + 0.26, final.z + 1.6)
        mesh.rotation.set(-1.25, 0, 0)

        layer.push({ mesh, material, final, restOpacity: 0.96 })
        group.add(mesh)
      })
      this.wordLayers.push(layer)
    })
  }

  // ————— theme textures —————
  // Procedural tiles drawn at runtime; ShapeGeometry UVs are in glyph
  // units, so with RepeatWrapping one tile covers about a third of a
  // letter's height and the pattern flows across every letterform.

  #makeThemeTexture(theme) {
    const S = 512
    const canvas = document.createElement('canvas')
    canvas.width = S
    canvas.height = S
    const ctx = canvas.getContext('2d')

    if (theme === 'education') this.#drawEducationTile(ctx, S)
    else if (theme === 'technology') this.#drawTechnologyTile(ctx, S)
    else if (theme === 'design') this.#drawDesignTile(ctx, S)
    else this.#drawTietTile(ctx, S)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2.6, 2.6)
    texture.anisotropy = 4
    return texture
  }

  #makeLetterArtTexture(index) {
    // Eight little posters, one per letter — stage, audience, mic, the x,
    // circuitry, an idea, a book, the campus. Same palette as the stage.
    const S = 512
    const canvas = document.createElement('canvas')
    canvas.width = S
    canvas.height = S
    const ctx = canvas.getContext('2d')

    const bg = ctx.createLinearGradient(0, 0, 0, S)
    bg.addColorStop(0, '#131315')
    bg.addColorStop(1, '#26080c')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, S, S)

    const RED = '#eb0028'
    const CHALK = 'rgba(244, 242, 239, 0.9)'

    const draw = [
      () => { // T — the spotlight and the round red stage
        const beam = ctx.createLinearGradient(0, 0, 0, S)
        beam.addColorStop(0, 'rgba(255, 246, 238, 0.5)')
        beam.addColorStop(1, 'rgba(255, 246, 238, 0.04)')
        ctx.fillStyle = beam
        ctx.beginPath()
        ctx.moveTo(226, 0); ctx.lineTo(286, 0); ctx.lineTo(400, 400); ctx.lineTo(112, 400)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = RED
        ctx.beginPath(); ctx.ellipse(256, 400, 150, 34, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(248, 300, 16, 88)
        ctx.beginPath(); ctx.arc(256, 286, 22, 0, Math.PI * 2); ctx.fill()
      },
      () => { // E — the audience, rows of heads against the glow
        const glow = ctx.createRadialGradient(256, 150, 20, 256, 150, 320)
        glow.addColorStop(0, 'rgba(235, 0, 40, 0.55)')
        glow.addColorStop(1, 'rgba(235, 0, 40, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, S, S)
        ctx.fillStyle = '#0a0a0b'
        for (let row = 0; row < 4; row++) {
          for (let c = 0; c < 7; c++) {
            const x = 40 + c * 72 + (row % 2) * 36
            const y = 300 + row * 58
            ctx.beginPath(); ctx.arc(x, y, 26 + row * 3, 0, Math.PI * 2); ctx.fill()
          }
        }
      },
      () => { // D — the microphone
        ctx.strokeStyle = CHALK
        ctx.lineWidth = 10
        ctx.beginPath(); ctx.moveTo(256, 300); ctx.lineTo(256, 430); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(180, 452); ctx.lineTo(332, 452); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(256, 430); ctx.lineTo(256, 452); ctx.stroke()
        ctx.fillStyle = CHALK
        ctx.beginPath()
        ctx.arc(256, 190, 78, Math.PI, 0)
        ctx.rect(178, 190, 156, 40)
        ctx.arc(256, 230, 78, 0, Math.PI)
        ctx.fill()
        ctx.strokeStyle = RED
        ctx.lineWidth = 8
        ctx.beginPath(); ctx.arc(256, 210, 108, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke()
      },
      () => { // x — the mark itself
        ctx.fillStyle = RED
        ctx.fillRect(0, 0, S, S)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
        ctx.lineWidth = 64
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(140, 140); ctx.lineTo(372, 372); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(372, 140); ctx.lineTo(140, 372); ctx.stroke()
      },
      () => { // T — circuitry
        this.#drawTechnologyTile(ctx, S)
      },
      () => { // I — the idea
        const halo = ctx.createRadialGradient(256, 210, 10, 256, 210, 220)
        halo.addColorStop(0, 'rgba(255, 246, 238, 0.5)')
        halo.addColorStop(1, 'rgba(255, 246, 238, 0)')
        ctx.fillStyle = halo
        ctx.fillRect(0, 0, S, S)
        ctx.strokeStyle = CHALK
        ctx.lineWidth = 12
        ctx.beginPath(); ctx.arc(256, 210, 90, 0.8 * Math.PI, 2.2 * Math.PI); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(203, 282); ctx.lineTo(309, 282); ctx.stroke()
        ctx.strokeStyle = RED
        ctx.beginPath(); ctx.moveTo(226, 330); ctx.lineTo(286, 330); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(238, 372); ctx.lineTo(274, 372); ctx.stroke()
        ctx.strokeStyle = CHALK
        ctx.lineWidth = 8
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2 - Math.PI / 2
          if (Math.abs(ang - Math.PI / 2) < 0.6) continue
          ctx.beginPath()
          ctx.moveTo(256 + Math.cos(ang) * 128, 210 + Math.sin(ang) * 128)
          ctx.lineTo(256 + Math.cos(ang) * 168, 210 + Math.sin(ang) * 168)
          ctx.stroke()
        }
      },
      () => { // E — the open book
        ctx.fillStyle = CHALK
        ctx.beginPath()
        ctx.moveTo(256, 160)
        ctx.quadraticCurveTo(150, 120, 70, 160)
        ctx.lineTo(70, 360)
        ctx.quadraticCurveTo(150, 320, 256, 360)
        ctx.quadraticCurveTo(362, 320, 442, 360)
        ctx.lineTo(442, 160)
        ctx.quadraticCurveTo(362, 120, 256, 160)
        ctx.fill()
        ctx.strokeStyle = '#26080c'
        ctx.lineWidth = 5
        for (let y = 200; y <= 320; y += 40) {
          ctx.beginPath(); ctx.moveTo(100, y); ctx.quadraticCurveTo(170, y - 24, 240, y); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(272, y); ctx.quadraticCurveTo(342, y - 24, 412, y); ctx.stroke()
        }
        ctx.strokeStyle = RED
        ctx.lineWidth = 8
        ctx.beginPath(); ctx.moveTo(256, 160); ctx.lineTo(256, 360); ctx.stroke()
      },
      () => { // T — the campus skyline at dusk
        const dusk = ctx.createLinearGradient(0, 0, 0, S)
        dusk.addColorStop(0, '#2b0a10')
        dusk.addColorStop(0.7, 'rgba(235, 0, 40, 0.4)')
        dusk.addColorStop(1, '#131315')
        ctx.fillStyle = dusk
        ctx.fillRect(0, 0, S, S)
        ctx.fillStyle = '#0a0a0b'
        ctx.fillRect(40, 300, 90, 180)
        ctx.fillRect(160, 260, 70, 220)
        ctx.fillRect(360, 320, 110, 160)
        ctx.fillRect(250, 200, 80, 280) // the tower
        ctx.fillStyle = RED
        ctx.fillRect(282, 220, 16, 16) // clock
        ctx.fillStyle = 'rgba(244, 242, 239, 0.5)'
        for (let fx = 0; fx < 6; fx++) {
          for (let fy = 0; fy < 4; fy++) {
            if ((fx + fy) % 2) ctx.fillRect(56 + fx * 24, 320 + fy * 36, 8, 12)
          }
        }
      },
    ]
    draw[index % draw.length]()

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }

  #drawEducationTile(ctx, S) {
    // ruled notebook paper, chalk formulas, a red margin
    ctx.fillStyle = '#101013'
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = 'rgba(244, 242, 239, 0.11)'
    ctx.lineWidth = 2
    for (let y = 28; y < S; y += 56) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(S, y)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(235, 0, 40, 0.55)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(84, 0)
    ctx.lineTo(84, S)
    ctx.stroke()

    const notes = ['E = mc²', '∑ f(x)', 'λ → ∞', '√−1', 'dy/dx', 'TEDxTIET']
    ctx.fillStyle = 'rgba(244, 242, 239, 0.3)'
    notes.forEach((n, i) => {
      ctx.save()
      ctx.translate(120 + (i % 2) * 190, 60 + i * 78)
      ctx.rotate(-0.04 + (i % 3) * 0.03)
      ctx.font = 'italic 30px Georgia, "Times New Roman", serif'
      ctx.fillText(n, 0, 0)
      ctx.restore()
    })
  }

  #drawTechnologyTile(ctx, S) {
    // circuit-board traces with solder pads
    ctx.fillStyle = '#0b0c0d'
    ctx.fillRect(0, 0, S, S)

    const rnd = (seed => () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    })(42)

    const grid = 32
    ctx.lineWidth = 3
    for (let n = 0; n < 16; n++) {
      let x = Math.floor(rnd() * 16) * grid
      let y = Math.floor(rnd() * 16) * grid
      const red = rnd() < 0.7
      ctx.strokeStyle = red ? 'rgba(235, 0, 40, 0.5)' : 'rgba(244, 242, 239, 0.28)'
      ctx.beginPath()
      ctx.moveTo(x, y)
      const steps = 3 + Math.floor(rnd() * 3)
      for (let s = 0; s < steps; s++) {
        if (rnd() < 0.5) x += (Math.floor(rnd() * 5) - 2) * grid
        else y += (Math.floor(rnd() * 5) - 2) * grid
        ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.fillStyle = red ? '#eb0028' : 'rgba(244, 242, 239, 0.55)'
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0b0c0d'
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(244, 242, 239, 0.12)'
    for (let n = 0; n < 60; n++) {
      ctx.fillRect(Math.floor(rnd() * 16) * grid - 1, Math.floor(rnd() * 16) * grid - 1, 3, 3)
    }
  }

  #drawDesignTile(ctx, S) {
    // a drafting sheet: grid, contour curves, bezier handles, crosshairs
    ctx.fillStyle = '#191a1c'
    ctx.fillRect(0, 0, S, S)

    ctx.strokeStyle = 'rgba(244, 242, 239, 0.07)'
    ctx.lineWidth = 1
    for (let p = 0; p < S; p += 64) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(244, 242, 239, 0.22)'
    ctx.lineWidth = 2
    for (let r = 40; r <= 160; r += 40) {
      ctx.beginPath()
      ctx.ellipse(150, 330, r * 1.25, r, -0.4, 0, Math.PI * 2)
      ctx.stroke()
    }

    // a bezier curve with its control handles — the designer's mark
    ctx.strokeStyle = 'rgba(235, 0, 40, 0.65)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(300, 90)
    ctx.bezierCurveTo(390, 40, 400, 220, 470, 170)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(244, 242, 239, 0.3)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(300, 90); ctx.lineTo(390, 40); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(470, 170); ctx.lineTo(400, 220); ctx.stroke()
    ctx.fillStyle = '#f4f2ef'
    for (const [px, py] of [[300, 90], [390, 40], [400, 220], [470, 170]]) {
      ctx.fillRect(px - 4, py - 4, 8, 8)
    }

    for (const [cx, cy] of [[90, 100], [440, 400]]) {
      ctx.strokeStyle = 'rgba(235, 0, 40, 0.55)'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx - 22, cy); ctx.lineTo(cx + 22, cy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy + 22); ctx.stroke()
    }
  }

  #drawTietTile(ctx, S) {
    // the institute sheet: TED red drenched, tiled with the wordmark
    ctx.fillStyle = '#d90024'
    ctx.fillRect(0, 0, S, S)

    ctx.save()
    ctx.translate(S / 2, S / 2)
    ctx.rotate(-Math.PI / 8)
    ctx.font = '700 44px "Archivo Variable", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let row = -3; row <= 3; row++) {
      const offset = (row % 2) * 130
      ctx.fillStyle = row % 2 ? 'rgba(70, 0, 13, 0.55)' : 'rgba(255, 255, 255, 0.16)'
      for (let col = -2; col <= 2; col++) {
        ctx.fillText('TEDxTIET', col * 260 + offset, row * 88)
      }
    }
    ctx.restore()
  }

  #buildFloor() {
    this.floor = createRippleFloor({ y: -1.75, maxRadius: 15 })
    this.scene.add(this.floor.points)
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.75)
    this.raycaster = new THREE.Raycaster()
  }

  #buildStage() {
    // The TEDx stage the logo levitates over: the signature circular red
    // carpet, a breathing edge glow, and a soft contact shadow that
    // tracks the float.
    const floorY = -1.74

    // The big deck: a half-oval platform wider than the screen, flat edge
    // toward the audience, with the red carpet at its center and a glowing
    // red border tracing its back curve.
    // deep enough that the word stands well inside the platform — the back
    // edge sits far behind it, not at its feet
    const DECK_RX = 24
    const DECK_RZ = 16
    const DECK_FRONT_Z = 3.2
    const deckShape = new THREE.Shape()
    deckShape.absellipse(0, 0, DECK_RX, DECK_RZ, Math.PI, 0, true)
    deckShape.closePath()
    this.deckMat = new THREE.MeshBasicMaterial({
      color: 0x161314,
      transparent: true,
      opacity: 0,
    })
    this.deck = new THREE.Mesh(new THREE.ShapeGeometry(deckShape, 48), this.deckMat)
    this.deck.rotation.x = -Math.PI / 2
    this.deck.position.set(0, floorY - 0.04, DECK_FRONT_Z)

    const borderPoints = []
    for (let i = 0; i <= 64; i++) {
      const a = Math.PI - (i / 64) * Math.PI // back half, left edge to right edge
      borderPoints.push(
        new THREE.Vector3(
          Math.cos(a) * DECK_RX,
          floorY - 0.02,
          DECK_FRONT_Z - Math.sin(a) * DECK_RZ,
        ),
      )
    }
    const borderCurve = new THREE.CatmullRomCurve3(borderPoints)
    this.borderMat = new THREE.MeshBasicMaterial({
      color: TED_RED,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    this.deckBorder = new THREE.Mesh(new THREE.TubeGeometry(borderCurve, 96, 0.06, 8), this.borderMat)

    const carpetTexture = this.#makeCarpetTexture()
    this.carpetMat = new THREE.MeshBasicMaterial({
      map: carpetTexture,
      transparent: true,
      opacity: 0,
    })
    this.carpet = new THREE.Mesh(new THREE.CircleGeometry(3.0, 72), this.carpetMat)
    this.carpet.rotation.x = -Math.PI / 2
    this.carpet.position.set(0, floorY, 0.9)

    this.ringMat = new THREE.MeshBasicMaterial({
      color: TED_RED,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.02, 3.3, 72), this.ringMat)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.set(0, floorY + 0.005, 0.9)

    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = shadowCanvas.height = 256
    const sctx = shadowCanvas.getContext('2d')
    const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128)
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)')
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    sctx.fillStyle = grad
    sctx.fillRect(0, 0, 256, 256)
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas)
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), this.shadowMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.set(0, floorY + 0.01, LOGO_Z)
    this.shadow.scale.set(2.1, 1, 1) // stretched under the wide standing word

    // a faint backlight at the rear of the stage, behind the word — just
    // enough to lift the horizon out of pure black
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = 512
    glowCanvas.height = 256
    const gctx = glowCanvas.getContext('2d')
    const glow = gctx.createRadialGradient(256, 200, 10, 256, 200, 250)
    glow.addColorStop(0, 'rgba(235, 0, 40, 0.5)')
    glow.addColorStop(0.55, 'rgba(235, 0, 40, 0.14)')
    glow.addColorStop(1, 'rgba(235, 0, 40, 0)')
    gctx.fillStyle = glow
    gctx.fillRect(0, 0, 512, 256)
    const glowTexture = new THREE.CanvasTexture(glowCanvas)
    this.backGlowMat = new THREE.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false, // the scene fog would otherwise swallow the low opacity
    })
    this.backGlow = new THREE.Mesh(new THREE.PlaneGeometry(36, 14), this.backGlowMat)
    this.backGlow.position.set(0, 2.4, -9)

    this.scene.add(this.deck, this.deckBorder, this.carpet, this.ring, this.shadow, this.backGlow)
  }

  #makeCarpetTexture() {
    const S = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const ctx = canvas.getContext('2d')
    const c = S / 2

    const base = ctx.createRadialGradient(c, c, 20, c, c, c)
    base.addColorStop(0, '#d40023')
    base.addColorStop(0.75, '#a3001b')
    base.addColorStop(1, '#6f0012')
    ctx.fillStyle = base
    ctx.beginPath()
    ctx.arc(c, c, c, 0, Math.PI * 2)
    ctx.fill()

    // woven rings
    ctx.lineWidth = 1
    for (let r = 24; r < c - 24; r += 12) {
      ctx.strokeStyle = r % 24 ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.05)'
      ctx.beginPath()
      ctx.arc(c, c, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // fabric speckle
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * (c - 8)
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)'
      ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 1.6, 1.6)
    }

    // border band
    ctx.strokeStyle = 'rgba(40, 0, 7, 0.85)'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.arc(c, c, c - 9, 0, Math.PI * 2)
    ctx.stroke()

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }

  #makeCurtainTexture() {
    // dark stage drapes: vertical folds with faint warm side washes
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0b0a0a'
    ctx.fillRect(0, 0, 1024, 256)
    for (let x = 0; x < 1024; x += 4) {
      const fold = Math.sin(x * 0.11) * 0.5 + Math.sin(x * 0.023) * 0.5
      ctx.fillStyle = `rgba(255, 240, 225, ${Math.max(0, fold) * 0.045})`
      ctx.fillRect(x, 0, 4, 256)
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, -fold) * 0.35})`
      ctx.fillRect(x, 0, 4, 256)
    }
    // warm wash left, deep red wash right — like the reference lighting
    const left = ctx.createLinearGradient(0, 0, 360, 0)
    left.addColorStop(0, 'rgba(214, 110, 40, 0.16)')
    left.addColorStop(1, 'rgba(214, 110, 40, 0)')
    ctx.fillStyle = left
    ctx.fillRect(0, 0, 360, 256)
    const right = ctx.createLinearGradient(1024, 0, 660, 0)
    right.addColorStop(0, 'rgba(235, 0, 40, 0.1)')
    right.addColorStop(1, 'rgba(235, 0, 40, 0)')
    ctx.fillStyle = right
    ctx.fillRect(660, 0, 364, 256)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.repeat.x = 3
    return texture
  }

  #buildCurtains() {
    // the background behind the stage: a drape band under the screen and
    // two tall curtain legs framing the sides
    const texture = this.#makeCurtainTexture()
    this.curtainMats = []

    const makeCurtain = (radius, height, thetaStart, thetaLength, y) => {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        fog: false,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 48, 1, true, thetaStart, thetaLength),
        material,
      )
      mesh.position.set(0, y, 4)
      this.curtainMats.push(material)
      this.scene.add(mesh)
      return mesh
    }

    // lower band from stage floor up to the screen's bottom edge, swept
    // right with the screen; a strong warm leg closes the left of frame
    makeCurtain(19.4, 3.3, Math.PI - 0.45 - 1.35, 2.7, FLOOR_Y + 1.6)
    makeCurtain(19.1, 13, Math.PI - 0.45 - 1.62, 0.5, 4.6)
    makeCurtain(19.1, 13, Math.PI - 0.45 + 1.18, 0.34, 4.6)
  }

  #buildDecor() {
    // stage dressing: red prop blocks at the wings, monitors at the lip,
    // warm uplights along the curtain base
    this.decorMats = []

    // the small stair unit to the right of the carpet, like the reference
    const stepMat = () => {
      const material = new THREE.MeshStandardMaterial({
        color: 0x3a3833,
        roughness: 0.9,
        transparent: true,
        opacity: 0,
      })
      this.decorMats.push(material)
      return material
    }
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.4), stepMat())
    step1.position.set(4.2, FLOOR_Y + 0.04, 1.2)
    step1.rotation.y = -0.2
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.4), stepMat())
    step2.position.set(4.3, FLOOR_Y + 0.12, 1.5)
    step2.rotation.y = -0.2
    this.scene.add(step1, step2)

    // the stage reads as a raised platform: a dark front fascia dropping
    // to the pit, with a faint edge highlight along the stage lip
    const fasciaMat = new THREE.MeshBasicMaterial({
      color: 0x0d0c0c,
      transparent: true,
      opacity: 0,
    })
    this.decorMats.push(fasciaMat)
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(46, 1.0), fasciaMat)
    fascia.position.set(0, FLOOR_Y - 0.54, 3.21)

    const lipMat = new THREE.MeshBasicMaterial({
      color: 0x565049,
      transparent: true,
      opacity: 0,
    })
    this.decorMats.push(lipMat)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(46, 0.03, 0.03), lipMat)
    lip.position.set(0, FLOOR_Y - 0.015, 3.22)

    this.scene.add(fascia, lip)

    // uplights washing the curtain base
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = glowCanvas.height = 128
    const gctx = glowCanvas.getContext('2d')
    const gg = gctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    gg.addColorStop(0, 'rgba(230, 140, 60, 0.55)')
    gg.addColorStop(1, 'rgba(230, 140, 60, 0)')
    gctx.fillStyle = gg
    gctx.fillRect(0, 0, 128, 128)
    const glowTexture = new THREE.CanvasTexture(glowCanvas)
    this.uplightMats = []
    for (const ux of [-11, -5.5, 5.5, 11]) {
      const material = new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2), material)
      glow.position.set(ux, -0.7, -13.8)
      this.uplightMats.push(material)
      this.scene.add(glow)
    }
  }

  #buildCrowd() {
    // The audience in the pit: seated silhouettes with torso, shoulders and
    // head, screen-lit in varied blue-greys like the reference, in loose
    // arcs with some seats empty, each person swaying faintly.
    const tones = [0x0a0c12, 0x0d1018, 0x10141f, 0x131826, 0x0b0e14]
    this.crowdMats = tones.map(
      (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
    )
    const headGeo = new THREE.SphereGeometry(0.155, 14, 12)
    const torsoGeo = new THREE.SphereGeometry(0.34, 14, 12)
    const shoulderGeo = new THREE.SphereGeometry(0.16, 10, 8)

    const rnd = (seed => () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    })(97531)

    // An organized house, like the reference: neat curved rows swept
    // diagonally from the lower-left, even seating pitch, everyone facing
    // the carpet, with light sofa backs running behind each row.
    this.benchMat = new THREE.MeshBasicMaterial({
      color: 0x151b28,
      transparent: true,
      opacity: 0,
    })
    const rows = [
      { from: [-9.2, 6.2], to: [3.8, 4.6], count: 12, baseY: -1.5, bow: 0.55, bench: false },
      { from: [-9.9, 5.2], to: [3.0, 3.9], count: 11, baseY: -1.58, bow: 0.45, bench: true },
      { from: [-10.4, 4.4], to: [2.0, 3.5], count: 9, baseY: -1.66, bow: 0.35, bench: true },
      { from: [-11.0, 3.9], to: [-5.2, 3.3], count: 5, baseY: -1.32, bow: 0.1, bench: true }, // raised left bank
    ]
    const CARPET = { x: 0, z: 0.9 } // everyone watches the speaker's spot

    this.crowd = []
    const group = new THREE.Group()
    rows.forEach((row) => {
      const rowPoint = (u) => [
        row.from[0] + (row.to[0] - row.from[0]) * u,
        row.from[1] + (row.to[1] - row.from[1]) * u + Math.sin(u * Math.PI) * row.bow,
      ]
      for (let i = 0; i < row.count; i++) {
        const u = i / (row.count - 1)
        const [x, rowZ] = rowPoint(u)

        // sofa back segment behind this seat, following the row's tangent
        const [ax, az] = rowPoint(Math.max(0, u - 0.04))
        const [bx, bz] = rowPoint(Math.min(1, u + 0.04))
        const tangent = Math.atan2(bx - ax, bz - az)
        const pitch = Math.hypot(row.to[0] - row.from[0], row.to[1] - row.from[1]) / (row.count - 1)
        if (row.bench) {
          const bench = new THREE.Mesh(
            new THREE.BoxGeometry(pitch * 0.98, 0.26, 0.12),
            this.benchMat,
          )
          bench.position.set(x, row.baseY - 0.08, rowZ + 0.32)
          bench.rotation.y = tangent + Math.PI / 2
          group.add(bench)
        }

        // a few seats stay empty, more toward the right
        if (rnd() < 0.06 + u * 0.2) continue

        const material = this.crowdMats[Math.floor(rnd() * this.crowdMats.length)]
        const s = 0.98 + rnd() * 0.22
        const baseY = row.baseY + rnd() * 0.05
        const person = new THREE.Group()

        const torso = new THREE.Mesh(torsoGeo, material)
        torso.scale.set(s * 0.82, s * 0.8, s * 0.62)
        const shoulderL = new THREE.Mesh(shoulderGeo, material)
        shoulderL.position.set(-0.27 * s, 0.15 * s, 0)
        shoulderL.scale.set(s * 0.9, s * 0.75, s * 0.75)
        const shoulderR = shoulderL.clone()
        shoulderR.position.x = 0.27 * s
        const head = new THREE.Mesh(headGeo, material)
        head.position.set((rnd() - 0.5) * 0.05, 0.45 * s, 0)
        head.scale.set(s * 0.9, s * 1.05, s * 0.95)
        head.rotation.z = (rnd() - 0.5) * 0.14 // subtle head tilts, listening

        person.add(torso, shoulderL, shoulderR, head)
        person.position.set(x + (rnd() - 0.5) * 0.08, baseY, rowZ + (rnd() - 0.5) * 0.06)
        // seated facing the speaker's spot on the carpet
        person.rotation.y = Math.atan2(CARPET.x - x, CARPET.z - rowZ) + (rnd() - 0.5) * 0.1
        group.add(person)
        this.crowd.push({ person, baseY, phase: rnd() * Math.PI * 2, amp: 0.005 + rnd() * 0.009 })
      }
    })
    this.scene.add(group)
  }

  #buildSpotlight() {
    // The cursor is the followspot: a real spotlight aimed where the
    // pointer lands on the stage, with a visible beam and light pool.
    this.spotSource = new THREE.Vector3(0, 9.5, 8.5)

    this.spot = new THREE.SpotLight(0xfff1dd, 0)
    this.spot.angle = 0.42
    this.spot.penumbra = 0.75
    this.spot.distance = 45
    this.spot.decay = 0
    this.spot.position.copy(this.spotSource)
    this.spotTarget = new THREE.Object3D()
    this.spot.target = this.spotTarget

    const poolCanvas = document.createElement('canvas')
    poolCanvas.width = poolCanvas.height = 256
    const pctx = poolCanvas.getContext('2d')
    const pg = pctx.createRadialGradient(128, 128, 8, 128, 128, 128)
    pg.addColorStop(0, 'rgba(255, 243, 220, 0.55)')
    pg.addColorStop(0.6, 'rgba(255, 243, 220, 0.16)')
    pg.addColorStop(1, 'rgba(255, 243, 220, 0)')
    pctx.fillStyle = pg
    pctx.fillRect(0, 0, 256, 256)
    const poolTexture = new THREE.CanvasTexture(poolCanvas)
    this.poolMat = new THREE.MeshBasicMaterial({
      map: poolTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), this.poolMat)
    this.pool.rotation.x = -Math.PI / 2
    this.pool.position.set(0, -1.72, 0)

    this.scene.add(this.spot, this.spotTarget, this.pool)
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
    this.pointerMoved = true
  }

  pulseAt(clientX, clientY, rect) {
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)

    // tapping a letter lights it up (the touch path to the hover reveal);
    // tapping the stage sends a ripple
    const letterHit = this.raycaster.intersectObjects(this.letterMeshes, true)[0]
    if (letterHit) {
      const i = letterHit.object.userData.letterIndex
      if (i !== undefined) this.hoverState[i].flashUntil = this.clock.elapsedTime + 1.6
      return
    }

    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.floorPlane, hit)) {
      this.floor.addPulse(hit.x, hit.z, this.clock.elapsedTime)
    }
  }

  #updateHover(t) {
    if (!this.assembled) return

    // which letter is under the pointer? (the word itself is one rigid
    // element; the whole-rig push tilt happens in the tick)
    let index = -1
    if (this.pointerMoved) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(this.pointer.tx, -this.pointer.ty),
        this.camera,
      )
      const hit = this.raycaster.intersectObjects(this.letterMeshes, true)[0]
      if (hit && hit.object.userData.letterIndex !== undefined) {
        index = hit.object.userData.letterIndex
      }
    }
    if (index !== this.hoverIndex) {
      this.hoverIndex = index
      this.canvas.style.cursor = index >= 0 ? 'pointer' : ''
    }

    const { hoverGlow } = this.tuning
    let lit = this.hoverIndex

    this.letters.forEach((l, i) => {
      // photo + glow: ease toward lit/unlit; taps hold the light briefly
      const hs = this.hoverState[i]
      const active = i === this.hoverIndex || t < hs.flashUntil
      if (active && lit === -1) lit = i
      hs.target = active ? 1 : 0
      hs.t += (hs.target - hs.t) * (this.reduced ? 1 : 0.14)
      if (Math.abs(hs.target - hs.t) < 0.001) hs.t = hs.target

      l.hoverMat.opacity = hs.t
      l.hoverMat.emissiveIntensity = hoverGlow * hs.t
      // the glass is always luminous from inside; hover turns it up
      // to obvious-but-restrained
      const idleGlow = l.isRed ? 0.34 : 0.2
      const hoverPeak = l.isRed ? 0.62 : 0.46
      l.material.emissiveIntensity = idleGlow + (hoverPeak - idleGlow) * hs.t
    })

    // sync the projector: the hovered letter's picture appears on the
    // curved screen behind the stage
    if (lit >= 0 && lit !== this.litIndex) {
      this.screenImageMat.map = this.screenSlides[lit]
      this.screenImageMat.needsUpdate = true
    }
    this.litIndex = lit
    const fadeTarget = lit >= 0 ? 1 : 0
    this.screenFade += (fadeTarget - this.screenFade) * (this.reduced ? 1 : 0.1)
  }

  // ————— state —————

  setFinalState() {
    for (const l of this.letters) {
      l.mesh.position.set(l.final.x, l.final.y, l.final.z)
      l.mesh.rotation.set(0, 0, 0)
      l.mesh.scale.set(1, 1, 1)
      l.material.opacity = 1
    }
    for (const layer of this.wordLayers) for (const s of layer) s.material.opacity = 0
    for (const r of this.rawLetters) r.material.opacity = 0
    this.state.rim = 1.1
    this.state.key = 2.4
    this.state.camZ = FINAL_CAM_Z
    this.state.idle = 1
    this.state.stage = 1
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

    // Like the reference: the wordmark stands at stage-left at a believable
    // scale (about a third of the frame), centered only on portrait screens.
    const portrait = w / h < 0.9
    const fraction = portrait ? 0.62 : 0.38
    const visibleWidth =
      2 *
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
      (FINAL_CAM_Z - LOGO_Z) *
      this.camera.aspect
    this.rigScale = (visibleWidth * fraction) / this.logoWidth
    this.rig.scale.setScalar(this.rigScale)
    this.rig.position.x = portrait ? 0 : -3.3
    // the standing word faces the viewer, like real stage letters
    this.baseYaw = portrait ? 0 : 0.32
    // standing on the stage floor, with a whisper of air underneath
    this.standY = FLOOR_Y + 0.355 * this.rigScale + 0.08
    if (this.shadow) {
      this.shadow.position.x = this.rig.position.x
      this.shadowBase = (this.logoWidth * this.rigScale) / 5.2
    }
  }

  // ————— loop —————

  #tick() {
    if (this.disposed) return
    const t = this.clock.getElapsedTime()
    const dt = 0.016

    // damped pointer — quick enough that the turn visibly follows the cursor
    this.pointer.x += (this.pointer.tx - this.pointer.x) * this.tuning.follow
    this.pointer.y += (this.pointer.ty - this.pointer.y) * this.tuning.follow

    const { state } = this
    const idle = this.reduced ? 0 : state.idle

    const bob = Math.sin(t * 0.55)
    const { tuning } = this
    // the word faces the viewer, and tilts as one element where the
    // cursor pushes it
    this.rig.rotation.y =
      (this.baseYaw ?? 0) + this.pointer.x * tuning.turnY * idle + Math.sin(t * 0.32) * 0.035 * idle
    this.rig.rotation.x = this.pointer.y * tuning.turnX * idle + Math.sin(t * 0.21) * 0.015 * idle
    this.rig.position.y = this.standY + bob * tuning.floatAmp * this.rigScale * idle

    // the stage breathes with the float: ring glow pulses, the contact
    // shadow tightens and lightens as the word rises
    const stage = state.stage
    this.carpetMat.opacity = stage
    this.ringMat.opacity = stage * (this.reduced ? tuning.ringGlow : tuning.ringGlow + 0.07 * Math.sin(t * 0.8))
    this.shadowMat.opacity = stage * (0.5 - 0.14 * bob * idle)
    const shadowScale = 1 - 0.035 * bob * idle
    this.shadow.scale.set((this.shadowBase ?? 1.6) * shadowScale, shadowScale * 0.8, 1)
    this.backGlowMat.opacity = stage * (this.reduced ? tuning.backGlow : tuning.backGlow + 0.035 * Math.sin(t * 0.45))
    this.deckMat.opacity = stage
    this.borderMat.opacity =
      stage * (this.reduced ? tuning.stageBorder : tuning.stageBorder * (0.85 + 0.15 * Math.sin(t * 0.6)))
    // projector: idle branding dims as a projected picture fades in
    this.screenBaseMat.opacity = stage * tuning.screenGlow * (1 - this.screenFade * 0.75)
    this.screenImageMat.opacity = stage * tuning.screenGlow * this.screenFade

    // curtains, decoration, and audience settle in with the stage
    for (const m of this.curtainMats) m.opacity = stage * 0.96
    for (const m of this.decorMats) m.opacity = stage
    for (const m of this.uplightMats) m.opacity = stage * (0.12 + 0.02 * Math.sin(t * 0.5))
    for (const m of this.crowdMats) m.opacity = stage * 0.95
    this.benchMat.opacity = stage * 0.6
    if (!this.reduced) {
      for (const c of this.crowd) {
        c.person.position.y = c.baseY + Math.sin(t * 0.7 + c.phase) * c.amp
      }
    }

    // the cursor followspot: aim the light where the pointer lands
    this.raycaster.setFromCamera(this.tmpA.set(this.pointer.x, -this.pointer.y, 0), this.camera)
    if (this.raycaster.ray.intersectPlane(this.floorPlane, this.tmpB)) {
      this.tmpB.x = THREE.MathUtils.clamp(this.tmpB.x, -13, 13)
      this.tmpB.z = THREE.MathUtils.clamp(this.tmpB.z, -12, 9.5)
      this.pool.position.set(this.tmpB.x, -1.72, this.tmpB.z)
      this.spotTarget.position.copy(this.tmpB)
    }
    const spotStrength = tuning.spotlight * stage
    this.spot.intensity = 2.6 * spotStrength
    this.poolMat.opacity = 0.16 * spotStrength

    // viewed from back-right of the house, with a slow cinematic drift
    this.camera.position.set(
      1.2 + this.pointer.x * 0.18 * idle + Math.sin(t * 0.11) * 0.2 * idle,
      state.camY + Math.sin(t * 0.14) * 0.07 * idle,
      state.camZ,
    )
    this.camera.lookAt(0, -0.45, 0)

    this.keyLight.intensity = state.key
    this.rimLeft.intensity = state.rim
    this.rimRight.intensity = state.rim * 0.8

    this.floor.uniforms.uTime.value = t
    this.#updateHover(t)

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
