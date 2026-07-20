# Audience character models

Five static character meshes for the theater audience:

| File | Size |
|---|---|
| `child.glb` | 439 KB |
| `businessman.glb` | 395 KB |
| `businesswoman.glb` | 421 KB |
| `male-human.glb` | 426 KB |
| `woman-business-outfit.glb` | 424 KB |
| `stage-and-seating.glb` | 16.0 MB |

The five character files are well under the ≤1.5 MB/character budget in
`docs/ENGINEERING_PLAN.md` §1.2 — no compression needed.

**`stage-and-seating.glb` is over budget** (plan target: stage ≤2 MB, seating
≤1.5 MB combined ~3.5 MB; this file is ~16 MB, two meshes, no skin/animation).
It will load and work as-is, but before it goes into a production Phase-1
build it should go through the `gltf-transform optimize` pass from the plan
(`--compress meshopt --texture-compress webp --texture-size 1024`) to get the
combined asset payload back under the ≤15 MB *total* ceiling.

**Verified (Phase 0 gate, §1.1):** each file has exactly one static mesh,
**no skeleton, no animation tracks**. They are not rigged for
`Sit_Idle` / `Stand_Up_Clap`.

To use them as-is: static seated or standing poses only (no clap animation).
To get the skeletal clap: run each through the Mixamo pipeline described in
the engineering plan — auto-rig, apply a sitting-idle clip and a
stand-up-and-clap clip, export, rename the tracks to `Sit_Idle` /
`Stand_Up_Clap`, and re-export as GLB (ideally re-compressed with
`gltf-transform` afterward, since Mixamo exports are usually heavier).
