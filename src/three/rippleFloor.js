import * as THREE from 'three'

/**
 * The stage floor: a disc of points that carries slow radial waves outward
 * from the logo — "an idea spreading". Clicking the stage injects a pulse
 * that travels the same way. Rendered as a custom shader so several
 * thousand points stay cheap.
 */

const MAX_PULSES = 4

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  uniform float uPixelRatio;
  uniform vec3 uPulses[${MAX_PULSES}]; // x, z, startTime

  varying float vGlow;
  varying float vDist;

  void main() {
    float dist = length(position.xz);
    vDist = dist;

    float wave = sin(dist * 1.9 - uTime * 1.25);
    float glow = smoothstep(0.72, 1.0, wave) * 0.55 * uWaveAmp;

    for (int i = 0; i < ${MAX_PULSES}; i++) {
      float age = uTime - uPulses[i].z;
      if (age > 0.0 && age < 6.0) {
        float radius = age * 3.1;
        float d = abs(distance(position.xz, uPulses[i].xy) - radius);
        glow += exp(-d * 4.5) * exp(-age * 0.75) * 1.1;
      }
    }

    vGlow = glow;

    vec3 p = position;
    p.y += glow * 0.1;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min((1.2 + min(glow, 1.4) * 1.5) * (34.0 / -mv.z), 8.0) * uPixelRatio;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uFade;
  uniform float uMaxRadius;

  varying float vGlow;
  varying float vDist;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;

    vec3 dim = vec3(0.16, 0.15, 0.15);
    vec3 red = vec3(0.922, 0.0, 0.157); // #EB0028
    vec3 color = mix(dim, red, clamp(vGlow, 0.0, 1.0));
    // hot pulse cores tip toward white
    color = mix(color, vec3(1.0), clamp(vGlow - 1.1, 0.0, 0.5));

    float edgeFade = 1.0 - smoothstep(0.5, 0.95, vDist / uMaxRadius);
    float alpha = (0.16 + clamp(vGlow, 0.0, 1.0) * 0.85) * edgeFade * uFade;

    gl_FragColor = vec4(color, alpha);
  }
`

export function createRippleFloor({ y = -1.7, maxRadius = 15 } = {}) {
  const positions = []
  const rings = 64
  for (let r = 1; r <= rings; r++) {
    const baseRadius = (r / rings) * maxRadius
    const count = Math.max(10, Math.floor(baseRadius * 16))
    for (let i = 0; i < count; i++) {
      // jittered polar grid: reads as texture, not as a moiré pattern
      const a = (i / count) * Math.PI * 2 + r * 0.35 + (Math.random() - 0.5) * 0.05
      const radius = baseRadius + (Math.random() - 0.5) * 0.16
      positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

  const uniforms = {
    uTime: { value: 0 },
    uWaveAmp: { value: 1 },
    uFade: { value: 0 },
    uMaxRadius: { value: maxRadius },
    uPixelRatio: { value: 1 },
    uPulses: { value: Array.from({ length: MAX_PULSES }, () => new THREE.Vector3(0, 0, -1000)) },
  }

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  points.position.y = y
  points.frustumCulled = false

  let nextPulse = 0
  const addPulse = (x, z, time) => {
    uniforms.uPulses.value[nextPulse].set(x, z, time)
    nextPulse = (nextPulse + 1) % MAX_PULSES
  }

  return { points, uniforms, addPulse, y }
}
