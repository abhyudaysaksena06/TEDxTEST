# Audience character models

Five static character meshes for the theater audience:

| File | Size |
|---|---|
| `child.glb` | 439 KB |
| `businessman.glb` | 395 KB |
| `businesswoman.glb` | 421 KB |
| `male-human.glb` | 426 KB |
| `woman-business-outfit.glb` | 424 KB |
| `stage-and-seating.glb` | 4.6 MB (compressed from 16.8 MB) |

The five character files are well under the ≤1.5 MB/character budget in
`docs/ENGINEERING_PLAN.md` §1.2 — no compression needed.

`stage-and-seating.glb` uses a **selective, per-mesh** compression pass
(scratchpad script, gltf-transform SDK) that spends quality where it's seen
and cuts hard where it isn't. The model has two meshes:

- **Seating bowl** (the amphitheater tiers, close to camera in the wide
  hero shot): kept detailed — simplified 1.87M → ~410K triangles
  (ratio 0.22, error 0.005), textures at 1280px WebP.
- **Stage-back** (the far deck behind the letters, mostly occluded and
  distant): cut aggressively — 1.72M → ~69K triangles (ratio 0.04,
  error 0.02), textures at 640px WebP.

Both meshes are then meshopt-compressed. Textures overall: two 8192² and
four 4096² JPEGs (~7.4 MB of the original) → WebP at the per-mesh sizes
above. Verified after compression by loading in a fresh three.js
`GLTFLoader` + `MeshoptDecoder` scene: the seating tiers, stage deck,
curtain folds and carpet cutout all remain clean — the visible foreground
seating keeps its finish, only the barely-seen back deck is heavily reduced.

Total payload for all six models: **~6.7 MB**, under the plan's ≤10 MB
target (hard ceiling 15 MB).

**Verified (Phase 0 gate, §1.1):** each file has exactly one static mesh,
**no skeleton, no animation tracks**. They are not rigged for
`Sit_Idle` / `Stand_Up_Clap`.

To use them as-is: static seated or standing poses only (no clap animation).
To get the skeletal clap: run each through the Mixamo pipeline described in
the engineering plan — auto-rig, apply a sitting-idle clip and a
stand-up-and-clap clip, export, rename the tracks to `Sit_Idle` /
`Stand_Up_Clap`, and re-export as GLB (ideally re-compressed with
`gltf-transform` afterward, since Mixamo exports are usually heavier).
