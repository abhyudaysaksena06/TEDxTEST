/**
 * Selective per-mesh compression for the stage+seating GLB.
 *
 * The source model (Untitled.glb export) is 16.8 MB — two meshes, oversized
 * textures (8192²/4096²), ~3.6M triangles. This spends quality where the
 * camera actually sees it and cuts hard where it doesn't:
 *
 *   - seating bowl  (near the camera in the hero) — light touch
 *   - stage-back    (far, mostly occluded)        — aggressive
 *
 * One-off tool: install the dev deps first, then run.
 *
 *   npm i -D @gltf-transform/core @gltf-transform/extensions \
 *            @gltf-transform/functions draco3dgltf meshoptimizer sharp
 *   node scripts/compress-stage-model.mjs <input.glb> public/models/stage-and-seating.glb
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, prune, textureCompress, meshopt, simplifyPrimitive } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'

const [SRC, OUT] = process.argv.slice(2)
if (!SRC || !OUT) {
  console.error('usage: node scripts/compress-stage-model.mjs <input.glb> <output.glb>')
  process.exit(1)
}

// the node id of the seating-bowl mesh (vs the far stage-back mesh)
const SEATING_ID = '933d99cd'
const SEATING = { ratio: 0.22, error: 0.005, texSize: 1280 }
const STAGEBACK = { ratio: 0.04, error: 0.02, texSize: 640 }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder,
})

const doc = await io.read(SRC)
await doc.transform(dedup(), weld())
await MeshoptSimplifier.ready

const tris = (prim) => {
  const idx = prim.getIndices()
  return idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3
}

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const budget = node.getName().includes(SEATING_ID) ? SEATING : STAGEBACK
  for (const prim of mesh.listPrimitives()) {
    const before = tris(prim)
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: budget.ratio, error: budget.error })
    console.log(`${Math.round(before).toLocaleString()} -> ${Math.round(tris(prim)).toLocaleString()} tris`)
  }
}

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [SEATING.texSize, SEATING.texSize], pattern: /auditorium/i }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [STAGEBACK.texSize, STAGEBACK.texSize], pattern: /stage/i }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)

// the source was Draco-compressed; we decoded and re-compressed with meshopt,
// so drop the stale Draco extension declaration before writing
doc
  .getRoot()
  .listExtensionsUsed()
  .find((e) => e.extensionName === 'KHR_draco_mesh_compression')
  ?.dispose()

await io.write(OUT, doc)
const { statSync } = await import('node:fs')
console.log('written', OUT, (statSync(OUT).size / 1e6).toFixed(2), 'MB')
