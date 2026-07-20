# Audience character models

Five static character meshes for the theater audience:

| File | Size |
|---|---|
| `child.glb` | 439 KB |
| `businessman.glb` | 395 KB |
| `businesswoman.glb` | 421 KB |
| `male-human.glb` | 426 KB |
| `woman-business-outfit.glb` | 424 KB |
| `stage-and-seating.glb` | 2.0 MB (compressed from 16.8 MB) |

The five character files are well under the ≤1.5 MB/character budget in
`docs/ENGINEERING_PLAN.md` §1.2 — no compression needed.

`stage-and-seating.glb` went through the plan's `gltf-transform optimize`
pass:

```bash
npx @gltf-transform/cli optimize stage-and-seating.glb stage-and-seating.glb \
  --compress meshopt \
  --texture-compress webp --texture-size 1024 \
  --simplify true --simplify-ratio 0.06 --simplify-error 0.015
```

- Textures: two 8192×8192 and four 4096×4096 JPEGs (was the real weight,
  ~7.4 MB of the original 16.8 MB) → six 1024×1024 WebP textures (~380 KB
  total).
- Geometry: ~1.93 M triangles (Draco-compressed on export, still enormous
  for a background prop viewed from a distance) → ~54K triangles via
  meshoptimizer simplification, then meshopt-compressed. A more aggressive
  ratio than the plan's default was used deliberately, since this asset sits
  behind the ripple floor, letters, and vignette — not a close-up subject.
- Verified after compression: loaded in a fresh three.js `GLTFLoader` +
  `MeshoptDecoder` scene and rendered — stage deck, curtain drape folds, the
  circular carpet cutout, and every curved seating row are still clearly
  legible; no exploded or degenerate geometry.

Total payload for all six models: **~4.7 MB**, comfortably under the plan's
≤10 MB target (hard ceiling 15 MB).

**Verified (Phase 0 gate, §1.1):** each file has exactly one static mesh,
**no skeleton, no animation tracks**. They are not rigged for
`Sit_Idle` / `Stand_Up_Clap`.

To use them as-is: static seated or standing poses only (no clap animation).
To get the skeletal clap: run each through the Mixamo pipeline described in
the engineering plan — auto-rig, apply a sitting-idle clip and a
stand-up-and-clap clip, export, rename the tracks to `Sit_Idle` /
`Stand_Up_Clap`, and re-export as GLB (ideally re-compressed with
`gltf-transform` afterward, since Mixamo exports are usually heavier).
